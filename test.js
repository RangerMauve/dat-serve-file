const test = require('tape')
const hyperdrive = require('hyperdrive')
const RAM = require('random-access-memory')

function getDrive (structure) {
  const archive = hyperdrive(RAM)

  return archive
}

test.skip('Locate file in root')

test.skip('Locate file in folder')

test.skip('Locate index.html in root')

test.skip('Locate index.html in folder')

test.skip('Locate index.md in root')

test.skip('Locate index.md in folder')

test.skip('Locate file using web_root')

test.skip('Locate index.html using web_root')

test.skip(`Locate fallback_page on 404`)

test.skip(`Locate fallback_page relative to web_root`)

test.skip(`Load file via HTTP handlers`)
