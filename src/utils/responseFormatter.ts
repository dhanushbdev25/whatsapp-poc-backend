import { StatusCodes } from 'http-status-codes';

export interface SuccessResponse<T = any> {
	success: true;
	data?: T;
	message?: string;
	timestamp: string;
}

export interface ErrorResponse {
	success: false;
	message: string;
	errors?: Record<string, string[]>;
	timestamp: string;
}

/**
 * Format a successful API response
 * @param data - The data to include in the response
 * @param message - Optional success message
 * @param statusCode - Optional HTTP status code (defaults to 200)
 * @returns Formatted success response object
 */
export function successResponse<T = any>(
	data?: T,
	message?: string,
	_statusCode: number = StatusCodes.OK,
): SuccessResponse<T> {
	const response: SuccessResponse<T> = {
		success: true,
		timestamp: new Date().toISOString(),
	};

	if (data !== undefined) {
		response.data = data;
	}

	if (message) {
		response.message = message;
	}

	return response;
}

/**
 * Format an error API response
 * @param message - Error message
 * @param errors - Optional validation errors object
 * @param statusCode - Optional HTTP status code (defaults to 400)
 * @returns Formatted error response object
 */
export function errorResponse(
	message: string,
	errors?: Record<string, string[]>,
	_statusCode: number = StatusCodes.BAD_REQUEST,
): ErrorResponse {
	const response: ErrorResponse = {
		success: false,
		message,
		timestamp: new Date().toISOString(),
	};

	if (errors && Object.keys(errors).length > 0) {
		response.errors = errors;
	}

	return response;
}
