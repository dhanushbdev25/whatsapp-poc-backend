import { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer from 'multer';
import BaseApi from '../../../../components/BaseApi';
import { customerService } from './customerMaster.service';
import AppError from '@/abstractions/AppError';
import { buildCustomersTemplate } from '@/utils/excelCustomers';

export default class CustomerController extends BaseApi {
	constructor() {
		super();
	}

	public register(): Router {
		const upload = multer({ storage: multer.memoryStorage() });

		this.router.get('/template', this.downloadTemplate.bind(this));

		this.router.get('/', this.getAllCustomers.bind(this));
		this.router.get('/:id', this.getCustomerById.bind(this));
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
		const { data, message } = await customerService.getAllCustomers();

		res.locals = { data, message };
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

	public async createCustomer(req: Request, res: Response) {
		const { userId } = req.query;

		const { data, message } = await customerService.createCustomer(
			req.body,
			userId ? String(userId) : undefined,
		);

		res.locals = { data, message };
		super.send(res);
	}

	public async updateCustomer(req: Request, res: Response) {
		const { id } = req.params;
		const { userId } = req.query;

		const { data, message } = await customerService.updateCustomer(
			id,
			req.body,
			userId ? String(userId) : undefined,
		);

		res.locals = { data, message };
		super.send(res);
	}

	public async deleteCustomer(req: Request, res: Response) {
		const { id } = req.params;
		const { userId } = req.query;

		const { data, message } = await customerService.deleteCustomer(
			id,
			userId ? String(userId) : undefined,
		);

		res.locals = { data, message };
		super.send(res);
	}

	public async bulkUpload(req: Request, res: Response) {
		const { userId } = req.query;
		const file = req.file;
		if (!file) {
			throw new AppError('No file provided', StatusCodes.BAD_REQUEST);
		}

		const { data, message } = await customerService.bulkUploadCustomers(
			file,
			userId ? String(userId) : undefined,
		);

		res.locals = { data, message };
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
