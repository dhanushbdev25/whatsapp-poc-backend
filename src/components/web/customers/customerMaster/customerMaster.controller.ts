import { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer from 'multer';
import Stripe from 'stripe';
import BaseApi from '../../../../components/BaseApi';
import { customerService } from './customerMaster.service';
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
		this.router.get('order/:id', this.getOrderById.bind(this));
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
	 * GET /web/customers
	 * Fetch all customers
	 */
	public async getAllCustomers(req: Request, res: Response) {
		const { data, message } = await customerService.getAllCustomers();

		res.locals = { data, message };
		super.send(res);
	}

	/**
	 * GET /web/customers/:id
	 * Fetch single customer by UUID
	 */
	public async getCustomerById(req: Request, res: Response) {
		const { id } = req.params;
		const { userId } = req.query;

		const { data, message } = await customerService.getCustomerById(
			id,
			userId ? String(userId) : undefined,
		);

		res.locals = { data, message };
		super.send(res);
	}

	/**
	 * POST /web/customers?userId=...
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
		const { userId } = req.query;

		const { data, message } = await customerService.createCustomerProduct(
			req.body,
			userId ? String(userId) : undefined,
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
			Number(customerID),
			userId ? String(userId) : undefined,
		);

		res.locals = { data, message };
		super.send(res);
	}
	public async getOrderById(req: Request, res: Response) {
		const { id }: any = req.params;
		const { userId }: any = req.query;

		const result = await this.getOrderById(id, userId);

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
	public async validateAndCreateIntent(req: Request, res: Response) {
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
			return res.json({
				valid: false,
				reason: 'Not a card payment method',
			});
		}
		if (card.checks?.cvc_check === 'fail') {
			return res.json({ valid: false, reason: 'CVC check failed' });
		}

		const amountInSmallest = Math.max(1, Math.round(order.amount * 100));
		const pi = await stripe.paymentIntents.create({
			amount: amountInSmallest,
			currency: order.currency.toLowerCase(),
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

		const { data, message } = await customerService.updateOrderStatus(
			orderNo,
			'922',
		);

		res.locals = {
			data: {
				data: data,
				valid: true,
				brand: card.brand,
				last4: card.last4,
				funding: card.funding,
				clientSecret: pi.client_secret,
			},
			message,
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
	 * PATCH /web/customers/:id?userId=...
	 */
	public async updateCustomer(req: Request, res: Response) {
		const { id } = req.params;
		const { userId } = req.query;

		const { data, message } = await customerService.updateCustomer(
			id,
			req.body,
			userId ? String(userId) : undefined,
		);

		res.locals = { data, message };
		super.send(res);
	}

	/**
	 * DELETE /web/customers/:id?userId=...
	 */
	public async deleteCustomer(req: Request, res: Response) {
		const { id } = req.params;
		const { userId } = req.query;

		const { data, message } = await customerService.deleteCustomer(
			id,
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

	/**
	 * GET /web/customers/template
	 * Download Excel customer upload template
	 */
	public async downloadTemplate(req: Request, res: Response) {
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
