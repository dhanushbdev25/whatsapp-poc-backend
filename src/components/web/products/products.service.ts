import { eq, desc as orderDesc } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import AppError from '@/abstractions/AppError';
import { db } from '@/database';
import { products } from '@/database/schema';
import { handleServiceError } from '@/utils/serviceErrorHandler';
import axios from 'axios';
import { fbUpdateProductStock, syncToFacebookCatalog } from './facebookProductSync';

interface CreateOrUpdateProductInput {
	contentId: string;
	productName: string;
	productType?: string;
	sku: string;
	weight?: string;
	dimensions?: string;
	warrantyPeriod?: string;
	returnPeriodDays?: string;
	qty?: number;
	amount?: number;
	currency?: string;
	type?: string;
	points?: number;
	metadata?: Record<string, any>;
}

export const productService = {


	/**
	 * Fetch all products
	 */
	async getAllProducts() {
		try {
			const data = await db.query.products.findMany({
				orderBy: [orderDesc(products.createdAt)],
			});
			return { data, message: 'All products fetched successfully' };
		} catch (error) {
			handleServiceError(
				error,
				'Failed to fetch products',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'getAllProducts',
			);
		}
	},

	/**
	 * Fetch product by ID
	 */
	async getProductById(productId: string) {
		try {
			const product = await db.query.products.findFirst({
				where: eq(products.id, productId),
			});

			if (!product) {
				throw new AppError('Product not found', StatusCodes.NOT_FOUND);
			}

			return { data: product, message: 'Product fetched successfully' };
		} catch (error) {
			handleServiceError(
				error,
				'Failed to fetch product',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'getProductById',
				{ productId },
			);
		}
	},

	/**
	 * Create a new product
	 */

	async createProduct(data: CreateOrUpdateProductInput, userId?: string) {
		try {
			// 1) Check duplicate contentId
			const existing = await db.query.products.findFirst({
				where: eq(products.contentId, data.contentId),
			});

			if (existing) {
				throw new AppError(
					"Product with this contentId already exists",
					StatusCodes.CONFLICT
				);
			}

			// 2) Fix metadata type
			const metadata = Array.isArray(data.metadata)
				? data.metadata
				: typeof data.metadata === "string"
					? JSON.parse(data.metadata)
					: [];

			// 3) Insert into DB
			const [newProduct]: any = await db
				.insert(products)
				.values({
					...data,
					metadata,
					createdBy: userId,
					updatedBy: userId,
				})
				.returning();

			// ======================================================
			// 🔗 FACEBOOK CATALOG — CREATE PRODUCT
			// ======================================================
			try {
				const fbResponse = await syncToFacebookCatalog({
					retailer_id: newProduct.contentId,
					name: newProduct.productName,
					description: "No description available",
					price: newProduct.amount,
					currency: newProduct.currency,
					availability: newProduct.qty > 0 ? "in stock" : "out of stock",
					condition: "new",
					brand: "Default",
					image_url: Array.isArray(newProduct.metadata)
						? newProduct.metadata[0]
						: "",
					url: "https://example.com/product/" + newProduct.contentId,
				});

				console.log("FB Sync Response:", fbResponse.data);
			} catch (fbErr) {
				console.error(
					"❌ FB Catalog Sync Failed:",
					fbErr?.response?.data || fbErr
				);
			}

			return {
				data: newProduct,
				message: "Product created successfully",
			};
		} catch (error) {
			handleServiceError(
				error,
				"Failed to create product",
				StatusCodes.INTERNAL_SERVER_ERROR,
				"createProduct",
				{ data }
			);
		}
	},



	async updateProduct(
		productId: string,
		data: Partial<CreateOrUpdateProductInput>,
		userId?: string,
	) {
		try {
			const existing = await db.query.products.findFirst({
				where: eq(products.id, productId),
			});

			if (!existing) {
				throw new AppError("Product not found", StatusCodes.NOT_FOUND);
			}

			// Prevent duplicate SKU
			if (data.sku && data.sku !== existing.sku) {
				const duplicateSKU = await db.query.products.findFirst({
					where: eq(products.sku, data.sku),
				});
				if (duplicateSKU) {
					throw new AppError(
						"Product with this SKU already exists",
						StatusCodes.CONFLICT
					);
				}
			}

			// --- UPDATE IN DB ---
			const [updated] = await db
				.update(products)
				.set({
					...data,
					updatedBy: userId,
					updatedAt: new Date(),
				})
				.where(eq(products.id, productId))
				.returning();

			// --- UPDATE IN FACEBOOK API ---
			await fbUpdateProductStock({
				sku: updated.sku,
				amount: updated.amount,
				qty: updated.qty,
			});

			return {
				data: updated,
				message: "Product updated successfully",
			};
		} catch (error) {
			handleServiceError(
				error,
				"Failed to update product",
				StatusCodes.INTERNAL_SERVER_ERROR,
				"updateProduct",
				{ productId, data },
			);
		}
	}

	,


	/**
	 * Update product
	 */
	// async updateProduct(
	// 	productId: string,
	// 	data: Partial<CreateOrUpdateProductInput>,
	// 	userId?: string,
	// ) {
	// 	try {
	// 		const existing = await db.query.products.findFirst({
	// 			where: eq(products.id, productId),
	// 		});

	// 		if (!existing) {
	// 			throw new AppError('Product not found', StatusCodes.NOT_FOUND);
	// 		}

	// 		// Prevent duplicate SKU when updating
	// 		if (data.sku && data.sku !== existing.sku) {
	// 			const duplicateSKU = await db.query.products.findFirst({
	// 				where: eq(products.sku, data.sku),
	// 			});
	// 			if (duplicateSKU) {
	// 				throw new AppError(
	// 					'Product with this SKU already exists',
	// 					StatusCodes.CONFLICT,
	// 				);
	// 			}
	// 		}

	// 		const [updated] = await db
	// 			.update(products)
	// 			.set({
	// 				...data,
	// 				updatedBy: userId,
	// 				updatedAt: new Date(),
	// 			})
	// 			.where(eq(products.id, productId))
	// 			.returning();

	// 		return {
	// 			data: updated,
	// 			message: 'Product updated successfully',
	// 		};
	// 	} catch (error) {
	// 		handleServiceError(
	// 			error,
	// 			'Failed to update product',
	// 			StatusCodes.INTERNAL_SERVER_ERROR,
	// 			'updateProduct',
	// 			{ productId, data },
	// 		);
	// 	}
	// },
};


