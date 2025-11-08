import axios from 'axios';
import env from '@/env';
import logger from '@/lib/logger';

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

	/**
	 * Send interactive menu message with buttons
	 */
	public async sendInteractiveMenu(to: string): Promise<void> {
		try {
			const headerImageUrl =
				'https://mtbsapoc.blob.core.windows.net/whatsapppoccontainer/lush-products-main.jpg';
			const bodyText =
				'Welcome to *Lush Rewards* 🌿\n— your gateway to conscious indulgence. ✨\n\nEarn, redeem, and explore eco-luxury products — made with love and purpose. 💚\n\n💎 Choose an option below to begin your lush experience! 🌸';
			const footerText = '🌼 Powered by Lush Loyalty Program';

			const payload = {
				messaging_product: 'whatsapp',
				to,
				type: 'interactive',
				interactive: {
					type: 'button',
					header: {
						type: 'image',
						image: {
							link: headerImageUrl,
						},
					},
					body: {
						text: bodyText,
					},
					footer: {
						text: footerText,
					},
					action: {
						buttons: [
							{
								type: 'reply',
								reply: {
									id: 'VIEW_CATALOG',
									title: '🛍️ View Catalog',
								},
							},
							{
								type: 'reply',
								reply: {
									id: 'VIEW_BALANCE',
									title: '💰 View Balance',
								},
							},
							{
								type: 'reply',
								reply: {
									id: 'ADD_POINTS',
									title: '➕ Add Points',
								},
							},
						],
					},
				},
			};

			const response = await axios.post(this.apiUrl, payload, {
				headers: {
					Authorization: `Bearer ${this.accessToken}`,
					'Content-Type': 'application/json',
				},
			});

			logger.info('Interactive menu message sent successfully', {
				to,
				messageId: response.data?.messages?.[0]?.id,
			});
		} catch (error) {
			logger.error('Failed to send interactive menu message', {
				error: error instanceof Error ? error.message : error,
				errorResponse: (error as any)?.response?.data,
				to,
			});
			throw error;
		}
	}

	/**
	 * Send CTA URL message for adding points
	 */
	public async sendAddPointsCTA(to: string): Promise<void> {
		try {
			const headerText = 'Add Your Loyalty Points';
			const bodyText =
				'Hey 🌸, when you click the button below, a secure scanner will open.\n\n📸 Simply scan your product QR code to instantly claim your *Lush Reward Points!* 💎\n\nYour eco-luxury treats are just one scan away. 🌿';
			const footerText = '🌼 Powered by Lush Loyalty Program';
			const displayText = '➕ Add Points';
			const ctaUrl = `${env.APP_URI}/add-points`;

			const payload = {
				messaging_product: 'whatsapp',
				to,
				type: 'interactive',
				interactive: {
					type: 'cta_url',
					header: {
						type: 'text',
						text: headerText,
					},
					body: {
						text: bodyText,
					},
					footer: {
						text: footerText,
					},
					action: {
						name: 'cta_url',
						parameters: {
							display_text: displayText,
							url: ctaUrl,
						},
					},
				},
			};

			const response = await axios.post(this.apiUrl, payload, {
				headers: {
					Authorization: `Bearer ${this.accessToken}`,
					'Content-Type': 'application/json',
				},
			});

			logger.info('Add Points CTA message sent successfully', {
				to,
				ctaUrl,
				messageId: response.data?.messages?.[0]?.id,
			});
		} catch (error) {
			logger.error('Failed to send Add Points CTA message', {
				error: error instanceof Error ? error.message : error,
				errorResponse: (error as any)?.response?.data,
				to,
			});
			throw error;
		}
	}

	/**
	 * Send catalog template message
	 */
	public async sendCatalogMessage(
		to: string,
		customerName: string,
	): Promise<void> {
		try {
			const templateName = 'lush_catalouge';

			const payload = {
				messaging_product: 'whatsapp',
				to,
				type: 'template',
				template: {
					name: templateName,
					language: { code: 'en' },
					components: [
						{
							type: 'body',
							parameters: [
								{
									type: 'text',
									text: customerName,
								},
							],
						},
						{
							type: 'button',
							sub_type: 'catalog',
							index: '0',
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

			logger.info('Catalog message sent successfully', {
				to,
				customerName,
				templateName,
				messageId: response.data?.messages?.[0]?.id,
			});
		} catch (error) {
			logger.error('Failed to send catalog message', {
				error: error instanceof Error ? error.message : error,
				errorResponse: (error as any)?.response?.data,
				to,
				customerName,
			});
			throw error;
		}
	}

	/**
	 * Send order confirmation CTA message
	 */
	public async sendOrderConfirmation(
		to: string,
		customerName: string,
		itemsCount: number,
		totalAmount: string,
		orderId: string,
	): Promise<void> {
		try {
			const headerText = '💳 Complete Your Payment';
			const bodyText = `Hey ${customerName} 🌸\nYou're almost there! ✨\n\nYour selected items are waiting to be processed — please complete your payment to confirm your order. 💖\n\n🛍️ *Order Summary:*\n📦 Items: *${itemsCount}*\n💰 Total: *${totalAmount}*\n\nOnce the payment is confirmed, we'll begin preparing your order for dispatch right away! 🚚`;
			const footerText = '🌼 Powered by Lush Loyalty Program';
			const displayText = 'Pay Now';
			const ctaUrl = `${env.APP_URI}/order/${orderId}/payment`;

			const payload = {
				messaging_product: 'whatsapp',
				to,
				type: 'interactive',
				interactive: {
					type: 'cta_url',
					header: {
						type: 'text',
						text: headerText,
					},
					body: {
						text: bodyText,
					},
					footer: {
						text: footerText,
					},
					action: {
						name: 'cta_url',
						parameters: {
							display_text: displayText,
							url: ctaUrl,
						},
					},
				},
			};

			const response = await axios.post(this.apiUrl, payload, {
				headers: {
					Authorization: `Bearer ${this.accessToken}`,
					'Content-Type': 'application/json',
				},
			});

			logger.info('Order confirmation message sent successfully', {
				to,
				customerName,
				itemsCount,
				totalAmount,
				ctaUrl,
				messageId: response.data?.messages?.[0]?.id,
			});
		} catch (error) {
			logger.error('Failed to send order confirmation message', {
				error: error instanceof Error ? error.message : error,
				errorResponse: (error as any)?.response?.data,
				to,
				customerName,
			});
			throw error;
		}
	}
}
