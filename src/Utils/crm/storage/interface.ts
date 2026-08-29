// storage/interface.ts
// CRMStorage interface - abstraction layer for storage
// Users can implement this with SQLite, PostgreSQL, MySQL, or any storage

import type { CRMCustomer, CRMActivity, CRMMessage, CRMAnalytics } from '../types'

export interface CRMStorage {
	// Initialize storage (create tables, connect, etc)
	init(): Promise<void>

	// Close storage (disconnect, cleanup, etc)
	close(): Promise<void>

	// Customer operations
	saveCustomer(customer: CRMCustomer): Promise<void>
	getCustomer(jid: string): Promise<CRMCustomer | null>
	deleteCustomer(jid: string): Promise<boolean>
	listCustomers(limit?: number, offset?: number): Promise<CRMCustomer[]>
	searchCustomers(query: string): Promise<CRMCustomer[]>

	// Activity operations
	saveActivity(activity: CRMActivity): Promise<void>
	getActivities(customerJid: string, limit?: number): Promise<CRMActivity[]>
	getRecentActivities(limit?: number): Promise<CRMActivity[]>

	// Message operations
	saveMessage(message: CRMMessage): Promise<void>
	getMessages(customerJid: string, limit?: number): Promise<CRMMessage[]>
	getConversation(customerJid: string, limit?: number): Promise<CRMMessage[]>

	// Tag operations
	addTagToCustomer(jid: string, tag: string): Promise<void>
	removeTagFromCustomer(jid: string, tag: string): Promise<void>
	getCustomersByTag(tag: string): Promise<CRMCustomer[]>

	// Analytics operations
	getAnalytics(): Promise<CRMAnalytics>
	updateAnalytics(analytics: Partial<CRMAnalytics>): Promise<void>
}
