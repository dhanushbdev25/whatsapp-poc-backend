import jwt from 'jsonwebtoken';
import env from '@/env';

export const isMobileNumber = (value: any) => {
	// Regex for validating a mobile number (basic 10 digits, adjust if needed)
	const mobileRegex = /^\d{9,}$/;
	return mobileRegex.test(value);
};

export const isEmail = (value: any) => {
	// Regex for validating a simple email format
	const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
	return emailRegex.test(value);
};

export const generateRefCode = (length: number) => {
	const characters =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	const charactersLength = characters.length;
	for (let i = 0; i < length; i += 1) {
		result += characters.charAt(
			Math.floor(Math.random() * charactersLength),
		);
	}
	return result;
};

type Result<T> =
	| { success: true; data: T }
	| { success: false; error: unknown };

export function safeJwtVerify<T>(token: string): Result<T> {
	try {
		const decoded = jwt.verify(token, env.JWT_SECRET) as T;
		return { success: true, data: decoded };
	} catch (err) {
		return { success: false, error: err };
	}
}

export const Zerror = (issue: any, name: string, type: string) =>
	issue?.input === undefined
		? `${name} is required`
		: `${name} must be a ${type}`;
