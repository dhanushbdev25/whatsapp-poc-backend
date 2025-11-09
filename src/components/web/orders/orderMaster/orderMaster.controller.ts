// src/controllers/customerController.ts
import { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer from 'multer';
import Stripe from 'stripe';
import BaseApi from '../../../BaseApi';
import { customerService } from './orderMaster.service';
import AppError from '@/abstractions/AppError';
import env from '@/env';
import { buildCustomersTemplate } from '@/utils/excelCustomers';

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
	constructor() {
		super();
	}

	public register(): Router {
		const upload = multer({ storage: multer.memoryStorage() });

		this.router.get('/template', this.downloadTemplate.bind(this));

		this.router.get('/', this.getAllCustomers.bind(this));
		this.router.get('/:id', this.getCustomerById.bind(this));
		this.router.get(
			'/:id/get-order-details',
			this.getOrderDetailsById.bind(this),
		);
		this.router.post('/', this.createCustomer.bind(this));
		this.router.get('/payments/pk', this.getPk.bind(this));
		this.router.post(
			'/payments/validate-card',
			this.validateCard.bind(this),
		);
		this.router.post(
			'/payments/validate-and-intent',
			this.validateAndCreateIntent.bind(this),
		);
		this.router.post(
			'/payments/create-intent',
			this.createIntent.bind(this),
		);

		this.router.post(
			'/bulk-upload',
			upload.single('file'),
			this.bulkUpload.bind(this),
		);
		this.router.patch('/:id', this.updateCustomer.bind(this));
		this.router.delete('/:id', this.deleteCustomer.bind(this));
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

	/**
	 * GET /api/customers
	 * Fetch all customers — no filters, no pagination
	 */
	public async getAllCustomers(req: Request, res: Response) {
		const { userId } = req.query;

		const { data, message } = await customerService.getAllCustomers(
			userId ? String(userId) : undefined,
		);

		res.locals = { data, message };
		super.send(res);
	}

	/**
	 * GET /api/customers/:id
	 * Fetch single customer by customerID
	 */
	public async getCustomerById(req: Request, res: Response) {
		const customerId = Number(req.params.id);
		const { userId } = req.query;

		const { data, message } = await customerService.getCustomerById(
			customerId,
			userId ? String(userId) : undefined,
		);

		res.locals = { data, message };
		super.send(res);
	}

	/**
	 * POST /api/customers?userId=...
	 */
	public async createCustomer(req: Request, res: Response) {
		const { userId } = req.query;

		const { data, message } = await customerService.createCustomer(
			req.body,
			userId ? String(userId) : undefined,
		);

		res.locals = { data, message };
		super.send(res);
	}
	public async addRedeemPoint(req: Request, res: Response) {
		const { userId } = req.query;

		const { data, message } = await customerService.createCustomer(
			req.body,
			userId ? String(userId) : undefined,
		);

		res.locals = { data, message };
		super.send(res);
	}
	public async createCustomerProductEngagement(req: Request, res: Response) {
		// const { userId } = req.body;

		const { data, message } = await customerService.createCustomerProduct(
			req.body,
		);

		res.locals = { data, message };
		super.send(res);
	}
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
	public async getOrderDetailsById(req: Request, res: Response) {
		const { id }: any = req.params;
		const { userId }: any = req.query;

		const result = await customerService.getOrderById(id, userId);

		res.locals = { data: result };
		super.send(res);
	}

	// getPk stays the same shape you posted
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

	// validateAndCreateIntent (unchanged logic)
	public async validateAndCreateIntents(req: Request, res: Response) {
		const stripe = getStripe();

		const {
			paymentMethodId,
			order,
			email,
		}: {
			paymentMethodId: string;
			order: {
				orderId: string;
				customerID: string;
				amount: number;
				currency: string;
			};
			email?: string;
		} = req.body;

		if (!paymentMethodId)
			return res.status(400).json({ message: 'paymentMethodId missing' });
		if (
			!order?.orderId ||
			!order?.customerID ||
			!order?.amount ||
			!order?.currency
		) {
			return res.status(400).json({ message: 'Missing order fields' });
		}

		const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
		const card = pm.card;
		if (!card) {
			// return res.json({
			// 	valid: false,
			// 	reason: 'Not a card payment method',
			// });
		}
		if (card.checks?.cvc_check === 'fail') {
			return res.json({ valid: false, reason: 'CVC check failed' });
		}

		const amountInSmallest = Math.max(1, Math.round(order.amount * 100));
		const pi = await stripe.paymentIntents.create({
			amount: amountInSmallest,
			currency: order.currency,
			automatic_payment_methods: { enabled: true },
			payment_method: paymentMethodId,
			receipt_email: email || undefined,
			description: `Order ${order.orderId}`,
			metadata: {
				orderId: order.orderId,
				customerID: order.customerID,
			},
		});
		const orderNo = order.orderId;

		const { data: _data, message: _message } =
			await customerService.updateOrderStatus(orderNo, '922');

		res.locals = {
			data: {
				// data: data,
				valid: true,
				brand: card.brand,
				last4: card.last4,
				funding: card.funding,
				clientSecret: pi.client_secret,
			},
			// message
		};

		super.send(res);
	}
	public async validateAndCreateIntent(req: Request, res: Response) {
		const stripe = getStripe();

		const { paymentMethodId, order, email, loyalty }: any = req.body;

		if (!paymentMethodId)
			return res.status(400).json({ message: 'paymentMethodId missing' });

		if (
			!order?.orderId ||
			!order?.customerID ||
			!order?.amount ||
			!order?.currency
		) {
			return res.status(400).json({ message: 'Missing order fields' });
		}

		const actingUserId =
			(req as any)?.user?.id ||
			(req as any)?.auth?.userId ||
			req.params?.id ||
			undefined;

		const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
		if (!pm.card)
			throw new AppError(
				'Not a card payment method',
				StatusCodes.BAD_REQUEST,
			);
		if (pm.card.checks?.cvc_check === 'fail')
			throw new AppError('CVC check failed', StatusCodes.BAD_REQUEST);

		const amountInSmallest = Math.max(1, Math.round(order.amount * 100));

		// CREATE & CONFIRM PAYMENT
		const pi: any = await stripe.paymentIntents.create({
			amount: amountInSmallest,
			currency: order.currency.toLowerCase(),
			payment_method: paymentMethodId,
			confirm: true,
			automatic_payment_methods: {
				enabled: true,
				allow_redirects: 'never',
			},
			receipt_email: email || undefined,
			description: `Order ${order.orderId}`,
			metadata: {
				orderId: order.orderId,
				customerID: String(order.customerID),
			},
		});

		if (
			pi.status === 'requires_action' ||
			pi.status === 'requires_confirmation'
		) {
			return res.json({
				valid: true,
				paymentStatus: pi.status,
				clientSecret: pi.client_secret,
				brand: pm.card.brand,
				last4: pm.card.last4,
				funding: pm.card.funding,
				message: '3D/OTP Authentication Required',
			});
		}

		if (pi.status === 'succeeded') {
			const orderNo = order.orderId;
			// 1) UPDATE ORDER STATUS
			await customerService.updateOrderStatus(
				orderNo,
				'6db69b5d-754f-4a66-8a51-5361ed01c914',
			);

			// 2) REDEEM POINTS IF APPLICABLE
			let loyaltySummary = null;
			const pointsToRedeem = Number(loyalty?.points_applied || 0);
			if (pointsToRedeem > 0) {
				loyaltySummary = await customerService.redeemPoints({
					customerID: order.customerID,
					points: pointsToRedeem,
					orderNo: order.orderId,
					userId: actingUserId,
				});
			}

			// 3) ADD +200 EARN POINTS
			// await customerService.addLoyaltyPointsTransactions(order.customerID, actingUserId);

			// 4) SEND RESPONSE

			res.locals = {
				data: {
					valid: true,
					paymentStatus: 'succeeded',
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
					'Payment succeeded, Order moved to IN_PROGRESS, Loyalty updated',
			};
			super.send(res);
			return;
		}

		// ❌ PAYMENT FAILED (OTHER STATUS)

		// res.locals = {
		// 	data: {
		// 		valid: false,
		// 		paymentStatus: pi.status
		// 	}, message: "Payment did not succeed"
		// };
		res.locals = {
			data: {
				daa: pi,
				// valid: false,
				// paymentStatus: pi.status
			},
			message: 'Payment did not succeed',
		};
		super.send(res);
	}

	// createIntent (unchanged shape)
	public async createIntent(req: Request, res: Response) {
		const stripe = getStripe();
		const {
			order,
		}: {
			order: {
				orderId: string;
				customerID: string;
				amount: number;
				currency: string;
			};
		} = req.body;

		if (
			!order?.orderId ||
			!order?.customerID ||
			!order?.amount ||
			!order?.currency
		) {
			throw new AppError('Missing order fields', StatusCodes.BAD_REQUEST);
		}

		const amountInSmallest = Math.max(1, Math.round(order.amount * 100));
		const pi = await stripe.paymentIntents.create({
			amount: amountInSmallest,
			currency: order.currency.toLowerCase(),
			automatic_payment_methods: { enabled: true },
			description: `Order ${order.orderId}`,
			metadata: {
				orderId: order.orderId,
				customerID: order.customerID,
			},
		});
		const { data, message } = await customerService.updateOrderStatus(
			order.orderId,
			'922',
		);

		res.locals = {
			data: { data, clientSecret: pi.client_secret },
			message,
		};
		super.send(res);
	}

	// validateCard (unchanged)
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

	/**
	 * PATCH /api/customers/:id?userId=...
	 */
	public async updateCustomer(req: Request, res: Response) {
		const customerId = Number(req.params.id);
		const { userId } = req.query;

		const { data, message } = await customerService.updateCustomer(
			customerId,
			req.body,
			userId ? String(userId) : undefined,
		);

		res.locals = { data, message };
		super.send(res);
	}

	/**
	 * DELETE /api/customers/:id?userId=...
	 */
	public async deleteCustomer(req: Request, res: Response) {
		const customerId = Number(req.params.id);
		const { userId } = req.query;

		const { data, message } = await customerService.deleteCustomer(
			customerId,
			userId ? String(userId) : undefined,
		);

		res.locals = { data, message };
		super.send(res);
	}

	/**
	 * POST /web/customers/bulk-upload?userId=...
	 */
	public async bulkUpload(req: Request, res: Response) {
		const { userId } = req.query;
		const file = req.file;
		if (!file) {
			throw new AppError('No file provided', StatusCodes.BAD_REQUEST);
		}
		const { data, message } = await customerService.bulkUploadCustomers(
			file,
			userId ? String(userId) : undefined,
		);

		res.locals = { data, message };
		super.send(res);
	}

	public async downloadTemplate(req: Request, res: Response) {
		// Dynamically import helper to avoid circular dependencies
		const buffer = await buildCustomersTemplate();

		res.setHeader(
			'Content-Type',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		);
		res.setHeader(
			'Content-Disposition',
			'attachment; filename="customers_template.xlsx"',
		);

		res.status(200).send(buffer);
	}
}
