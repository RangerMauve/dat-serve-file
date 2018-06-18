/*

Taken from https://github.com/beakerbrowser/homebase

MIT License

Copyright (c) 2018 Blue Link Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
 */

const identifyFiletype = require('identify-filetype')
const mime = require('mime')
const through2 = require('through2')

mime.default_type = 'text/plain'

var identify =
  exports.identify = function (name, chunk) {
    // try to identify the type by the chunk contents
    var mimeType
    var identifiedExt = (chunk) ? identifyFiletype(chunk) : false
    if (identifiedExt) {
      mimeType = mime.getType(identifiedExt)
    }
    if (!mimeType) {
      // fallback to using the entry name
      mimeType = mime.getType(name)
    }

    // hackish fix
    // the svg test can be a bit aggressive: html pages with
    // inline svgs can be falsely interpretted as svgs
    // double check that
    if (identifiedExt === 'svg' && mime.getType(name) === 'text/html') {
      return 'text/html'
    }

    return mimeType
  }

exports.identifyStream = function (name, cb) {
  var first = true
  return through2(function (chunk, enc, cb2) {
    if (first) {
      first = false
      cb(identify(name, chunk))
    }
    this.push(chunk)
    cb2()
  })
}
