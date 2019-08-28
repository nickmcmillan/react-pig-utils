/* eslint camelcase: 0 */

// `node generateJSON --cloudinaryFolder=whateverFolderYouWantJsonFor --out=./outputFilename.json`

require('dotenv').config()
const argv = require('minimist')(process.argv.slice(2))
const cloudinary = require('cloudinary')
const fs = require('fs')
const ColorThief = require('color-thief-jimp')
const Jimp = require('jimp')
const _cliProgress = require('cli-progress')

const outputJSONFileName = argv.out || './output.json'
const cloudinaryFolder = argv.cloudinaryFolder || ''

const cloud_name = process.env.cloud_name
const api_key = process.env.api_key
const api_secret = process.env.api_secret
const max_results = 500 // is the maximum cloudinary allows. not an issue because we run a recursive function with next_cursor

cloudinary.config({ cloud_name, api_key, api_secret })

const getCloudinaryFolder = ({ resourceType }) => {
  console.log(`🐕  Getting all media items from Cloudinary folder: ${cloudinaryFolder}, for resource type: ${resourceType}`)

  const results = []
  return new Promise((resolve, reject) => {
    function recursiveGet(next_cursor) {
      cloudinary.v2.api.resources({
        type: 'upload',
        resource_type: resourceType,
        prefix: cloudinaryFolder,
        context: true, // we want that extra data that we previously stored in cloudinary: created, lat, lng
        colors: true,
        image_metadata: true,
        next_cursor,
        max_results,
      }, function (err, res) {

        if (err) throw new Error(err)

        results.push(...res.resources)

        if (res.next_cursor) {
          console.log(`↩️  Received more than ${max_results} results, going back for more...`)
          recursiveGet(res.next_cursor)
        } else {
          console.log(`✅  Received ${results.length} results from Cloudinary`)
          resolve(results)
        }
      })
    }
    recursiveGet()
  })
}

function componentToHex(c) {
  const hex = c.toString(16)
  return hex.length === 1 ? '0' + hex : hex
}

function rgbToHex(r, g, b) {
  return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b)
}

const getDominantColor = url => new Promise(async (resolve, reject) => {
  Jimp.read(url).then(sourceImage => {
    const [r, g, b] = ColorThief.getColor(sourceImage)
    const hexed = rgbToHex(r, g, b)
    resolve(hexed)
  }).catch(err => {
    reject(err)
  })
})

;(async () => {
  // https://cloudinary.com/documentation/admin_api#optional_parameters
  // need to run this twice, as cloudinary doesn't have an option to return all types
  const cloudinaryImagesArr = await getCloudinaryFolder({ resourceType: 'image' })
  const cloudinaryVideosArr = await getCloudinaryFolder({ resourceType: 'video' })
  const cloudinaryCombinedArr = [...cloudinaryImagesArr, ...cloudinaryVideosArr] // and then just combine them here
  const outputArr = []
  
  const progressBar = new _cliProgress.Bar({}, _cliProgress.Presets.shades_classic)
  let progressBarVal = 0
  console.log('📷  Generating JSON')
  progressBar.start(cloudinaryCombinedArr.length, progressBarVal)

  for (const img of cloudinaryCombinedArr) {
    progressBarVal += 1
    progressBar.update(progressBarVal)

    // Cloudinary doesn't provide dominant colors when using the resources API, only when using the resource API.
    // So it's faster to just get the dominant color ourselves
    let dominantColor = ''
    // Jimp can't get dominant colours from videos.
    if (img.format === 'mp4' || img.format === 'mov') {
      dominantColor = '#fff' // use a default
    } else {
      try {
        dominantColor = await getDominantColor(img.url)
      } catch (err) {
        console.log(`❌  Error getting dominant color ${err}`)
        dominantColor = '#fff' // use a default
      }
    }

    const {
      width,
      height,
      version,
      public_id,
      format,
      context,
    } = img


    // we need to construct a URL that looks like this example;
    // http://res.cloudinary.com/dzroyrypi/image/upload/h_{{HEIGHT}}/v1549624762/europe/DSCF0310.jpg'
    // the {{HEIGHT}} is replaced by React Pig when dyanmically loading different image resolutions
    const url = `https://res.cloudinary.com/${cloud_name}/image/upload/h_{{HEIGHT}}/v${version}/${public_id}.${format}`

    outputArr.push({
      id: public_id.split('/')[1],
      created: context ? new Date(context.custom.created).getTime() : '', // use epoch as it uses fewer bytes (concerned about huge a JSON file)
      lat: context ? context.custom.lat : '',
      lng: context ? context.custom.lng : '',
      author: context ? context.custom.author : '',
      dominantColor,
      url,
      aspectRatio: parseFloat((width / height).toFixed(3), 10), // limit to 3 decimal places
    })
  }

  progressBar.stop()

  fs.writeFile(outputJSONFileName, JSON.stringify(outputArr), 'utf8', () => {
    console.log(`🎉  Done! Generated JSON file: ${outputJSONFileName}`)
  })
})()