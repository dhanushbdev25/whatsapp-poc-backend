import { StatusCodes } from 'http-status-codes';
import AppError from '@/abstractions/AppError';
import logger from '@/lib/logger';

/**
 * Service Error Handler Utility
 *
 * Handles errors in service layer catch blocks:
 * - Re-throws AppError instances (business logic errors)
 * - Logs unexpected errors with context
 * - Throws generic AppError for unexpected errors
 *
 * @param error - The error caught in the catch block
 * @param errorMessage - User-friendly error message to throw if error is unexpected
 * @param statusCode - HTTP status code for the error (defaults to 500)
 * @param logMessage - Message to log when error occurs (defaults to errorMessage)
 * @param context - Additional context to include in error logs
 * @throws AppError - Always throws an AppError (either re-thrown or newly created)
 *
 */
export function handleServiceError(
	error: unknown,
	errorMessage: string,
	statusCode?: number,
	logMessage?: string,
	context?: Record<string, unknown>,
): never {
	// Re-throw AppError instances (business logic errors should propagate)
	if (error instanceof AppError) {
		throw error;
	}

	// Use provided values or defaults
	const finalStatusCode = statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;
	const finalLogMessage = logMessage ?? errorMessage;

	// Log unexpected errors with context
	const errorContext: Record<string, unknown> = {
		...(context || {}),
		error: error instanceof Error ? error.message : 'Unknown error',
		stack: error instanceof Error ? error.stack : undefined,
	};

	logger.error(finalLogMessage, errorContext);

	// Throw AppError with specified status code
	throw new AppError(errorMessage, finalStatusCode);
}
