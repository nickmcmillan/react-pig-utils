const fs = require('fs')

module.exports = getFileData = fileName => new Promise(async resolve => {
  await fs.stat(fileName, (err, stats) => {
    if (err) throw new Error(err)
    resolve(stats)
  })
})