import * as express from 'express';
import { z, ZodError } from 'zod/v4';
import AppError from '@/abstractions/AppError';
import { AppGlobalError } from '@/abstractions/formatError';
import logger from '@/lib/logger';
import { errorResponse } from '@/utils/responseFormatter';

function tryParseJson(str: string) {
	try {
		return JSON.parse(str);
	} catch {
		return null;
	}
}

const addErrorHandler = (
	err: Error | AppGlobalError,
	req: express.Request,
	res: express.Response,
	next: express.NextFunction,
) => {
	if (res.headersSent) {
		return next(err);
	}

	// Convert ZodError, AppError, or regular Error to AppGlobalError if needed
	let appError: AppGlobalError;
	if (err instanceof ZodError) {
		// Format ZodError similar to formatError utility
		const flattened = z.flattenError(err);
		appError = new AppGlobalError(
			'Validation Error',
			400,
			JSON.stringify(flattened),
		);
	} else if (err instanceof AppError) {
		// Convert AppError to AppGlobalError preserving status code and message
		appError = new AppGlobalError(err.message, err.statusCode, err.stack);
	} else if (err instanceof AppGlobalError) {
		appError = err;
	} else {
		// Regular Error - convert to AppGlobalError
		appError = new AppGlobalError(
			err.message || 'Internal Server Error',
			500,
			err.stack,
		);
	}

	const parsedStackError = tryParseJson(appError.stackErr); // For Zod errors

	const statusCode = appError.statusCode || 500;
	const clientMessage =
		statusCode >= 500 ? 'Something went wrong' : appError.message;

	logger.error('API error', {
		message: appError.message || 'Internal Server Error',
		statusCode,
		request: {
			method: req.method,
			url: req.url,
			headers: req.headers,
			body: req.body,
		},
		userDetails: req?.user_details,
		parsedStackError,
		stack: appError.stack,
		actualStack: appError.stackErr,
	});

	const errorResp = errorResponse(
		clientMessage,
		parsedStackError?.fieldErrors,
		statusCode,
	);

	res.status(statusCode).json(errorResp);
};

export default addErrorHandler;
