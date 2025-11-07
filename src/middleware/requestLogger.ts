import { NextFunction, Request, Response } from 'express';
import logger from '@/lib/logger';

interface RequestLogData {
	method: string;
	url: string;
	statusCode: number;
	responseTime: number; // milliseconds
	ip: string;
	userAgent?: string;
	userId?: string;
	timestamp: string;
}

/**
 * Routes that should be excluded from detailed logging
 */
const EXCLUDED_ROUTES = ['/health-check', '/'];

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
	return (
		(req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
		(req.headers['x-real-ip'] as string) ||
		req.socket.remoteAddress ||
		'unknown'
	);
}

/**
 * Sanitize request body to remove sensitive information
 */
function sanitizeRequestBody(body: any): any {
	if (!body || typeof body !== 'object') {
		return body;
	}

	const sensitiveFields = [
		'password',
		'token',
		'accessToken',
		'refreshToken',
		'secret',
		'authorization',
	];
	const sanitized = { ...body };

	for (const field of sensitiveFields) {
		if (field in sanitized) {
			sanitized[field] = '[REDACTED]';
		}
	}

	return sanitized;
}

/**
 * Request/Response logging middleware with timing
 */
export function requestLogger(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	// Skip logging for excluded routes
	if (EXCLUDED_ROUTES.includes(req.path)) {
		return next();
	}

	// Capture request start time
	const startTime = Date.now();

	// Store original end function
	const originalEnd = res.end;

	// Override res.end to capture response completion
	res.end = function (
		chunk?: any,
		encoding?: BufferEncoding | (() => void),
		cb?: () => void,
	): Response {
		// Calculate response time
		const responseTime = Date.now() - startTime;

		// Get client information
		const ip = getClientIp(req);
		const userAgent = req.headers['user-agent'];
		const userId = req.user_details?.id;

		// Prepare log data
		const logData: RequestLogData = {
			method: req.method,
			url: req.originalUrl || req.url,
			statusCode: res.statusCode,
			responseTime,
			ip,
			timestamp: new Date().toISOString(),
		};

		if (userAgent) {
			logData.userAgent = userAgent;
		}

		if (userId) {
			logData.userId = userId;
		}

		// Log based on status code
		if (res.statusCode >= 500) {
			// Server errors
			logger.error('HTTP Request', {
				...logData,
				requestBody: sanitizeRequestBody(req.body),
				requestQuery: req.query,
			});
		} else if (res.statusCode >= 400) {
			// Client errors
			logger.warn('HTTP Request', {
				...logData,
				requestBody: sanitizeRequestBody(req.body),
				requestQuery: req.query,
			});
		} else {
			// Success responses
			logger.info('HTTP Request', logData);
		}

		// Call original end function and return its result
		return originalEnd.call(this, chunk, encoding, cb);
	};

	next();
}

export default requestLogger;
