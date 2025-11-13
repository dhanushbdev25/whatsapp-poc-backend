import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgTransaction, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/database/schema";

export type DbOrTx =
	| NodePgDatabase<typeof schema>
	| PgTransaction<PgQueryResultHKT, typeof schema, any>;
