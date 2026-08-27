// one-shot codemod: port upstream #2559 pairing-platform normalization into socket.ts
// safe: checks every anchor first, idempotent, git-revertible
const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, '..', 'src', 'Socket', 'socket.ts')
let src = fs.readFileSync(file, 'utf8')

if (src.includes('getPairingCodePlatform')) {
	console.log('already patched, nothing to do')
	process.exit(0)
}

const anchor = 'const requestPairingCode = async (phoneNumber: string, customPairingCode?: string): Promise<string> => {'
const oldId = 'content: getCompanionPlatformId(browser)'
const oldDisplay = 'content: `${browser[1]} (${browser[0]})`'

for (const [name, needle] of [['anchor', anchor], ['platform id', oldId], ['display', oldDisplay]]) {
	if (!src.includes(needle)) {
		console.error(`ABORT: pattern "${name}" not found. file untouched.`)
		process.exit(1)
	}
}

const helper =
	'// wa pairing-code validator rejects custom os labels like "Furina-Baileys".\n' +
	'// normalize to canonical values so custom browser names keep working (upstream #2559)\n' +
	'const getPairingCodePlatform = (browser: string[]) => {\n' +
	'\tconst known: { [k: string]: { id: string; name: string } } = {\n' +
	"\t\tChrome: { id: '1', name: 'Chrome' },\n" +
	"\t\tFirefox: { id: '2', name: 'Firefox' },\n" +
	"\t\tIE: { id: '3', name: 'IE' },\n" +
	"\t\tOpera: { id: '4', name: 'Opera' },\n" +
	"\t\tSafari: { id: '5', name: 'Safari' },\n" +
	"\t\tEdge: { id: '6', name: 'Edge' }\n" +
	'\t}\n' +
	"\tconst knownOs = ['Mac OS', 'Windows', 'Ubuntu']\n" +
	"\tconst b = known[browser[1]] || { id: '1', name: 'Chrome' }\n" +
	"\tconst os = knownOs.includes(browser[0]) ? browser[0] : 'Mac OS'\n" +
	'\treturn { id: b.id, display: `${b.name} (${os})` }\n' +
	'}\n\n\t'

src = src.replace(anchor, helper + anchor)
src = src.replace(oldId, 'content: getPairingCodePlatform(browser).id')
src = src.replace(oldDisplay, 'content: getPairingCodePlatform(browser).display')

fs.writeFileSync(file, src)
console.log('socket.ts patched OK')
