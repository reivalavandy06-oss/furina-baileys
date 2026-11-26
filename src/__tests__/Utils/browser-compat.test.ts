import { proto } from '../../../WAProto/index.js'
import { DEFAULT_CONNECTION_CONFIG } from '../../Defaults'
import { Browsers } from '../../Utils/browser-utils'
import { generateLoginNode, generateRegistrationNode } from '../../Utils/validate-connection'
import type { WABrowserDescription } from '../../Types'

const makeConfig = (browser: WABrowserDescription) => ({
	...DEFAULT_CONNECTION_CONFIG,
	browser
})

const getPayload = (browser: WABrowserDescription) =>
	generateLoginNode('6281234567890@s.whatsapp.net', makeConfig(browser))

const getPlatformType = (browser: WABrowserDescription) => {
	const payload = generateRegistrationNode(
		{
			registrationId: 1,
			signedPreKey: { keyId: 1, keyPair: { public: new Uint8Array([1]), private: new Uint8Array([2]) }, signature: new Uint8Array([3]) },
			signedIdentityKey: { public: new Uint8Array([4]), private: new Uint8Array([5]) }
		} as any,
		makeConfig(browser)
	)
	return proto.DeviceProps.decode(payload.devicePairingData!.deviceProps as Uint8Array).platformType
}

describe('browser platform compatibility', () => {
	it('uses WEB for the Ubuntu desktop preset', () => {
		const payload = getPayload(Browsers.ubuntu('Chrome'))
		expect(payload.userAgent?.platform).toBe(proto.ClientPayload.UserAgent.Platform.WEB)
	})

	it('uses ANDROID for the regular Android preset', () => {
		const payload = getPayload(Browsers.android('Chrome'))
		expect(payload.userAgent?.platform).toBe(proto.ClientPayload.UserAgent.Platform.ANDROID)
	})

	it('uses SMB_ANDROID for the WhatsApp Business Android preset', () => {
		expect(Browsers.businessAndroid('Chrome')).toEqual(['Chrome', 'SMB_ANDROID', ''])
		const payload = getPayload(Browsers.businessAndroid('Chrome'))
		expect(payload.userAgent?.platform).toBe(proto.ClientPayload.UserAgent.Platform.SMB_ANDROID)
	})

	it('matches SMB_ANDROID case-insensitively', () => {
		const payload = getPayload(['Chrome', 'smb_android', ''])
		expect(payload.userAgent?.platform).toBe(proto.ClientPayload.UserAgent.Platform.SMB_ANDROID)
	})

	it('keeps webInfo for business android but drops it for regular android', () => {
		expect(getPayload(Browsers.businessAndroid('Chrome')).webInfo).not.toBeNull()
		expect(getPayload(Browsers.android('Chrome')).webInfo).toBeNull()
	})

	it('uses CHROME platformType for business android companion registration', () => {
		expect(getPlatformType(Browsers.businessAndroid('Chrome'))).toBe(proto.DeviceProps.PlatformType.CHROME)
	})

	it('uses ANDROID_PHONE platformType for regular android companion registration', () => {
		expect(getPlatformType(Browsers.android('Chrome'))).toBe(proto.DeviceProps.PlatformType.ANDROID_PHONE)
	})
})
