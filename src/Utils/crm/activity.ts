// activity.ts
// Activity tracking for Furina CRM
// Logs customer activities like messages, tags, status changes, etc

import type { CRMStorage } from './storage/interface'
import type { CRMActivity } from './types'

export class CRMActivityTracker {
	private storage: CRMStorage

	constructor(storage: CRMStorage) {
		this.storage = storage
	}

	// Log a new activity
	async log(
		customerJid: string,
		activityType: string,
		metadata: Record<string, any> = {}
	): Promise<CRMActivity> {
		const activity: CRMActivity = {
			id: this.generateId(),
			customerJid,
			activityType,
			metadata,
			timestamp: Date.now(),
		}

		await this.storage.saveActivity(activity)
		return activity
	}

	// Get activities for a specific customer
	async getCustomerActivities(customerJid: string, limit?: number): Promise<CRMActivity[]> {
		return this.storage.getActivities(customerJid, limit)
	}

	// Get recent activities across all customers
	async getRecentActivities(limit?: number): Promise<CRMActivity[]> {
		return this.storage.getRecentActivities(limit)
	}

	// Log common activity types
	async logMessageSent(customerJid: string, messageId: string): Promise<void> {
		await this.log(customerJid, 'message_sent', { messageId })
	}

	async logMessageReceived(customerJid: string, messageId: string): Promise<void> {
		await this.log(customerJid, 'message_received', { messageId })
	}

	async logTagAdded(customerJid: string, tag: string): Promise<void> {
		await this.log(customerJid, 'tag_added', { tag })
	}

	async logTagRemoved(customerJid: string, tag: string): Promise<void> {
		await this.log(customerJid, 'tag_removed', { tag })
	}

	async logStatusChanged(customerJid: string, oldStatus: string, newStatus: string): Promise<void> {
		await this.log(customerJid, 'status_changed', { oldStatus, newStatus })
	}

	async logConverted(customerJid: string, revenue?: number): Promise<void> {
		await this.log(customerJid, 'converted', { revenue })
	}

	// Generate unique activity ID
	private generateId(): string {
		return `act_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
	}
}
