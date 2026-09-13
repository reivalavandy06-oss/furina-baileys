// buttons.ts — senders + re-export API publik
import { proto } from '../../../WAProto/index.js'
import { prepareWAMessageMedia } from '../messages'
import type { WAMessage, MessageRelayOptions } from '../../Types'
import { assert, assertUniqueIds, J, FURINA_BUTTON_RULES } from './types'
import type { FurinaSocket, FurinaButton, FurinaButtonOptions, FurinaTemplateOptions, FurinaListOptions, FurinaProductListOptions } from './types'
import { toNativeButton, buildButtonNodes, buildHeader } from './button-builders'
import type { NativeButton } from './types'

export async function sendButton(
	sock: FurinaSocket,
	jid: string,
	opts: FurinaButtonOptions,
	extra: MessageRelayOptions = {}
): Promise<WAMessage> {
	assert(opts.buttons.length >= 1, 'minimal 1 button')
	assert(opts.buttons.length <= FURINA_BUTTON_RULES.buttonsMax, `maksimal ${FURINA_BUTTON_RULES.buttonsMax} button per pesan`)
	assertUniqueIds(
		opts.buttons
			.filter((b): b is Extract<FurinaButton, { type: 'reply' }> => b.type === 'reply')
			.map((b) => b.id),
		'reply'
	)

	const multi = new Set(opts.buttons.map((b) => b.type)).size > 1
        const buttons = opts.buttons.map((b) => {
                const nb = toNativeButton(b)
                if (!multi) return nb
                const p = JSON.parse(nb.buttonParamsJson) as Record<string, unknown>
                return { ...nb, buttonParamsJson: J({ ...p, has_multiple_buttons: true }) }
        })

        // message-level: limited_time_offer + bottom_sheet (unit ms; flip ke seconds kalau countdown ngaco)
        const params: Record<string, unknown> = {}
        if (opts.limitedTimeOffer) {
                params.limited_time_offer = {
                        text: opts.limitedTimeOffer.text,
                        ...(opts.limitedTimeOffer.url ? { url: opts.limitedTimeOffer.url } : {}),
                        ...(opts.limitedTimeOffer.copyCode ? { copy_code: opts.limitedTimeOffer.copyCode } : {}),
                        expiration_time: opts.limitedTimeOffer.expiresAtMs,
                }
        }
        if (opts.bottomSheet) {
                params.bottom_sheet = {
                        in_thread_buttons_limit: opts.bottomSheet.buttonsLimit,
                        list_title: opts.bottomSheet.listTitle,
                        button_title: opts.bottomSheet.buttonTitle,
                        ...(opts.bottomSheet.dividers ? { dividers: opts.bottomSheet.dividers } : {}),
                }
        }
	const interactive: proto.Message.IInteractiveMessage = {
		body: { text: opts.text },
		nativeFlowMessage: {
                        buttons,
                        ...(Object.keys(params).length ? { messageParamsJson: J(params) } : {}),
                },
	}

	const header = await buildHeader(sock, opts.header)
	if (header) interactive.header = header
	if (opts.footer) interactive.footer = { text: opts.footer }

	const content: proto.IMessage = opts.viewOnce
		? { viewOnceMessage: { message: { interactiveMessage: interactive } } }
		: { interactiveMessage: interactive }

	return sock.relayMessage(jid, content, { additionalNodes: buildButtonNodes(buttons, jid), ...extra })
}

// Shortcut gaya template: header judul + body + max 3 reply
export function sendTemplate(
	sock: FurinaSocket,
	jid: string,
	opts: FurinaTemplateOptions,
	extra: MessageRelayOptions = {}
): Promise<WAMessage> {
	assert(
		opts.buttons.length >= 1 && opts.buttons.length <= FURINA_BUTTON_RULES.templateButtonsMax,
		`template maksimal ${FURINA_BUTTON_RULES.templateButtonsMax} button`
	)
	assertUniqueIds(opts.buttons.map((b) => b.id), 'template')

	return sendButton(
		sock,
		jid,
		{
			text: opts.body,
			footer: opts.footer,
			header: opts.header ? { title: opts.header } : undefined,
			buttons: opts.buttons.map((b) => ({ type: 'reply', id: b.id, text: b.text })),
		},
		extra
	)
}

export function sendList(
	sock: FurinaSocket,
	jid: string,
	opts: FurinaListOptions,
	extra: MessageRelayOptions = {}
): Promise<WAMessage> {
	return sendButton(
		sock,
		jid,
		{
			text: opts.description ?? opts.title ?? ' ',
			footer: opts.footer,
			buttons: [{ type: 'list', title: opts.buttonText, sections: opts.sections }],
		},
		extra
	)
}

// ── Parser respons (dipanggil di messages.upsert) ──


export async function sendProductList(
        sock: FurinaSocket,
        jid: string,
        opts: FurinaProductListOptions,
        extra: MessageRelayOptions = {}
): Promise<WAMessage> {
        assert(opts.sections.length > 0, 'product-list butuh minimal 1 section')
        return sock.relayMessage(
                jid,
                {
                        listMessage: {
                                listType: 2, // PRODUCT_LIST
                                title: opts.title,
                                description: opts.text ?? '',
                                buttonText: opts.buttonText ?? 'Lihat Produk',
                                footerText: opts.footer ?? '',
                                productListInfo: {
                                        businessOwnerJid: opts.businessOwnerJid ?? undefined,
                                        productSections: opts.sections.map((sec) => ({ title: sec.title, products: sec.productIds.map((productId) => ({ productId })) })),
                                },
                        },
                },
                extra
        )
}

export * from './types'
export * from './button-builders'
