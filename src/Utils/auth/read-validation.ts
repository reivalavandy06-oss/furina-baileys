import { BufferJSON } from '../generics'

export const missingFileOnly = (error: unknown): null => {
	if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return null
	throw error
}

export const parseAuthRecord = (raw: string): unknown => {
	try {
		return JSON.parse(raw, BufferJSON.reviver)
	} catch (cause) {
		const error = new SyntaxError('Stored authentication record is malformed')
		Object.defineProperty(error, 'cause', { value: cause })
		throw error
	}
}

export const assertCredentialsObject = (value: unknown): void => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Stored authentication credentials are malformed')
	}
}

export const storedString = (value: unknown): string => {
	if (typeof value !== 'string') throw new Error('Stored authentication record is malformed')
	return value
}
