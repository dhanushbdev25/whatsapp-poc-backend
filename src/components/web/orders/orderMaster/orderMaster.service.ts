import { eq, and } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { db } from '../../../../database/index';
import { WhatsAppMessageService } from '../../webhook/whatsapp-message.service';
import AppError from '@/abstractions/AppError';
import {
	customerMaster,
	customerProducts,
	loyaltyAccounts,
	loyaltyTransactions,
	orderItems,
	orders,
	products,
} from '@/database/schema';
import { DbOrTx } from '@/database/transactionType/transactionType';
import { handleServiceError } from '@/utils/serviceErrorHandler';
import { fbCheckStock } from './facebookSync';
import { logger } from '@azure/storage-blob';
import env from '@/env';
import Stripe from 'stripe';
import { CustomerWebService } from '../../webhook/customer-web.service';


// interface CreateCustomerInput {
// 	name: string;
// 	email: string;
// 	phone: string;
// 	gender?: 'male' | 'female' | 'other';
// 	address?: string;
// 	state?: string;
// 	pincode?: string;
// 	notificationPreferences?: {
// 		orderUpdates?: boolean;
// 		loyaltyRewards?: boolean;
// 		promotionalMessages?: boolean;
// 	};
// }

const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY || '';
// const STRIPE_PUBLISHABLE_KEY = env.STRIPE_PUBLISHABLE_KEY || '';

function getStripe() {
	if (!STRIPE_SECRET_KEY) {
		throw new Error('STRIPE_SECRET_KEY missing');
	}
	// Use null to bind to your account default API version (keeps TS happy)
	return new Stripe(STRIPE_SECRET_KEY, { apiVersion: null });
}

const customerWebService = new CustomerWebService();

