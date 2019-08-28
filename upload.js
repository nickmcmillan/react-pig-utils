/* eslint camelcase: 0 */

// node upload.js --in=./yourLocalImgPath/ --cloudinaryFolder=yourFolderName


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

const localImgFolder = argv.in
const cloudinaryFolder = argv.cloudinaryFolder || ''

if (!localImgFolder) throw new Error('Missing argument: --in')

const cloud_name = process.env.cloud_name
const api_key = process.env.api_key
const api_secret = process.env.api_secret

const MAX_IMAGE_DIMENSION = 3000 // width or height. set a limit so you don't upload images too large and risk up your storage limit

cloudinary.config({ cloud_name, api_key, api_secret })

const uploadImageToCloudinary = (fileBuffer, { location, date, gpsData, created }) => new Promise(async (resolve, reject) => {
  // Cloudinary only allows strings in its context
  location = location ? location.toString() : ''
  date = date ? date.toString() : ''
  created = created ? created.toString() : ''
  const lat = gpsData.lat ? gpsData.lat.toString() : ''
  const lng = gpsData.lng ? gpsData.lng.toString() : ''

  try {
    await cloudinary.v2.uploader.upload_stream({
      resource_type: "auto",
      // quality: 100,
      quality: 'auto:best',
      colors: true,
      exif: true,
      image_metadata: true,
      overwrite: true, // replace anything existing in cloudinary
      folder: cloudinaryFolder,
      // context is cloudinary's way of storing meta data about an image
      context: {
        location,
        date,
        created,
        lat,
        lng,
      },
    }, function (err, result) {

      if (err) reject(err)

      resolve(result)

    }).end(fileBuffer)

  } catch (err) {
    reject(err)
  }
})

const uploadVideoToCloudinary = (file, { location, date, gpsData, created }) => new Promise(async (resolve, reject) => {
  // Cloudinary only allows strings in its context
  location = location ? location.toString() : ''
  date = date ? date.toString() : ''
  created = created ? created.toString() : ''
  const lat = gpsData.lat ? gpsData.lat.toString() : ''
  const lng = gpsData.lng ? gpsData.lng.toString() : ''

  try {
    await cloudinary.v2.uploader.upload_large(file, {
      resource_type: "auto", // needs to be "auto" not "video" so that gifs are included too. shrugs.
      // limit the size of the uploaded video
      width: 1280,
      height: 1280,
      eager_async: true,
      crop: "limit",
      colors: true,
      exif: true,
      image_metadata: true,
      overwrite: false,
      folder: cloudinaryFolder,
      // context is cloudinary's way of storing meta data about an image
      context: {
        location,
        date,
        created,
        lat,
        lng,
      },
    }, function (err, result) {

      if (err) reject(err)

      resolve(result)

    })

  } catch (err) {
    reject(err)
  }
})

const getFileData = fileName => new Promise(async resolve => {
  await fs.stat(fileName, (err, stats) => {
    if (err) throw new Error(err)
    resolve(stats)
  })
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
      // Possible folder name formats;
      // ./ (image in root folder)
      // 25 March 2016
      // Amsterdam - Oud-West - Jacob van Lennepstraat, 18 February 2019
      // Beirut, Beirut - Younas Gebayli Street, 13 October 2017
      // We always know the portion after the last comma is the date
      // And everything before that is the address
      const folderName = file.split('/')[1]
      const breakChar = folderName.lastIndexOf(',')

      // if the file is in the root on the source folder, set location and date to null
      const isRoot = file.split('/').length === 2
      const location = !isRoot ? folderName.substring(0, breakChar) : null
      const date = !isRoot ? folderName.substring(breakChar + 1).trim() : null

      // GPS EXIF data
      let gpsData = {
        lat: null,
        lng: null,
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
        }

      } catch (err) {
        console.log(`Couldn't get GPS data from image ${err}`)
      }

      // END GPS EXIF data

      // this uploads the file and returns all of its juicy metadata
      const fileToLowerCase = file.toLowerCase()
      const isVideo = fileToLowerCase.includes('.mov') || fileToLowerCase.includes('.mp4') || fileToLowerCase.includes('.gif')

      let uploadedFileData
      if (isVideo) {
        uploadedFileData = await uploadVideoToCloudinary(file, { location, date, gpsData, created })
      } else {

        const fileBuffer = await sharp(file)
          .resize({
            width: MAX_IMAGE_DIMENSION,
            height: MAX_IMAGE_DIMENSION,
            fit: 'inside',
            withoutEnlargement: true, // otherwise cloudinary enlarges images to be the MAX_IMAGE_DIMENSION. Silly.
          })
          .toBuffer()

        uploadedFileData = await uploadImageToCloudinary(fileBuffer, { location, date, gpsData, created })
      }

      if (uploadedFileData.err) {
        console.warn('❌  Error from Cloudinary. Skipping file:', err)
        continue
      }

      successCount += 1

    } catch (err) {
      console.warn(`❌  Oh dear: Error uploading ${file}:`, err)
      failedImgs.push({
        file,
        reason: err
      })
    }
  }

  progressBar.stop()

  console.log(`🎉  Done. ${successCount}/${filteredFiles.length} items uploaded successfully`)

  if (failedImgs.length) {

    const formatErrors = failedImgs.map(err => {
      return `➡️  ${err.file} - ${err.reason.message}. HTTP code: ${err.reason.http_code}. \n`
    })

    console.log(`❌  ${failedImgs.length} files failed to upload, see logs below`)
    console.log(...formatErrors)
  }
})
