/* eslint camelcase: 0 */

// Example usage:
// node upload --in=./yourLocalImgPath/ --cloudinaryFolder=yourCloudinaryFolderName

require('dotenv').config()
const argv = require('minimist')(process.argv.slice(2))
const cloudinary = require('cloudinary')
const fs = require('fs')
const _cliProgress = require('cli-progress')
const recursive = require('recursive-readdir')
const sharp = require('sharp')
const exif = require('exiftool')

// local utils
const parseDMS = require('./utils/parseDMS')
const getFileData = require('./utils/getFileData')
const getGeocode = require('./utils/getGeocode')

const localImgFolder = argv.in
const cloudinaryFolder = argv.cloudinaryFolder || ''

if (!localImgFolder) throw new Error('Missing argument: --in')

const cloud_name = process.env.cloud_name
const api_key = process.env.api_key
const api_secret = process.env.api_secret

const logFileName = 'upload-log.txt'

const MAX_IMAGE_DIMENSION = 1920 // width or height. set a limit so you don't upload images too large and risk up your storage limit
const MAX_VIDEO_DIMENSION = 1024

cloudinary.config({ cloud_name, api_key, api_secret })

const uploadImageToCloudinary = (fileBuffer, { location, date, gpsData, gpsGeocode, created }) => new Promise(async (resolve, reject) => {
  // Cloudinary only allows String types in its context
  location = location ? location.toString() : ''
  date = date ? date.toString() : ''
  created = created ? created.toString() : ''
  const lat = gpsData.lat ? gpsData.lat.toString() : ''
  const lng = gpsData.lng ? gpsData.lng.toString() : ''

  
  const { neighbourhood, city, country, streetName } = gpsGeocode


  try {
    await cloudinary.v2.uploader.upload_stream({
      resource_type: "auto",
      // quality: 100,
      quality: 'auto:best',
      // colors: true,
      // exif: true,
      // image_metadata: true,
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
      },
    }, function (err, result) {

      if (err) reject(err)

      resolve(result)

    }).end(fileBuffer)

  } catch (err) {
    reject(err)
  }
})

const uploadVideoToCloudinary = (file, { location, date, gpsData, gpsGeocode, created }) => new Promise(async (resolve, reject) => {
  // Cloudinary only allows strings in its context
  location = location ? location.toString() : ''
  date = date ? date.toString() : ''
  created = created ? created.toString() : ''
  const lat = gpsData.lat ? gpsData.lat.toString() : ''
  const lng = gpsData.lng ? gpsData.lng.toString() : ''

  const { neighbourhood, city, country, streetName } = gpsGeocode

  try {
    await cloudinary.v2.uploader.upload(file, {
      async: true,
      // eager_async: true,
      // eager_notification_url: 'https://google.com',
      // eager: [
      //   {
      //     width: MAX_VIDEO_DIMENSION,
      //     height: MAX_VIDEO_DIMENSION,
      //     crop: "limit",
      //   },
      // ],
      resource_type: "auto", // needs to be "auto" not "video" so that gifs are included too. shrugs.
      // limit the size of the uploaded video
      width: MAX_VIDEO_DIMENSION,
      height: MAX_VIDEO_DIMENSION,
      crop: "limit",
      // colors: true,
      // exif: true,
      // image_metadata: true,
      overwrite: true,
      folder: cloudinaryFolder,
      context: {
        location,
        date,
        created,
        lat,
        lng,
        neighbourhood, city, country, streetName,
      },
    }, function (err, result) {
      
      if (err) reject(err)
      resolve(result)
    })

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
  console.log(`⬆️  Uploading`)

  const progressBar = new _cliProgress.Bar({}, _cliProgress.Presets.shades_classic)
  let progressBarVal = 0
  progressBar.start(filteredFiles.length, progressBarVal)

  const failedImgs = []

  // loop through each image found
  for (const file of filteredFiles) {

    progressBarVal += 1
    progressBar.update(progressBarVal)
    // cloudinary doesnt store created data, but we need this. Its useful to know when an image was created.
    const { birthtime: created } = await getFileData(file)

    try {
      // Possible folder name variations (examples);
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
      const location = isRoot ? null : fullPath.substring(0, breakCharIndex)
      // get the date and filename, then remove the filename
      const date = isRoot ? null : fullPath.substring(breakCharIndex + 1).trim().split('/')[0]

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

          if (process.env.google_api) {
            gpsGeocode = await getGeocode(gpsData)
          }
        }

      } catch (err) {
        console.log(`\n❌  Couldn't get GPS data from ${file} - ${err}`)
      }
      // END GPS EXIF data

      const fileToLowerCase = file.toLowerCase()
      const isVideo = fileToLowerCase.includes('.mov') || fileToLowerCase.includes('.mp4') || fileToLowerCase.includes('.gif')

      let uploadedFileData
      if (isVideo) {
        uploadedFileData = await uploadVideoToCloudinary(file, { location, date, gpsData, gpsGeocode, created })
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

        uploadedFileData = await uploadImageToCloudinary(fileBuffer, { location, date, gpsData, gpsGeocode, created })
      }

      if (uploadedFileData.err) {
        console.warn('\n❌  Error from Cloudinary. Skipping file:', err)
        continue
      }

      successCount += 1

    } catch (err) {
      
      // console.warn(`\n❌  Oh dear. Error uploading ${file}:\n`)
      // console.warn(err)
      failedImgs.push({
        file,
        reason: err
      })
    }
  }

  progressBar.stop()

  // A timeout just because sometimes the progress bar visually clashes with the console logs
  setTimeout(() => {
    console.log(`\n🎉  Done. ${successCount}/${filteredFiles.length} items uploaded successfully\n`)
  
    if (failedImgs.length) {
  
      const formatErrors = failedImgs.map(err => `➡️  ${err.file} - ${err.reason.message}. HTTP code: ${err.reason.http_code}\n`)
  
      console.log(`❌  ${failedImgs.length} files failed to upload, see below. Logs also saved to file: ${localImgFolder}/${logFileName} \n`)
      console.log(...formatErrors)
      fs.appendFile(`${localImgFolder}/${logFileName}`, ...formatErrors, () => {
        console.log(`\n📄  Errors saved to ${logFileName}\n`)
      })
    }
  }, 2000)

})
