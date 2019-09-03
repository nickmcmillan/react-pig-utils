# react-pig-utils

> Utilities for [React Pig](https://github.com/nickmcmillan/react-pig)

## upload.js
Using this file assumes you are using Cloudinary as your image hosting provider. You could take the concepts within it and write it for your own image hosting provider of choice.

Running the file will loop through a local folder (and its subfolders) of images & videos, it will generate metadata on each item, and will upload them to Cloudinary.

To use upload.js
1. Create a Cloudinary account. 
2. Create a file named `.env` and save it in the same folder as `upload.js`. Paste in the following with your Cloudinary credentials filled out;
```
cloud_name="abc123"
api_key="1234567890"
api_secret="yourapisecret"
```

3. Run the file thusly `node upload --in=./yourLocalImgPath/ --cloudinaryFolder=yourCloudinaryFolderName`
* `--in` - your local folder where your images are at (it will also recursively use files found in subfolders too)
* `--cloudinaryFolder` - the folder in Cloudinary (optional, if omitted will use the Cloudinary root folder)

### For Apple Photos users
The Apple Photos app conveniently has a feature where it can export your photos into folders named with location and date. If this folder structure is present in your `--in` folder, `upload.js` will automatically use the folder names to add `location` and `date` metadata to the images. This is handy for grouping images later. 

To export your images from Apple Photos;
1. Select all images to export
2. File -> Export -> Export Photos -> Filename: Use Title & Subfolder Format: Moment Name
3. When running upload.js just point `--in` at the generated folder



### Metadata
`upload.js` will automatically add metadata to the images uploaded to Cloudinary. This includes;
* `location` - the location detected from the Apple Photos folder, as mentioned above
* `date` - the date detected from the Apple Photos folder, as mentioned above
* `created` - the file created date from the original file. Often it's the same as `date`
* `lat` - latitude as extracted from the original files EXIF data
* `lng` - longitude as extracted from the original files EXIF data
* `dominantColor` - the dominant colour of the image, for videos this is always `#fff`
* neighbourhood, city, country, streetName, - generating these requires a reverse geocode lookup based on the `lat` `lng`, so if you require these you'll need to add a Google API key into the `.env` file, example below, simply adding the key will enable the feature;

`google_api="123"`


## generateJSON.js
Once you've uploaded your images, you'll need to generate the JSON file to provide to React Pig.
Assuming you have a Cloudinary account and have followed the `upload.js` process;

`node generateJSON --cloudinaryFolder=whateverFolderYouWantJsonFrom --out=./outputFilename.json`

## groupify.js

docs coming.

## License

MIT © [nickmcmillan](https://github.com/nickmcmillan)
