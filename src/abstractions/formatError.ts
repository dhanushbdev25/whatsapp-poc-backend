import { NextFunction } from 'express';
import { z, ZodError } from 'zod/v4';

export class AppGlobalError extends Error {
	public statusCode: number;
	public stackErr?: string;

	constructor(message: string, statusCode: number, stackErr?: string) {
		super(message);
		this.statusCode = statusCode;
		this.stackErr = stackErr;

		Object.setPrototypeOf(this, AppGlobalError.prototype);
		Error.captureStackTrace(this, this.constructor);
	}
}

export default function formatError(
	next: NextFunction,
	err: any,
	errorMessage = 'Validation Error',
) {
	if (err instanceof ZodError) {
		const flattened = z.flattenError(err);
		return next(
			new AppGlobalError(errorMessage, 400, JSON.stringify(flattened)),
		);
	}

	// If err is already AppError or AppGlobalError, use its properties; otherwise default to 500
	const message = err.message || 'Internal Server Error';
	const statusCode = err.statusCode || 500;
	const stackErr = err.stack || undefined;

	return next(new AppGlobalError(message, statusCode, stackErr));
}
