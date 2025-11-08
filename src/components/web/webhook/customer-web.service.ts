import { sql } from 'drizzle-orm';
import { db } from '@/database';
import { customerMaster, type InsertCustomer } from '@/database/schema';
import logger from '@/lib/logger';
import { handleServiceError } from '@/utils/serviceErrorHandler';
import { WhatsAppMessageService } from './whatsapp-message.service';

export class CustomerWebService {
	private whatsappMessageService: WhatsAppMessageService;

	constructor() {
		this.whatsappMessageService = new WhatsAppMessageService();
	}

	/**
	 * Parse WhatsApp ID (wa_id) to integer
	 * wa_id is typically a string like "91XXXXXXXXXX", we need to convert it to integer
	 */
	private parseWaIdToCustomerID(waId: string): number {
		try {
			// Remove any non-numeric characters and parse to integer
			const numericId = waId.replace(/\D/g, '');
			const customerID = parseInt(numericId, 10);
			
			if (isNaN(customerID) || customerID <= 0) {
				throw new Error(`Invalid wa_id format: ${waId}`);
			}
			
			return customerID;
		} catch (error) {
			logger.error('Failed to parse wa_id to customerID', { error, waId });
			throw error;
		}
	}

	/**
	 * Create customer from WhatsApp Flow data
	 */
	public async createCustomerFromFlow(
		flowData: any,
		phoneNumber: string,
		waId: string,
	): Promise<{ id: string; customerID: number }> {
		try {
			// Extract data from flow response
			const flowResponse = flowData?.data || flowData;
			
			// Helper function to find field by multiple possible names (handles nfm_reply format like screen_0_First_Name_0)
			const getField = (...searchTerms: string[]): string | undefined => {
				if (!flowResponse) return undefined;
				
				// First try exact matches
				for (const term of searchTerms) {
					if (flowResponse[term]) {
						return flowResponse[term];
					}
				}
				
				// Then try case-insensitive partial matches (for nfm_reply format)
				const lowerTerms = searchTerms.map(t => t.toLowerCase().replace(/_/g, ''));
				for (const key in flowResponse) {
					const lowerKey = key.toLowerCase().replace(/_/g, '');
					if (lowerTerms.some(term => lowerKey.includes(term))) {
						return flowResponse[key];
					}
				}
				
				return undefined;
			};
			
			// Map flow fields to customer fields (handles both standard and nfm_reply formats)
			const firstName = getField('firstname', 'firstName', 'First_Name', 'first_name') || '';
			const lastName = getField('lastname', 'lastName', 'Last_Name', 'last_name') || '';
			const fullName = `${firstName} ${lastName}`.trim() || undefined;
			const email = getField('email', 'email_id', 'Email_ID', 'email_id');
			const phone = phoneNumber || getField('phone', 'phone_no', 'Phone_No', 'phone_no');
			const streetAddress = getField('street_address', 'streetAddress', 'Street_Address', 'address');
			const city = getField('city', 'City');
			const pincode = getField('pincode', 'pin_code', 'postal_code', 'Pincode');

			// Combine street address and city for address field
			const address = streetAddress && city 
				? `${streetAddress}, ${city}`.trim()
				: streetAddress || city || undefined;

			// Use wa_id as customer ID
			const customerID = this.parseWaIdToCustomerID(waId);

			// Prepare customer data
			const customerData: InsertCustomer = {
				customerID,
				name: fullName,
				email: email?.toLowerCase(),
				phone,
				address,
				state: undefined, // Not collected in flow
				pincode,
				gender: undefined, // Not collected in flow
				isActive: true,
			};

			// Insert customer
			const [customer] = await db
				.insert(customerMaster)
				.values(customerData)
				.returning({ id: customerMaster.id, customerID: customerMaster.customerID });

			if (!customer) {
				throw new Error('Failed to create customer');
			}

			logger.info('Customer created from WhatsApp Flow', {
				customerID: customer.customerID,
				phone,
				email,
				name: fullName,
			});

			// Send enrollment confirmation message
			// Extract template config from flow data if available
			if (fullName && phone) {
				const templateName = "lush_loyalty_main_menu_premium";
				const headerImageUrl = "https://mtbsapoc.blob.core.windows.net/whatsapppoccontainer/lush-products-main.jpg";

				this.whatsappMessageService
					.sendEnrollmentConfirmation(phone, fullName, templateName, headerImageUrl)
					.catch((error) => {
						logger.error('Failed to send enrollment confirmation message', {
							error,
							customerID: customer.customerID,
							phone,
							customerName: fullName,
						});
					});
			}

			return { id: 'customer', customerID: customerID };
		} catch (error) {
			return handleServiceError(
				error,
				'Failed to create customer from flow data',
				500,
				'Error creating customer',
				{ flowData, phoneNumber },
			);
		}
	}

