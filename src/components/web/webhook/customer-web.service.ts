import { sql } from 'drizzle-orm';
import { customerService } from '../customers/customerMaster/customerMaster.service';
import { parseWaIdToCustomerID, getFlowField } from './webhook-utils';
import { WhatsAppMessageService } from './whatsapp-message.service';
import { db } from '@/database';
import { customerMaster, loyaltyAccounts } from '@/database/schema';
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

			// Ensure required fields have values
			// Name is required - use phone number as fallback if name is not provided
			const customerName = fullName || phone || 'Customer';

			// Email is required - generate a placeholder email if not provided
			const customerEmail =
				email?.toLowerCase() ||
				`${phone.replace(/\D/g, '')}@whatsapp.flow`;

			// Phone is required - should always be available
			if (!phone) {
				throw new Error('Phone number is required to create customer');
			}

			// Call customer service to create customer
			const result = await customerService.createCustomer(
				{
					customerID,
					name: customerName,
					email: customerEmail,
					phone,
					address,
					state: city,
					pincode,
					// Gender not collected in flow, so it's optional
				},
				undefined, // userId - WhatsApp flow has no user associated
			);

			if (!result?.data) {
				throw new Error('Failed to create customer');
			}

			const customer = result.data;

			logger.info('Customer created from WhatsApp Flow', {
				customerID: customer.customerID,
				phone,
				email: customerEmail,
				name: customerName,
			});

			// Send enrollment confirmation message
			// Extract template config from flow data if available
			if (customerName && phone) {
				const templateName = 'lush_loyalty_main_menu_premium';
				const headerImageUrl =
					'https://mtbsapoc.blob.core.windows.net/whatsapppoccontainer/lush-products-main.jpg';

				this.whatsappMessageService
					.sendEnrollmentConfirmation(
						phone,
						customerName,
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
								customerName,
							},
						);
					});
			}

			return {
				id: customer.id,
				customerID: customer.customerID || customerID,
			};
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
	 * Send payment confirmation interactive message
	 */
	public async sendPaymentConfirmation(
		phoneNumber: string,
		customerName: string,
		orderNo: string,
		orderAmount: string,
		currency: string,
		deliveryDays: number = 3,
	): Promise<void> {
		await this.whatsappMessageService.sendPaymentConfirmation(
			phoneNumber,
			customerName,
			orderNo,
			orderAmount,
			currency,
			deliveryDays,
		);
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
					.where(sql`${loyaltyAccounts.customerID} = ${customer.id}`)
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
