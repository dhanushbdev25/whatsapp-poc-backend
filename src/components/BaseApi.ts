import { Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { successResponse } from '@/utils/responseFormatter';

export default abstract class BaseApi {
	protected router: Router;

	protected constructor() {
		this.router = Router();
	}

	public abstract register(): void;

	public send(res: Response, statusCode: number = StatusCodes.OK): void {
		const data = res.locals.data ?? {};
		const message = res.locals.message;

		// If data already has a success property, use it as-is (for backward compatibility)
		// Otherwise, format it using the response formatter
		let response;
		if (
			typeof data === 'object' &&
			data !== null &&
			'success' in data &&
			'timestamp' in data
		) {
			// Already formatted response
			response = data;
		} else {
			// Format using response formatter
			response = successResponse(data, message, statusCode);
		}

		res.status(statusCode).json(response);
	}
}
