import http from 'http';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { testConnection } from './database';
import { formatUptime } from './utils/general';
import env from '@/env';
import { initLogWatcher } from '@/lib/watcher';
import addErrorHandler from '@/middleware/error-handler';
import requestLogger from '@/middleware/requestLogger';
import { RoleBaseAccess } from '@/middleware/roleBasesAccess';
import webPostAuthRoutes from '@/routes/web/webPostAuthRoutes';
import webPreAuthRoutes from '@/routes/web/webPreAuthRoutes';
import { errorResponse } from '@/utils/responseFormatter';
export default class App {
	public express: express.Application;

	public httpServer: http.Server;

	public connection: void;

	public async init(): Promise<void> {
		this.express = express();
		this.httpServer = http.createServer(this.express);

		// add all global middleware like cors
		this.middleware();

		this.preAuthRoutes();

		RoleBaseAccess.init();

		// register the all routes
		this.protectedRoutes();

		this.unhandlerRoute();

		// add the middleware to handle error, make sure to add if after registering routes method
		this.express.use(addErrorHandler);

		// Blob Logger Initiate
		this.loggerWatcher();
	}

	private preAuthRoutes(): void {
		// General
		this.express.get('/', this.healthRoute);

		// Mobileroutes

		// Web
		this.express.use('/web', webPreAuthRoutes());

		// Health Check
		this.express.use('/health-check', this.healthRoute);
	}

	private protectedRoutes(): void {
		// Web
		this.express.use('/web', webPostAuthRoutes());
	}

	private middleware(): void {
		// Security headers
		this.express.use(helmet({ contentSecurityPolicy: false }));

		this.express.use(cookieParser());

		// Body parsing
		this.express.use(express.json({ limit: '10000mb' }));
		this.express.use(
			express.urlencoded({ limit: '10000mb', extended: true }),
		);
		// add multiple cors options as per your use
		const corsOptions = {
			origin: [env.APP_URI],
			credentials: true,
		};
		this.express.use(cors(corsOptions));

		this.express.use((req, res, next) => {
			res.set('Cross-Origin-Resource-Policy', 'cross-origin');
			next();
		});

		// Request/Response logging middleware (after body parsing to access req.body)
		this.express.use(requestLogger);
	}

	private unhandlerRoute(): void {
		this.express.use((req, res) => {
			const errorResp = errorResponse(
				`Can't find ${req.originalUrl} on this server!!!`,
				undefined,
				404,
			);
			res.status(404).json(errorResp);
		});
	}

	private readonly healthRoute = async (
		_req: express.Request,
		res: express.Response,
	) => {
		const health = {
			uptime: formatUptime(process.uptime()),
			timestamp: new Date().toISOString(),
			status: 'ok' as const,
			checks: { db: 'ok' },
		};

		try {
			await testConnection();
			health.checks.db = 'ok';
		} catch {
			health.checks.db = 'error';
			return res.status(503).json(health);
		}

		return res.json(health);
	};

	private async loggerWatcher() {
		initLogWatcher();
	}
}
