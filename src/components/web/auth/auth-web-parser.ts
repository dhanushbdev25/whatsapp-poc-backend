import { z } from 'zod/v4';

const Zerror = (issue: any, name: string, type: string) =>
	issue?.input === undefined
		? `${name} is required`
		: `${name} must be a ${type}`;

const EmailValidator = z
	.email({ error: (issue) => Zerror(issue, 'Email', 'email') })
	.trim();

const PasswordValidator = z.string({
	error: (issue) => Zerror(issue, 'Password', 'string'),
});

export const LoginWebPostParser = z.object({
	email: EmailValidator,
	password: PasswordValidator,
});
