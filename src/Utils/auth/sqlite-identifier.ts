import { Boom } from '@hapi/boom'

/** Accept one table or schema.table; quoted components retain their literal meaning. */
export const quoteSQLiteIdentifier = (input: string): string => {
	const invalid = () => new Boom('Malformed SQLite table identifier', { statusCode: 400 })
	if (typeof input !== 'string' || /[\x00-\x1f\x7f]/.test(input)) throw invalid()
	const parts: string[] = []
	let index = 0
	while (index < input.length) {
		while (input[index] === ' ') index++
		const start = input[index]
		let value = ''
		if (start === '"' || start === '`' || start === '[' || start === "'") {
			const end = start === '[' ? ']' : start
			index++
			let closed = false
			while (index < input.length) {
				const char = input[index++]!
				if (char !== end) {
					value += char
				} else if (end !== ']' && input[index] === end) {
					value += end
					index++
				} else {
					closed = true
					break
				}
			}
			if (!closed) throw invalid()
			while (input[index] === ' ') index++
			if (index < input.length && input[index] !== '.') throw invalid()
		} else {
			const begin = index
			while (index < input.length && input[index] !== '.') index++
			value = input.slice(begin, index).trim()
			// Unquoted punctuation names are additive; SQL syntax must be quoted explicitly.
			if (/["'`\[\];(),?*\\/]/.test(value) || value.includes('--')) throw invalid()
		}
		if (!value) throw invalid()
		parts.push(`"${value.replace(/"/g, '""')}"`)
		if (parts.length > 2) throw invalid()
		if (index < input.length) {
			index++
			if (index === input.length) throw invalid()
		}
	}
	if (!parts.length) throw invalid()
	return parts.join('.')
}
