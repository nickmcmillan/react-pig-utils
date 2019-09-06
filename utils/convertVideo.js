// const fs = require('fs')
// const path = require('path')
const ffmpeg = require('fluent-ffmpeg')


module.exports = convertVideo = (file, tempVideoFileName) => new Promise(async (resolve, reject) => {
  
  // var outStream = fs.createWriteStream(path.resolve(__dirname, '.cmp.mp4'));

  await ffmpeg(file)
    .videoCodec('libx264') // convert to mp4
    // limit video dimensions
    .size('1024x?')
    .size('?x1024')
    .audioBitrate(128)
    .videoBitrate(5000)
    .on('start', () => {
      console.log('📼  Started converting video')
    })
    .on('error', (err) => {
      console.log('  Error converting video', err)
      reject(err)
    })
    .on('end', (stdout, stderr) => {
      console.log('   Video conversion done')
      resolve(tempVideoFileName)
    })
    // .pipe(outStream, { end: true })
    // .output(outStream)
    .output(tempVideoFileName)
    .run()
    // .pipe(outStream, { end: true })
    // .save('./testtoot.mp4')

})