const path = require('path')
const fs = require('fs-extra')
const rootDir = path.join(__dirname, '../')
const distDir = path.join(rootDir, './publish/')
const assetsDir = path.join(distDir, './assets/')
const srcDir = path.join(rootDir, './src/common/')
const webAssetsDir = path.join(rootDir, './src/web/')

const version = require(path.join(rootDir, './package.json')).version

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir)
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)

fs.copySync(srcDir, assetsDir)
fs.copySync(webAssetsDir, distDir)
fs.writeJSONSync(path.join(distDir, './version.json'), { version })