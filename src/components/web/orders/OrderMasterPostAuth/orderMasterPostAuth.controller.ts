// src/controllers/customerController.ts
import { Request, Response, Router } from 'express';

import BaseApi from '../../../BaseApi';
import { orderMasterPostAuthService } from './orderMasterPostAuth.service';


/** Helper: build Stripe client */


export default class OrderMasterPostAuthController extends BaseApi {

	constructor() {
		super();
		
	}

	public register(): Router {
		this.router.get(
			'/:id/get-order-details',
			this.getOrderDetailsById.bind(this),
		);
		this.router.get('/fetchAllOrders', this.getAllOrderDetails.bind(this));

		return this.router;
	}


	public async getOrderDetailsById(req: Request, res: Response) {
		const { id }: any = req.params;
		const result = await orderMasterPostAuthService.getOrderById(id);

		res.locals = { data: result };
		super.send(res);
	}

	public async getAllOrderDetails(req: Request, res: Response) {
		const result = await orderMasterPostAuthService.getAllOrderDetails();

		res.locals = { data: result };
		super.send(res);
	}

}
