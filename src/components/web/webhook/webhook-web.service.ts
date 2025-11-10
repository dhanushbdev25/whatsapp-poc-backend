import axios from 'axios';
import { eq, inArray } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { CustomerWebService } from './customer-web.service';
import { parseWaIdToCustomerID } from './webhook-utils';
import AppError from '@/abstractions/AppError';
import { db } from '@/database';
import {
	customerMaster,
	loyaltyAccounts,
	loyaltyTransactions,
	orderItems,
	orders,
	products,
} from '@/database/schema';
import env from '@/env';
import logger from '@/lib/logger';
import { handleServiceError } from '@/utils/serviceErrorHandler';
import { formatTemplateResponse } from '@/utils/templateFormatter';

export class WebhookWebService {
	private customerService: CustomerWebService;

	constructor() {
		this.customerService = new CustomerWebService();
	}

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

				if (
					value?.messages &&
					Array.isArray(value.messages) &&
					value.messages.length > 0
				) {
					// Extract wa_id from contacts if available
					const waId =
						value?.contacts?.[0]?.wa_id || value?.messages[0]?.from;
					await this.processMessages(
						value.messages,
						value.metadata,
						waId,
					);
				}

				if (
					value?.statuses &&
					Array.isArray(value.statuses) &&
					value.statuses.length > 0
				) {
					await this.processStatuses(value.statuses);
				}

