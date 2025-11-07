import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { BlobServiceClient, BlockBlobClient } from '@azure/storage-blob';
import { getCurrentDate } from './day';
import env from '@/env';
import logger from '@/lib/logger';

class FileLoggerBlob {
	private getConnection() {
		const blobServiceClient = BlobServiceClient.fromConnectionString(
			env.AZURE_STORAGE_CONNECTION_STRING,
		);
		return blobServiceClient;
	}

	private getBlobClient(filename: string): BlockBlobClient {
		const blobServiceClient = this.getConnection();
		const containerClient = blobServiceClient.getContainerClient(
			env.AZURE_STORAGE_CONTAINER,
		);

		return containerClient.getBlockBlobClient(filename);
	}

	public async uploadFile(): Promise<void> {
		try {
			const fileName = `${getCurrentDate()}.log`;
			const logPath = `logs/${fileName}`;
			const localFilePath = path.resolve(logPath);

			try {
				await fs.access(localFilePath);
			} catch {
				throw new Error(`Log file not found: ${localFilePath}`);
			}

			const fileBuffer = await fs.readFile(localFilePath);
			const blobClient = this.getBlobClient(logPath);

			await blobClient.uploadData(fileBuffer, {
				blobHTTPHeaders: {
					blobContentType: 'text/plain',
				},
			});
		} catch (error) {
			logger.error('Logger Upload Error:', error);
		}
	}
}

export const fileLoggerBlob = new FileLoggerBlob();
