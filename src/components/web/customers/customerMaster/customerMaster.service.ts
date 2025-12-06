import axios from 'axios';
import {
	eq,
	desc as orderDesc,
	and,
	inArray,
	sql,
	asc as orderAsc,
	or,
	ilike,
	ne,
} from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { db } from '../../../../database';
import AppError from '@/abstractions/AppError';
import {
	customerMaster,
	loyaltyAccounts,
	loyaltyTransactions,
	notificationPreferences,
	orderItems,
	orders,
	products,
	tiers,
} from '@/database/schema';
import { DbOrTx } from '@/database/transactionType/transactionType';
import env from '@/env';
import { parseCustomersExcel } from '@/utils/excelCustomers';
import { handleServiceError } from '@/utils/serviceErrorHandler';

interface CreateCustomerInput {
	customerID?: number;
	name: string;
	email: string;
	phone: string;
	gender?: 'male' | 'female' | 'other';
	address?: string;
	state?: string;
	pincode?: string;
	notificationPreferences?: {
		orderUpdates?: boolean;
		loyaltyRewards?: boolean;
		promotionalMessages?: boolean;
	};
}

export const customerService = {
	/**
	 * Fetch all customers
	 */
	async getAllCustomers(reqQuery) {
		try {
			const { page, limit, search, sortBy, sortOrder } = reqQuery;

			const offset = (page - 1) * limit;

			const allowedSortFields = {
				createdAt: customerMaster.createdAt,
				name: customerMaster.name,
				customerID: customerMaster.customerID,
				email: customerMaster.email,
			};
			const sortColumn =
				allowedSortFields[sortBy as keyof typeof allowedSortFields] ||
				customerMaster.createdAt;

			const whereClause = search
				? or(
						ilike(customerMaster.name, `%${search}%`),
						ilike(
							sql`CAST(${customerMaster.customerID} AS TEXT)`,
							`%${search}%`,
						),
					)
				: undefined;

			const customers = await db.query.customerMaster.findMany({
				where: whereClause,
				limit,
				offset,
				orderBy: (_, { asc, desc }) => [
					sortOrder === 'ASC' ? asc(sortColumn) : desc(sortColumn),
				],
				with: {
					notificationPreferences: true,
				},
			});

			const [{ count: totalCount }] = await db
				.select({ count: sql<number>`count(*)` })
				.from(customerMaster)
				.where(whereClause ?? sql`true`);

			if (!customers || customers.length === 0) {
				throw new AppError(
					'Customers not found',
					StatusCodes.NOT_FOUND,
				);
			}

			return {
				message: 'All customers fetched successfully',
				data: {
					customers,
					pagination: {
						currentPage: page,
						totalPages: Math.ceil(totalCount / limit),
						totalItems: totalCount,
						itemsPerPage: limit,
					},
				},
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to fetch customers',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Error in getAllCustomers service',
			);
		}
	},

	/**
	 * Get customer by UUID
	 */
	async getCustomerById(customerId: string, userId?: string) {
		try {
			const customer = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.id, customerId),
				with: {
					notificationPreferences: true,
					loyaltyAccounts: true,
					orders: {
						orderBy: (o, { desc }) => [desc(o.createdAt)],
						with: {
							orderItems: { with: { product: true } },
						},
					},
					customerGroupMembers: { with: { group: true } },
				},
			});

			if (!customer) {
				throw new AppError('Customer not found', StatusCodes.NOT_FOUND);
			}

			const totalOrders = customer.orders?.length || 0;
			const loyaltyPoints = customer.loyaltyAccounts?.points_balance ?? 0;

			const statsResult = await db
				.select({
					totalSpent: sql<number>`COALESCE(SUM(${products.amount} * ${orderItems.qty}), 0)`,
					totalItems: sql<number>`COALESCE(SUM(${orderItems.qty}), 0)`,
				})
				.from(orders)
				.leftJoin(orderItems, eq(orderItems.orderID, orders.id))
				.leftJoin(products, eq(products.id, orderItems.productID))
				.where(eq(orders.customerID, customerId));

			const totalSpent = statsResult[0]?.totalSpent ?? 0;
			const totalItems = statsResult[0]?.totalItems ?? 0;
			const avgOrderValue =
				totalOrders > 0 ? totalSpent / totalOrders : 0;

			const topProductResult = await db
				.select({
					productID: products.id,
					productName: products.productName,
					totalQuantity: sql<number>`SUM(${orderItems.qty})`,
				})
				.from(orders)
				.leftJoin(orderItems, eq(orderItems.orderID, orders.id))
				.leftJoin(products, eq(products.id, orderItems.productID))
				.where(eq(orders.customerID, customerId))
				.groupBy(products.id, products.productName)
				.orderBy(orderDesc(sql`SUM(${orderItems.qty})`))
				.limit(1);

			const mostPurchasedProduct = topProductResult[0]
				? {
						productID: topProductResult[0].productID,
						productName: topProductResult[0].productName,
						totalQuantity: topProductResult[0].totalQuantity,
					}
				: null;

			const allTiers = await db
				.select()
				.from(tiers)
				.orderBy(orderAsc(tiers.points_required));

			const lifetimePoints =
				customer.loyaltyAccounts?.lifetime_points ?? 0;

			let currentTier = allTiers[0];
			let nextTier: (typeof allTiers)[0] | null = null;

			for (let i = 0; i < allTiers.length; i++) {
				if (lifetimePoints >= allTiers[i].points_required) {
					currentTier = allTiers[i];
					nextTier = allTiers[i + 1] ?? null;
				}
			}

			const tierProgress = {
				currentTier: currentTier?.tier_name ?? null,
				nextTier: nextTier?.tier_name ?? null,
				currentLoyaltyPoints: lifetimePoints,
				currentTierPoints: currentTier?.points_required ?? 0,
				nextTierPoints: nextTier?.points_required ?? null,
			};
			const customerWithStats = {
				...customer,
				quickStats: {
					totalOrders,
					totalItems,
					loyaltyPoints,
					totalSpent,
					avgOrderValue,
					mostPurchasedProduct,
				},
				tierProgress,
			};

			return {
				data: customerWithStats,
				message: 'Customer fetched successfully',
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to fetch customer',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'getCustomerById',
				{ customerId, userId },
			);
		}
	},

	async getLoyaltyTransactions(reqQuery) {
		const { customerID, page, limit, search, sortBy, sortOrder } = reqQuery;
		const offset = (page - 1) * limit;

		const loyaltyAccount = await db.query.loyaltyAccounts.findFirst({
			where: eq(loyaltyAccounts.customerID, customerID),
		});

		if (!loyaltyAccount) {
			throw new AppError(
				'Loyalty account not found for this customer',
				StatusCodes.NOT_FOUND,
			);
		}

		const allowedSortFields = {
			createdAt: loyaltyTransactions.createdAt,
			type: loyaltyTransactions.type,
			orderNo: loyaltyTransactions.orderNo,
		};
		const sortColumn =
			allowedSortFields[sortBy as keyof typeof allowedSortFields] ||
			loyaltyTransactions.createdAt;

		const whereClause = and(
			eq(loyaltyTransactions.account_id, loyaltyAccount.id),
			search
				? or(
						ilike(loyaltyTransactions.description, `%${search}%`),
						ilike(loyaltyTransactions.orderNo, `%${search}%`),
						ilike(loyaltyTransactions.type, `%${search}%`),
					)
				: undefined,
		);

		const records = await db.query.loyaltyTransactions.findMany({
			where: whereClause,
			limit,
			offset,
			orderBy: (_, { asc, desc }) => [
				sortOrder === 'ASC' ? asc(sortColumn) : desc(sortColumn),
			],
		});

		const [{ count: totalCount }] = await db
			.select({ count: sql<number>`count(*)` })
			.from(loyaltyTransactions)
			.where(whereClause ?? sql`true`);

		return {
			message: 'Loyalty transactions fetched successfully',
			data: {
				transactions: records,
				pagination: {
					currentPage: page,
					totalPages: Math.ceil(totalCount / limit),
					totalItems: totalCount,
					itemsPerPage: limit,
				},
			},
		};
	},
	async getOrdersByStatus(reqQuery) {
		const { customerID, status, page, limit, search, sortBy, sortOrder } =
			reqQuery;
		const offset = (page - 1) * limit;

		const allowedSortFields = {
			createdAt: orders.createdAt,
			orderNo: orders.orderNo,
			orderName: orders.orderName,
			status: orders.status,
		};
		const sortColumn =
			allowedSortFields[sortBy as keyof typeof allowedSortFields] ||
			orders.createdAt;

		const whereClause = and(
			eq(orders.customerID, customerID),
			status === 'pending'
				? ne(orders.status, 'completed')
				: eq(orders.status, 'completed'),
			search
				? or(
						ilike(orders.orderNo, `%${search}%`),
						ilike(orders.orderName, `%${search}%`),
						ilike(orders.trackingNo, `%${search}%`),
					)
				: undefined,
		);

		const records = await db.query.orders.findMany({
			where: whereClause,
			limit,
			offset,
			orderBy: (_, { asc, desc }) => [
				sortOrder === 'ASC' ? asc(sortColumn) : desc(sortColumn),
			],
			with: {
				orderItems: { with: { product: true } },
			},
		});

		const [{ count: totalCount }] = await db
			.select({ count: sql<number>`count(*)` })
			.from(orders)
			.where(whereClause ?? sql`true`);

		return {
			message:
				status === 'pending'
					? 'Pending orders fetched successfully'
					: 'Completed orders fetched successfully',
			data: {
				orders: records,
				pagination: {
					currentPage: page,
					totalPages: Math.ceil(totalCount / limit),
					totalItems: totalCount,
					itemsPerPage: limit,
				},
			},
		};
	},
	/**
	 * Create new customer
	 */

	async createCustomer(
		data: CreateCustomerInput,
		userId?: string,
		txOrDb: DbOrTx = db,
	) {
		try {
			// Check if phone already exists
			const existing = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.phone, data.phone),
			});
			if (existing)
				throw new AppError(
					'Customer with this phone no already exists',
					StatusCodes.CONFLICT,
				);

			// Check if CustomerID already exists
			const existingID = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.customerID, data.customerID),
			});
			if (existingID)
				throw new AppError(
					'Customer with this Customer ID already exists',
					StatusCodes.CONFLICT,
				);

			// Create new customer
			const [createdCustomer] = await txOrDb
				.insert(customerMaster)
				.values({
					customerID: data.customerID,
					name: data.name,
					email: data.email,
					phone: data.phone,
					gender: data.gender,
					address: data.address,
					state: data.state,
					pincode: data.pincode,
					createdBy: userId,
					updatedBy: userId,
					isActive: true,
					latestActive: new Date(),
				})
				.returning();

			// 1️⃣ Auto-create Loyalty Account
			await txOrDb.insert(loyaltyAccounts).values({
				customerID: createdCustomer.id,
				points_balance: 0,
				points_redeemed: 0,
				lifetime_points: 0,
				createdBy: userId,
				updatedBy: userId,
			});

			// 2️⃣ Create notification preferences (optional)
			if (data.notificationPreferences) {
				await txOrDb.insert(notificationPreferences).values({
					customerID: createdCustomer.id,
					orderUpdates:
						data.notificationPreferences.orderUpdates ?? false,
					loyaltyRewards:
						data.notificationPreferences.loyaltyRewards ?? false,
					promotionalMessages:
						data.notificationPreferences.promotionalMessages ??
						false,
					createdBy: userId,
					updatedBy: userId,
				});
			}

			// 3️⃣ Fetch full customer with relations
			const customer = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.id, createdCustomer.id),
				with: { notificationPreferences: true, loyaltyAccounts: true },
			});

			return {
				data: customer,
				message: 'Customer created successfully with loyalty account',
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to create customer',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'createCustomer',
				{ email: data.email, userId },
			);
		}
	},

	/**
	 * Update customer by UUID
	 */

	async updateCustomer(
		customerId: string,
		data: any,
		userId?: string,
		txOrDb: DbOrTx = db,
	) {
		try {
			// 1️⃣ Validate UUID format (outside of DB)
			if (!/^[0-9a-fA-F-]{36}$/.test(customerId)) {
				throw new AppError(
					'Invalid customer ID format (expected UUID)',
					StatusCodes.BAD_REQUEST,
				);
			}

			// 2️⃣ Fetch existing customer (read → use db)
			const existing = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.id, customerId),
			});
			if (!existing)
				throw new AppError('Customer not found', StatusCodes.NOT_FOUND);

			// 3️⃣ Check for duplicate email (read → use db)
			if (data.email && data.email !== existing.email) {
				const duplicate = await db.query.customerMaster.findFirst({
					where: and(
						eq(customerMaster.email, data.email),
						sql`${customerMaster.id} != ${customerId}`,
					),
				});
				if (duplicate)
					throw new AppError(
						'Email already in use by another customer',
						StatusCodes.CONFLICT,
					);
			}

			// 4️⃣ Update customer master (write → use txOrDb)
			await txOrDb
				.update(customerMaster)
				.set({
					name: data.name ?? existing.name,
					email: data.email ?? existing.email,
					phone: data.phone ?? existing.phone,
					gender: data.gender ?? existing.gender,
					address: data.address ?? existing.address,
					state: data.state ?? existing.state,
					pincode: data.pincode ?? existing.pincode,
					updatedBy: userId,
					updatedAt: new Date(),
				})
				.where(eq(customerMaster.id, customerId));

			// 5️⃣ Update notification preferences (optional write → use txOrDb)
			if (data.notificationPreferences) {
				await txOrDb
					.update(notificationPreferences)
					.set({
						orderUpdates:
							data.notificationPreferences.orderUpdates ??
							undefined,
						loyaltyRewards:
							data.notificationPreferences.loyaltyRewards ??
							undefined,
						promotionalMessages:
							data.notificationPreferences.promotionalMessages ??
							undefined,
						updatedBy: userId,
						updatedAt: new Date(),
					})
					.where(eq(notificationPreferences.customerID, customerId));
			}

			// 6️⃣ Fetch updated customer (read → use db)
			const updated = await db.query.customerMaster.findFirst({
				where: eq(customerMaster.id, customerId),
				with: { notificationPreferences: true },
			});

			return { data: updated, message: 'Customer updated successfully' };
		} catch (error) {
			handleServiceError(
				error,
				'Failed to update customer',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'updateCustomer',
				{ customerId, userId },
			);
		}
	},

	/**
	 * Soft delete customer by UUID
	 */

	async deleteCustomer(
		customerId: string,
		userId?: string,
		txOrDb: DbOrTx = db,
	) {
		try {
			// Perform soft delete (write → use txOrDb)
			const [deleted] = await txOrDb
				.update(customerMaster)
				.set({
					isActive: false,
					updatedBy: userId,
					updatedAt: new Date(),
				})
				.where(eq(customerMaster.id, customerId))
				.returning();

			// Validation after DB operation
			if (!deleted)
				throw new AppError('Customer not found', StatusCodes.NOT_FOUND);

			return {
				data: { id: deleted.id },
				message: 'Customer deleted successfully',
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to delete customer',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'deleteCustomer',
				{ customerId, userId },
			);
		}
	},

	async bulkUploadCustomers(
		file: Express.Multer.File,
		userId?: string,
		txOrDb: DbOrTx = db,
	) {
		try {
			// 1️⃣ Basic file and content validation
			if (!file)
				throw new AppError('No file provided', StatusCodes.BAD_REQUEST);

			const rows = await parseCustomersExcel(file.buffer);
			if (!rows.length)
				throw new AppError(
					'No valid rows found in Excel',
					StatusCodes.BAD_REQUEST,
				);

			// 2️⃣ Check for existing emails (read → use db)
			const emails = rows.map((r) => r.email.toLowerCase());
			const existing = await db
				.select({ email: customerMaster.email })
				.from(customerMaster)
				.where(inArray(customerMaster.email, emails));

			const existingEmails = new Set(
				existing.map((e) => e.email.toLowerCase()),
			);

			const toInsert = rows.filter(
				(r) => !existingEmails.has(r.email.toLowerCase()),
			);
			const skipped = rows.filter((r) =>
				existingEmails.has(r.email.toLowerCase()),
			);

			// 3️⃣ Perform inserts (write → use txOrDb)
			for (const row of toInsert) {
				const [customer] = await txOrDb
					.insert(customerMaster)
					.values({
						customerID: row.customerID,
						name: row.name,
						email: row.email,
						phone: row.phone,
						gender: row.gender,
						address: row.address,
						state: row.state,
						pincode: row.pincode,
						createdBy: userId,
						updatedBy: userId,
						isActive: true,
					})
					.returning();

				await txOrDb.insert(notificationPreferences).values({
					customerID: customer.id,
					orderUpdates:
						row.notificationPreferences.orderUpdates ?? false,
					loyaltyRewards:
						row.notificationPreferences.loyaltyRewards ?? false,
					promotionalMessages:
						row.notificationPreferences.promotionalMessages ??
						false,
					createdBy: userId,
					updatedBy: userId,
				});
			}

			// 4️⃣ Return structured response
			return {
				data: {
					totalRows: rows.length,
					createdCount: toInsert.length,
					skippedCount: skipped.length,
					errors: skipped.map((s) => ({
						email: s.email,
						reason: 'Duplicate email',
					})),
				},
				message: 'Bulk upload completed successfully',
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to upload customers',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'bulkUploadCustomers',
				{ userId },
			);
		}
	},
	async sendTemplateMessage(phoneNumber: string) {
		const FACEBOOK_API_URL =
			'https://graph.facebook.com/v24.0/918090124709683/messages';
		const FACEBOOK_TOKEN = env.WHATSAPP_ACCESS_TOKEN;
		try {
			const response = await axios.post(
				FACEBOOK_API_URL!,
				{
					messaging_product: 'whatsapp',
					to: phoneNumber,
					type: 'template',
					template: {
						name: 'enrolment_template',
						language: { code: 'en' },
						components: [
							{
								type: 'header',
								parameters: [
									{
										type: 'image',
										image: {
											link: 'https://mtbsapoc.blob.core.windows.net/whatsapppoccontainer/lush-logo.png',
										},
									},
								],
							},
							{
								type: 'button',
								sub_type: 'flow',
								index: '0',
								parameters: [
									{
										type: 'payload',
										payload: '{"flow_token":"0000"}',
									},
								],
							},
						],
					},
				},
				{
					headers: {
						Authorization: `Bearer ${FACEBOOK_TOKEN}`,
						'Content-Type': 'application/json',
					},
				},
			);

			return {
				data: response.data,
				message: 'WhatsApp template message sent successfully',
			};
		} catch (error: any) {
			handleServiceError(
				error,
				'Failed to send WhatsApp message',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'sendTemplateMessage',
				{ phoneNumber },
			);
		}
	},
};
