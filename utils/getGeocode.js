const NodeGeocoder = require('node-geocoder')

const options = {
  provider: 'google',

  // Optional depending on the providers
  httpAdapter: 'https', // Default
  apiKey: process.env.google_api, // for Mapquest, OpenCage, Google Premier
  formatter: null         // 'gpx', 'string', ...
}

const geocoder = NodeGeocoder(options)


module.exports = getFileData = gpsData => new Promise(async resolve => {
  await geocoder.reverse({ lat: gpsData.lat, lon: gpsData.lng })
    .then(function (res) {

      const gpsGeocode = {
        neighbourhood: res[0].extra.neighborhood || '',
        city: res[0].city || '',
        country: res[0].country || '',
        streetName: res[0].streetName || '',
      }

      resolve(gpsGeocode)

    })
    .catch(function (err) {
      console.log(err);
    });
})