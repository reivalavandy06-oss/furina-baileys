// analytics.ts
// Analytics and statistics for Furina CRM
// Calculates metrics like conversion rate, response time, activity levels

import type { CRMStorage } from './storage/interface'
import type { CRMAnalytics, CRMCustomer } from './types'

export class CRMAnalyticsManager {
	private storage: CRMStorage

	constructor(storage: CRMStorage) {
		this.storage = storage
	}

	// Get current analytics snapshot
	async getAnalytics(): Promise<CRMAnalytics> {
		return this.storage.getAnalytics()
	}

	// Calculate conversion rate
	// Conversion = customers with 'converted' tag / total customers
	async calculateConversionRate(): Promise<number> {
		const allCustomers = await this.storage.listCustomers()
		const totalCustomers = allCustomers.length

		if (totalCustomers === 0) {
			return 0
		}

		const convertedCustomers = allCustomers.filter(
			c => c.tags.includes('converted') || c.status === 'vip'
		).length

		return Math.round((convertedCustomers / totalCustomers) * 100)
	}

	// Calculate average response time
	// Response time = time between customer message and bot reply
	async calculateAverageResponseTime(): Promise<number | null> {
		const allCustomers = await this.storage.listCustomers()
		let totalResponseTime = 0
		let responseCount = 0

		for (const customer of allCustomers) {
			const messages = await this.storage.getMessages(customer.jid)

			for (let i = 0; i < messages.length - 1; i++) {
				const current = messages[i]
				const next = messages[i + 1]

				// Explicit undefined check
				if (!current || !next) continue

				// If customer sent a message and bot replied
				if (current.direction === 'in' && next.direction === 'out') {
					const responseTime = next.timestamp - current.timestamp
					totalResponseTime += responseTime
					responseCount++
				}
			}
		}

		if (responseCount === 0) {
			return null
		}

		return Math.round(totalResponseTime / responseCount)
	}

	// Calculate new customers today
	async calculateNewCustomersToday(): Promise<number> {
		const allCustomers = await this.storage.listCustomers()
		const todayStart = new Date()
		todayStart.setHours(0, 0, 0, 0)
		const todayTimestamp = todayStart.getTime()

		return allCustomers.filter(c => c.createdAt >= todayTimestamp).length
	}

	// Calculate messages today
	async calculateMessagesToday(): Promise<number> {
		const analytics = await this.storage.getAnalytics()
		return analytics.messagesToday
	}

	// Get active customers (last seen within 7 days)
	async getActiveCustomers(days: number = 7): Promise<CRMCustomer[]> {
		const allCustomers = await this.storage.listCustomers()
		const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000)

		return allCustomers.filter(c => c.lastSeen >= cutoff)
	}

	// Get inactive customers (not seen for X days)
	async getInactiveCustomers(days: number = 30): Promise<CRMCustomer[]> {
		const allCustomers = await this.storage.listCustomers()
		const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000)

		return allCustomers.filter(c => c.lastSeen < cutoff)
	}

	// Update analytics snapshot
	async refreshAnalytics(): Promise<CRMAnalytics> {
		const totalCustomers = (await this.storage.listCustomers()).length
		const activeCustomers = (await this.getActiveCustomers()).length
		const newCustomersToday = await this.calculateNewCustomersToday()
		const analytics = await this.storage.getAnalytics()
		const conversionRate = await this.calculateConversionRate()
		const averageResponseTime = await this.calculateAverageResponseTime()

		const updated: CRMAnalytics = {
			totalCustomers,
			activeCustomers,
			newCustomersToday,
			totalMessages: analytics.totalMessages,
			messagesToday: analytics.messagesToday,
			conversionRate,
			averageResponseTime,
		}

		await this.storage.updateAnalytics(updated)
		return updated
	}

	// Generate analytics report (formatted string)
	async generateReport(): Promise<string> {
		const analytics = await this.refreshAnalytics()

		const lines = [
			'═══════════════════════════════════════',
			'        FURINA CRM ANALYTICS',
			'═══════════════════════════════════════',
			`Total Customers:     ${analytics.totalCustomers}`,
			`Active (7 days):     ${analytics.activeCustomers}`,
			`New Today:           ${analytics.newCustomersToday}`,
			`Total Messages:      ${analytics.totalMessages}`,
			`Messages Today:      ${analytics.messagesToday}`,
			`Conversion Rate:     ${analytics.conversionRate}%`,
			`Avg Response Time:   ${analytics.averageResponseTime !== null ? `${analytics.averageResponseTime}ms` : 'N/A'}`,
			'═══════════════════════════════════════',
		]

		return lines.join('\n')
	}
}
