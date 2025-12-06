// src/controllers/customerController.ts
import { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import Stripe from 'stripe';
import BaseApi from '../../../BaseApi';
import { CustomerWebService } from '../../webhook/customer-web.service';
import { customerService } from './orderMaster.service';
import AppError from '@/abstractions/AppError';
import { db } from '@/database';
import env from '@/env';

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
		const result = await db.transaction(async (tx) => {
			return await customerService.createCustomerProduct(req.body, tx);
		});

		res.locals = result;
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

		const result = await db.transaction(async (tx) => {
			return await customerService.addLoyaltyPoints(
				customerID,
				userId,
				tx, // 👈 transaction passed in
			);
		});

		res.locals = result;
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
		const { paymentMethodId, order } = req.body;

		if (!paymentMethodId) {
			throw new AppError("paymentMethodId missing", StatusCodes.BAD_REQUEST);
		}

		if (!order?.orderId || !order?.customerID || !order?.amount || !order?.currency) {
			throw new AppError("Missing order fields", StatusCodes.BAD_REQUEST);
		}

		const result = await customerService.createPaymentTransaction(req.body);

		res.locals = result;
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
