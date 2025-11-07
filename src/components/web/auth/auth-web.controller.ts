import { eq, and } from 'drizzle-orm';
import { Router, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';
import { LoginWebPostParser } from './auth-web-parser';
import {
	getUserProfileFromMicrosoft,
	issueTokens,
	verifyPassword,
} from './authUtils';
import AppError from '@/abstractions/AppError';
import BaseApi from '@/components/BaseApi';
import { db } from '@/database';
import { users, userRoles, roles, SelectUserType } from '@/database/schema';
import env from '@/env';

export default class AuthWebController extends BaseApi {
	constructor() {
		super();
	}

	public register(): Router {
		this.router.post('/login', this.loginUser.bind(this));
		this.router.get('/refresh', this.refreshToken.bind(this));
		this.router.post('/logout', this.logoutUser.bind(this));
		return this.router;
	}

	public async loginUser(req: Request, res: Response) {
		const bearerToken = req.headers.authorization?.split(' ')[1];
		let user: SelectUserType;

		// A) Azure token login
		if (bearerToken && bearerToken !== 'undefined') {
			user = await this.handleAzureLogin(bearerToken);
		}

		// B) Local login
		else if (req.body) {
			const result = LoginWebPostParser.safeParse(req.body);
			if (!result.success) throw result.error;

			const { email, password } = result.data;
			const [userRecord] = await db
				.select()
				.from(users)
				.where(eq(users.email, email))
				.execute();

			if (!userRecord?.id)
				throw new AppError(
					'Incorrect Email/Password',
					StatusCodes.BAD_REQUEST,
				);

			if (!userRecord.passwordHash) {
				throw new AppError(
					'Incorrect Email/Password',
					StatusCodes.BAD_REQUEST,
				);
			}

			const isValid = await verifyPassword(
				password,
				userRecord.passwordHash,
			);

			if (!isValid)
				throw new AppError(
					'Incorrect Email/Password',
					StatusCodes.BAD_REQUEST,
				);
			if (!userRecord.isActive)
				throw new AppError(
					'Your account is inactive',
					StatusCodes.BAD_REQUEST,
				);

			user = userRecord;
		} else {
			throw new AppError(
				'Missing credentials: expected Azure token or email/password.',
				StatusCodes.BAD_REQUEST,
			);
		}

		// Get default role for the user
		const [defaultUserRole] = await db
			.select({
				roleId: userRoles.roleId,
			})
			.from(userRoles)
			.where(
				and(
					eq(userRoles.userId, user.id),
					eq(userRoles.isDefault, true),
				),
			)
			.limit(1)
			.execute();

		if (!defaultUserRole) {
			throw new AppError(
				'User has no default role assigned',
				StatusCodes.INTERNAL_SERVER_ERROR,
			);
		}

		const { accessToken, refreshToken } = issueTokens(
			user,
			defaultUserRole.roleId,
		);

		const domain = env.NODE_ENV !== 'local' ? env.COOKIE_DOMAIN : undefined;

		res.cookie('accessToken', accessToken, {
			httpOnly: false,
			domain,
			secure: env.NODE_ENV !== 'local',
			sameSite: env.NODE_ENV !== 'local' ? 'none' : undefined,
			maxAge: 30 * 60 * 1000,
		});

		res.cookie('refreshToken', refreshToken, {
			httpOnly: true,
			domain,
			secure: env.NODE_ENV !== 'local',
			sameSite: env.NODE_ENV !== 'local' ? 'none' : undefined,
			maxAge: 7 * 24 * 60 * 60 * 1000,
		});

		res.locals.data = {};
		res.locals.message = 'Login Successful';
		super.send(res);
	}

	private async handleAzureLogin(
		bearerToken: string,
	): Promise<SelectUserType> {
		const azureUser = await getUserProfileFromMicrosoft(bearerToken);
		if (!azureUser)
			throw new AppError('Invalid Azure token', StatusCodes.UNAUTHORIZED);

		const email =
			azureUser.mail.toLocaleLowerCase() ||
			azureUser.userPrincipalName.toLocaleLowerCase();

		const [existingUser] = await db
			.select()
			.from(users)
			.where(eq(users.email, email));

		if (existingUser) return existingUser;

		// Get the first available role as default for new users
		const [defaultRole] = await db
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.isActive, true))
			.limit(1);

		if (!defaultRole) {
			throw new AppError(
				'No active roles found in the system',
				StatusCodes.INTERNAL_SERVER_ERROR,
			);
		}

		const defaultRoleId = defaultRole.id;

		const [newUser] = await db
			.insert(users)
			.values({
				name: azureUser.displayName,
				email,
				// azureId: azureUser.id,
				isActive: true,
			})
			.returning();

		// Create user-role mapping with isDefault=true
		await db.insert(userRoles).values({
			userId: newUser.id,
			roleId: defaultRoleId,
			isDefault: true,
		});

		return newUser;
	}

	private async refreshToken(req: Request, res: Response) {
		const refreshToken =
			req.cookies['refreshToken'] ?? req.body.refreshToken;

		if (!refreshToken) {
			throw new AppError('Refresh token missing', 401);
		}

		const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as {
			userId: string;
		};

		const [userInfo] = await db
			.select()
			.from(users)
			.where(eq(users.id, decoded.userId))
			.execute();

		if (!userInfo) {
			throw new AppError('Invalid refresh token', 401);
		}

		// Get default role for the user
		const [defaultUserRole] = await db
			.select({
				roleId: userRoles.roleId,
			})
			.from(userRoles)
			.where(
				and(
					eq(userRoles.userId, userInfo.id),
					eq(userRoles.isDefault, true),
				),
			)
			.limit(1)
			.execute();

		if (!defaultUserRole) {
			throw new AppError(
				'User has no default role assigned',
				StatusCodes.INTERNAL_SERVER_ERROR,
			);
		}

		const accessToken = jwt.sign(
			{
				userId: userInfo.id,
				name: userInfo.name,
				email: userInfo.email,
				roleId: defaultUserRole.roleId,
			},
			env.JWT_SECRET,
			{ expiresIn: '15m' },
		);

		// Refresh token (long-lived)
		const newRefreshToken = jwt.sign(
			{ userId: userInfo.id },
			env.JWT_REFRESH_SECRET,
			{ expiresIn: '7d' },
		);

		const domain = env.NODE_ENV !== 'local' ? env.COOKIE_DOMAIN : undefined;
		res.cookie('accessToken', accessToken, {
			httpOnly: false,
			domain,
			sameSite: env.NODE_ENV !== 'local' ? 'none' : undefined,
			secure: env.NODE_ENV !== 'local',
			maxAge: 30 * 60 * 1000,
		});

		res.cookie('refreshToken', newRefreshToken, {
			httpOnly: true,
			domain,
			sameSite: env.NODE_ENV !== 'local' ? 'none' : undefined,
			secure: env.NODE_ENV !== 'local',
			maxAge: 7 * 24 * 60 * 60 * 1000,
		});

		res.locals.data = {};
		res.locals.message = 'Tokens refreshed successfully';
		super.send(res);
	}

	public async logoutUser(req: Request, res: Response) {
		res.clearCookie('accessToken', {
			httpOnly: false,
			secure: env.NODE_ENV !== 'local',
			sameSite: 'strict',
		});

		res.clearCookie('refreshToken', {
			httpOnly: true,
			secure: env.NODE_ENV !== 'local',
			sameSite: 'strict',
		});

		res.locals.data = {};
		res.locals.message = 'Logged out successfully';
		super.send(res);
	}
}
