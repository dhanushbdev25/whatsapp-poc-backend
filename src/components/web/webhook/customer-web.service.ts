import { sql } from 'drizzle-orm';
import { parseWaIdToCustomerID, getFlowField } from './webhook-utils';
import { WhatsAppMessageService } from './whatsapp-message.service';
import { db } from '@/database';
import {
	customerMaster,
	loyaltyAccounts,
	type InsertCustomer,
} from '@/database/schema';
import logger from '@/lib/logger';
import { handleServiceError } from '@/utils/serviceErrorHandler';

export class CustomerWebService {
	private whatsappMessageService: WhatsAppMessageService;

	constructor() {
		this.whatsappMessageService = new WhatsAppMessageService();
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

			// Map flow fields to customer fields (handles both standard and nfm_reply formats)
			const firstName =
				getFlowField(
					flowResponse,
					'firstname',
					'firstName',
					'First_Name',
					'first_name',
				) || '';
			const lastName =
				getFlowField(
					flowResponse,
					'lastname',
					'lastName',
					'Last_Name',
					'last_name',
				) || '';
			const fullName = `${firstName} ${lastName}`.trim() || undefined;
			const email = getFlowField(
				flowResponse,
				'email',
				'email_id',
				'Email_ID',
				'email_id',
			);
			const phone =
				phoneNumber ||
				getFlowField(
					flowResponse,
					'phone',
					'phone_no',
					'Phone_No',
					'phone_no',
				);
			const streetAddress = getFlowField(
				flowResponse,
				'street_address',
				'streetAddress',
				'Street_Address',
				'address',
			);
			const city = getFlowField(flowResponse, 'city', 'City');
			const pincode = getFlowField(
				flowResponse,
				'pincode',
				'pin_code',
				'postal_code',
				'Pincode',
			);

			// Combine street address and city for address field
			const address =
				streetAddress && city
					? `${streetAddress}, ${city}`.trim()
					: streetAddress || city || undefined;

			// Use wa_id as customer ID
			const customerID = parseWaIdToCustomerID(waId);

			// Prepare customer data
			const customerData: InsertCustomer = {
				customerID,
				name: fullName,
				email: email?.toLowerCase(),
				phone,
				address,
				state: city,
				pincode,
				gender: undefined, // Not collected in flow
				isActive: true,
				createdBy: null, // WhatsApp flow - no user associated
				updatedBy: null, // WhatsApp flow - no user associated
				latestActive: new Date(),
			};

			// Insert customer
			const [customer] = await db
				.insert(customerMaster)
				.values(customerData)
				.returning({
					id: customerMaster.id,
					customerID: customerMaster.customerID,
				});

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
				const templateName = 'lush_loyalty_main_menu_premium';
				const headerImageUrl =
					'https://mtbsapoc.blob.core.windows.net/whatsapppoccontainer/lush-products-main.jpg';

				this.whatsappMessageService
					.sendEnrollmentConfirmation(
						phone,
						fullName,
						templateName,
						headerImageUrl,
					)
					.catch((error) => {
						logger.error(
							'Failed to send enrollment confirmation message',
							{
								error,
								customerID: customer.customerID,
								phone,
								customerName: fullName,
							},
						);
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
	public async findCustomerByCustomerID(
		customerID: number,
	): Promise<{ id: string; customerID: number } | null> {
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
			logger.error('Error finding customer by customerID', {
				error,
				customerID,
			});
			return null;
		}
	}

	/**
	 * Check if customer exists by phone number
	 */
	public async findCustomerByPhone(
		phone: string,
	): Promise<{ id: string; customerID: number } | null> {
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
	public async getCustomerName(
		phoneNumber: string,
		waId?: string,
	): Promise<string | null> {
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
				const customerID = parseWaIdToCustomerID(waId);
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
			logger.error('Error getting customer name', {
				error,
				phoneNumber,
				waId,
			});
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
	public async sendAddPointsCTA(
		phoneNumber: string,
		userId: number,
	): Promise<void> {
		await this.whatsappMessageService.sendAddPointsCTA(phoneNumber, userId);
	}

	/**
	 * Send Try Wigs CTA message
	 */
	public async sendTryWigsCTA(
		phoneNumber: string,
		userId: number,
	): Promise<void> {
		await this.whatsappMessageService.sendTryWigsCTA(phoneNumber, userId);
	}

	/**
	 * Send catalog message
	 */
	public async sendCatalogMessage(
		phoneNumber: string,
		customerName?: string | null,
	): Promise<void> {
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
		orderId: string,
	): Promise<void> {
		await this.whatsappMessageService.sendOrderConfirmation(
			phoneNumber,
			customerName,
			itemsCount,
			totalAmount,
			orderId,
		);
	}

	/**
	 * Send points earned notification message
	 */
	public async sendPointsEarnedMessage(
		phoneNumber: string,
		pointsAdded: number,
		newBalance: number,
		customerName: string,
	): Promise<void> {
		await this.whatsappMessageService.sendPointsEarnedMessage(
			phoneNumber,
			pointsAdded,
			newBalance,
			customerName,
		);
	}

	/**
	 * Get customer loyalty balance and send balance message
	 */
	public async sendBalanceMessage(
		phoneNumber: string,
		waId?: string,
	): Promise<void> {
		try {
			// Find customer by phone or waId
			let customer = await this.findCustomerByPhone(phoneNumber);
			const customerName = await this.getCustomerName(phoneNumber, waId);

			if (!customer && waId) {
				const customerID = parseWaIdToCustomerID(waId);
				customer = await this.findCustomerByCustomerID(customerID);
			}

			if (!customer) {
				logger.warn('Customer not found for balance request', {
					phoneNumber,
					waId,
				});

				// Send a default message or error message
				await this.whatsappMessageService.sendBalanceMessage(
					phoneNumber,
					0,
					customerName,
				);
				return;
			}

			//  Fetch loyalty account balance safely
			let pointsBalance = 0;

			try {
				const [loyaltyAccount] = await db
					.select({
						pointsBalance: loyaltyAccounts.points_balance,
					})
					.from(loyaltyAccounts)
					.where(
						sql`${loyaltyAccounts.customerID} = ${customer.customerID}`,
					)
					.limit(1);

				if (loyaltyAccount) {
					pointsBalance = loyaltyAccount.pointsBalance ?? 0;
					logger.info('Loyalty account found', {
						customerID: customer.customerID,
						pointsBalance,
					});
				} else {
					logger.warn('No loyalty account found for customer', {
						customerID: customer.customerID,
					});
				}
			} catch (loyaltyError) {
				logger.error('Error fetching loyalty account balance', {
					error: loyaltyError,
					customerID: customer.customerID,
				});
				pointsBalance = 0;
			}

			//  Send balance message
			await this.whatsappMessageService.sendBalanceMessage(
				phoneNumber,
				pointsBalance,
				customerName,
			);

			logger.info('Balance message sent', {
				phoneNumber,
				customerID: customer.customerID,
				pointsBalance,
				customerName,
			});
		} catch (error) {
			logger.error('Error sending balance message', {
				error,
				phoneNumber,
				waId,
			});

			// Send default balance message even on error
			await this.whatsappMessageService
				.sendBalanceMessage(phoneNumber, 0, 'Customer')
				.catch((err) => {
					logger.error('Failed to send default balance message', {
						error: err,
						phoneNumber,
						customer: 'Customer',
					});
				});
		}
	}
}
