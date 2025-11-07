import { Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback, MulterError } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { errorResponse } from '@/utils/responseFormatter';

export interface MulterFile {
	fieldname: string;
	originalname: string;
	encoding: string;
	mimetype: string;
	size: number;
	buffer: Buffer;
	destination?: string;
	filename?: string;
	path?: string;
}

const memoryStorage = multer.memoryStorage();

export const allowedTypes = [
	// Images
	'image/jpeg',
	'image/png',
	'image/jpg',
	// PDF
	'application/pdf',
	// Word
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	// Excel
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	// PowerPoint
	'application/vnd.ms-powerpoint',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB per file

// Centralized filter
const fileFilter = (req: Request, file: MulterFile, cb: FileFilterCallback) => {
	if (!allowedTypes.includes(file.mimetype)) {
		return cb(new Error('Unsupported file type'));
	}
	cb(null, true);
};

// Single unified uploader
const upload = multer({
	storage: memoryStorage,
	limits: { fileSize: MAX_SIZE },
	fileFilter,
});

export const memoryUploadMiddleware = (
	req: Request,
	res: Response,
	next: NextFunction,
): void => {
	upload.any()(req, res, (err?: unknown) => {
		if (err instanceof MulterError) {
			const errorResp = errorResponse(err.message, undefined, 400);
			return res.status(400).json(errorResp);
		}

		if (err instanceof Error) {
			const errorResp = errorResponse(err.message, undefined, 400);
			return res.status(400).json(errorResp);
		}

		if (Array.isArray(req.files)) {
			req.body.files = req.files.map((file) => {
				return {
					fieldname: file.fieldname,
					originalname: file.originalname,
					uuidfileName: `${uuidv4()}_${file.originalname}`,
					fileType: file.mimetype,
					buffer: file.buffer,
				};
			});
		} else {
			req.body.files = [];
		}
		next();
	});
};
