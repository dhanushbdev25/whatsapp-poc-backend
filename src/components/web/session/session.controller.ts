import { NextFunction, Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import BaseApi from '../../BaseApi';

export default class SessionController extends BaseApi {
	constructor() {
		super();
	}

	public register(): Router {
		this.router.get('/', this.fetchProfile.bind(this));
		return this.router;
	}

	public async fetchProfile(
		req: Request,
		res: Response,
		_next: NextFunction,
	) {
		res.locals.data = req.user_details;
		res.locals.message = 'Session Data Fetched Successfully';

		super.send(res, StatusCodes.OK);
	}
}
