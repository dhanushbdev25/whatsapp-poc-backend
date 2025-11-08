import { StatusCodes } from 'http-status-codes';
import { CustomerWebService } from './customer-web.service';
import { parseWaIdToCustomerID } from './webhook-utils';
import AppError from '@/abstractions/AppError';
import env from '@/env';
import logger from '@/lib/logger';

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
					await this.handleAddPointsRequest(phoneNumber);
				} else if (
					textContent === 'VIEW_CATALOG' ||
					textContent === 'CATALOG' ||
					textContent === 'VIEW CATALOG'
				) {
					await this.handleCatalogRequest(phoneNumber, customerWaId);
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
					await this.handleAddPointsRequest(phoneNumber);
				} else if (buttonId === 'VIEW_CATALOG') {
					await this.handleCatalogRequest(phoneNumber, customerWaId);
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
	private async handleAddPointsRequest(phoneNumber: string): Promise<void> {
		try {
			logger.info('Add Points request received', { phoneNumber });
			await this.customerService.sendAddPointsCTA(phoneNumber);
		} catch (error) {
			logger.error('Error handling add points request', {
				error,
				phoneNumber,
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
			// const customerName = await this.customerService.getCustomerName(phoneNumber, waId);
			await this.customerService.sendCatalogMessage(
				phoneNumber,
				'customerName',
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
			// WhatsApp order structure can have either 'products' or 'product_items' array
			const products = order?.products || order?.product_items || [];
			const itemsCount = products.length || 0;

			// Calculate total from order items
			// Order items typically have: product_retailer_id, quantity, item_price, currency
			let totalAmount = 0;
			for (const product of products) {
				const itemPrice = parseFloat(product?.item_price || 0);
				const quantity = parseInt(product?.quantity || 1, 10);
				totalAmount += itemPrice * quantity;
			}

			// Format total amount (assuming NGN currency, adjust as needed)
			const currency = products[0]?.currency || 'NGN';
			const formattedTotal = `${totalAmount} ${currency}`;

			// Get customer name
			// const customerName = await this.customerService.getCustomerName(phoneNumber, waId) || 'Customer';

			// Send order confirmation message
			await this.customerService.sendOrderConfirmation(
				phoneNumber,
				'customerName',
				itemsCount,
				formattedTotal,
			);

			logger.info('Order confirmation sent successfully', {
				phoneNumber,
				// customerName,
				itemsCount,
				totalAmount: formattedTotal,
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
}
