import { eq, desc as orderDesc, and, inArray, sql } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { db } from '../../../../database';
import { WhatsAppMessageService } from '../../webhook/whatsapp-message.service';
import AppError from '@/abstractions/AppError';
import {
	customerMaster,
	customerProducts,
	loyaltyAccounts,
	loyaltyTransactions,
	notificationPreferences,
	orders,
	products,
} from '@/database/schema';
import { parseCustomersExcel } from '@/utils/excelCustomers';
import { handleServiceError } from '@/utils/serviceErrorHandler';

interface CreateCustomerInput {
	customerID?: number;
	name: string;
	email: string;
	phone: string;
	gender?: 'male' | 'female' | 'other';
	address?: string;
	state?: string;
	pincode?: string;
	notificationPreferences?: {
		orderUpdates?: boolean;
		loyaltyRewards?: boolean;
		promotionalMessages?: boolean;
	};
}

export const customerService = {
	/**
	 * Fetch all customers
	 */
	async getAllCustomers() {
		try {
			const customers = await db.query.customerMaster.findMany({
				where: eq(customerMaster.isActive, true),
				orderBy: [orderDesc(customerMaster.createdAt)],
				with: {
					notificationPreferences: true,
				},
			});

			return {
				data: customers,
				message: 'All customers fetched successfully',
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to fetch customers',
				StatusCodes.INTERNAL_SERVER_ERROR,
			);
		}
	},

	/**
	 * Get customer by UUID
	 */
	async getCustomerById(customerId: string, userId?: string) {
		try {
			const customer = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.id, customerId),
				with: {
					notificationPreferences: true,
					loyaltyAccounts: true,
					orders: {
						orderBy: (orderItems, { desc }) => [
							desc(orderItems.createdAt),
						],
						limit: 10,
					},
					customerGroupMembers: {
						with: { group: true },
					},
				},
			});

			if (!customer) {
				throw new AppError('Customer not found', StatusCodes.NOT_FOUND);
			}

			return { data: customer, message: 'Customer fetched successfully' };
		} catch (error) {
			handleServiceError(
				error,
				'Failed to fetch customer',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'getCustomerById',
				{ customerId, userId },
			);
		}
	},

	/**
	 * Create new customer
	 */

	async createCustomer(data: CreateCustomerInput, userId?: string) {
		try {
			// Check if email already exists
			const existing = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.email, data.email),
			});
			if (existing)
				throw new AppError(
					'Customer with this email already exists',
					StatusCodes.CONFLICT,
				);

			// Create new customer
			const [createdCustomer] = await db
				.insert(customerMaster)
				.values({
					customerID: data.customerID,
					name: data.name,
					email: data.email,
					phone: data.phone,
					gender: data.gender,
					address: data.address,
					state: data.state,
					pincode: data.pincode,
					createdBy: userId,
					updatedBy: userId,
					isActive: true,
					latestActive: new Date(),
				})
				.returning();

			//  1. Auto-create Loyalty Account
			await db.insert(loyaltyAccounts).values({
				customerID: createdCustomer.id,
				points_balance: 0,
				points_redeemed: 0,
				lifetime_points: 0,
				createdBy: userId,
				updatedBy: userId,
			});

			//  2. Create notification preferences (optional)
			if (data.notificationPreferences) {
				await db.insert(notificationPreferences).values({
					customerID: createdCustomer.id,
					orderUpdates:
						data.notificationPreferences.orderUpdates ?? false,
					loyaltyRewards:
						data.notificationPreferences.loyaltyRewards ?? false,
					promotionalMessages:
						data.notificationPreferences.promotionalMessages ??
						false,
					createdBy: userId,
					updatedBy: userId,
				});
			}

			const customer = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.id, createdCustomer.id),
				with: { notificationPreferences: true, loyaltyAccounts: true },
			});

			return {
				data: customer,
				message: 'Customer created successfully with loyalty account',
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to create customer',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'createCustomer',
				{ email: data.email, userId },
			);
		}
	},

	/**
	 * Update customer by UUID
	 */
	async updateCustomer(customerId: string, data: any, userId?: string) {
		try {
			// 1️⃣ Ensure UUID format — early validation helps catch errors early
			if (!/^[0-9a-fA-F-]{36}$/.test(customerId)) {
				throw new AppError(
					'Invalid customer ID format (expected UUID)',
					StatusCodes.BAD_REQUEST,
				);
			}

			// 2️⃣ Fetch existing customer
			const existing = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.id, customerId),
			});
			if (!existing)
				throw new AppError('Customer not found', StatusCodes.NOT_FOUND);

			// 3️⃣ Check for duplicate email
			if (data.email && data.email !== existing.email) {
				const duplicate = await db.query.customerMaster.findFirst({
					where: and(
						eq(customerMaster.email, data.email),
						sql`${customerMaster.id} != ${customerId}`,
					),
				});
				if (duplicate)
					throw new AppError(
						'Email already in use by another customer',
						StatusCodes.CONFLICT,
					);
			}

			// 4️⃣ Update customer master
			await db
				.update(customerMaster)
				.set({
					name: data.name ?? existing.name,
					email: data.email ?? existing.email,
					phone: data.phone ?? existing.phone,
					gender: data.gender ?? existing.gender,
					address: data.address ?? existing.address,
					state: data.state ?? existing.state,
					pincode: data.pincode ?? existing.pincode,
					updatedBy: userId,
					updatedAt: new Date(),
				})
				.where(eq(customerMaster.id, customerId));

			// 5️⃣ Update notification preferences (optional)
			if (data.notificationPreferences) {
				await db
					.update(notificationPreferences)
					.set({
						orderUpdates:
							data.notificationPreferences.orderUpdates ??
							undefined,
						loyaltyRewards:
							data.notificationPreferences.loyaltyRewards ??
							undefined,
						promotionalMessages:
							data.notificationPreferences.promotionalMessages ??
							undefined,
						updatedBy: userId,
						updatedAt: new Date(),
					})
					.where(eq(notificationPreferences.customerID, customerId));
			}

			// 6️⃣ Fetch updated customer
			const updated = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.id, customerId),
				with: { notificationPreferences: true },
			});

			return { data: updated, message: 'Customer updated successfully' };
		} catch (error) {
			handleServiceError(
				error,
				'Failed to update customer',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'updateCustomer',
				{ customerId, userId },
			);
		}
	},

	/**
	 * Soft delete customer by UUID
	 */
	async deleteCustomer(customerId: string, userId?: string) {
		try {
			const [deleted] = await db
				.update(customerMaster)
				.set({
					isActive: false,
					updatedBy: userId,
					updatedAt: new Date(),
				})
				.where(eq(customerMaster.id, customerId))
				.returning();

			if (!deleted)
				throw new AppError('Customer not found', StatusCodes.NOT_FOUND);

			return {
				data: { id: deleted.id },
				message: 'Customer deleted successfully',
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to delete customer',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'deleteCustomer',
				{ customerId, userId },
			);
		}
	},

	async updateOrderStatus(orderNo: any, userId?: string) {
		try {
			// Check if order exists
			const existingOrder = await db.query.orders.findFirst({
				where: eq(orders.orderNo, orderNo),
			});

			if (!existingOrder) {
				throw new AppError('Order not found', StatusCodes.NOT_FOUND);
			}

			// Check status
			if (existingOrder.status !== 'new') {
				throw new AppError(
					'Order cannot be updated. Only orders with status NEW can be moved to IN_PROGRESS.',
					StatusCodes.CONFLICT,
				);
			}

			// Update status to IN_PROGRESS
			await db
				.update(orders)
				.set({
					status: 'inprogress',
					updatedBy: userId,
					updatedAt: new Date(),
				})
				.where(eq(orders.orderNo, orderNo));

			const updatedOrder = await db.query.orders.findFirst({
				where: eq(orders.orderNo, orderNo),
			});

			return {
				data: updatedOrder,
				message: 'Order status updated to IN_PROGRESS successfully',
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to update order status',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Error in updateOrderStatus service',
				{ orderNo, userId },
			);
		}
	},
	async createCustomerProduct(
		data: { customerID: string; productID: string },
		userId?: string,
	) {
		try {
			// Validate input
			if (!data.customerID || !data.productID) {
				throw new AppError(
					'customerID and productID are required',
					StatusCodes.BAD_REQUEST,
				);
			}

			// Check if customer exists
			const customer = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.id, data.customerID),
			});

			if (!customer) {
				throw new AppError('Customer not found', StatusCodes.NOT_FOUND);
			}

			// Check if product exists
			const product = await db.query.products.findFirst({
				where: eq(products.id, data.productID),
			});

			if (!product) {
				throw new AppError('Product not found', StatusCodes.NOT_FOUND);
			}

			// Prevent duplicate engagement
			// const exists = await db.query.customerProducts.findFirst({
			// 	where: and(
			// 		eq(customerProducts.customerID, data.customerID),
			// 		eq(customerProducts.productID, data.productID),
			// 	),
			// });

			// if (exists) {
			// 	throw new AppError(
			// 		'This product is already linked to the customer',
			// 		StatusCodes.CONFLICT,
			// 	);
			// }

			// Insert new engagement record
			await db
				.insert(customerProducts)
				.values({
					customerID: data.customerID,
					productID: data.productID,
					createdBy: userId,
					updatedBy: userId,
				})
				.returning();

			// Return full populated entity (optional but good UX)
			const createdEngagement = await db.query.customerProducts.findFirst(
				{
					where: and(
						eq(customerProducts.customerID, data.customerID),
						eq(customerProducts.productID, data.productID),
					),
					with: {
						customer: true,
						product: true,
					},
				},
			);

			// Send WhatsApp product message
			if (
				createdEngagement?.customer?.phone &&
				createdEngagement?.product?.contentId
			) {
				try {
					const whatsappService = new WhatsAppMessageService();
					await whatsappService.sendProductMessage(
						createdEngagement.customer.phone,
						createdEngagement.product.contentId,
					);
				} catch (error) {
					// Log error but don't fail the engagement creation
					console.error(
						'Failed to send WhatsApp product message:',
						error,
					);
				}
			}

			return {
				data: createdEngagement,
				message: 'Customer product engagement recorded successfully',
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to create customer product engagement',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Error in createCustomerProduct service',
				{
					customerID: data.customerID,
					productID: data.productID,
					userId,
				},
			);
		}
	},
	async addLoyaltyPoints(customerID: any, userId?: string) {
		try {
			// Validate customer
			const customer = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.customerID, customerID),
			});

			if (!customer) {
				throw new AppError('Customer not found', StatusCodes.NOT_FOUND);
			}

			// Fetch or create loyalty account
			let account = await db.query.loyaltyAccounts.findFirst({
				where: eq(loyaltyAccounts.id, customerID),
			});

			if (!account) {
				// Create new loyalty account if missing
				const [createdAcc] = await db
					.insert(loyaltyAccounts)
					.values({
						customerID,
						points_balance: 0,
						points_redeemed: 0,
						lifetime_points: 0,
						createdBy: userId,
						updatedBy: userId,
					})
					.returning();

				account = createdAcc;
			}

			// Points to add per PAI hit
			const POINTS_TO_ADD = 200;

			const updatedBalance = account.points_balance + POINTS_TO_ADD;
			const updatedLifetime = account.lifetime_points + POINTS_TO_ADD;

			// Update account balance
			const [updatedAccount] = await db
				.update(loyaltyAccounts)
				.set({
					points_balance: updatedBalance,
					lifetime_points: updatedLifetime,
					last_transaction_at: new Date(),
					updatedBy: userId,
					updatedAt: new Date(),
				})
				.where(eq(loyaltyAccounts.id, account.id))
				.returning();

			// Insert transaction history
			await db.insert(loyaltyTransactions).values({
				customerID,
				account_id: account.id,
				initialPoint: account.points_balance,
				manipulatedPoint: POINTS_TO_ADD,
				totalPoint: updatedBalance,
				type: 'EARN',
				description: 'PAI reward points added',
				createdBy: userId,
				updatedBy: userId,
			});

			return {
				message: '200 Loyalty points added successfully',
				data: updatedAccount,
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to add loyalty points',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Error in addLoyaltyPoints service',
				{ customerID, userId },
			);
		}
	},
	async bulkUploadCustomers(
		file: Express.Multer.File | undefined,
		userId?: string,
	) {
		try {
			if (!file)
				throw new AppError('No file provided', StatusCodes.BAD_REQUEST);
			const rows = await parseCustomersExcel(file.buffer);
			if (!rows.length)
				throw new AppError(
					'No valid rows found in Excel',
					StatusCodes.BAD_REQUEST,
				);

			const emails = rows.map((r) => r.email.toLowerCase());
			const existing = await db
				.select({ email: customerMaster.email })
				.from(customerMaster)
				.where(inArray(customerMaster.email, emails));

			const existingEmails = new Set(
				existing.map((e) => e.email.toLowerCase()),
			);
			const toInsert = rows.filter(
				(r) => !existingEmails.has(r.email.toLowerCase()),
			);
			const skipped = rows.filter((r) =>
				existingEmails.has(r.email.toLowerCase()),
			);

			const createdCount = await db.transaction(async (tx) => {
				for (const row of toInsert) {
					console.log('row consoled', row);
					const [customer] = await tx
						.insert(customerMaster)
						.values({
							customerID: row.customerID,
							name: row.name,
							email: row.email,
							phone: row.phone,
							gender: row.gender,
							address: row.address,
							state: row.state,
							pincode: row.pincode,
							createdBy: userId,
							updatedBy: userId,
							isActive: true,
						})
						.returning();

					await tx.insert(notificationPreferences).values({
						customerID: customer.id,
						orderUpdates:
							row.notificationPreferences.orderUpdates ?? false,
						loyaltyRewards:
							row.notificationPreferences.loyaltyRewards ?? false,
						promotionalMessages:
							row.notificationPreferences.promotionalMessages ??
							false,
						createdBy: userId,
						updatedBy: userId,
					});
				}
				return toInsert.length;
			});

			return {
				data: {
					totalRows: rows.length,
					createdCount,
					skippedCount: skipped.length,
					errors: skipped.map((s) => ({
						email: s.email,
						reason: 'Duplicate email',
					})),
				},
				message: 'Bulk upload completed successfully',
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to upload customers',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'bulkUploadCustomers',
				{ userId },
			);
		}
	},
	// async getOrderById(id: string, userId?: string) {
	// 	try {
	// 		const order = await db.query.orders.findFirst({
	// 			where: eq(orders.id, id),
	// 			with: {
	// 				customer: true,
	// 				createdByUser: true,
	// 				updatedByUser: true,
	// 				orderItems: {
	// 					with: {
	// 						product: true,
	// 						createdByUser: true,
	// 						updatedByUser: true,
	// 					},
	// 					orderBy: (orderItems, { desc }) => [desc(orderItems.createdAt)],
	// 				},
	// 			},
	// 		});

	// 		if (!order) {
	// 			throw new AppError("Order not found", StatusCodes.NOT_FOUND);
	// 		}

	// 		return {
	// 			data: order,
	// 			message: "Order fetched successfully",
	// 		};
	// 	} catch (error) {
	// 		handleServiceError(
	// 			error,
	// 			"Failed to fetch order",
	// 			StatusCodes.INTERNAL_SERVER_ERROR,
	// 			"Error in getOrderById service",
	// 			{ id, userId }
	// 		);
	// 	}
	// }
	async getOrderById(id: string, userId?: string) {
		try {
			const order = await db.query.orders.findFirst({
				where: eq(orders.id, id),
				with: {
					customer: true,
					createdByUser: true,
					updatedByUser: true,
					orderItems: {
						with: {
							product: true,
							createdByUser: true,
							updatedByUser: true,
						},
						orderBy: (orderItems, { desc }) => [
							desc(orderItems.createdAt),
						],
					},
				},
			});

			if (!order) {
				throw new AppError('Order not found', StatusCodes.NOT_FOUND);
			}

			//  Fetch loyalty account using order.customer.customerID
			const loyaltyAccount = await db.query.loyaltyAccounts.findFirst({
				where: eq(loyaltyAccounts.customerID, order.customer.id),
				with: {
					transactions: {
						orderBy: (t, { desc }) => [desc(t.createdAt)],
					},
					createdByUser: true,
					updatedByUser: true,
				},
			});

			return {
				message: 'Order fetched successfully',
				data: {
					order,
					loyaltyAccount: loyaltyAccount ?? {
						points_balance: 0,
						points_redeemed: 0,
						lifetime_points: 0,
						transactions: [],
					},
				},
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to fetch order',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Error in getOrderById service',
				{ id, userId },
			);
		}
	},
};
