// follow-up codemod: make getPairingCodePlatform pass strict TS (noUncheckedIndexedAccess)
const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, '..', 'src', 'Socket', 'socket.ts')
let src = fs.readFileSync(file, 'utf8')

const oldB = "const b = known[browser[1]] || { id: '1', name: 'Chrome' }"
const newB = "const b = known[browser[1] ?? 'Chrome'] ?? { id: '1', name: 'Chrome' }"

const oldOs = "const os = knownOs.includes(browser[0]) ? browser[0] : 'Mac OS'"
const newOs = "const osName = browser[0] ?? 'Mac OS'\n\tconst os = knownOs.includes(osName) ? osName : 'Mac OS'"

if (src.includes(newB)) {
	console.log('already strict-safe, nothing to do')
	process.exit(0)
}

for (const [name, needle] of [['b-line', oldB], ['os-line', oldOs]]) {
	if (!src.includes(needle)) {
		console.error(`ABORT: pattern "${name}" not found. file untouched.`)
		process.exit(1)
	}
}

src = src.replace(oldB, newB)
src = src.replace(oldOs, newOs)

fs.writeFileSync(file, src)
console.log('socket.ts strict-fix OK')
