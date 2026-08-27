import makeWASocket from './Socket/index'

export * from '../WAProto/index.js'
export * from './Utils'
export * from './Types'
export * from './Defaults'
export * from './WABinary'
export * from './WAM'
export * from './WAUSync'
export * from './Utils/furina-resolver'
export * from './Utils/antiban'

export type WASocket = ReturnType<typeof makeWASocket>
export { makeWASocket }
export default makeWASocket
