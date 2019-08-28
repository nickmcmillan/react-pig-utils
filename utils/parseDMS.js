function convertDMSToDD(degrees, minutes, seconds, direction) {
  const dd = Number(degrees) + Number(minutes) / 60 + Number(seconds) / (60 * 60)

  if (direction == "S" || direction == "W") {
    dd = dd * -1
  } // Don't do anything for N or E
  return dd
}

// node uses different syntax to es6+
module.exports = function parseDMS(input) {
  // clean up the shitty string provided to us from exiftool
  // '52 deg 18\' 41.04" N, 4 deg 48\' 57.60" E'
  const parts = input.trim().replace('deg', '').replace("'", '').replace('"', '').split(/\s+/)
  return convertDMSToDD(parts[0], parts[1], parts[2], parts[3])
}