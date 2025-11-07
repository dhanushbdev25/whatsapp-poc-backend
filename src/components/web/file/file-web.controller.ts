import { createReadStream } from 'fs';
import path from 'path';
import { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';
import BaseApi from '../../BaseApi';
import AppError from '@/abstractions/AppError';
import env from '@/env';
import logger from '@/lib/logger';
import { fileHandlerService } from '@/utils/fileUploadBlob';
import { errorResponse } from '@/utils/responseFormatter';

export default class FileWebController extends BaseApi {
	constructor() {
		super();
	}

	public register(): Router {
		this.router.get('/:folderName/:filename', this.fetchFile.bind(this));

		return this.router;
	}

	public async fetchFile(req: Request, res: Response) {
		const { folderName, filename } = req.params;

		if (!folderName || !filename) {
			throw new AppError(
				`Missing required parameters`,
				StatusCodes.BAD_REQUEST,
			);
		}

		// Configure folder access - customize based on your needs
		const accessConfig = {
			protected: [] as string[], // Add folder names that require authentication
			public: [] as string[], // Add folder names that are publicly accessible
		};

		const isProtected = accessConfig.protected?.includes(folderName);
		const isPublic = accessConfig.public?.includes(folderName);

		// Handle unknown folderName
		if (!isProtected && !isPublic) {
			throw new AppError(
				`Unauthorized folder access`,
				StatusCodes.BAD_REQUEST,
			);
		}

		try {
			if (isProtected) {
				const token =
					req.cookies['accessToken'] ??
					req.headers?.authorization?.split(' ')[1];

				jwt.verify(token, env.JWT_SECRET);
			}
		} catch (err) {
			logger.error('Error in JWT', err);

			throw new AppError(
				`You're session has expired, Please re-login into the portal.`,
				StatusCodes.UNAUTHORIZED,
			);
		}

		const { stream, contentLength, contentType } =
			await fileHandlerService.fileStreamProxy(filename, folderName);

		res.setHeader('Content-Type', contentType);
		const [, ...parts] = filename.split('_');
		const actualFileName = parts.join('_');
		res.setHeader(
			'Content-Disposition',
			`attachment; filename="${actualFileName}"`,
		);

		res.setHeader('Cache-Control', 'public, max-age=86400');

		if (contentLength) {
			res.setHeader('Content-Length', contentLength.toString());
		}

		stream.on('error', (streamErr) => {
			logger.error(`Stream error:`, streamErr);
			if (!res.headersSent) {
				const errorResp = errorResponse(
					'Image Not Found',
					undefined,
					StatusCodes.NOT_FOUND,
				);
				res.status(StatusCodes.NOT_FOUND).json(errorResp);
			}
		});

		stream.pipe(res);
	}

	private serveFallbackImage(res: Response) {
		const noImagePath = path.join(
			__dirname,
			'../../../assets/no-image.jpg',
		);

		try {
			res.setHeader('Content-Type', 'image/jpeg');
			createReadStream(noImagePath).pipe(res);
		} catch (fallbackErr) {
			logger.error('Fallback failed:', fallbackErr);
			if (!res.headersSent) {
				res.status(500).send('Internal Server Error');
			}
		}
	}
}
