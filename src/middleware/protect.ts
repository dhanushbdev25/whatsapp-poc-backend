import { eq, and, inArray } from 'drizzle-orm';
import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import AppError from '@/abstractions/AppError';
import { db } from '@/database';
import {
	users,
	userRoles,
	roles,
	permissions,
	rolePermissions,
} from '@/database/schema';
import { safeJwtVerify } from '@/utils/validations';

export type UserDetailsType = {
	id: string;
	name: string;
	email: string;
	roleId: number;
	roleName: string;
	permissions: string[];
};

type AccessTokenType = {
	userId: string;
	name: string;
	email: string;
	roleId: number;
};

const protect = async (req: Request, res: Response, next: NextFunction) => {
	let token = req.cookies['accessToken'];

	if (!token && req.headers.authorization?.startsWith('Bearer ')) {
		token = req.headers.authorization.split(' ')[1];
	}

	if (!token) {
		throw new AppError(
			'Authentication token missing',
			StatusCodes.UNAUTHORIZED,
		);
	}

	const result = safeJwtVerify<AccessTokenType>(token);

	if (!result.success) {
		throw new AppError(
			'Authentication token missing',
			StatusCodes.UNAUTHORIZED,
		);
	}

	const decoded = result.data;

	// Get user with default role
	const [user] = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			roleId: roles.id,
			roleName: roles.name,
		})
		.from(users)
		.innerJoin(userRoles, eq(userRoles.userId, users.id))
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(and(eq(users.id, decoded.userId), eq(userRoles.isDefault, true)))
		.limit(1)
		.execute();

	if (!user) {
		throw new AppError(
			'Invalid session, please login again',
			StatusCodes.UNAUTHORIZED,
		);
	}

	// Get all user roles to aggregate permissions
	const allUserRoles = await db
		.select({ roleId: userRoles.roleId })
		.from(userRoles)
		.where(eq(userRoles.userId, decoded.userId))
		.execute();

	const roleIds = allUserRoles.map((ur) => ur.roleId);

	// Get permissions from all user roles in a single query
	const allUserPermissions =
		roleIds.length > 0
			? await db
					.select({ code: permissions.code })
					.from(rolePermissions)
					.innerJoin(
						permissions,
						eq(permissions.id, rolePermissions.permissionId),
					)
					.where(inArray(rolePermissions.roleId, roleIds))
					.execute()
			: [];

	// Deduplicate permissions
	const uniquePerms = Array.from(
		new Set(allUserPermissions.map((p) => p.code)),
	);

	req.user_details = {
		...user,
		permissions: uniquePerms,
	};

	next();
};
export default protect;
