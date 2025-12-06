import { eq, ilike, sql } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import AppError from '@/abstractions/AppError';
import { db } from '@/database';
import { loyaltyAccounts, orders } from '@/database/schema';
import { handleServiceError } from '@/utils/serviceErrorHandler';

export const orderMasterPostAuthService = {
	async getOrderById(id: string, _userId?: string) {
		try {
			const order = await db.query.orders.findFirst({
				where: eq(orders.id, id),
				with: {
					customer: true,
					createdByUser: true,
					updatedByUser: true,
					orderItems: {
						with: {
							product: true,
							createdByUser: true,
							updatedByUser: true,
						},
						orderBy: (orderItems, { desc }) => [
							desc(orderItems.createdAt),
						],
					},
				},
			});

			if (!order) {
				throw new AppError('Order not found', StatusCodes.NOT_FOUND);
			}

			//  Fetch loyalty account using order.customer.customerID
			const loyaltyAccount = await db.query.loyaltyAccounts.findFirst({
				where: eq(loyaltyAccounts.customerID, order.customer.id),
				with: {
					transactions: {
						orderBy: (t, { desc }) => [desc(t.createdAt)],
					},
					createdByUser: true,
					updatedByUser: true,
				},
			});

			return {
				message: 'Order fetched successfully',
				data: {
					order,
					loyaltyAccount: loyaltyAccount ?? {
						points_balance: 0,
						points_redeemed: 0,
						lifetime_points: 0,
						transactions: [],
					},
				},
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to fetch order',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Error in getOrderById service',
				{ id },
			);
		}
	},

	async getAllOrderDetails(reqQuery?: any) {
		try {
			// Pagination setup
			const page = parseInt(reqQuery?.page as string) || 1;
			const limit = parseInt(reqQuery?.limit as string) || 10;
			const offset = (page - 1) * limit;

			// Search filter (by order_no)
			const search = (reqQuery?.search as string) || '';

			// Sorting setup
			const sortBy = (reqQuery?.sortBy as string) || 'createdAt';
			const sortOrder =
				(reqQuery?.sortOrder as string)?.toUpperCase() === 'ASC'
					? 'ASC'
					: 'DESC';

			// Base where clause
			const whereClause = search
				? ilike(orders.orderNo, `%${search}%`)
				: undefined;

			// Allowed sorting fields to prevent injection
			const allowedSortFields = {
				createdAt: orders.createdAt,
				orderNo: orders.orderNo,
				status: orders.status,
				orderCreatedAt: orders.orderCreatedAt,
			};

			// Fallback to createdAt if invalid sort field
			const sortColumn = allowedSortFields[sortBy] || orders.createdAt;

			// Fetch paginated orders
			const order = await db.query.orders.findMany({
				where: whereClause,
				limit,
				offset,
				with: {
					customer: true,
					createdByUser: true,
					updatedByUser: true,
					orderItems: {
						with: {
							product: true,
							createdByUser: true,
							updatedByUser: true,
						},
						orderBy: (orderItems, { desc }) => [
							desc(orderItems.createdAt),
						],
					},
				},
				orderBy: (_, { asc, desc }) => [
					sortOrder === 'ASC' ? asc(sortColumn) : desc(sortColumn),
				],
			});

			// Total count (for pagination)
			const [{ count: totalCount }] = await db
				.select({ count: sql<number>`count(*)` })
				.from(orders)
				.where(whereClause ?? sql`true`);

			if (!order || order.length === 0) {
				throw new AppError('Orders not found', StatusCodes.NOT_FOUND);
			}

			// Response structure (same style)
			return {
				message: 'Order fetched successfully',
				data: order,
				pagination: {
					currentPage: page,
					totalPages: Math.ceil(totalCount / limit),
					totalItems: totalCount,
					itemsPerPage: limit,
				},
			};
		} catch (error) {
			handleServiceError(
				error,
				'Failed to fetch order',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Error in getAllOrderDetails service',
			);
		}
	},
};
