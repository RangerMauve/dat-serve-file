/*
Based on https://github.com/beakerbrowser/homebase/blob/master/lib/vhosts/dat.js#L64

I know that promise / cb mising is horrible, was kinda in a rush
PRs for cleaner code are welcome! :D
*/

const pda = require('pauls-dat-api')
const parseRange = require('range-parser')
var createError = require('http-errors')

var mime = require('./mime')
var locatePath = require('./locatePath')

module.exports = serveFile

// Based on how homebase serves files
// https://github.com/beakerbrowser/homebase/blob/master/lib/vhosts/dat.js#L64

/**
 * Serve a file from a hyperdrive using the same logic as beaker
 * This module does not support directory listings
 * @param {Hyperdrive} archive The archive to serve the file from
 * @param {String} filePath The path being served
 * @param {*} req A Node HTTP request
 * @param {*} res A Node HTTP response
 * @param {*} cb A callback. Invoked with an error if there was an error, invoked with no error if a response was made
 */
function serveFile (archive, filePath, req, res, cb) {
  // Make sure it's a GET or HEAD request, error out if not
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return cb(createError(405, 'Method Not Supported'))
  }

  locatePath(archive, filePath, function (err, locatedData) {
    if (err) return cb(err)

    if (locatedData.redirect) {
      redirect(locatedData.redirect, res)
      cb(null)
    } else {
      sendFile(archive, locatedData.file, req, res, cb)
    }
  })
}

function redirect (redirectPath, res) {
  res.set({ Location: redirectPath })
  return res.status(303).end()
}

// Respond with the file from the archive
function sendFile (archive, entry, req, res, cb) {
  var headersSent = false
  let statusCode = 200

  // Try to get the cspHeader from the manifest
  getCSP(archive, function (err, cspHeader) {
    if (err) return cb(err)

    // handle range
    res.set('Accept-Ranges', 'bytes')
    let range = req.headers.range && parseRange(entry.size, req.headers.range)
    if (range && range.type === 'bytes') {
      range = range[0] // only handle first range given
      statusCode = 206
      res.set('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + entry.size)
      res.set('Content-Length', range.end - range.start + 1)
    } else {
      if (entry.size) {
        res.set('Content-Length', entry.size)
      }
    }

    let fileReadStream = archive.createReadStream(entry.path, range)
    let dataStream = fileReadStream
      .pipe(mime.identifyStream(entry.path, mimeType => {
      // cleanup the timeout now, as bytes have begun to stream

      // send headers, now that we can identify the data
        headersSent = true
        res.set({
          'Content-Type': mimeType,
          'Content-Security-Policy': cspHeader,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age: 60'
        })

        if (req.method === 'HEAD') {
          dataStream.destroy() // stop reading data
          res.status(204).end()
        } else {
          res.status(statusCode)
          dataStream.pipe(res)
        }
      }))

    // handle empty files
    fileReadStream.once('end', () => {
      cb(null)
      if (!headersSent) {
        res.set({
          'Content-Security-Policy': cspHeader,
          'Access-Control-Allow-Origin': '*'
        })
        res.status(200).end()
      }
    })

    // handle read-stream errors
    fileReadStream.once('error', () => {
      if (!headersSent) cb(createError(500, 'Failed to read file'))
    })
  })
}

function getCSP (archive, cb) {
  pda.readManifest(archive).catch(noop).then(function (manifest) {
    if (manifest && manifest.content_security_policy && typeof manifest.content_security_policy === 'string') {
      return manifest.content_security_policy
    }
    return ''
  })
}

function noop () {}
