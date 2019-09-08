/* eslint camelcase: 0 */

// Example usage:
// node upload --in=./yourLocalImgPath/ --cloudinaryFolder=yourCloudinaryFolderName

require('dotenv').config()
const argv = require('minimist')(process.argv.slice(2))
const cloudinary = require('cloudinary').v2
const fs = require('fs')
const recursive = require('recursive-readdir')
const sharp = require('sharp')
const exif = require('exiftool')
const shortHash = require('short-hash')

// local utils
const parseDMS = require('./utils/parseDMS')
const getFileData = require('./utils/getFileData')
const getGeocode = require('./utils/getGeocode')
const getDominantColor = require('./utils/getDominantColor')
const convertVideo = require('./utils/convertVideo')

const default_dominant_color = '#fff'
const localImgFolder = argv.in
const cloudinaryFolder = argv.cloudinaryFolder || ''

if (!localImgFolder) throw new Error('Missing argument: --in')

const cloud_name = process.env.cloud_name
const api_key = process.env.api_key
const api_secret = process.env.api_secret

const errorLogFileName = '_upload-errors.txt'
const tempVideoFileName = '_tempVideo.mp4'

const MAX_IMAGE_DIMENSION = 1920 // width or height. set a limit so you don't upload images too large and risk up your storage limit
const MAX_VIDEO_DIMENSION = 1024

cloudinary.config({ cloud_name, api_key, api_secret })

const uploadImageToCloudinary = (fileBuffer, file, { location, date, gpsData, gpsGeocode, created, dominantColor }, type) => new Promise(async (resolve, reject) => {
  // Cloudinary only allows String types in its context
  location = location ? location.toString() : ''
  date = date ? date.toString() : ''
  created = created ? created.toString() : ''
  const lat = gpsData.lat ? gpsData.lat.toString() : ''
  const lng = gpsData.lng ? gpsData.lng.toString() : ''

  const { neighbourhood, city, country, streetName } = gpsGeocode

  const hashedFilename = shortHash(file)

  let additionalOptions = {}
  if (type === 'video') {
    additionalOptions = {
      async: true,
      width: MAX_VIDEO_DIMENSION,
      height: MAX_VIDEO_DIMENSION,
      crop: "limit",
    }
  } else {
    additionalOptions = {
      quality: 'auto:best',
    }
  }

  console.log(`⬆  Uploading ${type} to Cloudinary`)
  
  try {
    await cloudinary.uploader.upload_stream({
      resource_type: "auto",
      public_id: hashedFilename, // we create the public_id based off a hashed file name, this is so we have a reference of what files exist already on cloudinary which we've already uploaded
      overwrite: true, // replace anything existing in cloudinary
      folder: cloudinaryFolder,
      // context is cloudinary's way of storing meta data about an image
      context: {
        location,
        date,
        created,
        lat,
        lng,
        neighbourhood, city, country, streetName,
        dominantColor,
      },
      ...additionalOptions,
    }, function (err, result) {

      if (err) reject(err)

      resolve(result)

    }).end(fileBuffer)

  } catch (err) {
    reject(err)
  }
})

