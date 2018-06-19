const path = require('path')

const pda = require('pauls-dat-api')
var createError = require('http-errors')

module.exports = locatePath

/*
Given a path, locates what file it should resolve to in the archive.
Callback takes an error if it couldn't be resolved, and a `result` object which either contains the String property `redirect` if a redirect is needed, or a `file` property which is the File stat result
*/
function locatePath (archive, filePath, cb) {
  // Get the manifest
  pda.readManifest(archive).catch(noop).then(function (manifest) {
    // Resolve the path using the manifest web_root if it exists
    const resolvedPath = resolvePath(filePath || '')

    // Stat the path, see if it's a folder or file
    statFile(archive, resolvedPath, function (foundFile) {
      if (foundFile.isDirectory()) {
        // If it was a folder, bu the URL didn't end with a slash, redirect
        if (resolvedPath.slice(-1) !== '/') {
          cb(null, {
            redirect: resolvedPath + '/'
          })
          return
        }

        const indexHTML = path.join(resolvedPath, 'index.html')
        const indexMD = path.join(resolvedPath, 'index.md')

        // If it's a folder, try to serve `index.html`
        tryFile(archive, indexHTML, function (htmlErr, htmlResult) {
          if (!htmlErr) {
            cb(null, htmlResult)
          } else {
            // If it doesn't exist, try to serve index.md
            tryFile(archive, indexMD, function (mdErr, mdResult) {
              if (!mdErr) {
                cb(null, mdResult)
              } else {
                // If neither of them exists, try to 404
                tryFallback(archive, manifest, cb)
              }
            })
          }
        })
      } else {
        // Try to serve the file
        tryFile(archive, resolvedPath, function (serverErr) {
          // If the file couldn't be served, try to 404
          tryFallback(archive, manifest, cb)
        })
      }
    })
  }).catch(cb)
}

// Try to resolve a file from the archive
function tryFile (archive, filePath, cb) {
  statFile(archive, filePath, function (err, entity) {
    if (err) cb(err)
    if (entity && entity.isFile()) {
      cb(null, {
        file: entity
      })
    } else {
      cb(createError(404, 'File Not Found'))
    }
  })
}

// Try to load the fallback page if it's specified
function tryFallback (archive, manifest, cb) {
  if (manifest && manifest.fallback_page) {
    const filePath = resolvePath(manifest, manifest.fallback_page)

    tryFile(archive, filePath, cb)
  } else {
    cb(createError(404, 'File Not Found'))
  }
}

// Stat the file from the archive and populate the `path` property
function statFile (archive, filePath, cb) {
  pda.stat(archive, filePath).then(function (stat) {
    // Set the `path` property
    stat.path = filePath

    cb(null, stat)
  }, cb)
}

// Resolve the path relative to the web root
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

function noop () {}
