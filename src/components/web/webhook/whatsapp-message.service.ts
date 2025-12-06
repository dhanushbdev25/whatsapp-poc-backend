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
	 * Send welcome message with brand selection buttons
	 * Note: WhatsApp supports max 3 buttons, so we use a list for 5 options
	 */
	public async sendWelcomeMessage(to: string): Promise<void> {
		try {
			const bodyText =
				'🎉 *Welcome to Tolaram Ecommerce!* 🎉\n\nYour *unified platform* to discover and shop all your favorite Tolaram products! ✨\n\nFrom *bold flavors* that spice up your meals 🌶️ to *vibrant beauty* essentials 💄, *nourishing wellness* products 🌿 and *everyday essentials* that make life easier 🏠 — we\'ve got it all!\n\n🌟 *Choose your brand below* and let\'s start your shopping journey! 🛍️';
			const footerText = '🌼 Tolaram Ecommerce • Your One-Stop Shop';

			const payload = {
				messaging_product: 'whatsapp',
				to,
				type: 'interactive',
				interactive: {
					type: 'list',
					body: {
						text: bodyText,
					},
					footer: {
						text: footerText,
					},
					action: {
						button: '🛍️ Explore Brands',
						sections: [
							{
								title: '✨ Our Brands',
								rows: [
									{
										id: 'CELEBR8LYFE',
										title: '🎉 Celebr8lyfe',
										description: 'Celebrate life with style',
									},
									{
										id: 'LUSH',
										title: '🌿 Lush',
										description: 'Eco-luxury beauty & wellness',
									},
									{
										id: 'INDOMIE',
										title: '🍜 Indomie',
										description: 'Delicious instant noodles',
									},
									{
										id: 'MINIME',
										title: '👶 Minime',
										description: 'Care essentials for little ones',
									},
									{
										id: 'POWEROIL',
										title: '🛢️ Poweroil',
										description: 'Quality cooking oils',
									},
								],
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

			logger.info('Welcome message sent successfully', {
				to,
				messageId: response.data?.messages?.[0]?.id,
			});
		} catch (error) {
			logger.error('Failed to send welcome message', {
				error: error instanceof Error ? error.message : error,
				errorResponse: (error as any)?.response?.data,
				to,
			});
			throw error;
		}
	}

	/**
	 * Send brand-specific message with URL button
	 */
	public async sendBrandMessage(
		to: string,
		brandName: string,
	): Promise<void> {
		try {
			// Create brand-specific header and body text
			const brandMessages: Record<string, { header: string; body: string }> =
				{
					Celebr8lyfe: {
						header: '🎉 Welcome to Celebr8lyfe!',
						body: `Hey there! 🌟\n\nWelcome to *Celebr8lyfe* — where every moment is worth celebrating! ✨\n\nDiscover our curated collection of products designed to add joy, style, and excitement to your everyday life. 🎊\n\nFrom trendy essentials to must-have items, we've got everything you need to *celebrate life* in style! 💫\n\nTap below to explore our collection and find your next favorite product! 🛍️`,
					},
					Lush: {
						header: '🌿 Welcome to Lush!',
						body: `Hey there! 🌸\n\nWelcome to *Lush* — your gateway to conscious indulgence and eco-luxury! ✨\n\nExplore our handpicked selection of beauty, wellness, and lifestyle products made with love and purpose. 💚\n\nFrom nourishing skincare to vibrant beauty essentials, discover products that care for you and the planet! 🌍\n\nTap below to browse our collection and start your lush journey! 🛍️`,
					},
					Indomie: {
						header: '🍜 Welcome to Indomie!',
						body: `Hey there! 👋\n\nWelcome to *Indomie* — where delicious flavors meet convenience! ✨\n\nStep into a world of mouth-watering instant noodles and food products that bring joy to every meal. 🍲\n\nFrom classic favorites to exciting new flavors, discover why millions love *Indomie* around the world! 🌍\n\nTap below to explore our full range and find your perfect flavor! 🛍️`,
					},
					Minime: {
						header: '👶 Welcome to Minime!',
						body: `Hey there! 💕\n\nWelcome to *Minime* — caring for your little ones with love and quality! ✨\n\nDiscover our gentle, safe, and trusted products designed especially for babies and children. 🧸\n\nFrom essential care products to everyday needs, we ensure the best for your family's most precious members! 👨‍👩‍👧‍👦\n\nTap below to explore our collection and find everything your little one needs! 🛍️`,
					},
					Poweroil: {
						header: '🛢️ Welcome to Poweroil!',
						body: `Hey there! 👋\n\nWelcome to *Poweroil* — quality cooking oils for your kitchen! ✨\n\nDiscover our premium selection of cooking oils that bring out the best in your meals. 🍳\n\nFrom everyday cooking to special recipes, we've got the perfect oil for every dish! 🥘\n\nTap below to explore our range and elevate your cooking experience! 🛍️`,
					},
				};

			const brandInfo =
				brandMessages[brandName] ||
				brandMessages[
					brandName.charAt(0).toUpperCase() + brandName.slice(1).toLowerCase()
				] || {
					header: `🌟 Welcome to ${brandName}!`,
					body: `Hey there! 👋\n\nWelcome to *${brandName}* — your trusted brand for quality products! ✨\n\nExplore our curated collection designed to enhance your everyday life. 💫\n\nTap below to discover our products and find something special just for you! 🛍️`,
				};

			const headerText = brandInfo.header;
			const bodyText = brandInfo.body;
			const displayText = '🛍️ Shop Now';
			const footerText = '🌼 Tolaram Ecommerce • Quality You Can Trust';
			const ctaUrl =
				'https://ecom-web-static-web.onrender.com/products?page=1';

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

			logger.info('Brand message sent successfully', {
				to,
				brandName,
				ctaUrl,
				messageId: response.data?.messages?.[0]?.id,
			});
		} catch (error) {
			logger.error('Failed to send brand message', {
				error: error instanceof Error ? error.message : error,
				errorResponse: (error as any)?.response?.data,
				to,
				brandName,
			});
			throw error;
		}
	}

	/**
	 * Send CTA URL message for adding points
	 */
	public async sendAddPointsCTA(to: string, userId: number): Promise<void> {
		try {
			const headerText = 'Add Your Loyalty Points';
			const bodyText =
				'Hey 🌸, when you click the button below, a secure scanner will open.\n\n📸 Simply scan your product QR code to instantly claim your *Lush Reward Points!* 💎\n\nYour eco-luxury treats are just one scan away. 🌿';
			const footerText = '🌼 Powered by Lush Loyalty Program';
			const displayText = 'Scan QR Code';
			const ctaUrl = `${env.APP_URI}/redeem/camera/${userId}`;

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
				userId,
				messageId: response.data?.messages?.[0]?.id,
			});
		} catch (error) {
			logger.error('Failed to send Add Points CTA message', {
				error: error instanceof Error ? error.message : error,
				errorResponse: (error as any)?.response?.data,
				to,
				userId,
			});
			throw error;
		}
	}

	/**
	 * Send CTA URL message for trying wigs
	 */
	public async sendTryWigsCTA(to: string, userId: number): Promise<void> {
		try {
			const headerText = '💇‍♀️ Try Wigs Instantly';
			const bodyText =
				'Ready to see the glow? Open our live try-on, switch styles in seconds, and buy the one you love.\n\nPro tip: Save your favorite look before checkout. 💖';
			const footerText = '🌼 Lush • Wig Studio';
			const displayText = 'Try Wigs Now';
			const ctaUrl = `${env.APP_URI}/try/${userId}`;

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

			logger.info('Try Wigs CTA message sent successfully', {
				to,
				ctaUrl,
				userId,
				messageId: response.data?.messages?.[0]?.id,
			});
		} catch (error) {
			logger.error('Failed to send Try Wigs CTA message', {
				error: error instanceof Error ? error.message : error,
				errorResponse: (error as any)?.response?.data,
				to,
				userId,
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
			const ctaUrl = `${env.APP_URI}/order/${orderId}`;

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

	/**
	 * Send balance message showing loyalty points
	 */
	public async sendBalanceMessage(
		to: string,
		pointsBalance: number,
		customerName: string,
	): Promise<void> {
		try {
			const bodyText = `💰 *Your Lush Loyalty Balance*\n\nHey ${customerName}, you currently have *${pointsBalance} reward points!* ✨\n\nThat's enough to unlock some exclusive eco-luxury treats. 💎`;
			const footerText = '🌼 Powered by Lush Loyalty Program';

			const payload = {
				messaging_product: 'whatsapp',
				to,
				type: 'interactive',
				interactive: {
					type: 'button',
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
									title: '🛍️ Shop Now',
								},
							},
							{
								type: 'reply',
								reply: {
									id: 'BACK',
									title: '🔙 Back',
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

			logger.info('Balance message sent successfully', {
				to,
				pointsBalance,
				messageId: response.data?.messages?.[0]?.id,
			});
		} catch (error) {
			logger.error('Failed to send balance message', {
				error: error instanceof Error ? error.message : error,
				errorResponse: (error as any)?.response?.data,
				to,
				pointsBalance,
			});
			throw error;
		}
	}

	/**
	 * Send points earned notification message
	 */
	public async sendPointsEarnedMessage(
		to: string,
		pointsAdded: number,
		newBalance: number,
		customerName: string,
	): Promise<void> {
		try {
			const bodyText = `🎉 *Points Earned!*\n\nHey ${customerName} 🌸\n\n✨ You've just earned *${pointsAdded} reward points!*\n\n💰 Your new balance is *${newBalance} points*.\n\nKeep earning to unlock more exclusive eco-luxury treats! 💎`;
			const footerText = '🌼 Powered by Lush Loyalty Program';

			const payload = {
				messaging_product: 'whatsapp',
				to,
				type: 'interactive',
				interactive: {
					type: 'button',
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
									id: 'BACK',
									title: '🔙 Back',
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

			logger.info('Points earned message sent successfully', {
				to,
				pointsAdded,
				newBalance,
				customerName,
				messageId: response.data?.messages?.[0]?.id,
			});
		} catch (error) {
			logger.error('Failed to send points earned message', {
				error: error instanceof Error ? error.message : error,
				errorResponse: (error as any)?.response?.data,
				to,
				pointsAdded,
				newBalance,
			});
			throw error;
		}
	}

	/**
	 * Send product message from WhatsApp catalog
	 */
	public async sendProductMessage(
		to: string,
		productRetailerId: string,
	): Promise<void> {
		try {
			const defaultBodyText =
				"Wow ✨\nThat look was absolutely stunning on you! 💃\n\nWe've saved your favorite wig so you can make it yours today — before it sells out. 👑\n\nTap below to view your selected piece and complete your order in just a few seconds. 💖";
			const defaultFooterText = 'Your glam moment awaits! 💫';

			// Get catalog ID from env if not provided
			const finalCatalogId = '2085125095564033';

			if (!finalCatalogId) {
				throw new Error(
					'Catalog ID is required. Please provide catalogId parameter or set WHATSAPP_CATALOG_ID in environment variables.',
				);
			}

			const payload = {
				messaging_product: 'whatsapp',
				to,
				type: 'interactive',
				interactive: {
					type: 'product',
					body: {
						text: defaultBodyText,
					},
					footer: {
						text: defaultFooterText,
					},
					action: {
						catalog_id: finalCatalogId,
						product_retailer_id: productRetailerId,
					},
				},
			};

			const response = await axios.post(this.apiUrl, payload, {
				headers: {
					Authorization: `Bearer ${this.accessToken}`,
					'Content-Type': 'application/json',
				},
			});

			logger.info('Product message sent successfully', {
				to,
				productRetailerId,
				catalogId: finalCatalogId,
				messageId: response.data?.messages?.[0]?.id,
			});
		} catch (error) {
			logger.error('Failed to send product message', {
				error: error instanceof Error ? error.message : error,
				errorResponse: (error as any)?.response?.data,
				to,
				productRetailerId,
			});
			throw error;
		}
	}

	/**
	 * Send payment confirmation interactive message
	 */
	public async sendPaymentConfirmation(
		to: string,
		customerName: string,
		orderNo: string,
		orderAmount: string,
		currency: string,
		deliveryDays: number = 3,
	): Promise<void> {
		try {
			const bodyText = `🎉 *Payment Successful!*\n\nHi *${customerName}*,\n\nYour payment has been confirmed successfully! ✅\n\n*Order Details:*\n📦 Order Number: ${orderNo}\n💰 Amount: ${orderAmount} ${currency}\n\n🚚 Your order will be delivered in *${deliveryDays} days*.\n\nThank you for your purchase! We appreciate your business. 💚`;

			const footerText = '🌼 Powered by Lush Rewards';

			const payload = {
				messaging_product: 'whatsapp',
				to,
				type: 'interactive',
				interactive: {
					type: 'button',
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
									id: 'BACK',
									title: '🔙 Back',
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

			logger.info('Payment confirmation message sent successfully', {
				to,
				orderNo,
				messageId: response.data?.messages?.[0]?.id,
			});
		} catch (error) {
			logger.error('Failed to send payment confirmation message', {
				error: error instanceof Error ? error.message : error,
				errorResponse: (error as any)?.response?.data,
				to,
				orderNo,
			});
			throw error;
		}
	}
}
