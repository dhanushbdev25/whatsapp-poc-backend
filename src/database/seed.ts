import readline from 'node:readline';
import chalk from 'chalk';
import { Table, getTableName, sql } from 'drizzle-orm';
import * as seeds from './seeds';
import { db, closeConnection, type dbConnection } from '@/database';
import * as schema from '@/database/schema';
import env from '@/env';
import logger from '@/lib/logger';

(async () => {
	if (!env.DB_SEEDING) {
		throw new Error(
			'Set "DB_SEEDING=true" when running seeds. Contact a developer if you are unsure.',
		);
	}

	if (env.NODE_ENV === 'prod') {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		console.log(
			chalk.bgRed.white.bold(
				'\n\n\n ⚠️  PRODUCTION SEEDING CHECKLIST ⚠️   \n',
			),
		);

		console.log(
			chalk.yellow('1.') +
				' Have you checked the seed script and data and know exactly what you are doing?',
		);
		console.log(
			chalk.yellow('2.') +
				' Did you ensure no irrelevant table will be truncated?',
		);
		console.log(
			chalk.yellow('3.') +
				' Are you 100% sure you want to continue? ' +
				chalk.red.bold('Because the damage could be irreversible.\n'),
		);

		const answer = await new Promise<string>((resolve) => {
			rl.question(
				chalk.bgYellow.black(' Type "YES" to confirm and continue: '),
				resolve,
			);
		});

		rl.close();

		if (answer.trim().toUpperCase() !== 'YES') {
			console.log('❌ Seeding aborted.');
			process.exit(0);
		}
	}

	async function resetTable(database: dbConnection, table: Table) {
		return database.execute(
			sql.raw(
				`TRUNCATE TABLE ${getTableName(table)} RESTART IDENTITY CASCADE`,
			),
		);
	}

	for (const table of [
		schema.roles,
		schema.permissions,
		schema.rolePermissions,
		schema.userRoles,
		schema.users,
	]) {
		// await db.delete(table); // clear tables without truncating / resetting ids
		await resetTable(db, table);
	}

	await seeds.roles(db);
	logger.debug('✅ Roles seeded');

	await seeds.permissions(db);
	logger.debug('✅ Permissions seeded');

	await seeds.rolePermissions(db);
	logger.debug('✅ Role–Permission mappings seeded');

	await seeds.users(db);
	logger.debug('✅ Users and UserRoles seeded');

	logger.info('🎉 All seeds completed successfully!');

	await closeConnection();
})();
