import { sql } from 'drizzle-orm';
import { db } from '@/database';
import { customerMaster, type InsertCustomer } from '@/database/schema';
import logger from '@/lib/logger';
import { handleServiceError } from '@/utils/serviceErrorHandler';

export class CustomerWebService {
	/**
	 * Parse WhatsApp ID (wa_id) to integer
	 * wa_id is typically a string like "918610031033", we need to convert it to integer
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
			
			// Map flow fields to customer fields
			const firstName = flowResponse?.firstname || flowResponse?.firstName || '';
			const lastName = flowResponse?.lastname || flowResponse?.lastName || '';
			const fullName = `${firstName} ${lastName}`.trim() || undefined;
			const email = flowResponse?.email || flowResponse?.email_id || undefined;
			const phone = phoneNumber || flowResponse?.phone || flowResponse?.phone_no || undefined;
			const streetAddress = flowResponse?.street_address || flowResponse?.streetAddress || flowResponse?.address || undefined;
			const city = flowResponse?.city || undefined;
			const pincode = flowResponse?.pincode || flowResponse?.pin_code || flowResponse?.postal_code || undefined;

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
			});

			return customer;
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
}

