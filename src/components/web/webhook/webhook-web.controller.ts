import { eq } from 'drizzle-orm';
import { Router, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { WebhookVerificationQueryParser } from './webhook-web-parser';
import { WebhookWebService } from './webhook-web.service';
import AppError from '@/abstractions/AppError';
import BaseApi from '@/components/BaseApi';
import { db } from '@/database';
import { users } from '@/database/schema';
import logger from '@/lib/logger';

export default class WebhookWebController extends BaseApi {
	private webhookService: WebhookWebService;

	constructor() {
		super();
		this.webhookService = new WebhookWebService();
	}

	public register(): Router {
		this.router.get('/', this.verifyWebhook.bind(this));
		this.router.post('/', this.handleWebhookEvents.bind(this));
		this.router.get('/fetchTemplates', this.fetchAllTemplates.bind(this));
		this.router.post('/earn-loyalty', this.earnLoyaltyPoints.bind(this));
		return this.router;
	}

	public async verifyWebhook(req: Request, res: Response): Promise<void> {
		const result = WebhookVerificationQueryParser.safeParse(req.query);
		if (!result.success) {
			throw result.error;
		}

		const {
			'hub.mode': mode,
			'hub.verify_token': token,
			'hub.challenge': challenge,
		} = result.data;

		const challengeResponse = this.webhookService.verifyWebhook(
			mode,
			token,
			challenge,
		);

		res.status(StatusCodes.OK).send(challengeResponse);
	}

	public async handleWebhookEvents(
		req: Request,
		res: Response,
	): Promise<void> {
		res.locals.data = { received: true };
		res.locals.message = 'Webhook event received';
		super.send(res, StatusCodes.OK);

		this.webhookService.processWebhookPayload(req.body).catch((error) => {
			logger.error('Error processing webhook events', { error });
		});
	}

	public async fetchAllTemplates(req: Request, res: Response) {
		const { data, message } = await this.webhookService.fetchAllTemplates();
		res.locals = { data, message };
		super.send(res);
	}

	public async earnLoyaltyPoints(req: Request, res: Response) {
		const { productID, customerID } = req.body;
		const { userId } = req.query;

		// Validate required fields
		if (!productID || !customerID) {
			throw new AppError(
				'Missing required fields: productID or customerID',
				StatusCodes.BAD_REQUEST,
			);
		}

		let resolvedUserId: string;
		if (userId) {
			resolvedUserId = String(userId);
		} else {
			const whatsappUser = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.name, 'whatsapp'))
				.limit(1);

			if (!whatsappUser.length) {
				throw new AppError(
					"Default 'whatsapp' customer not found in database",
					StatusCodes.INTERNAL_SERVER_ERROR,
				);
			}

			resolvedUserId = whatsappUser[0].id;
		}

		const { data, message } = await this.webhookService.earnLoyaltyPoints(
			String(customerID),
			String(productID),
			resolvedUserId,
		);

		res.locals = { data, message };
		super.send(res);
	}
}
