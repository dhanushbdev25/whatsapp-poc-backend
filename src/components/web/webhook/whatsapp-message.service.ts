import axios from 'axios';
import env from '@/env';
import logger from '@/lib/logger';
import { handleServiceError } from '@/utils/serviceErrorHandler';

export class WhatsAppMessageService {
	private readonly apiUrl: string;
	private readonly phoneNumberId: string;
	private readonly accessToken: string;
	private readonly apiVersion: string;

	constructor() {
		this.phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
		this.accessToken = env.WHATSAPP_ACCESS_TOKEN;
		this.apiVersion = env.WHATSAPP_API_VERSION || 'v21.0';
		this.apiUrl = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
	}

	/**
	 * Send enrollment confirmation message to customer
	 * @param to - Recipient phone number
	 * @param customerName - Customer name to use in template
	 * @param templateName - Optional template name (defaults to env or 'lush_loyalty_main_menu_premium')
	 * @param headerImageUrl - Optional header image URL (defaults to env or default image)
	 */
	public async sendEnrollmentConfirmation(
		to: string,
		customerName: string,
		templateName?: string,
		headerImageUrl?: string,
	): Promise<void> {
		try {
			const finalTemplateName = templateName;
			const finalHeaderImageUrl = headerImageUrl;

			const payload = {
				messaging_product: 'whatsapp',
				to,
				type: 'template',
				template: {
					name: finalTemplateName,
					language: { code: 'en' },
					components: [
						{
							type: 'header',
							parameters: [
								{
									type: 'image',
									image: {
										link: finalHeaderImageUrl,
									},
								},
							],
						},
						{
							type: 'body',
							parameters: [
								{
									type: 'text',
									text: customerName,
								},
							],
						},
					],
				},
			};

			const response = await axios.post(this.apiUrl, payload, {
				headers: {
					Authorization: `Bearer ${this.accessToken}`,
					'Content-Type': 'application/json',
				},
			});

			logger.info('Enrollment confirmation message sent successfully', {
				to,
				customerName,
				templateName: finalTemplateName,
				messageId: response.data?.messages?.[0]?.id,
			});
		} catch (error) {
			// Log error but don't throw - message sending failure shouldn't break customer creation
			logger.error('Failed to send enrollment confirmation message', {
				error: error instanceof Error ? error.message : error,
				errorResponse: (error as any)?.response?.data,
				to,
				customerName,
			});
			// Re-throw only if caller needs to handle it
			throw error;
		}
	}
}
