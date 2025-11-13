import { eq, desc, and } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { db } from '../../../../database/index';
import { WhatsAppMessageService } from '../../webhook/whatsapp-message.service';
import AppError from '@/abstractions/AppError';
import {
	customerMaster,
	customerProducts,
	loyaltyAccounts,
	loyaltyTransactions,
	orders,
	products,
} from '@/database/schema';
import logger from '@/lib/logger';
import { handleServiceError } from '@/utils/serviceErrorHandler';
import { DbOrTx } from '@/database/transactionType/transactionType';

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

async redeemLoyaltyPoints(
	customerID: string,
	pointsToRedeem: number,
	userId?: string,
	txOrDb: DbOrTx = db
) {
	try {
		if (!pointsToRedeem || pointsToRedeem <= 0) {
			return { message: "No loyalty points redeemed", data: null };
		}

		const account = await db.query.loyaltyAccounts.findFirst({
			where: eq(loyaltyAccounts.customerID, customerID),
		});

		if (!account) {
			throw new AppError("Loyalty account does not exist", StatusCodes.NOT_FOUND);
		}

		// if (account.points_balance < pointsToRedeem) {
		// 	throw new AppError("Insufficient loyalty points", StatusCodes.BAD_REQUEST);
		// }

		const updatedBalance = account.points_balance - pointsToRedeem;
		const updatedRedeemed = account.points_redeemed + pointsToRedeem;

		const [updatedAccount] = await txOrDb
			.update(loyaltyAccounts)
			.set({
				points_balance: updatedBalance,
				points_redeemed: updatedRedeemed,
				last_transaction_at: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(loyaltyAccounts.id, account.id))
			.returning();

		await txOrDb.insert(loyaltyTransactions).values({
			customerID,
			account_id: account.id,
			initialPoint: account.points_balance,
			manipulatedPoint: -pointsToRedeem,
			totalPoint: updatedBalance,
			type: "REDEEM",
			description: "Points redeemed on order payment",
		});

		return {
			message: `${pointsToRedeem} points redeemed successfully`,
			data: updatedAccount,
		};
	} catch (error) {
		handleServiceError(
			error,
			"Failed to redeem loyalty points",
			StatusCodes.INTERNAL_SERVER_ERROR,
			"Error in redeemLoyaltyPoints service",
			{ customerID, pointsToRedeem }
		);
	}
}
,

	async updateOrderStatus(orderNo: any, userId?: any, txOrDb: DbOrTx = db) {
		try {
			const existingOrder = await db.query.orders.findFirst({
				where: eq(orders.orderNo, orderNo),
			});

			if (!existingOrder) {
				throw new AppError('Order not found', StatusCodes.NOT_FOUND);
			}

			if (existingOrder.status !== 'new') {
				throw new AppError(
					'Order cannot be updated. Only orders with status NEW can be moved to IN_PROGRESS.',
					StatusCodes.CONFLICT,
				);
			}

			await txOrDb
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
			if (!data.customerID || !data.productID) {
				throw new AppError(
					'customerID and productID are required',
					StatusCodes.BAD_REQUEST,
				);
			}
			const isUUID =
				typeof data.customerID === 'string' &&
				data.customerID.includes('-');

			const customer = await db.query.customerMaster.findFirst({
				where: isUUID
					? eq(customerMaster.id, data.customerID)
					: eq(customerMaster.customerID, Number(data.customerID)),
			});

			if (!customer) {
				throw new AppError('Customer not found', StatusCodes.NOT_FOUND);
			}

			const product = await db.query.products.findFirst({
				where: eq(products.contentId, data.productID),
			});

			if (!product) {
				throw new AppError('Product not found', StatusCodes.NOT_FOUND);
			}

			await db
				.insert(customerProducts)
				.values({
					customerID: customer.id,
					productID: product.id,
				})
				.returning();

			const createdEngagement = await db.query.customerProducts.findFirst(
				{
					where: and(
						eq(customerProducts.customerID, customer.id),
						eq(customerProducts.productID, product.id),
					),
					with: {
						customer: true,
						product: true,
					},
				},
			);

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

async deductLoyaltyPoints(
	{ customerID, points, orderNo, userId }: { customerID: string; points: number; orderNo: string; userId?: string },
	txOrDb: DbOrTx = db
) {
	try {
		const account = await db.query.loyaltyAccounts.findFirst({
			where: eq(loyaltyAccounts.customerID, customerID),
		});

		if (!account) {
			throw new AppError("Loyalty account not found", StatusCodes.NOT_FOUND);
		}

		// if (account.points_balance < points) {
		// 	throw new AppError("Insufficient loyalty points", StatusCodes.BAD_REQUEST);
		// }

		const previousBalance = account.points_balance;
		const newBalance = previousBalance - points;
		const newRedeemedTotal = account.points_redeemed + points;

		const [updatedAccount] = await txOrDb
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

		await txOrDb.insert(loyaltyTransactions).values({
			customerID,
			account_id: account.id,
			initialPoint: previousBalance,
			manipulatedPoint: -points,
			totalPoint: newBalance,
			type: "REDEEM",
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
			"Failed to redeem loyalty points",
			StatusCodes.INTERNAL_SERVER_ERROR,
			"Error in redeemPoints service",
			{ customerID, points, orderNo, userId }
		);
	}
}
,
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

	async getAllOrderDetails() {
		try {
			const order = await db.query.orders.findMany({
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
				throw new AppError('Orders not found', StatusCodes.NOT_FOUND);
			}

			return {
				message: 'Order fetched successfully',
				data: order,
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to fetch order',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Error in getOrderById service',
			);
		}
	},
};
