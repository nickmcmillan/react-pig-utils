/* eslint camelcase: 0 */

// node generateJSON --cloudinaryFolder=whateverFolderYouWantJsonFrom --out=./outputFilename.json

require('dotenv').config()
const argv = require('minimist')(process.argv.slice(2))
const cloudinary = require('cloudinary')
const fs = require('fs')

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
          console.log(`✅  Received ${results.length} ${resourceType} results from Cloudinary`)
          resolve(results)
        }
      })
    }
    recursiveGet()
  })
}



;(async () => {
  // https://cloudinary.com/documentation/admin_api#optional_parameters
  // need to run this function twice, as cloudinary doesn't have an option to return multiple types
  const cloudinaryImagesArr = await getCloudinaryFolder({ resourceType: 'image' })
  const cloudinaryVideosArr = await getCloudinaryFolder({ resourceType: 'video' })
  const cloudinaryCombinedArr = [...cloudinaryImagesArr, ...cloudinaryVideosArr] // and then just combine them here
  const outputArr = []
  
  console.log(`🍜  Generating JSON for ${cloudinaryCombinedArr.length} items`)

  for (const mediaItem of cloudinaryCombinedArr) {

    const {
      width,
      height,
      version,
      public_id,
      format,
      context,
      resource_type,
    } = mediaItem

    // We need to create a URL that looks like this example;
    // http://res.cloudinary.com/yourCloudinaryName/image/upload/h_{{HEIGHT}}/v1549624762/europe/DSCF0310.jpg'
    // {{HEIGHT}} is replaced by React Pig when dynamically requesting different image sizes
    const url = `https://res.cloudinary.com/${cloud_name}/${resource_type}/upload/h_{{HEIGHT}}/v${version}/${public_id}.${format}`

    // cloudinary puts videos in a subfolder without any choice.
    // then when runnign this api lookup it returns the same video twice, one with the wrong url. good work cloudinary.
    // const isBuggySubfolder = public_id.indexOf('/') === public_id.lastIndexOf('/')
    // if (isBuggySubfolder) continue

    outputArr.push({
      id: public_id.split('/')[1],
      url,
      created: context ? new Date(context.custom.created).getTime() : '', // use epoch time as it uses fewer bytes (concerned about huge a JSON file)
      date: context ? new Date(context.custom.date).getTime() : '',
      lat: context ? context.custom.lat : '',
      lng: context ? context.custom.lng : '',
      location: context ? context.custom.location : '',
      neighbourhood: context ? context.custom.neighbourhood : '',
      city: context ? context.custom.city : '',
      country: context ? context.custom.country : '',
      streetName: context ? context.custom.streetName : '',
      dominantColor: context ? context.custom.dominantColor : '',
      aspectRatio: parseFloat((width / height).toFixed(3), 10), // limit to 3 decimal places
    })
  }

  fs.writeFile(outputJSONFileName, JSON.stringify(outputArr), 'utf8', err => {
    if (err) throw err
    console.log(`🎉  Done! Generated JSON file: ${outputJSONFileName}`)
  })
})()
