import { defineConfig } from 'drizzle-kit';
import env from './src/env';

export default defineConfig({
	schema: './src/database/schema/index.ts',
	out: './src/database/migrations',
	dialect: 'postgresql',
	dbCredentials: {
		host: env.DB_IP,
		port: Number(env.DB_PORT),
		user: env.DB_USER,
		password: env.DB_PASSWORD,
		database: env.DB_DATABASE,
		ssl:
			env.NODE_ENV !== 'local'
				? { rejectUnauthorized: false }
				: undefined,
	},
	verbose: true,
	strict: true,
	casing: 'snake_case',
	migrations: {
		prefix: 'timestamp',
	},
});
