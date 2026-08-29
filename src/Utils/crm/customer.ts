// customer.ts
// Customer entity management for Furina CRM
// Handles customer creation, updates, tags, and status tracking

import type { CRMStorage } from './storage/interface'
import type { CRMCustomer, CRMCustomerStatus } from './types'

export class CRMCustomerManager {
	private storage: CRMStorage

	constructor(storage: CRMStorage) {
		this.storage = storage
	}

	// Get customer by JID, or create a new one if not exists
	async getOrCreate(
		jid: string,
		options: {
			lid?: string | null
			pn?: string | null
			pushname?: string | null
			status?: CRMCustomerStatus
		} = {}
	): Promise<CRMCustomer> {
		const existing = await this.storage.getCustomer(jid)
		if (existing) {
			return existing
		}

		const now = Date.now()
		const customer: CRMCustomer = {
			jid,
			lid: options.lid ?? null,
			pn: options.pn ?? null,
			pushname: options.pushname ?? null,
			status: options.status ?? 'new',
			tags: [],
			metadata: {},
			firstSeen: now,
			lastSeen: now,
			messageCount: 0,
			createdAt: now,
			updatedAt: now,
		}

		await this.storage.saveCustomer(customer)
		return customer
	}

	// Update customer fields
	async update(jid: string, updates: Partial<CRMCustomer>): Promise<CRMCustomer | null> {
		const customer = await this.storage.getCustomer(jid)
		if (!customer) {
			return null
		}

		const updated: CRMCustomer = {
			...customer,
			...updates,
			jid: customer.jid, // JID cannot be changed
			updatedAt: Date.now(),
		}

		await this.storage.saveCustomer(updated)
		return updated
	}

	// Update last seen timestamp (called on every message)
	async touch(jid: string): Promise<void> {
		const customer = await this.storage.getCustomer(jid)
		if (customer) {
			customer.lastSeen = Date.now()
			customer.updatedAt = Date.now()
			await this.storage.saveCustomer(customer)
		}
	}

	// Increment message count
	async incrementMessageCount(jid: string): Promise<void> {
		const customer = await this.storage.getCustomer(jid)
		if (customer) {
			customer.messageCount++
			customer.lastSeen = Date.now()
			customer.updatedAt = Date.now()
			await this.storage.saveCustomer(customer)
		}
	}

	// Add tag to customer
	async addTag(jid: string, tag: string): Promise<boolean> {
		const customer = await this.storage.getCustomer(jid)
		if (!customer) {
			return false
		}

		if (customer.tags.includes(tag)) {
			return false // Tag already exists
		}

		customer.tags.push(tag)
		customer.updatedAt = Date.now()
		await this.storage.saveCustomer(customer)
		return true
	}

	// Remove tag from customer
	async removeTag(jid: string, tag: string): Promise<boolean> {
		const customer = await this.storage.getCustomer(jid)
		if (!customer) {
			return false
		}

		if (!customer.tags.includes(tag)) {
			return false // Tag doesn't exist
		}

		customer.tags = customer.tags.filter(t => t !== tag)
		customer.updatedAt = Date.now()
		await this.storage.saveCustomer(customer)
		return true
	}

	// Check if customer has a specific tag
	async hasTag(jid: string, tag: string): Promise<boolean> {
		const customer = await this.storage.getCustomer(jid)
		return customer?.tags.includes(tag) ?? false
	}

	// Update customer status
	async setStatus(jid: string, status: CRMCustomerStatus): Promise<boolean> {
		const customer = await this.storage.getCustomer(jid)
		if (!customer) {
			return false
		}

		customer.status = status
		customer.updatedAt = Date.now()
		await this.storage.saveCustomer(customer)
		return true
	}

	// Get customers by status
	async getByStatus(status: CRMCustomerStatus): Promise<CRMCustomer[]> {
		const all = await this.storage.listCustomers()
		return all.filter(c => c.status === status)
	}

	// Get customers by tag
	async getByTag(tag: string): Promise<CRMCustomer[]> {
		return this.storage.getCustomersByTag(tag)
	}

	// Search customers by query (name, JID, tags)
	async search(query: string): Promise<CRMCustomer[]> {
		return this.storage.searchCustomers(query)
	}

	// Delete customer
	async delete(jid: string): Promise<boolean> {
		return this.storage.deleteCustomer(jid)
	}
}
