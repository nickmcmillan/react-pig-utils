const ColorThief = require('color-thief-jimp')
const Jimp = require('jimp')

function componentToHex(c) {
  const hex = c.toString(16)
  return hex.length === 1 ? '0' + hex : hex
}

function rgbToHex(r, g, b) {
  return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b)
}

module.exports = getDominantColor = url => new Promise(async (resolve, reject) => {
  Jimp.read(url).then(sourceImage => {
    const [r, g, b] = ColorThief.getColor(sourceImage)
    const hexed = rgbToHex(r, g, b)
    resolve(hexed)
  }).catch(err => {
    reject(err)
  })
})