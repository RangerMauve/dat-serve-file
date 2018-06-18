const path = require('path')

/*
Based on https://github.com/beakerbrowser/homebase/blob/master/lib/vhosts/dat.js#L64

I know that promise / cb mising is horrible, was kinda in a rush
PRs for cleaner code are welcome! :D
*/

const pda = require('pauls-dat-api')
const parseRange = require('range-parser')
var createError = require('http-errors')
var mime = require('./mime')

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

  // Get the manifest
  pda.readManifest(archive).catch(noop).then(function (manifest) {
    // Resolve the path using the manifest web_root if it exists
    const resolvedPath = resolvePath(filePath || '')

    // Stat the path, see if it's a folder or file
    statFile(archive, resolvedPath, function (foundFile) {
      if (foundFile.isDirectory()) {
        // If it was a folder, bu the URL didn't end with a slash, redirect
        if (resolvedPath.slice(-1) !== '/') {
          redirect(resolvedPath + '/', res)
          cb(null)
          return
        }

        // If it's a folder, try to serve `index.html` and `index.md`
        tryFile(archive, manifest, path.join(resolvedPath, 'index.html'), req, res, function (htmlErr) {
          if (!htmlErr) return cb(null)
          tryFile(archive, manifest, path.join(resolvedPath, 'index.md'), req, res, function (mdErr) {
            // If neither of them exists, try to 404
            try404(archive, manifest, req, res, cb)
          })
        })
      } else {
        // Try to serve the file
        tryFile(archive, manifest, resolvedPath, req, res, function (serverErr) {
          // If the file couldn't be served, try to 404
          try404(archive, manifest, req, res, cb)
        })
      }
    })
  }).catch(cb)
}

function redirect (redirectPath, res) {
  res.set({ Location: redirectPath })
  return res.status(303).end()
}

function statFile (archive, filePath, cb) {
  pda.stat(archive, filePath).then(function (stat) {
    // Set the `path` property
    stat.path = filePath

    cb(null, stat)
  }, cb)
}

function tryFile (archive, manifest, filePath, req, res, cb) {
  statFile(archive, filePath, function (statErr, stat) {
    if (statErr) return cb(statErr)

    // If path isn't a file, it should error out
    if (!stat.isFile()) {
      cb(createError(404, 'File not found'))
    } else {
      sendFile(archive, manifest, stat, req, res, cb)
    }
  })
}

// Respond with the file from the archive
function sendFile (archive, manifest, entry, req, res, cb) {
  var headersSent = false
  let statusCode = 200

  // Try to get the cspHeader from the manifest
  var cspHeader = getCSP(manifest)

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
}

function try404 (archive, manifest, req, res, cb) {
  if (manifest && manifest.fallback_page) {
    tryFile(archive, manifest, manifest.fallback_page, req, res, cb)
  } else {
    cb(createError(404, 'File Not Found'))
  }
}

function getCSP (manifest) {
  if (manifest && manifest.content_security_policy && typeof manifest.content_security_policy === 'string') {
    return manifest.content_security_policy
  }
  return ''
}

function resolvePath (manifest, filePath) {
  if (manifest && manifest.web_root) {
    if (filePath) {
      return path.join(manifest.web_root, filePath)
    } else {
      return manifest.web_root
    }
  }

  return filePath
}

function noop () {
}
