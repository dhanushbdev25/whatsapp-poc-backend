import { eq, desc as orderDesc, sql, and, inArray } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { db } from '../../../../database/index';
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
import logger from '@/lib/logger';
import { parseCustomersExcel } from '@/utils/excelCustomers';
import { handleServiceError } from '@/utils/serviceErrorHandler';

interface CreateCustomerInput {
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

//  Fixed: replaced empty interface with type alias
type UpdateCustomerInput = Partial<CreateCustomerInput>;

export const customerService = {
	/**
	 *  Fetch all customers (no filters, no pagination)
	 */
	async getAllCustomers(userId?: string) {
		try {
			const customers = await db.query.customerMaster.findMany({
				orderBy: [orderDesc(customerMaster.createdAt)],
				where: eq(customerMaster.isActive, true),
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
				'Error in getAllCustomers service',
				{ userId },
			);
		}
	},

	/**
	 *  Get customer by customerID with all relations
	 */
	async getCustomerById(customerID: number, userId?: string) {
		try {
			const customer = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.customerID, customerID),
				with: {
					notificationPreferences: true,
					loyaltyAccounts: true,
					orders: {
						limit: 10,
						orderBy: (orderItems, { desc }) => [
							desc(orderItems.createdAt),
						],
					},
					customerGroupMembers: {
						with: {
							group: true,
						},
					},
				},
			});

			if (!customer) {
				throw new AppError('Customer not found', StatusCodes.NOT_FOUND);
			}

			return {
				data: customer,
				message: 'Customer fetched successfully',
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to fetch customer',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Error in getCustomerById service',
				{ customerID, userId },
			);
		}
	},

	async redeemLoyaltyPoints(
		customerID: string,
		pointsToRedeem: number,
		userId?: string,
	) {
		try {
			if (!pointsToRedeem || pointsToRedeem <= 0) {
				return { message: 'No loyalty points redeemed', data: null };
			}

			logger.info('Redeeming loyalty points', {
				customerID,
				pointsToRedeem,
				userId,
			});

			// Get loyalty account
			const account = await db.query.loyaltyAccounts.findFirst({
				where: eq(loyaltyAccounts.customerID, customerID),
			});

			if (!account) {
				throw new AppError(
					'Loyalty account does not exist',
					StatusCodes.NOT_FOUND,
				);
			}

			// Ensure sufficient balance
			if (account.points_balance < pointsToRedeem) {
				throw new AppError(
					'Insufficient loyalty points',
					StatusCodes.BAD_REQUEST,
				);
			}

			const updatedBalance = account.points_balance - pointsToRedeem;
			const updatedRedeemed = account.points_redeemed + pointsToRedeem;

			// Update loyalty balance
			const [updatedAccount] = await db
				.update(loyaltyAccounts)
				.set({
					points_balance: updatedBalance,
					points_redeemed: updatedRedeemed,
					last_transaction_at: new Date(),
					// updatedBy: userId,
					updatedAt: new Date(),
				})
				.where(eq(loyaltyAccounts.id, account.id))
				.returning();

			// Insert REDEEM transaction
			const ddata = await db.insert(loyaltyTransactions).values({
				customerID,
				account_id: account.id,
				initialPoint: account.points_balance,
				manipulatedPoint: -pointsToRedeem,
				totalPoint: updatedBalance,
				type: 'REDEEM',
				description: 'Points redeemed on order payment',
				// createdBy: userId,
				// updatedBy: userId,
			});
			console.log(ddata);

			return {
				message: `${pointsToRedeem} points redeemed successfully`,
				data: updatedAccount,
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to redeem loyalty points',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Error in redeemLoyaltyPoints service',
				{ customerID, pointsToRedeem },
			);
		}
	},

	/**
	 *  Create new customer with notification preferences
	 */
	async createCustomer(
		data: CreateCustomerInput & { customerID?: any },
		userId?: string,
	) {
		try {
			// Check if email already exists
			const existingCustomer = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.email, data.email),
			});

			if (existingCustomer) {
				throw new AppError(
					'Customer with this email already exists',
					StatusCodes.CONFLICT,
				);
			}

			// Auto-generate customerID if not provided
			let customerID = data.customerID;
			if (!customerID) {
				const [lastCustomer] = await db
					.select({ customerID: customerMaster.customerID })
					.from(customerMaster)
					.orderBy(orderDesc(customerMaster.customerID))
					.limit(1);

				customerID = lastCustomer ? lastCustomer.customerID + 1 : 1;
			}

			//  Removed unused variable warning (customer)
			await db
				.insert(customerMaster)
				.values({
					customerID,
					name: data.name,
					email: data.email,
					phone: data.phone,
					gender: data.gender,
					address: data.address,
					state: data.state,
					pincode: data.pincode,
					createdBy: userId,
					updatedBy: userId,
					latestActive: new Date(),
					isActive: true,
				})
				.returning();

			// Create notification preferences if provided
			if (data.notificationPreferences) {
				await db.insert(notificationPreferences).values({
					customerID,
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

			// Fetch created customer with preferences
			const createdCustomer = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.customerID, customerID),
				with: {
					notificationPreferences: true,
				},
			});

			return {
				data: createdCustomer,
				message: 'Customer created successfully',
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to create customer',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Error in createCustomer service',
				{ email: data.email, userId },
			);
		}
	},

	/**
	 *  Update customer by customerID
	 */
	async updateCustomer(
		customerID: any,
		data: UpdateCustomerInput,
		userId?: string,
	) {
		try {
			// Check if customer exists
			const existingCustomer = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.id, customerID),
			});

			if (!existingCustomer) {
				throw new AppError('Customer not found', StatusCodes.NOT_FOUND);
			}

			// Check email uniqueness if updated
			if (data.email && data.email !== existingCustomer.email) {
				const emailExists = await db.query.customerMaster.findFirst({
					where: and(
						eq(customerMaster.email, data.email),
						sql`${customerMaster.customerID} != ${customerID}`,
					),
				});

				if (emailExists) {
					throw new AppError(
						'Email already in use by another customer',
						StatusCodes.CONFLICT,
					);
				}
			}

			// Update customer
			await db
				.update(customerMaster)
				.set({
					...(data.name && { name: data.name }),
					...(data.email && { email: data.email }),
					...(data.phone && { phone: data.phone }),
					...(data.gender && { gender: data.gender }),
					...(data.address !== undefined && {
						address: data.address,
					}),
					...(data.state !== undefined && { state: data.state }),
					...(data.pincode !== undefined && {
						pincode: data.pincode,
					}),
					updatedBy: userId,
					updatedAt: new Date(),
				})
				.where(eq(customerMaster.id, customerID));

			// Update notification preferences
			if (data.notificationPreferences) {
				await db
					.update(notificationPreferences)
					.set({
						...(data.notificationPreferences.orderUpdates !==
							undefined && {
							orderUpdates:
								data.notificationPreferences.orderUpdates,
						}),
						...(data.notificationPreferences.loyaltyRewards !==
							undefined && {
							loyaltyRewards:
								data.notificationPreferences.loyaltyRewards,
						}),
						...(data.notificationPreferences.promotionalMessages !==
							undefined && {
							promotionalMessages:
								data.notificationPreferences
									.promotionalMessages,
						}),
						updatedBy: userId,
						updatedAt: new Date(),
					})
					.where(eq(notificationPreferences.customerID, customerID));
			}

			const updatedCustomer = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.customerID, customerID),
				with: {
					notificationPreferences: true,
				},
			});

			return {
				data: updatedCustomer,
				message: 'Customer updated successfully',
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to update customer',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Error in updateCustomer service',
				{ customerID, userId },
			);
		}
	},

	/**
	 *  Soft delete customer
	 */
	async deleteCustomer(customerID: number, userId?: string) {
		try {
			const [deletedCustomer] = await db
				.update(customerMaster)
				.set({
					isActive: false,
					updatedBy: userId,
					updatedAt: new Date(),
				})
				.where(eq(customerMaster.customerID, customerID))
				.returning();

			if (!deletedCustomer) {
				throw new AppError('Customer not found', StatusCodes.NOT_FOUND);
			}

			return {
				data: { customerID: deletedCustomer.customerID },
				message: 'Customer deleted successfully',
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to delete customer',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Error in deleteCustomer service',
				{ customerID, userId },
			);
		}
	},

	async updateOrderStatus(orderNo: any, userId?: any) {
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
					// updatedBy: userId,
					// updatedAt: new Date(),
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
	async createCustomerProduct(data: any) {
		try {
			// Validate input
			if (!data.customerID || !data.productID || !data.userId) {
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
				where: eq(products.contentId, data.productID),
			});

			if (!product) {
				throw new AppError('Product not found', StatusCodes.NOT_FOUND);
			}

			// Insert new engagement record
			await db
				.insert(customerProducts)
				.values({
					customerID: data.customerID,
					productID: product.id,
					// createdBy: data.userId,
					// updatedBy: data.userId,
				})
				.returning();

			// Return full populated entity (optional but good UX)
			const createdEngagement = await db.query.customerProducts.findFirst(
				{
					where: and(
						eq(customerProducts.customerID, data.customerID),
						eq(customerProducts.productID, product.id),
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
				{ customerID: data.customerID, productID: data.productID },
			);
		}
	},
	async addLoyaltyPoints(customerID: any, userId?: any) {
		try {
			// Validate customer
			const customer = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.id, customerID),
			});

			if (!customer) {
				throw new AppError('Customer not found', StatusCodes.NOT_FOUND);
			}

			// Fetch or create loyalty account
			let account = await db.query.loyaltyAccounts.findFirst({
				where: eq(loyaltyAccounts.customerID, customerID),
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
	async addLoyaltyPointsTransactions(customerID: any, userId?: string) {
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
				where: eq(loyaltyAccounts.customerID, customerID),
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
	async redeemPoints({
		customerID,
		points,
		orderNo,
		userId,
	}: {
		customerID: string;
		points: number;
		orderNo: string;
		userId?: string;
	}) {
		try {
			const account = await db.query.loyaltyAccounts.findFirst({
				where: eq(loyaltyAccounts.customerID, customerID),
			});

			if (!account) {
				throw new AppError(
					'Loyalty account not found',
					StatusCodes.NOT_FOUND,
				);
			}

			if (account.points_balance < points) {
				throw new AppError(
					'Insufficient loyalty points',
					StatusCodes.BAD_REQUEST,
				);
			}

			const previousBalance = account.points_balance;
			const newBalance = previousBalance - points;
			const newRedeemedTotal = account.points_redeemed + points;

			const [updatedAccount] = await db
				.update(loyaltyAccounts)
				.set({
					points_balance: newBalance,
					points_redeemed: newRedeemedTotal,
					last_transaction_at: new Date(),
					updatedBy: userId,
					updatedAt: new Date(),
				})
				.where(eq(loyaltyAccounts.id, account.id))
				.returning();

			await db.insert(loyaltyTransactions).values({
				customerID,
				account_id: account.id,
				initialPoint: previousBalance,
				manipulatedPoint: -points,
				totalPoint: newBalance,
				type: 'REDEEM',
				description: `Redeemed ${points} points`,
				orderNo,
				createdBy: userId,
				updatedBy: userId,
			});

			return {
				previous_balance: previousBalance,
				new_balance: newBalance,
				new_points_redeemed_total: newRedeemedTotal,
				lifetime_points: updatedAccount.lifetime_points,
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to redeem loyalty points',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Error in redeemPoints service',
				{ customerID, points, orderNo, userId },
			);
		}
	},
	async bulkUploadCustomers(
		file: Express.Multer.File | undefined,
		userId?: string,
	) {
		try {
			if (!file) {
				throw new AppError('No file provided', StatusCodes.BAD_REQUEST);
			}

			// 1️⃣ Parse Excel file
			const rows = await parseCustomersExcel(file.buffer);
			if (!rows.length) {
				throw new AppError(
					'No valid rows found in Excel',
					StatusCodes.BAD_REQUEST,
				);
			}

			// 2️⃣ Check duplicates by email
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

			if (!toInsert.length) {
				return {
					data: {
						totalRows: rows.length,
						createdCount: 0,
						skippedCount: rows.length,
						errors: skipped.map((s) => ({
							email: s.email,
							reason: 'Duplicate email found',
						})),
					},
					message: 'All rows skipped due to existing emails',
				};
			}

			// 3️⃣ Insert customers transactionally
			const createdCount = await db.transaction(async (tx) => {
				const [last] = await tx
					.select({ customerID: customerMaster.customerID })
					.from(customerMaster)
					.orderBy(orderDesc(customerMaster.customerID))
					.limit(1);

				let nextId = last ? last.customerID + 1 : 1;

				for (const row of toInsert) {
					const [customer] = await tx
						.insert(customerMaster)
						.values({
							customerID: nextId++,
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

			// 4️⃣ Return summary
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
				'Error in bulkUploadCustomers service',
				{ userId },
			);
		}
	},
	async getOrderByIds(id: string, userId?: string) {
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

			return {
				data: order,
				message: 'Order fetched successfully',
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
	async getOrderById(id: string, _userId?: string) {
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
				{ id },
			);
		}
	},
};
