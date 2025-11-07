import { StatusCodes } from 'http-status-codes';
import AppError from '@/abstractions/AppError';
import env from '@/env';
import logger from '@/lib/logger';

export class WebhookWebService {
	/**
	 * Verify webhook subscription request from WhatsApp
	 */
	public verifyWebhook(
		mode: string,
		token: string,
		challenge: string,
	): string {
		if (mode !== 'subscribe') {
			throw new AppError(
				'Invalid verification mode',
				StatusCodes.FORBIDDEN,
			);
		}

		if (token !== env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
			logger.warn('Webhook verification failed: Token mismatch', {
				receivedToken: token.substring(0, 5) + '...',
			});
			throw new AppError(
				'Invalid verification token',
				StatusCodes.FORBIDDEN,
			);
		}

		logger.info('Webhook verification successful');
		return challenge;
	}

	/**
	 * Process webhook payload and extract events
	 */
	public async processWebhookPayload(payload: any): Promise<void> {
		logger.info('Webhook event received', {
			object: payload?.object,
			entryCount: payload?.entry?.length || 0,
		});

		if (!payload?.entry || !Array.isArray(payload.entry)) {
			return;
		}

		for (const entry of payload.entry) {
			if (!entry?.changes || !Array.isArray(entry.changes)) {
				continue;
			}

			for (const change of entry.changes) {
				const value = change?.value;

				if (value?.messages && Array.isArray(value.messages) && value.messages.length > 0) {
					await this.processMessages(value.messages, value.metadata);
				}

				if (value?.statuses && Array.isArray(value.statuses) && value.statuses.length > 0) {
					await this.processStatuses(value.statuses);
				}

				if (!value?.messages && !value?.statuses) {
					logger.info('Webhook event received (not messages/statuses)', {
						field: change?.field,
						value: JSON.stringify(value).substring(0, 200),
					});
				}
			}
		}
	}

	/**
	 * Process incoming messages from users
	 */
	private async processMessages(messages: any[], metadata?: any): Promise<void> {
		for (const message of messages) {
			if (!message) continue;

			logger.info('Message received from user', {
				from: message?.from,
				messageId: message?.id,
				type: message?.type,
				timestamp: message?.timestamp,
				phoneNumberId: metadata?.phone_number_id,
			});

			const messageContent = this.extractMessageContent(message);

			logger.info('Message content extracted', {
				from: message?.from,
				messageId: message?.id,
				content: messageContent,
				type: message?.type,
			});
		}
	}

	/**
	 * Extract message content based on message type
	 */
	private extractMessageContent(message: any): string | undefined {
		const messageType = message?.type;

		switch (messageType) {
			case 'text':
				return message?.text?.body;
			case 'interactive':
				if (message?.interactive?.type === 'button_reply') {
					return message?.interactive?.button_reply?.title;
				}
				if (message?.interactive?.type === 'list_reply') {
					return message?.interactive?.list_reply?.title;
				}
				return undefined;
			case 'image':
				return message?.image?.caption || '[Image]';
			case 'video':
				return message?.video?.caption || '[Video]';
			case 'audio':
				return '[Audio]';
			case 'document':
				return message?.document?.caption || message?.document?.filename || '[Document]';
			case 'location':
				return `[Location: ${message?.location?.latitude}, ${message?.location?.longitude}]`;
			default:
				return `[${messageType || 'unknown'}]`;
		}
	}

	/**
	 * Process message status updates
	 */
	private async processStatuses(statuses: any[]): Promise<void> {
		for (const status of statuses) {
			if (!status) continue;

			logger.info('Message status update', {
				messageId: status?.id,
				status: status?.status,
				recipientId: status?.recipient_id,
				timestamp: status?.timestamp,
			});

			if (status?.status === 'failed' && status?.errors) {
				logger.error('Message delivery failed', {
					messageId: status?.id,
					recipientId: status?.recipient_id,
					errors: status?.errors,
				});
			}
		}
	}
}

