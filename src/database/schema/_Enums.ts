import { pgEnum } from 'drizzle-orm/pg-core';

// User roles - customize based on your application needs
export const userRoleEnum = pgEnum('user_role', [
	'ADMIN',
	'USER',
	'MODERATOR',
	'VIEWER',
]);
export type RoleType = (typeof userRoleEnum.enumValues)[number];