	/**
	 * Check if customer exists by customer ID (wa_id)
	 */
	public async findCustomerByCustomerID(customerID: number): Promise<{ id: string; customerID: number } | null> {
		try {
			const [customer] = await db
				.select({
					id: customerMaster.id,
					customerID: customerMaster.customerID,
				})
				.from(customerMaster)
				.where(sql`${customerMaster.customerID} = ${customerID}`)
				.limit(1);

			return customer || null;
		} catch (error) {
			logger.error('Error finding customer by customerID', { error, customerID });
			return null;
		}
	}

	/**
	 * Check if customer exists by phone number
	 */
	public async findCustomerByPhone(phone: string): Promise<{ id: string; customerID: number } | null> {
		try {
			const [customer] = await db
				.select({
					id: customerMaster.id,
					customerID: customerMaster.customerID,
				})
				.from(customerMaster)
				.where(sql`${customerMaster.phone} = ${phone}`)
				.limit(1);

			return customer || null;
		} catch (error) {
			logger.error('Error finding customer by phone', { error, phone });
			return null;
		}
	}

	/**
	 * Get customer name by phone number or waId
	 */
	public async getCustomerName(phoneNumber: string, waId?: string): Promise<string | null> {
		try {
			// Try to find by phone first
			let [customer] = await db
				.select({
					name: customerMaster.name,
				})
				.from(customerMaster)
				.where(sql`${customerMaster.phone} = ${phoneNumber}`)
				.limit(1);

			// If not found and waId provided, try by customerID
			if (!customer && waId) {
				const customerID = this.parseWaIdToCustomerID(waId);
				[customer] = await db
					.select({
						name: customerMaster.name,
					})
					.from(customerMaster)
					.where(sql`${customerMaster.customerID} = ${customerID}`)
					.limit(1);
			}

			return customer?.name || null;
		} catch (error) {
			logger.error('Error getting customer name', { error, phoneNumber, waId });
			return null;
		}
	}

	/**
	 * Send interactive menu message
	 */
	public async sendInteractiveMenu(phoneNumber: string): Promise<void> {
		await this.whatsappMessageService.sendInteractiveMenu(phoneNumber);
	}

	/**
	 * Send Add Points CTA message
	 */
	public async sendAddPointsCTA(phoneNumber: string): Promise<void> {
		await this.whatsappMessageService.sendAddPointsCTA(phoneNumber);
	}

	/**
	 * Send catalog message
	 */
	public async sendCatalogMessage(phoneNumber: string, customerName?: string | null): Promise<void> {
		const name = customerName || 'Customer';
		await this.whatsappMessageService.sendCatalogMessage(phoneNumber, name);
	}

	/**
	 * Send order confirmation message
	 */
	public async sendOrderConfirmation(
		phoneNumber: string,
		customerName: string,
		itemsCount: number,
		totalAmount: string,
	): Promise<void> {
		await this.whatsappMessageService.sendOrderConfirmation(phoneNumber, customerName, itemsCount, totalAmount);
	}
}

