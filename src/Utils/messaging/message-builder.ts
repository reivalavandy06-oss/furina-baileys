// furina-baileys — message-builder.ts
// Fluent builder untuk komposisi pesan interaktif + standard.
// Dual-path: sendMessage() untuk content biasa, relayMessage() + additionalNodes
// untuk content yang butuh render native (button, carousel).
//
// NOTE viewOnce: pada upstream Baileys 7.0.0-rc14 masih ada bug platform —
// pesan viewOnce outgoing bisa silent drop. Wrapping di sini sudah benar,
// sukses/gagalnya tergantung versi Baileys di sisi client.

import { proto } from '../../../WAProto/index.js'
import type {
  AnyMessageContent,
  MiscMessageGenerationOptions,
  WAMessage,
  MessageRelayOptions,
} from '../../Types'
import type { FurinaButton } from './types'
import { FURINA_BUTTON_RULES } from './types'
import { toNativeButton, buildHeader, buildButtonNodes } from './button-builders'
import { FURINA_CAROUSEL_RULES, buildCarouselNodes } from './carousel'
import { prepareWAMessageMedia } from '../messages'
import { generateMessageIDV2 } from '../generics'

export interface AdReplyOptions {
  title: string
  body?: string
  thumbnail?: string | Buffer | Uint8Array
  sourceUrl?: string
  mediaType?: 1 | 2 | 3
  renderLargerThumbnail?: boolean
  showAdAttribution?: boolean
}

export interface CarouselCardOptions {
  header?: {
    title?: string
    subtitle?: string
    image?: Buffer | { url: string }
    video?: Buffer | { url: string }
  }
  body: string
  footer?: string
  buttons: FurinaButton[]
}

export interface LocationOptions {
  degreesLatitude: number
  degreesLongitude: number
  name?: string
  address?: string
}

export interface ContactOptions {
  phoneNumber: string
  fullName: string
  org?: string
}

// ===== FURINA: MESSAGE BUILDER =====

export class MessageBuilder {
  private _content: any = {}
  private _options: MiscMessageGenerationOptions = {}
  private _contextInfo: proto.IContextInfo = {}
  private _buttons: FurinaButton[] = []
  private _cards: CarouselCardOptions[] = []
  private _mentions: string[] = []
  private _mediaType: 'image' | 'video' | 'sticker' | 'audio' | 'document' | null = null
  private _viewOnce: boolean = false

  // ===== FURINA: TEXT & MEDIA =====

  setText(text: string, autoMention: boolean = true): this {
    this._content = { text }
    if (autoMention) {
      const mentionRegex = /(?<![\w.@-])@(\d{5,16})(?!\d)/g
      const matches = [...text.matchAll(mentionRegex)]
      if (matches.length > 0) {
        this._mentions.push(...matches.map((m) => m[1] + '@s.whatsapp.net'))
        this._mentions = Array.from(new Set(this._mentions))
        this._contextInfo = { ...this._contextInfo, mentionedJid: this._mentions }
      }
    }
    return this
  }

  setImage(image: Buffer | { url: string }, caption?: string): this {
    this._content = { image, caption }
    this._mediaType = 'image'
    return this
  }

  setVideo(video: Buffer | { url: string }, caption?: string, gifPlayback?: boolean): this {
    this._content = { video, caption, gifPlayback }
    this._mediaType = 'video'
    return this
  }

  setAudio(audio: Buffer | { url: string }, ptt?: boolean): this {
    this._content = { audio, ptt, mimetype: ptt ? 'audio/ogg; codecs=opus' : undefined }
    this._mediaType = 'audio'
    return this
  }

  setDocument(document: Buffer | { url: string }, fileName: string, mimetype?: string, caption?: string): this {
    this._content = { document, fileName, mimetype, caption }
    this._mediaType = 'document'
    return this
  }

  setSticker(sticker: Buffer | { url: string }, isAnimated?: boolean): this {
    if (Buffer.isBuffer(sticker)) {
      const isWebP = sticker.slice(0, 4).toString() === 'RIFF' && sticker.slice(8, 12).toString() === 'WEBP'
      if (!isWebP) console.warn('[furina-builder] sticker bukan WebP, mungkin tidak render')
    }
    this._content = { sticker, isAnimated }
    this._mediaType = 'sticker'
    return this
  }

  setLocation(opts: LocationOptions): this {
    this._content = {
      location: {
        degreesLatitude: opts.degreesLatitude,
        degreesLongitude: opts.degreesLongitude,
        name: opts.name,
        address: opts.address,
      },
    }
    return this
  }

