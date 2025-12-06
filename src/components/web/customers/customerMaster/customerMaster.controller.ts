import { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer from 'multer';
import BaseApi from '../../../../components/BaseApi';
import {
	getAllCustomersRequestSchema,
	getAllCustomersResponseSchema,
} from '../customerMaster.validation';
import { customerService } from './customerMaster.service';
import AppError from '@/abstractions/AppError';
import { db } from '@/database';
import { validateRequest } from '@/middleware/validateRequest';
import { buildCustomersTemplate } from '@/utils/excelCustomers';

export default class CustomerController extends BaseApi {
	constructor() {
		super();
	}

	public register(): Router {
		const upload = multer({ storage: multer.memoryStorage() });

		this.router.get('/template', this.downloadTemplate.bind(this));

		this.router.get(
			'/',
			validateRequest(getAllCustomersRequestSchema),
			this.getAllCustomers.bind(this),
		);

		this.router.get('/:id', this.getCustomerById.bind(this));
		this.router.get(
			'/:id/loyalty-transactions',
			this.getLoyaltyTransactions.bind(this),
		);
		this.router.get(
			'/:id/completed-orders',
			this.getCompletedOrders.bind(this),
		);
		this.router.get(
			'/:id/pending-orders',
			this.getPendingOrders.bind(this),
		);
		this.router.post('/', this.createCustomer.bind(this));

		this.router.post(
			'/bulk-upload',
			upload.single('file'),
			this.bulkUpload.bind(this),
		);
		this.router.patch('/:id', this.updateCustomer.bind(this));
		this.router.delete('/:id', this.deleteCustomer.bind(this));
		this.router.post('/send-template', this.sendTemplate.bind(this));

		return this.router;
	}

	public async getAllCustomers(req: Request, res: Response) {
		const { data, message } = await customerService.getAllCustomers(
			req.query,
		);

		// Optionally validate outgoing data
		const validatedResponse = getAllCustomersResponseSchema.parse({
			data,
			message,
		});

		res.locals = validatedResponse;
		super.send(res);
	}

	public async getCustomerById(req: Request, res: Response) {
		const { id } = req.params;
		const { userId } = req.query;

		const { data, message } = await customerService.getCustomerById(
			id,
			userId ? String(userId) : undefined,
		);

		res.locals = { data, message };
		super.send(res);
	}

	public async getLoyaltyTransactions(req: Request, res: Response) {
		const { id } = req.params; // customerMaster.id (UUID)
		const { page, limit, sortBy, sortOrder, search } = req.query;

		const { data, message } = await customerService.getLoyaltyTransactions({
			customerID: String(id),
			page: Number(page) || 1,
			limit: Number(limit) || 10,
			sortBy: sortBy ? String(sortBy) : undefined,
			sortOrder: sortOrder ? String(sortOrder).toUpperCase() : 'DESC',
			search: search ? String(search) : undefined,
		});

		res.locals = { data, message };
		super.send(res);
	}

	public async getCompletedOrders(req: Request, res: Response) {
		const { id } = req.params;
		const { page, limit, sortBy, sortOrder, search } = req.query;

		const { data, message } = await customerService.getOrdersByStatus({
			customerID: String(id),
			page: Number(page) || 1,
			limit: Number(limit) || 10,
			sortBy: sortBy ? String(sortBy) : undefined,
			sortOrder: sortOrder ? String(sortOrder).toUpperCase() : 'DESC',
			search: search ? String(search) : undefined,
			status: 'completed',
		});

		res.locals = { data, message };
		super.send(res);
	}

	public async getPendingOrders(req: Request, res: Response) {
		const { id } = req.params;
		const { page, limit, sortBy, sortOrder, search } = req.query;

		const { data, message } = await customerService.getOrdersByStatus({
			customerID: String(id),
			page: Number(page) || 1,
			limit: Number(limit) || 10,
			sortBy: sortBy ? String(sortBy) : undefined,
			sortOrder: sortOrder ? String(sortOrder).toUpperCase() : 'DESC',
			search: search ? String(search) : undefined,
			status: 'pending', // internally means != 'completed'
		});

		res.locals = { data, message };
		super.send(res);
	}

	public async createCustomer(req: Request, res: Response) {
		const { userId } = req.query;

		const result = await db.transaction(async (tx) => {
			return await customerService.createCustomer(
				req.body,
				userId ? String(userId) : undefined,
				tx,
			);
		});

		res.locals = result;
		super.send(res);
	}

	public async updateCustomer(req: Request, res: Response) {
		const { id } = req.params;
		const { userId } = req.query;

		const result = await db.transaction(async (tx) => {
			return await customerService.updateCustomer(
				id,
				req.body,
				userId ? String(userId) : undefined,
				tx,
			);
		});

		res.locals = result;
		super.send(res);
	}

	public async deleteCustomer(req: Request, res: Response) {
		const { id } = req.params;
		const { userId } = req.query;

		const result = await db.transaction(async (tx) => {
			return await customerService.deleteCustomer(
				id,
				userId ? String(userId) : undefined,
				tx, // pass transaction here
			);
		});

		res.locals = result;
		super.send(res);
	}

	public async bulkUpload(req: Request, res: Response) {
		const { userId } = req.query;
		const file = req.file;

		if (!file) {
			throw new AppError('No file provided', StatusCodes.BAD_REQUEST);
		}

		const result = await db.transaction(async (tx) => {
			return await customerService.bulkUploadCustomers(
				file,
				userId ? String(userId) : undefined,
				tx, // 👈 pass transaction
			);
		});

		res.locals = result;
		super.send(res);
	}

	public async downloadTemplate(req: Request, res: Response) {
		const buffer = await buildCustomersTemplate();

		res.setHeader(
			'Content-Type',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		);
		res.setHeader(
			'Content-Disposition',
			'attachment; filename="customers_template.xlsx"',
		);

		res.status(200).send(buffer);
	}

	public async sendTemplate(req: Request, res: Response) {
		const { phoneNumber } = req.body;
		if (!phoneNumber) {
			throw new AppError(
				'Missing required field: phoneNumber',
				StatusCodes.BAD_REQUEST,
			);
		}

		const { data, message } = await customerService.sendTemplateMessage(
			String(phoneNumber),
		);

		res.locals = { data, message };
		super.send(res);
	}
}
