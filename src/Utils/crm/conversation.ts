// conversation.ts
// Conversation history tracking for Furina CRM
// Stores dan retrieves message history per customer
// FINAL VERSION - support full message type detection

import type { CRMStorage } from './storage/interface'
import type { CRMMessage, CRMMessageType } from './types'

export class CRMConversationManager {
	private storage: CRMStorage

	constructor(storage: CRMStorage) {
		this.storage = storage
	}

	// Track a new message (inbound atau outbound)
	async trackMessage(
		customerJid: string,
		content: string,
		options: {
			id?: string
			groupJid?: string | null
			direction?: 'in' | 'out'
			messageType?: CRMMessageType
			interactiveSubType?: 'nativeFlow' | 'a2ui' | 'carousel' | 'collection' | 'form' | 'button' | 'list' | null
			unwrappedFrom?: CRMMessageType | null
			timestamp?: number
		} = {}
	): Promise<CRMMessage> {
		const message: CRMMessage = {
			id: options.id ?? this.generateId(),
			customerJid,
			groupJid: options.groupJid ?? null,
			direction: options.direction ?? 'in',
			content,
			messageType: options.messageType ?? 'unknown',
			timestamp: options.timestamp ?? Date.now(),
			interactiveSubType: options.interactiveSubType ?? null,
			unwrappedFrom: options.unwrappedFrom ?? null,
			isInternal: false,
		}

		await this.storage.saveMessage(message)
		return message
	}

	// Track inbound message (customer → bot)
	async trackInbound(
		customerJid: string,
		content: string,
		options: {
			id?: string
			groupJid?: string | null
			messageType?: CRMMessageType
			interactiveSubType?: 'nativeFlow' | 'a2ui' | 'carousel' | 'collection' | 'form' | 'button' | 'list' | null
			unwrappedFrom?: CRMMessageType | null
		} = {}
	): Promise<CRMMessage> {
		return this.trackMessage(customerJid, content, {
			...options,
			direction: 'in',
		})
	}

	// Track outbound message (bot → customer)
	async trackOutbound(
		customerJid: string,
		content: string,
		options: {
			id?: string
			groupJid?: string | null
			messageType?: CRMMessageType
		} = {}
	): Promise<CRMMessage> {
		return this.trackMessage(customerJid, content, {
			...options,
			direction: 'out',
		})
	}

	// Get conversation history buat customer
	async getConversation(customerJid: string, limit?: number): Promise<CRMMessage[]> {
		return this.storage.getConversation(customerJid, limit)
	}

	// Get last message dari customer
	async getLastMessage(customerJid: string): Promise<CRMMessage | null> {
		const messages = await this.storage.getMessages(customerJid, 1)
		return messages[0] ?? null
	}

	// Get last inbound message (customer's last message)
	async getLastInbound(customerJid: string): Promise<CRMMessage | null> {
		const messages = await this.storage.getMessages(customerJid, 50)
		const inbound = messages.filter(m => m.direction === 'in')
		return inbound[inbound.length - 1] ?? null
	}

	// Get last outbound message (bot's last message ke customer)
	async getLastOutbound(customerJid: string): Promise<CRMMessage | null> {
		const messages = await this.storage.getMessages(customerJid, 50)
		const outbound = messages.filter(m => m.direction === 'out')
		return outbound[outbound.length - 1] ?? null
	}

	// Get message count buat customer
	async getMessageCount(customerJid: string): Promise<number> {
		const messages = await this.storage.getMessages(customerJid)
		return messages.length
	}

	// Get message count by type
	async getMessageCountByType(customerJid: string): Promise<Record<string, number>> {
		const messages = await this.storage.getMessages(customerJid)
		const counts: Record<string, number> = {}

		for (const msg of messages) {
			const type = msg.messageType || 'unknown'
			counts[type] = (counts[type] || 0) + 1
		}

		return counts
	}

	// Generate unique message ID
	private generateId(): string {
		return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
	}
}
