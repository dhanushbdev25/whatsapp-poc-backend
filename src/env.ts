import path from 'path';
import { config } from 'dotenv';
import { z } from 'zod/v4';
import { EnvErrorLoggger } from './utils/chalk';

const envMap = {
	prod: '.env.prod',
	dev: '.env.dev',
	test: '.env.qass',
	uat: '.env.uat',
	qas: '.env.qas',
	local: '.env.local',
};

const nodeEnv = (process.env.NODE_ENV?.trim() || 'local').toLowerCase();
const envFile = envMap[nodeEnv] || '.env.local';

config({ path: path.resolve(process.cwd(), envFile) });

const stringBoolean = z
	.string()
	.transform((val) => {
		return val === 'true';
	})
	.default(false);

const envSchema = z.object({
	APPLICATION_NAME: z.string(),
	NODE_ENV: z
		.string()
		.transform((v) => (v?.trim() ? v.trim() : 'local'))
		.pipe(z.enum(['local', 'dev', 'prod', 'test', 'uat', 'qas'])),

	PORT: z.coerce.number().default(8080),
	APP_URI: z.url(),
	APP_URI_BACKEND: z.url(),

	DB_USER: z.string(),
	DB_PASSWORD: z.string(),
	DB_DATABASE: z.string(),
	DB_IP: z.string(),
	DB_PORT: z.coerce.number().default(5432),
	DB_DIALECT: z
		.enum(['postgres', 'mysql', 'mariadb', 'sqlite', 'mssql'])
		.default('postgres'),
	DB_SSL_REQUIRED: stringBoolean,

	JWT_SECRET: z.string(),
	JWT_EXPIRES_IN: z.string(),
	JWT_REFRESH_SECRET: z.string(),

	AZURE_STORAGE_ACCOUNT_NAME: z.string(),
	AZURE_STORAGE_ACCOUNT_KEY: z.string(),
	AZURE_STORAGE_CONTAINER: z.string(),
	AZURE_STORAGE_CONNECTION_STRING: z.string(),

	COOKIE_DOMAIN: z.string().optional(),

	AUTH_MODE: z.enum(['cookie', 'localStorage']).optional().default('cookie'),

	DB_MIGRATING: stringBoolean,
	DB_SEEDING: stringBoolean,

	WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string(),
	WHATSAPP_ACCESS_TOKEN: z.string(),
	WHATSAPP_PHONE_NUMBER_ID: z.string(),
	WHATSAPP_API_VERSION: z.string().optional(),
	TZ: z.string().default('UTC'),

	STRIPE_SECRET_KEY: z.string().optional(),
	STRIPE_PUBLISHABLE_KEY: z.string().optional(),
});

export function initEnv() {
	try {
		const validatedEnv = envSchema.parse(process.env);

		// Set Node.js timezone (system-level setting)
		// This must be set before any date operations
		if (process.env.TZ !== validatedEnv.TZ) {
			process.env.TZ = validatedEnv.TZ;
		}

		return validatedEnv;
	} catch (err) {
		if (err instanceof z.ZodError) {
			EnvErrorLoggger(z.prettifyError(err));

			process.exit(1);
		}
	}
}

export default initEnv();