export const customerService = {
	async redeemLoyaltyPoints(
		customerID: string,
		pointsToRedeem: number,
		userId?: string,
		txOrDb: DbOrTx = db,
	) {
		try {
			if (!pointsToRedeem || pointsToRedeem <= 0) {
				return { message: 'No loyalty points redeemed', data: null };
			}

			const account = await db.query.loyaltyAccounts.findFirst({
				where: eq(loyaltyAccounts.customerID, customerID),
			});

			if (!account) {
				throw new AppError(
					'Loyalty account does not exist',
					StatusCodes.NOT_FOUND,
				);
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
				type: 'REDEEM',
				description: 'Points redeemed on order payment',
			});

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

	async createCustomerProduct(data: any, txOrDb: DbOrTx = db) {
		try {
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
			if (!customer)
				throw new AppError('Customer not found', StatusCodes.NOT_FOUND);

			const product = await db.query.products.findFirst({
				where: eq(products.contentId, data.productID),
			});
			if (!product)
				throw new AppError('Product not found', StatusCodes.NOT_FOUND);

			await txOrDb
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
	async addLoyaltyPoints(customerID: any, userId?: any, txOrDb: DbOrTx = db) {
	try {
		// 1️⃣ Validate customer (read → use db)
		const customer = await db.query.customerMaster.findFirst({
			where: eq(customerMaster.id, customerID),
		});
		if (!customer)
			throw new AppError("Customer not found", StatusCodes.NOT_FOUND);

		// 2️⃣ Fetch existing loyalty account (read → use db)
		let account = await db.query.loyaltyAccounts.findFirst({
			where: eq(loyaltyAccounts.customerID, customerID),
		});

		// 3️⃣ Create new account if missing (write → use txOrDb)
		if (!account) {
			const [createdAcc] = await txOrDb
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

		// 4️⃣ Points logic
		const POINTS_TO_ADD = 200;
		const updatedBalance = account.points_balance + POINTS_TO_ADD;
		const updatedLifetime = account.lifetime_points + POINTS_TO_ADD;

		// 5️⃣ Update loyalty account (write → use txOrDb)
		const [updatedAccount] = await txOrDb
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

		// 6️⃣ Insert transaction record (write → use txOrDb)
		await txOrDb.insert(loyaltyTransactions).values({
			customerID,
			account_id: account.id,
			initialPoint: account.points_balance,
			manipulatedPoint: POINTS_TO_ADD,
			totalPoint: updatedBalance,
			type: "EARN",
			description: "PAI reward points added",
			createdBy: userId,
			updatedBy: userId,
		});

		return {
			message: "200 Loyalty points added successfully",
			data: updatedAccount,
		};
	} catch (error) {
		handleServiceError(
			error,
			"Failed to add loyalty points",
			StatusCodes.INTERNAL_SERVER_ERROR,
			"Error in addLoyaltyPoints service",
			{ customerID, userId },
		);
	}
},

	async deductLoyaltyPoints(
		{
			customerID,
			points,
			orderNo,
			userId,
		}: {
			customerID: string;
			points: number;
			orderNo: string;
			userId?: string;
		},
		txOrDb: DbOrTx = db,
	) {
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

	async createPaymentTransaction({ paymentMethodId, order, email, loyalty }: any) {
		const stripe = getStripe();

		const actingUserId =
			order?.userId || order?.actingUserId || null;

		// 1️⃣ Fetch order record
		const orderRecord = await db.query.orders.findFirst({
			where: eq(orders.orderNo, order.orderId),
		});
		if (!orderRecord) throw new AppError("Order not found", StatusCodes.NOT_FOUND);

		// 2️⃣ Fetch ordered items
		const orderedItems = await db.query.orderItems.findMany({
			where: eq(orderItems.orderID, orderRecord.id),
			with: { product: true },
		});

		// 3️⃣ Stock check (DB + Facebook)
		for (const item of orderedItems) {
			const product = item.product;
			const qtyRequired = item.qty ?? 0;

			if (!product.qty || product.qty < qtyRequired) {
				throw new AppError(
					`Product ${product.productName} does not have enough stock`,
					StatusCodes.BAD_REQUEST
				);
			}

			const fbInfo = await fbCheckStock(product.contentId);
			if (!fbInfo.exists)
				throw new AppError(
					`Product ${product.productName} not found in Facebook catalog`,
					StatusCodes.BAD_REQUEST
				);
			if (fbInfo.availability === "out of stock")
				throw new AppError(
					`Product ${product.productName} is out of stock on Facebook`,
					StatusCodes.BAD_REQUEST
				);
		}

		// 4️⃣ Validate payment method
		const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
		if (!pm.card)
			throw new AppError("Not a card payment method", StatusCodes.BAD_REQUEST);
		if (pm.card.checks?.cvc_check === "fail")
			throw new AppError("CVC check failed", StatusCodes.BAD_REQUEST);

		const amountInSmallest = Math.max(1, Math.round(order.amount * 100));

		// 5️⃣ Create + confirm payment intent
		const pi: any = await stripe.paymentIntents.create({
			amount: amountInSmallest,
			currency: order.currency.toLowerCase(),
			payment_method: paymentMethodId,
			confirm: true,
			automatic_payment_methods: {
				enabled: true,
				allow_redirects: "never",
			},
			receipt_email: email || undefined,
			description: `Order ${order.orderId}`,
			metadata: {
				orderId: order.orderId,
				customerID: String(order.customerID),
			},
		});

		// 6️⃣ Handle 3D Secure
		if (pi.status === "requires_action" || pi.status === "requires_confirmation") {
			return {
				data: {
					valid: true,
					paymentStatus: pi.status,
					clientSecret: pi.client_secret,
					brand: pm.card.brand,
					last4: pm.card.last4,
					funding: pm.card.funding,
					message: "3D/OTP Authentication Required",
				},
			};
		}

		// 7️⃣ If succeeded — do everything inside one TX
		if (pi.status === "succeeded") {
			const orderNo = order.orderId;
			let loyaltySummary = null;

			await db.transaction(async (tx) => {
				await customerService.updateOrderStatus(orderNo, actingUserId, tx);

				const pointsToRedeem = Number(loyalty?.points_applied || 0);

				if (pointsToRedeem > 0) {
					loyaltySummary = await customerService.deductLoyaltyPoints(
						{
							customerID: order.customerID,
							points: pointsToRedeem,
							orderNo: order.orderId,
							userId: actingUserId,
						},
						tx
					);

					await customerService.redeemLoyaltyPoints(
						order.customerID,
						pointsToRedeem,
						actingUserId,
						tx
					);
				}

				for (const item of orderedItems) {
					const product = item.product;
					const qtyOrdered = item.qty ?? 0;
					const newQty = Math.max((product.qty || 0) - qtyOrdered, 0);

					await tx
						.update(products)
						.set({ qty: newQty, updatedAt: new Date() })
						.where(eq(products.id, product.id));
				}
			});

			// 8️⃣ Send WhatsApp confirmation
			try {
				const orderWithCustomer = await db.query.orders.findFirst({
					where: eq(orders.orderNo, orderNo),
					with: { customer: true },
				});

				if (orderWithCustomer?.customer?.phone) {
					const customerName = orderWithCustomer.customer.name || "Customer";
					const deliveryDays = 3;
					const formattedAmount = order.amount.toFixed(2);

					await customerWebService.sendPaymentConfirmation(
						orderWithCustomer.customer.phone,
						customerName,
						orderNo,
						formattedAmount,
						order.currency,
						deliveryDays
					);
				}
			} catch (msgErr) {
				logger.error("Failed to send payment confirmation", msgErr);
			}

			// 9️⃣ Facebook sync
			// try {
			// 	for (const item of orderedItems) {
			// 		const product = item.product;
			// 		const qtyOrdered = item.qty ?? 0;
			// 		const newQty = Math.max((product.qty || 0) - qtyOrdered, 0);

			// 		await fbUpdateStock(
			// 			product.contentId,
			// 			product.amount,
			// 			newQty,
			// 			product.currency
			// 		);
			// 	}
			// 	logger.info("Stock updated & synced to Facebook");
			// } catch (err) {
			// 	logger.error("Stock update failed", err);
			// }

			// 🔟 Final response
			return {
				data: {
					valid: true,
					paymentStatus: "succeeded",
					clientSecret: pi.client_secret,
					brand: pm.card.brand,
					last4: pm.card.last4,
					funding: pm.card.funding,
					order: {
						orderId: order.orderId,
						customerID: order.customerID,
						amount: order.amount,
						currency: order.currency,
					},
					email: email || null,
					loyalty: loyaltySummary,
				},
				message:
					"Payment succeeded, order updated, loyalty applied, stock reduced & synced",
			};
		}

		// Default case
		return {
			data: {
				valid: false,
				paymentStatus: pi.status,
			},
			message: "Payment did not succeed",
		};
	},
};
