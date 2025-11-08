import { Router, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { WebhookVerificationQueryParser } from './webhook-web-parser';
import { WebhookWebService } from './webhook-web.service';
import BaseApi from '@/components/BaseApi';
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
}