  setContact(opts: ContactOptions): this {
    const clean = opts.phoneNumber.replace(/\D/g, '')
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:;' + opts.fullName + ';;;',
      'FN:' + opts.fullName,
      opts.org ? 'ORG:' + opts.org : null,
      'TEL;type=CELL;type=VOICE;waid=' + clean + ':+' + clean,
      'END:VCARD',
    ]
      .filter(Boolean)
      .join('\n')
    this._content = { contacts: { displayName: opts.fullName, contacts: [{ displayName: opts.fullName, vcard }] } }
    return this
  }

  setPoll(name: string, values: string[], selectableCount: number = 1): this {
    this._content = { poll: { name, values, selectableCount } }
    return this
  }

  setReaction(key: proto.IMessageKey, text: string): this {
    this._content = { react: { text, key } }
    return this
  }

  // ViewOnce hanya valid untuk image/video. Kalau dipanggil di text/audio/doc/sticker,
  // flag-nya diabaikan diam-diam supaya payload nggak invalid.
  // NOTE: pada rc14, outgoing viewOnce masih bisa silent drop karena bug platform.
  setViewOnce(enabled: boolean = true): this {
    this._viewOnce = enabled
    return this
  }

  setForward(message: WAMessage, force: boolean = false): this {
    this._content = { forward: message, force }
    return this
  }

  setDelete(key: proto.IMessageKey): this {
    this._content = { delete: key }
    return this
  }

  setLimitSharing(enabled: boolean): this {
    this._content = { limitSharing: enabled }
    return this
  }

  // ===== FURINA: QUOTED, AD REPLY, MENTION =====

  setQuoted(quoted: WAMessage): this {
    this._options.quoted = quoted
    return this
  }

  setAdReply(config: AdReplyOptions): this {
    const externalAdReply: any = {
      title: config.title,
      body: config.body,
      mediaType: config.mediaType || 1,
      sourceUrl: config.sourceUrl,
      showAdAttribution: config.showAdAttribution ?? false,
      renderLargerThumbnail: config.renderLargerThumbnail ?? false,
    }

    // Buffer/Uint8Array masuk ke `thumbnail`, string masuk ke `thumbnailUrl`.
    // Salah tipe = preview nggak render (lihat bug adReply di changelog v1.0.6).
    if (config.thumbnail) {
      if (Buffer.isBuffer(config.thumbnail) || config.thumbnail instanceof Uint8Array) {
        externalAdReply.thumbnail = config.thumbnail
      } else if (typeof config.thumbnail === 'string') {
        externalAdReply.thumbnailUrl = config.thumbnail
      }
    }

    this._contextInfo = { ...this._contextInfo, externalAdReply }
    return this
  }

  addMention(...jids: string[]): this {
    this._mentions.push(...jids)
    this._mentions = Array.from(new Set(this._mentions))
    this._contextInfo = { ...this._contextInfo, mentionedJid: this._mentions }
    return this
  }

  // ===== FURINA: BUTTON & CAROUSEL =====

  addButton(button: FurinaButton): this {
    if (this._buttons.length >= FURINA_BUTTON_RULES.buttonsMax) {
      throw new Error('[furina-builder] maksimal ' + FURINA_BUTTON_RULES.buttonsMax + ' button per pesan')
    }
    this._buttons.push(button)
    return this
  }

  addCard(card: CarouselCardOptions): this {
    if (this._cards.length >= FURINA_CAROUSEL_RULES.cardsMax) {
      throw new Error('[furina-builder] maksimal ' + FURINA_CAROUSEL_RULES.cardsMax + ' kartu per carousel')
    }
    // Kartu tanpa media = WhatsApp drop kartu itu. Tolak di awal biar nggak silent fail.
    if (!card.header?.image && !card.header?.video) {
      throw new Error('[furina-builder] kartu carousel wajib punya image atau video di header')
    }
    if (card.buttons.length > FURINA_CAROUSEL_RULES.buttonsPerCardMax) {
      throw new Error('[furina-builder] maksimal ' + FURINA_CAROUSEL_RULES.buttonsPerCardMax + ' button per kartu')
    }
    this._cards.push(card)
    return this
  }

  // ===== FURINA: BUILD & SEND =====

  build(): { content: AnyMessageContent | proto.IMessage; options: MiscMessageGenerationOptions; requiresRelay: boolean } {
    if (this._buttons.length > 0) {
      const interactive: proto.Message.IInteractiveMessage = {
        body: { text: this._content.text || this._content.caption || '' },
        nativeFlowMessage: { buttons: this._buttons.map(toNativeButton) },
        contextInfo: Object.keys(this._contextInfo).length > 0 ? this._contextInfo : undefined,
      }
      return { content: { interactiveMessage: interactive }, options: this._options, requiresRelay: true }
    }

    if (this._cards.length > 0) {
      const cards = this._cards.map((card) => ({
        header: card.header
          ? {
              title: card.header.title,
              subtitle: card.header.subtitle,
              hasMediaAttachment: !!(card.header.image || card.header.video),
            }
          : undefined,
        body: { text: card.body },
        footer: card.footer ? { text: card.footer } : undefined,
        nativeFlowMessage: { buttons: card.buttons.map(toNativeButton) },
      }))
      const interactive: proto.Message.IInteractiveMessage = { carouselMessage: { cards } }
      return { content: { interactiveMessage: interactive }, options: this._options, requiresRelay: true }
    }

    if (Object.keys(this._contextInfo).length > 0) {
      this._content.contextInfo = this._contextInfo
    }

    // ViewOnce hanya apply untuk image/video — bukan text/audio/doc/sticker.
    if (this._viewOnce && (this._mediaType === 'image' || this._mediaType === 'video')) {
      this._content.viewOnce = true
    }

    return { content: this._content as AnyMessageContent, options: this._options, requiresRelay: false }
  }

  async send(sock: any, jid: string, extra: MessageRelayOptions = {}): Promise<any> {
    const { content, options, requiresRelay } = this.build()

    if (!requiresRelay) {
      return sock.sendMessage(jid, content as AnyMessageContent, options)
    }

    const messageContent = content as proto.IMessage

    // relayMessage nggak baca options.quoted — harus inject manual ke contextInfo.
    // Tanpa ini, setQuoted() + addButton() = quote hilang.
    if (options.quoted && messageContent.interactiveMessage) {
      const q = options.quoted
      const existing = messageContent.interactiveMessage.contextInfo ?? {}
      messageContent.interactiveMessage.contextInfo = {
        ...existing,
        stanzaId: q.key.id,
        participant: q.key.participant ?? q.key.remoteJid,
        quotedMessage: q.message,
      }
    }

    // ===== FURINA: BUTTONS RELAY PATH =====
    if (this._buttons.length > 0 && messageContent.interactiveMessage) {
      // Upload media header kalau ada (image/video/document)
      if (this._mediaType === 'image' || this._mediaType === 'video' || this._mediaType === 'document') {
        const mediaContent: any = { [this._mediaType]: this._content[this._mediaType] }
        const header = await buildHeader(sock, mediaContent)
        if (header) messageContent.interactiveMessage.header = header
      }

      const buttons = this._buttons.map(toNativeButton)
      let finalContent: proto.IMessage = messageContent

      // viewOnce + interactive: bungkus supaya format-nya sesuai proto.
      // NOTE: pada rc14 masih bisa silent drop karena bug platform.
      if (this._viewOnce) {
        finalContent = { viewOnceMessage: { message: { interactiveMessage: messageContent.interactiveMessage } } }
      }

      return sock.relayMessage(jid, finalContent, {
        messageId: generateMessageIDV2(),
        additionalNodes: buildButtonNodes(buttons, jid),
        ...extra,
      })
    }

    // ===== FURINA: CAROUSEL RELAY PATH =====
    if (this._cards.length > 0 && messageContent.interactiveMessage) {
      const cards = messageContent.interactiveMessage.carouselMessage?.cards
      if (cards) {
        for (let i = 0; i < cards.length; i++) {
          const card = cards[i]
          const originalCard = this._cards[i]
          if (!card || !originalCard || (!originalCard.header?.image && !originalCard.header?.video)) continue

          const mediaType = originalCard.header.image ? 'image' : 'video'
          const mediaContent: any = { [mediaType]: originalCard.header[mediaType] }

          try {
            const uploaded: any = await prepareWAMessageMedia(mediaContent, {
              upload: sock.waUploadToServer,
              logger: sock.logger,
            } as any)
            const header: proto.Message.InteractiveMessage.IHeader = { ...(card.header ?? {}), hasMediaAttachment: true }
            if (mediaType === 'image') header.imageMessage = uploaded.imageMessage
            else header.videoMessage = uploaded.videoMessage
            card.header = header
          } catch (e) {
            // Upload gagal → reset flag biar WhatsApp nggak coba render header kosong.
            console.error('[furina-builder] carousel card ' + i + ' media upload failed:', e)
            if (card.header) card.header.hasMediaAttachment = false
          }
        }
      }

      let finalContent: proto.IMessage = messageContent
      if (this._viewOnce) {
        finalContent = { viewOnceMessage: { message: { interactiveMessage: messageContent.interactiveMessage } } }
      }

      return sock.relayMessage(jid, finalContent, {
        messageId: generateMessageIDV2(),
        additionalNodes: buildCarouselNodes(jid),
        ...extra,
      })
    }

    return sock.sendMessage(jid, content as AnyMessageContent, options)
  }
}
