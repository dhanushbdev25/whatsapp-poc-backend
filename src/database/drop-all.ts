import { sql } from 'drizzle-orm';
import { db, closeConnection } from './index';
import env from '@/env';
import logger from '@/lib/logger';

(async () => {
	if (!env.DB_MIGRATING) {
		throw new Error(
			'Set "DB_MIGRATING=true" when dropping tables. Contact a developer if you are unsure.',
		);
	}

	logger.info('DROPPING ALL TABLES');

	try {
		// Drop all tables in the public schema
		await db.execute(
			sql.raw(`
			DO $$ 
			DECLARE 
				r RECORD;
			BEGIN
				-- Drop all tables in public schema
				FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') 
				LOOP
					EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
				END LOOP;
				
				-- Drop all tables in drizzle schema
				FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'drizzle') 
				LOOP
					EXECUTE 'DROP TABLE IF EXISTS drizzle.' || quote_ident(r.tablename) || ' CASCADE';
				END LOOP;
			END $$;
		`),
		);

		// Drop all custom types
		await db.execute(
			sql.raw(`
			DO $$ 
			DECLARE 
				r RECORD;
			BEGIN
				FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND typtype = 'e') 
				LOOP
					EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
				END LOOP;
			END $$;
		`),
		);

		logger.info('✅ All tables and types dropped successfully');
	} catch (error) {
		logger.error('❌ Error dropping tables:', error);
		throw error;
	} finally {
		await closeConnection();
	}
})();
