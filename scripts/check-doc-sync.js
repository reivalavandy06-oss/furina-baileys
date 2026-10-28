#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version

const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')

const changelogRe = new RegExp(`## ${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
const readmeRe = new RegExp(version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

let ok = true
if (!changelogRe.test(changelog)) {
	console.error('❌ Versi belum ada di CHANGELOG')
	ok = false
}
if (!readmeRe.test(readme)) {
	console.error('❌ Versi belum ada di README')
	ok = false
}

if (ok) {
	console.log('✅ Dokumentasi sinkron!')
} else {
	console.error(`❌ Versi ${version} belum ada di CHANGELOG/README`)
	process.exit(1)
}