let successCount = 0
// read the localImgFolder
recursive(localImgFolder, async (err, files) => {
  if (err) throw new Error(err)

  // we are only interested in the following file formats
  const filteredFiles = files.filter(file => {
    const fileToLowerCase = file.toLowerCase()
    if (fileToLowerCase.includes('.png')) return true
    if (fileToLowerCase.includes('.jpg')) return true
    if (fileToLowerCase.includes('.jpeg')) return true
    if (fileToLowerCase.includes('.gif')) return true
    if (fileToLowerCase.includes('.mov')) return true
    if (fileToLowerCase.includes('.mp4')) return true
    return false
  })

  console.log(`🐕  ${filteredFiles.length} media files found in ${localImgFolder} (and its subfolders)`)

  const failedImgs = []

  // loop through each image found
  for (const file of filteredFiles) {

    // cloudinary doesnt store created data, but we need this. Its useful to know when an image was created.
    const { birthtime: created } = await getFileData(file)

    try {
      // Possible Apple Photos folder name variations (examples);
      // 1) ./
      // 2) ./25 March 2016
      // 3) ./Amsterdam - Oud-West - Jacob van Lennepstraat, 18 February 2019
      // 4) ./Beirut, Beirut - Younas Gebayli Street, 13 October 2017
      // So we always know the portion after the last comma is the date, and everything before that is the address

      const localImgFolderWithoutDotSlash = localImgFolder.replace('./', '')
      const fullPath = file.replace(localImgFolderWithoutDotSlash, '').substring(1)
      const isRoot = !fullPath.includes('/')

      // find the last index of ','
      const breakCharIndex = fullPath.lastIndexOf(',')
      // use that value to split the string. before it is the location, after it is the date and filename
      // If the file is in the root of the source folder (#1 above) we can't infer any information about it,
      // so set location and date to null
      const locationUnstripped = isRoot ? null : fullPath.substring(0, breakCharIndex)
      const location = locationUnstripped.includes('/') ? locationUnstripped.split('/')[1] : locationUnstripped

      console.log(locationUnstripped, location)
      
      // get the date and filename, then remove the filename
      const date = isRoot ? null : fullPath.substring(breakCharIndex + 1).trim().split('/')[0]

      console.log(`\n♻️  File ${successCount + 1} of ${filteredFiles.length}`)
      console.log(`   "${fullPath}"`)
      console.log(`📁  Apple Photo folders found:`)
      console.log(`   Location: ${location || 'N/A'}`)
      console.log(`   Date: ${date || 'N/A'}`)

      // GPS EXIF data
      const gpsData = {
        lat: null,
        lng: null,
      }

      let gpsGeocode = {
        neighbourhood: '',
        city: '',
        country: '',
        streetName: '',
      }

      try {
        console.log(`🌏  Retrieving EXIF data for Lat/Lng`)
        
        const exifBuffer = fs.readFileSync(file)
        const exifResult = await new Promise((resolve, reject) => {
          exif.metadata(exifBuffer, (err, metadata) => {
            if (err) reject(err)
            resolve(metadata)
          })
        })

        if (exifResult.gpsPosition) {
          const [gpsLatitude, gpsLongitude] = exifResult.gpsPosition.split(',')
          
          gpsData.lat = parseDMS(gpsLatitude)
          gpsData.lng = parseDMS(gpsLongitude)
          
          console.log(`   Got lat: ${gpsData.lat}, lng: ${gpsData.lng}`)

          if (process.env.google_api) {
            console.log(`🌍  Doing Google reverse geocode`)
            gpsGeocode = await getGeocode(gpsData)
            console.log(`   Reverse geocode done, got: ${gpsGeocode.neighbourhood}, ${gpsGeocode.streetName}, ${gpsGeocode.city}, ${gpsGeocode.country}`)
          }

        } else {
          console.log(`   No lat/lng data found`)
        }

      } catch (err) {
        console.log(`\n❌  Couldn't get GPS data from ${file} - ${err}`)
      }
      // END GPS EXIF data

      const fileToLowerCase = file.toLowerCase()
      const isVideo = fileToLowerCase.includes('.mov') || fileToLowerCase.includes('.mp4') || fileToLowerCase.includes('.gif')

      // Dominant colour stuff
      let dominantColor = ''
      // Jimp can't get dominant colours from videos.
      if (isVideo) {
        dominantColor = default_dominant_color
      } else {
        try {
          console.log(`🎨  Getting dominant color`)
          
          dominantColor = await getDominantColor(file)
          console.log(`   Done: ${dominantColor}`)
          
        } catch (err) {
          console.log(`❌  Error getting dominant color ${err}, using default: ${default_dominant_color}`)
          dominantColor = default_dominant_color
        }
      }

      let uploadedFileData

      if (isVideo) {

        let tempFile = file

        try {
          
          tempFile = await convertVideo(file, tempVideoFileName)
        } catch (error) {
          console.log(error)
        }

        const fileBuffer = fs.readFileSync(tempFile)
        uploadedFileData = await uploadImageToCloudinary(fileBuffer, file, { location, date, gpsData, gpsGeocode, created, dominantColor }, 'video')
      } else {

        // Resize the file locally first using Sharp before uploading it (to minimise bandwidth usage)
        const fileBuffer = await sharp(file)
          .resize({
            width: MAX_IMAGE_DIMENSION,
            height: MAX_IMAGE_DIMENSION,
            fit: 'inside',
            withoutEnlargement: true, // Otherwise cloudinary enlarges smaller images to be the MAX_IMAGE_DIMENSION. Silly.
          })
          .toBuffer()

        uploadedFileData = await uploadImageToCloudinary(fileBuffer, file, { location, date, gpsData, gpsGeocode, created, dominantColor }, 'image')
      }

      if (uploadedFileData.err) {
        console.warn('\n❌  Error from Cloudinary. Skipping file:', err)
        continue
      }

      successCount += 1
      try {
        // check if tempVideoFileName exists, if so delete it
        // https://nodejs.org/api/fs.html#fs_fs_access_path_mode_callback
        fs.access(tempVideoFileName, fs.constants.R_OK | fs.constants.W_OK, (err) => {
          if (err) return
          fs.unlinkSync(tempVideoFileName)
        })
      } catch (err) {
        console.error(err)
      }
      console.log(`✅  Done`)


    } catch (err) {
      console.warn(`\n❌  Oh dear. Error uploading ${file}:`)
      console.warn(err)

      const errMsg = `➡️  ${file} - ${JSON.stringify(err.reason)}\n`

      fs.appendFile(`${localImgFolder}/${errorLogFileName}`, errMsg, err => {
        if (err) throw new Error(err)
      })
      
      failedImgs.push({
        file,
        reason: err
      })
    }
  }

  console.log(`\n🎉  Done. ${successCount}/${filteredFiles.length} items uploaded successfully\n`)

  if (failedImgs.length) {

    const formatErrors = failedImgs.map(err => `➡️  ${err.file} - ${JSON.stringify(err.reason)}\n`)

    console.log(`❌  ${failedImgs.length} files failed to upload, see below. Log also saved to file: ${localImgFolder}/${errorLogFileName} \n`)
    console.log(...formatErrors)
  }

})
