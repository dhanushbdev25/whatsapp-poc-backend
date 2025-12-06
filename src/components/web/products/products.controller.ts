import { Request, Response, Router } from 'express';
import { productService } from './products.service';
import BaseApi from '@/components/BaseApi';
import { db } from '@/database';

export default class ProductController extends BaseApi {
	constructor() {
		super();
	}

	public register(): Router {
		this.router.get('/', this.getAllProducts.bind(this));
		this.router.get('/:id', this.getProductById.bind(this));
		this.router.post('/', this.createProduct.bind(this));
		this.router.patch('/:id', this.updateProduct.bind(this));

		return this.router;
	}

	public async getAllProducts(req: Request, res: Response) {
		const { data, message } = await productService.getAllProducts();
		res.locals = { data, message };
		super.send(res);
	}

	public async getProductById(req: Request, res: Response) {
		const { id } = req.params;
		const { data, message } = await productService.getProductById(id);
		res.locals = { data, message };
		super.send(res);
	}

	public async createProduct(req: Request, res: Response) {
		const { userId } = req.query;

		const result = await db.transaction(async (tx) => {
			return await productService.createProduct(
				req.body,
				userId ? String(userId) : undefined,
				tx, // transaction passed in
			);
		});

		res.locals = result;
		super.send(res);
	}

	public async updateProduct(req: Request, res: Response) {
	const { id } = req.params;
	const { userId } = req.query;

	const result = await db.transaction(async (tx) => {
		return await productService.updateProduct(
			id,
			req.body,
			userId ? String(userId) : undefined,
			tx,
		);
	});

	res.locals = result;
	super.send(res);
}

}