				if (!value?.messages && !value?.statuses) {
					logger.info(
						'Webhook event received (not messages/statuses)',
						{
							field: change?.field,
							value: JSON.stringify(value).substring(0, 200),
						},
					);
				}
			}
		}
	}

	/**
	 * Process incoming messages from users
	 */
	private async processMessages(
		messages: any[],
		metadata?: any,
		waId?: string,
	): Promise<void> {
		for (const message of messages) {
			if (!message) continue;

			const phoneNumber = message?.from;
			const messageType = message?.type;
			// Use wa_id from parameter or fallback to phone number
			const customerWaId = waId || phoneNumber;

			logger.info('Message received from user', {
				from: phoneNumber,
				waId: customerWaId,
				messageId: message?.id,
				type: messageType,
				timestamp: message?.timestamp,
				phoneNumberId: metadata?.phone_number_id,
			});

			// Log interactive message structure for debugging
			if (messageType === 'interactive') {
				logger.info('Interactive message structure', {
					phoneNumber,
					interactiveType: message?.interactive?.type,
					interactiveKeys: Object.keys(message?.interactive || {}),
					hasFlowResponseJson:
						!!message?.interactive?.flow_response_json,
					hasFlowResponseData:
						!!message?.interactive?.flow_response_data,
					hasButtonReply: !!message?.interactive?.button_reply,
					hasNfmReply: !!message?.interactive?.nfm_reply,
					fullInteractive: JSON.stringify(
						message?.interactive,
					).substring(0, 1000),
				});
			}

			// Handle WhatsApp Flow responses
			// Check for flow type explicitly OR check for flow data fields (more flexible)
			let isFlowMessage = false;
			if (messageType === 'interactive') {
				const interactive = message?.interactive;

				// Check explicit flow type
				if (interactive?.type === 'flow') {
					isFlowMessage = true;
				}
				// Check for nfm_reply (Native Flow Message reply) - new WhatsApp format
				else if (
					interactive?.type === 'nfm_reply' ||
					interactive?.nfm_reply
				) {
					isFlowMessage = true;
				}
				// Check for flow response data fields
				else if (
					interactive?.flow_response_json ||
					interactive?.flow_response_data
				) {
					isFlowMessage = true;
				}
				// Check button_reply payload for flow_token
				else if (interactive?.button_reply?.payload) {
					try {
						const payload =
							typeof interactive.button_reply.payload === 'string'
								? JSON.parse(interactive.button_reply.payload)
								: interactive.button_reply.payload;

						if (
							payload?.flow_token ||
							payload?.screen === 'COMPLETE' ||
							payload?.data
						) {
							isFlowMessage = true;
						}
					} catch (e) {
						// If payload is not JSON, check if it's a flow-related string
						logger.info(
							"Button reply payload is not JSON, checking if it's a flow-related string",
							{
								payload: interactive.button_reply.payload,
								error: e,
							},
						);
						if (
							typeof interactive.button_reply.payload ===
								'string' &&
							interactive.button_reply.payload.includes('flow')
						) {
							isFlowMessage = true;
						}
					}
				}
			}

			if (isFlowMessage) {
				logger.info('Flow message detected, processing...', {
					phoneNumber,
					interactiveType: message?.interactive?.type,
				});
				await this.handleFlowResponse(
					message,
					phoneNumber,
					customerWaId,
				);
			}

			// Handle MENU or BACK commands
			if (messageType === 'text') {
				const textContent = message?.text?.body?.toUpperCase()?.trim();
				if (textContent === 'MENU' || textContent === 'BACK') {
					await this.handleMenuRequest(phoneNumber);
				} else if (
					textContent === 'ADD_POINTS' ||
					textContent === 'ADD POINTS'
				) {
					await this.handleAddPointsRequest(
						phoneNumber,
						customerWaId,
					);
				} else if (
					textContent === 'VIEW_CATALOG' ||
					textContent === 'CATALOG' ||
					textContent === 'VIEW CATALOG'
				) {
					await this.handleCatalogRequest(phoneNumber, customerWaId);
				} else if (
					textContent === 'VIEW_BALANCE' ||
					textContent === 'BALANCE' ||
					textContent === 'VIEW BALANCE'
				) {
					await this.handleBalanceRequest(phoneNumber, customerWaId);
				} else if (
					textContent === 'TRY' ||
					textContent === 'TRY WIG' ||
					textContent === 'WIG'
				) {
					await this.handleTryWigsRequest(phoneNumber, customerWaId);
				}
			}

			// Handle button replies
			if (
				messageType === 'interactive' &&
				message?.interactive?.type === 'button_reply'
			) {
				const buttonId =
					message?.interactive?.button_reply?.id?.toUpperCase();
				if (buttonId === 'MENU' || buttonId === 'BACK') {
					await this.handleMenuRequest(phoneNumber);
				} else if (buttonId === 'ADD_POINTS') {
					await this.handleAddPointsRequest(
						phoneNumber,
						customerWaId,
					);
				} else if (buttonId === 'VIEW_CATALOG') {
					await this.handleCatalogRequest(phoneNumber, customerWaId);
				} else if (buttonId === 'VIEW_BALANCE') {
					await this.handleBalanceRequest(phoneNumber, customerWaId);
				} else if (buttonId === 'TRY_WIG') {
					await this.handleTryWigsRequest(phoneNumber, customerWaId);
				}
			}

			// Handle order events from catalog
			if (messageType === 'order') {
				await this.handleOrderEvent(message, phoneNumber, customerWaId);
			}

			const messageContent = this.extractMessageContent(message);

			logger.info('Message content extracted', {
				from: phoneNumber,
				messageId: message?.id,
				content: messageContent,
				type: messageType,
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
				if (message?.interactive?.type === 'flow') {
					return '[Flow Response]';
				}
				return undefined;
			case 'image':
				return message?.image?.caption || '[Image]';
			case 'video':
				return message?.video?.caption || '[Video]';
			case 'audio':
				return '[Audio]';
			case 'document':
				return (
					message?.document?.caption ||
					message?.document?.filename ||
					'[Document]'
				);
			case 'location':
				return `[Location: ${message?.location?.latitude}, ${message?.location?.longitude}]`;
			default:
				return `[${messageType || 'unknown'}]`;
		}
	}

	/**
	 * Handle WhatsApp Flow response
	 */
	private async handleFlowResponse(
		message: any,
		phoneNumber: string,
		waId: string,
	): Promise<void> {
		try {
			const interactive = message?.interactive;

			// Log the full interactive structure for debugging
			logger.info('Flow interactive message received', {
				phoneNumber,
				interactiveType: interactive?.type,
				interactive: JSON.stringify(interactive).substring(0, 1000),
			});

			// Extract flow data from various possible locations
			let flowData: any;

			// Try nfm_reply first (Native Flow Message - new WhatsApp format)
			if (interactive?.nfm_reply?.response_json) {
				try {
					const responseJson =
						typeof interactive.nfm_reply.response_json === 'string'
							? JSON.parse(interactive.nfm_reply.response_json)
							: interactive.nfm_reply.response_json;

					// nfm_reply format has the data directly in response_json
					// Extract the actual flow data from the response
					flowData = {
						data: responseJson,
						screen: 'COMPLETE', // nfm_reply is sent when flow is completed
					};

					logger.info(
						'Flow data extracted from nfm_reply.response_json',
						{
							phoneNumber,
							hasData: !!flowData?.data,
							responseKeys: Object.keys(responseJson || {}),
						},
					);
				} catch (parseError) {
					logger.error('Failed to parse nfm_reply.response_json', {
						error: parseError,
						response_json: interactive.nfm_reply.response_json,
					});
					return;
				}
			}
			// Try flow_response_json (legacy/common location)
			else if (interactive?.flow_response_json) {
				try {
					flowData =
						typeof interactive.flow_response_json === 'string'
							? JSON.parse(interactive.flow_response_json)
							: interactive.flow_response_json;
					logger.info('Flow data extracted from flow_response_json', {
						phoneNumber,
						screen: flowData?.screen,
					});
				} catch (parseError) {
					logger.error('Failed to parse flow_response_json', {
						error: parseError,
						flow_response_json: interactive.flow_response_json,
					});
					return;
				}
			}
			// Try flow_response_data (alternative location)
			else if (interactive?.flow_response_data) {
				try {
					flowData =
						typeof interactive.flow_response_data === 'string'
							? JSON.parse(interactive.flow_response_data)
							: interactive.flow_response_data;
					logger.info('Flow data extracted from flow_response_data', {
						phoneNumber,
						screen: flowData?.screen,
					});
				} catch (parseError) {
					logger.error('Failed to parse flow_response_data', {
						error: parseError,
						flow_response_data: interactive.flow_response_data,
					});
					return;
				}
			}
			// Try button_reply payload (sometimes used)
			else if (interactive?.button_reply?.payload) {
				try {
					const payload =
						typeof interactive.button_reply.payload === 'string'
							? JSON.parse(interactive.button_reply.payload)
							: interactive.button_reply.payload;

					// If it's just a flow_token, wait for completion
					if (
						payload?.flow_token &&
						!payload?.data &&
						!payload?.screen
					) {
						logger.info(
							'Flow token received, waiting for flow completion',
							{
								phoneNumber,
								flowToken: payload.flow_token,
							},
						);
						return;
					}
					// Otherwise treat as flow data
					flowData = payload;
					logger.info(
						'Flow data extracted from button_reply payload',
						{
							phoneNumber,
							screen: flowData?.screen,
							hasData: !!flowData?.data,
						},
					);
				} catch (parseError) {
					logger.error('Failed to parse button_reply payload', {
						error: parseError,
						payload: interactive.button_reply.payload,
					});
					return;
				}
			}
			// Log full structure if no flow data found
			else {
				logger.warn(
					'Flow response received but no flow data found in expected locations',
					{
						phoneNumber,
						interactiveKeys: Object.keys(interactive || {}),
						fullInteractive: JSON.stringify(interactive).substring(
							0,
							500,
						),
					},
				);
				return;
			}

			// Check if flow is completed
			// Flow is complete if:
			// 1. screen === 'COMPLETE'
			// 2. OR if there's data but no version (completed flow without version)
			// 3. OR if there's data and screen is not present (some flows don't have screen field)
			const isCompleted =
				flowData?.screen === 'COMPLETE' ||
				(flowData?.data && !flowData?.version) ||
				(flowData?.data && flowData?.screen === undefined);

			if (
				!isCompleted &&
				flowData?.version &&
				flowData?.screen !== 'COMPLETE'
			) {
				logger.info('Flow response received but not completed', {
					phoneNumber,
					screen: flowData?.screen,
					hasData: !!flowData?.data,
					hasVersion: !!flowData?.version,
				});
				return;
			}

			logger.info('Processing WhatsApp Flow completion', {
				phoneNumber,
				waId,
				flowData: JSON.stringify(flowData).substring(0, 500),
			});

			// Parse wa_id to customer ID
			const customerID = parseWaIdToCustomerID(waId);

			// Check if customer already exists by customer ID (wa_id)
			const existingCustomer =
				await this.customerService.findCustomerByCustomerID(customerID);

			if (existingCustomer) {
				logger.info('Customer already exists, skipping creation', {
					phoneNumber,
					waId,
					customerID: existingCustomer.customerID,
				});
				return;
			}

			// Create customer from flow data using wa_id as customer ID
			const customer = await this.customerService.createCustomerFromFlow(
				flowData,
				phoneNumber,
				waId,
			);

			logger.info('Customer created successfully from WhatsApp Flow', {
				phoneNumber,
				waId,
				customerID: customer.customerID,
				customerId: customer.id,
			});
		} catch (error) {
			logger.error('Error handling flow response', {
				error,
				phoneNumber,
				waId,
				messageId: message?.id,
			});
		}
	}

	/**
	 * Handle MENU or BACK request - send interactive menu
	 */
	private async handleMenuRequest(phoneNumber: string): Promise<void> {
		try {
			logger.info('Menu request received', { phoneNumber });
			await this.customerService.sendInteractiveMenu(phoneNumber);
		} catch (error) {
			logger.error('Error handling menu request', {
				error,
				phoneNumber,
			});
		}
	}

	/**
	 * Handle ADD_POINTS request - send CTA URL message
	 */
	private async handleAddPointsRequest(
		phoneNumber: string,
		waId?: string,
	): Promise<void> {
		try {
			logger.info('Add Points request received', { phoneNumber, waId });

			// Find customer to get their customerID (userId)
			let customer =
				await this.customerService.findCustomerByPhone(phoneNumber);

			if (!customer && waId) {
				const customerID = parseWaIdToCustomerID(waId);
				customer =
					await this.customerService.findCustomerByCustomerID(
						customerID,
					);
			}

			if (!customer) {
				logger.warn('Customer not found for add points request', {
					phoneNumber,
					waId,
				});
				return;
			}

			await this.customerService.sendAddPointsCTA(
				phoneNumber,
				customer.customerID,
			);
		} catch (error) {
			logger.error('Error handling add points request', {
				error,
				phoneNumber,
				waId,
			});
		}
	}

	/**
	 * Handle TRY_WIG request - send Try Wigs CTA URL message
	 */
	private async handleTryWigsRequest(
		phoneNumber: string,
		waId?: string,
	): Promise<void> {
		try {
			logger.info('Try Wigs request received', { phoneNumber, waId });

			// Find customer to get their customerID (userId)
			let customer =
				await this.customerService.findCustomerByPhone(phoneNumber);

			if (!customer && waId) {
				const customerID = parseWaIdToCustomerID(waId);
				customer =
					await this.customerService.findCustomerByCustomerID(
						customerID,
					);
			}

			if (!customer) {
				logger.warn('Customer not found for try wigs request', {
					phoneNumber,
					waId,
				});
				return;
			}

			await this.customerService.sendTryWigsCTA(
				phoneNumber,
				customer.customerID,
			);
		} catch (error) {
			logger.error('Error handling try wigs request', {
				error,
				phoneNumber,
				waId,
			});
		}
	}

	/**
	 * Handle VIEW_CATALOG or CATALOG request - send catalog message
	 */
	private async handleCatalogRequest(
		phoneNumber: string,
		waId?: string,
	): Promise<void> {
		try {
			logger.info('Catalog request received', { phoneNumber, waId });
			const customerName = await this.customerService.getCustomerName(
				phoneNumber,
				waId,
			);
			await this.customerService.sendCatalogMessage(
				phoneNumber,
				customerName,
			);
		} catch (error) {
			logger.error('Error handling catalog request', {
				error,
				phoneNumber,
				waId,
			});
		}
	}

	/**
	 * Handle VIEW_BALANCE or BALANCE request - send balance message
	 */
	private async handleBalanceRequest(
		phoneNumber: string,
		waId?: string,
	): Promise<void> {
		try {
			logger.info('Balance request received', { phoneNumber, waId });
			await this.customerService.sendBalanceMessage(phoneNumber, waId);
		} catch (error) {
			logger.error('Error handling balance request', {
				error,
				phoneNumber,
				waId,
			});
		}
	}

	/**
	 * Handle order event from catalog - send order confirmation
	 */
	private async handleOrderEvent(
		message: any,
		phoneNumber: string,
		waId?: string,
	): Promise<void> {
		try {
			logger.info('Order event received from catalog', {
				phoneNumber,
				waId,
				messageId: message?.id,
				orderId: message?.order?.id,
			});

			const order = message?.order;
			if (!order) {
				logger.warn('Order event received but no order data found', {
					phoneNumber,
					messageId: message?.id,
				});
				return;
			}

			// Extract order details
			const productsList = order?.products || order?.product_items || [];
			const itemsCount = productsList.length || 0;

			// Calculate total amount
			let totalAmount = 0;
			for (const product of productsList) {
				const itemPrice = parseFloat(product?.item_price || 0);
				const quantity = parseInt(product?.quantity || 1, 10);
				totalAmount += itemPrice * quantity;
			}

			const currency = productsList[0]?.currency || 'NGN';
			const formattedTotal = `${totalAmount} ${currency}`;

			const customerName =
				(await this.customerService.getCustomerName(
					phoneNumber,
					waId,
				)) || 'Customer';

			logger.info('Order details', {
				products: order?.products,
				productItems: order?.product_items,
				itemsCount,
				totalAmount,
				currency,
				formattedTotal,
				customerName,
				messageId: message?.id,
				orderId: message?.order?.id,
			});

			let newOrder: any = null;
			try {
				await db.transaction(async (tx) => {
					const customer =
						await this.customerService.findCustomerByPhone(
							phoneNumber,
						);
					if (!customer) {
						throw new AppError(
							`Customer not found for phone number: ${phoneNumber}`,
							StatusCodes.NOT_FOUND,
						);
					}

					const [insertedOrder] = await tx
						.insert(orders)
						.values({
							customerID: customer.id,
							orderNo: message?.order?.id || `ORD-${Date.now()}`,
							orderName: message?.order?.id,
							status: 'new',
							paymentType: 'WhatsApp',
							metadata: {
								itemsCount,
								totalAmount,
								currency,
								formattedTotal,
								productItems: productsList,
								messageId: message?.id,
								customerName,
								phoneNumber,
								waId,
							},
						})
						.returning();

					newOrder = insertedOrder;

					logger.info('Order inserted successfully', {
						orderId: newOrder.id,
						orderNo: newOrder.orderNo,
						customerID: newOrder.customerID,
					});

					const skus = productsList
						.map((p) => p?.product_retailer_id)
						.filter(Boolean);
					if (skus.length === 0) {
						logger.warn(
							'No valid product SKUs found, skipping product insertions',
						);
						return;
					}

					const productsToBeMapped = await tx
						.select({
							id: products.id,
							contentId: products.contentId,
						})
						.from(products)
						.where(inArray(products.contentId, skus));

					// Create SKU → Product ID map
					const contentIdToIdMap = new Map(
						productsToBeMapped.map((p) => [p.contentId, p.id]),
					);

					const orderItemsData = productsList
						.filter(
							(p) =>
								p?.product_retailer_id &&
								contentIdToIdMap.has(p.product_retailer_id),
						)
						.map((p) => ({
							orderID: newOrder.id,
							productID: contentIdToIdMap.get(
								p.product_retailer_id,
							)!,
							qty: parseInt(p?.quantity || 1, 10),
							status: 'new' as const,
						}));

					if (orderItemsData.length > 0) {
						await tx.insert(orderItems).values(orderItemsData);
						logger.info('Bulk order-product mapping inserted', {
							orderId: newOrder.id,
							itemCount: orderItemsData.length,
						});
					} else {
						logger.warn(
							'No order-product mappings created (no valid SKUs found)',
						);
					}
				});

				logger.info(
					'Order and related products processed successfully',
					{
						messageId: message?.id,
						orderId: message?.order?.id,
					},
				);
			} catch (dbError) {
				logger.error('Error inserting order and related products', {
					error: dbError,
					messageId: message?.id,
					orderId: message?.order?.id,
				});
			}

			// Send order confirmation message
			await this.customerService.sendOrderConfirmation(
				phoneNumber,
				customerName,
				itemsCount,
				formattedTotal,
				newOrder?.id,
			);

			logger.info('Order confirmation sent successfully', {
				phoneNumber,
				customerName,
				itemsCount,
				totalAmount: formattedTotal,
				orderId: newOrder?.id,
			});
		} catch (error) {
			logger.error('Error handling order event', {
				error,
				phoneNumber,
				waId,
				messageId: message?.id,
			});
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

	async fetchAllTemplates() {
		const GRAPH_API_URL =
			'https://graph.facebook.com/v22.0/791929203748580/message_templates';
		const ACCESS_TOKEN = env.WHATSAPP_ACCESS_TOKEN;
		try {
			// Fetch all templates
			const response = await axios.get(GRAPH_API_URL, {
				headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
			});

			if (!response) {
				throw new AppError(
					'Fetch Templates failed - fetching from WP',
					StatusCodes.INTERNAL_SERVER_ERROR,
				);
			}
			const templates = response.data?.data || [];

			const formattedTemplates = templates.map((template: any) => {
				template.components = template.components?.filter(
					(c: any) =>
						!['BUTTONS', 'BUTTON', 'FOOTER'].includes(
							c.type?.toUpperCase(),
						),
				);
				return formatTemplateResponse(template);
			});

			return {
				data: formattedTemplates,
				message: 'All templates fetched and formatted successfully',
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to fetch templates',
				StatusCodes.BAD_GATEWAY,
				'Error in fetchAllTemplates service',
			);
		}
	}

	async earnLoyaltyPoints(
		userIdentifier: string,
		productID: string,
		resolvedUserId: string,
	) {
		try {
			const isUUID = /^[0-9a-fA-F-]{36}$/.test(userIdentifier);
			const isproductUUID = /^[0-9a-fA-F-]{36}$/.test(productID);
			return await db.transaction(async (tx) => {
				const product = await tx.query.products.findFirst({
					where: isproductUUID
						? eq(products.id, productID)
						: eq(products.contentId, productID),
				});
				if (!product)
					throw new AppError(
						'Product not found',
						StatusCodes.NOT_FOUND,
					);

				const productPoints = product?.points ?? 0;
				if (!productPoints || productPoints <= 0)
					throw new AppError(
						'Product does not have valid points value',
						StatusCodes.BAD_REQUEST,
					);

				const customer = await tx.query.customerMaster.findFirst({
					where: isUUID
						? eq(customerMaster.id, userIdentifier)
						: eq(customerMaster.customerID, Number(userIdentifier)),
					with: { loyaltyAccounts: true },
				});

				if (!customer)
					throw new AppError(
						'Customer not found',
						StatusCodes.NOT_FOUND,
					);

				const account = customer.loyaltyAccounts;
				if (!account)
					throw new AppError(
						'Loyalty account not found for this customer',
						StatusCodes.NOT_FOUND,
					);

				const newBalance = account.points_balance + productPoints;
				const newLifetime = account.lifetime_points + productPoints;

				const [createdTx] = await tx
					.insert(loyaltyTransactions)
					.values({
						customerID: customer.id,
						account_id: account.id,
						initialPoint: account.points_balance,
						manipulatedPoint: productPoints,
						totalPoint: newBalance,
						description: `Earned ${productPoints} points for purchasing ${product.productName}`,
						type: 'EARN',
						metadata: {
							productID,
							productName: product.productName,
							points: productPoints,
						},
						// createdBy: userId,
						// updatedBy: userId,
					})
					.returning();

				await tx
					.update(loyaltyAccounts)
					.set({
						points_balance: newBalance,
						lifetime_points: newLifetime,
						last_transaction_at: new Date(),
						updatedBy: customer.updatedBy,
					})
					.where(eq(loyaltyAccounts.id, account.id));

				// Send points earned notification message
				if (customer.phone) {
					const customerName = customer.name || 'Customer';
					this.customerService
						.sendPointsEarnedMessage(
							customer.phone,
							productPoints,
							newBalance,
							customerName,
						)
						.catch((error) => {
							logger.error(
								'Failed to send points earned message',
								{
									error,
									customerID: customer.customerID,
									phone: customer.phone,
									pointsAdded: productPoints,
									newBalance,
								},
							);
						});
				}

				logger.info('Points earned message', {
					pointsAdded: productPoints,
					newBalance,
					customerID: customer.customerID,
					phone: customer.phone,
					customerName: customer.name,
					resolvedUserId,
				});

				return {
					data: {
						transaction: createdTx,
						account: {
							points_balance: newBalance,
							lifetime_points: newLifetime,
						},
					},
					message: `Successfully earned ${productPoints} points.`,
				};
			});
		} catch (error) {
			handleServiceError(
				error,
				'Failed to process loyalty transaction',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'earnLoyaltyPoints',
				{ userIdentifier, productID },
			);
		}
	}
}
