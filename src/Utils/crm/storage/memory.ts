// storage/memory.ts
// InMemoryStorage - default storage implementation for testing/development
// Uses Map/Set for fast in-memory operations, no external dependencies

import type { CRMStorage } from './interface'
import type { CRMCustomer, CRMActivity, CRMMessage, CRMAnalytics } from '../types'

export class InMemoryStorage implements CRMStorage {
	private customers = new Map<string, CRMCustomer>()
	private activities: CRMActivity[] = []
	private messages: CRMMessage[] = []
	private analytics: CRMAnalytics = {
		totalCustomers: 0,
		activeCustomers: 0,
		newCustomersToday: 0,
		totalMessages: 0,
		messagesToday: 0,
		conversionRate: 0,
		averageResponseTime: null,
	}

	async init(): Promise<void> {
		// No-op for in-memory storage
	}

	async close(): Promise<void> {
		this.customers.clear()
		this.activities = []
		this.messages = []
	}

	// Customer operations
	async saveCustomer(customer: CRMCustomer): Promise<void> {
		this.customers.set(customer.jid, customer)
		this.analytics.totalCustomers = this.customers.size
		this.analytics.activeCustomers = Array.from(this.customers.values())
			.filter(c => c.status === 'active' || c.status === 'vip').length
	}

	async getCustomer(jid: string): Promise<CRMCustomer | null> {
		return this.customers.get(jid) ?? null
	}

	async deleteCustomer(jid: string): Promise<boolean> {
		const deleted = this.customers.delete(jid)
		if (deleted) {
			this.analytics.totalCustomers = this.customers.size
		}
		return deleted
	}

	async listCustomers(limit?: number, offset?: number): Promise<CRMCustomer[]> {
		const all = Array.from(this.customers.values())
		const start = offset ?? 0
		const end = limit ? start + limit : undefined
		return all.slice(start, end)
	}

	async searchCustomers(query: string): Promise<CRMCustomer[]> {
		const lowerQuery = query.toLowerCase()
		return Array.from(this.customers.values()).filter(c => {
			return (
				c.jid.toLowerCase().includes(lowerQuery) ||
				c.pushname?.toLowerCase().includes(lowerQuery) ||
				c.tags.some(t => t.toLowerCase().includes(lowerQuery))
			)
		})
	}

	// Activity operations
	async saveActivity(activity: CRMActivity): Promise<void> {
		this.activities.push(activity)
	}

	async getActivities(customerJid: string, limit?: number): Promise<CRMActivity[]> {
		const filtered = this.activities.filter(a => a.customerJid === customerJid)
		return limit ? filtered.slice(-limit) : filtered
	}

	async getRecentActivities(limit?: number): Promise<CRMActivity[]> {
		return limit ? this.activities.slice(-limit) : [...this.activities]
	}

	// Message operations
	async saveMessage(message: CRMMessage): Promise<void> {
		this.messages.push(message)
		this.analytics.totalMessages = this.messages.length
		
		const today = new Date().toDateString()
		const messageDate = new Date(message.timestamp).toDateString()
		if (messageDate === today) {
			this.analytics.messagesToday++
		}
	}

	async getMessages(customerJid: string, limit?: number): Promise<CRMMessage[]> {
		const filtered = this.messages.filter(m => m.customerJid === customerJid)
		return limit ? filtered.slice(-limit) : filtered
	}

	async getConversation(customerJid: string, limit?: number): Promise<CRMMessage[]> {
		return this.getMessages(customerJid, limit)
	}

	// Tag operations
	async addTagToCustomer(jid: string, tag: string): Promise<void> {
		const customer = this.customers.get(jid)
		if (customer && !customer.tags.includes(tag)) {
			customer.tags.push(tag)
			customer.updatedAt = Date.now()
		}
	}

	async removeTagFromCustomer(jid: string, tag: string): Promise<void> {
		const customer = this.customers.get(jid)
		if (customer) {
			customer.tags = customer.tags.filter(t => t !== tag)
			customer.updatedAt = Date.now()
		}
	}

	async getCustomersByTag(tag: string): Promise<CRMCustomer[]> {
		return Array.from(this.customers.values()).filter(c => c.tags.includes(tag))
	}

	// Analytics operations
	async getAnalytics(): Promise<CRMAnalytics> {
		return { ...this.analytics }
	}

	async updateAnalytics(analytics: Partial<CRMAnalytics>): Promise<void> {
		this.analytics = { ...this.analytics, ...analytics }
	}
}
