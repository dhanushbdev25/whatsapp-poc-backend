// src/controllers/customerController.ts
import { eq } from 'drizzle-orm';
import { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import Stripe from 'stripe';
import BaseApi from '../../../BaseApi';
import { CustomerWebService } from '../../webhook/customer-web.service';
import { customerService } from './orderMaster.service';
import AppError from '@/abstractions/AppError';
import { db } from '@/database';
import { orderItems, orders, products } from '@/database/schema';
import env from '@/env';
import logger from '@/lib/logger';
import { fbCheckStock, fbUpdateStock } from './facebookSync';

const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY || '';
const STRIPE_PUBLISHABLE_KEY = env.STRIPE_PUBLISHABLE_KEY || '';

/** Helper: build Stripe client */
function getStripe() {
	if (!STRIPE_SECRET_KEY) {
		throw new Error('STRIPE_SECRET_KEY missing');
	}
	// Use null to bind to your account default API version (keeps TS happy)
	return new Stripe(STRIPE_SECRET_KEY, { apiVersion: null });
}

export default class CustomerController extends BaseApi {
	private customerWebService: CustomerWebService;

	constructor() {
		super();
		this.customerWebService = new CustomerWebService();
	}

	public register(): Router {
		this.router.get(
			'/:id/get-order-details',
			this.getOrderDetailsById.bind(this),
		);
		this.router.get('/fetchAllOrders', this.getAllOrderDetails.bind(this));
		this.router.get('/payments/pk', this.getPk.bind(this));
		this.router.post(
			'/payments/validate-card',
			this.validateCard.bind(this),
		);
		this.router.post(
			'/payments/validate-and-intent',
			this.createPaymentTransaction.bind(this),
		);

		this.router.post(
			'/engagement/create',
			this.createCustomerProductEngagement.bind(this),
		);
		this.router.post(
			'/add/point',
			this.addCustomerLoyaltyPoints.bind(this),
		);

		return this.router;
	}

	public async createCustomerProductEngagement(req: Request, res: Response) {
		// const { userId } = req.body;

		const { data, message } = await customerService.createCustomerProduct(
			req.body,
		);

		res.locals = { data, message };
		super.send(res);
	}
	// add loyalty points
	public async addCustomerLoyaltyPoints(req: Request, res: Response) {
		const { customerID, userId } = req.query;

		if (!customerID) {
			return res.status(400).json({
				message: 'customerID is required',
			});
		}

		const { data, message } = await customerService.addLoyaltyPoints(
			customerID,
			userId,
		);

		res.locals = { data, message };
		super.send(res);
	}
	// Get order by ID
	public async getOrderDetailsById(req: Request, res: Response) {
		const { id }: any = req.params;

		const result = await customerService.getOrderById(id);

		res.locals = { data: result };
		super.send(res);
	}

	public async getAllOrderDetails(req: Request, res: Response) {
		const result = await customerService.getAllOrderDetails();

		res.locals = { data: result };
		super.send(res);
	}

	//Fetch Stripe pb key
	public async getPk(req: Request, res: Response) {
		if (!STRIPE_PUBLISHABLE_KEY) {
			throw new AppError(
				'Stripe publishable key not configured',
				StatusCodes.BAD_REQUEST,
			);
		}
		res.locals = { data: { publishableKey: STRIPE_PUBLISHABLE_KEY } };
		super.send(res);
	}
	// Create payment
	public async createPaymentTransaction(req: Request, res: Response) {
		const stripe = getStripe();
		const { paymentMethodId, order, email, loyalty }: any = req.body;

		if (!paymentMethodId)
			return res.status(400).json({ message: "paymentMethodId missing" });

		if (!order?.orderId || !order?.customerID || !order?.amount || !order?.currency) {
			return res.status(400).json({ message: "Missing order fields" });
		}

		const actingUserId =
			(req as any)?.user?.id ||
			(req as any)?.auth?.userId ||
			req.params?.id;

		// ===================================================================
		// 1) FETCH ORDER ITEMS BEFORE PAYMENT
		// ===================================================================
		const orderRecord = await db.query.orders.findFirst({
			where: eq(orders.orderNo, order.orderId),
		});

		if (!orderRecord) {
			return res.status(404).json({ message: "Order not found" });
		}

		const orderedItems = await db.query.orderItems.findMany({
			where: eq(orderItems.orderID, orderRecord.id),
			with: { product: true },
		});

		// ===================================================================
		// 2) STOCK CHECK (DATABASE + FACEBOOK)
		// ===================================================================
		for (const item of orderedItems) {
			const product = item.product;
			const qtyRequired = item.qty ?? 0;

			// --- DB CHECK ---
			if (!product.qty || product.qty < qtyRequired) {
				return res.status(400).json({
					message: `Product ${product.productName} does not have enough stock`,
				});
			}

			// --- FACEBOOK CHECK ---
			const fbInfo = await fbCheckStock(product.contentId);

			if (!fbInfo.exists) {
				return res.status(400).json({
					message: `Product ${product.productName} not found in Facebook catalog`,
				});
			}

			if (fbInfo.availability === "out of stock") {
				return res.status(400).json({
					message: `Product ${product.productName} is out of stock on Facebook`,
				});
			}
		}

		// ===================================================================
		// 3) VALIDATE PAYMENT METHOD
		// ===================================================================
		const pm = await stripe.paymentMethods.retrieve(paymentMethodId);

		if (!pm.card)
			throw new AppError("Not a card payment method", StatusCodes.BAD_REQUEST);

		if (pm.card.checks?.cvc_check === "fail")
			throw new AppError("CVC check failed", StatusCodes.BAD_REQUEST);

		const amountInSmallest = Math.max(1, Math.round(order.amount * 100));

		// ===================================================================
		// 4) CREATE + CONFIRM PAYMENT INTENT
		// ===================================================================
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

		// ===================================================================
		// 5) HANDLE 3D SECURE ACTION
		// ===================================================================
		if (pi.status === "requires_action" || pi.status === "requires_confirmation") {
			return res.json({
				valid: true,
				paymentStatus: pi.status,
				clientSecret: pi.client_secret,
				brand: pm.card.brand,
				last4: pm.card.last4,
				funding: pm.card.funding,
				message: "3D/OTP Authentication Required",
			});
		}

		// ===================================================================
		// 6) PAYMENT SUCCESS LOGIC
		// ===================================================================
		if (pi.status === "succeeded") {
			const orderNo = order.orderId;

			// -- update order status --
			await customerService.updateOrderStatus(orderNo, order.customerID);

			// -- loyalty --
			let loyaltySummary = null;
			const pointsToRedeem = Number(loyalty?.points_applied || 0);

			if (pointsToRedeem > 0) {
				loyaltySummary = await customerService.deductLoyaltyPoints({
					customerID: order.customerID,
					points: pointsToRedeem,
					orderNo: order.orderId,
					userId: actingUserId,
				});

				await customerService.redeemLoyaltyPoints(
					order.customerID,
					loyalty.points_applied
				);
			}

			// ===================================================================
			// 7) SEND PAYMENT CONFIRMATION MESSAGE
			// ===================================================================
			try {
				const orderWithCustomer = await db.query.orders.findFirst({
					where: eq(orders.orderNo, orderNo),
					with: { customer: true },
				});

				if (orderWithCustomer?.customer?.phone) {
					const customerName =
						orderWithCustomer.customer.name || "Customer";
					const deliveryDays = 3;
					const formattedAmount = order.amount.toFixed(2);

					await this.customerWebService.sendPaymentConfirmation(
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

			// ===================================================================
			// 8) REDUCE STOCK + SYNC WITH FACEBOOK
			// ===================================================================
			try {
				for (const item of orderedItems) {
					const product = item.product;
					const qtyOrdered = item.qty ?? 0;
					const newQty = Math.max((product.qty || 0) - qtyOrdered, 0);

					// update DB stock
					await db
						.update(products)
						.set({
							qty: newQty,
							updatedAt: new Date(),
						})
						.where(eq(products.id, product.id));

					// Facebook sync
					const data = await fbUpdateStock(
						product.contentId,
						product.amount,
						newQty,
						product.currency
					);
					console.log(data, 'datadatadata');

				}


				logger.info("Stock updated & synced to Facebook");
			} catch (err) {
				logger.error("Stock update failed", err);
			}

			// ===================================================================
			// 9) SUCCESS RESPONSE
			// ===================================================================
			res.locals = {
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

			super.send(res);
			return;
		}


		res.locals = {
			data: {
				valid: false,
				paymentStatus: pi.status,
			},
			message: "Payment did not succeed",
		};

		super.send(res);
	}



	//Validate Payment Cards
	public async validateCard(req: Request, res: Response) {
		const { paymentMethodId } = req.body as { paymentMethodId: string };
		if (!paymentMethodId) {
			return res
				.status(400)
				.json({ valid: false, reason: 'paymentMethodId missing' });
		}

		const stripe = getStripe();
		const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
		const card = pm.card;
		if (!card)
			return res.json({
				valid: false,
				reason: 'Not a card payment method',
			});
		if (card.checks?.cvc_check === 'fail') {
			res.locals = { data: { valid: false, reason: 'CVC check failed' } };
			return super.send(res);
		}

		res.locals = {
			data: {
				valid: true,
				brand: card.brand,
				last4: card.last4,
				funding: card.funding,
			},
		};
		super.send(res);
	}
}
