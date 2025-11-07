import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
	BlobServiceClient,
	StorageSharedKeyCredential,
	generateBlobSASQueryParameters,
	BlobSASPermissions,
	type BlockBlobClient,
	type BlobDownloadResponseParsed,
	type BlobUploadCommonResponse,
} from '@azure/storage-blob';
import mime from 'mime-types';
import env from '@/env';
import logger from '@/lib/logger';
import { type MulterFile } from '@/middleware/fileUpload';

class FileHandlerService {
	private readonly authConnection = env.AZURE_STORAGE_CONNECTION_STRING;
	private readonly containerName = env.AZURE_STORAGE_CONTAINER;
	private readonly sharedKeyCredential = new StorageSharedKeyCredential(
		env.AZURE_STORAGE_ACCOUNT_NAME,
		env.AZURE_STORAGE_ACCOUNT_KEY,
	);

	//! Essentials

	// init func
	private getBlobClient(filename: string): BlockBlobClient {
		const blobServiceClient = BlobServiceClient.fromConnectionString(
			this.authConnection,
		);
		const containerClient = blobServiceClient.getContainerClient(
			this.containerName,
		);

		return containerClient.getBlockBlobClient(filename);
	}

	// view/download file
	public async fileStreamProxy(
		filename: string,
		dirName: string,
		options: { range?: string } = {},
	): Promise<{
		stream: NodeJS.ReadableStream;
		contentLength: number;
		contentType: string;
		etag?: string;
		lastModified?: Date;
	}> {
		const blobPath = this.pathDir(dirName, filename);
		const blobClient = this.getBlobClient(blobPath);

		try {
			const properties = await blobClient.getProperties();

			if (!properties.contentType) {
				// Fallback to mime-type detection if blob doesn't provide content type
				const detectedType =
					mime.lookup(filename) || 'application/octet-stream';
				logger.warn(
					`Using detected content type (${detectedType}) for blob: ${blobPath}`,
				);
				properties.contentType = detectedType;
			}

			let downloadResponse: BlobDownloadResponseParsed;
			if (options.range) {
				const [start, end] = this.parseRangeHeader(
					options.range,
					properties.contentLength,
				);
				downloadResponse = await blobClient.download(
					start,
					end - start + 1,
				);
			} else {
				downloadResponse = await blobClient.download();
			}

			if (!downloadResponse.readableStreamBody)
				throw new Error(`Empty stream returned for blob: ${blobPath}`);

			return {
				stream: downloadResponse.readableStreamBody,
				contentLength:
					downloadResponse.contentLength || properties.contentLength,
				contentType: properties.contentType,
				etag: properties.etag,
				lastModified: properties.lastModified,
			};
		} catch (error: any) {
			if (
				(error.statusCode === 404 || error.code === 'BlobNotFound') &&
				dirName
			) {
				logger.warn(
					`Blob not found at ${blobPath}, trying root directory...`,
				);
				return this.fileStreamProxy(filename, '', options);
			}
			throw error;
		}
	}

	public async uploadFile(
		file: MulterFile,
		filename: string,
		dirName: string,
	): Promise<BlobUploadCommonResponse> {
		try {
			filename = this.pathDir(dirName, filename);
			const blobClient = this.getBlobClient(filename);
			const options = {
				blobHTTPHeaders: {
					blobContentType: file.mimetype,
				},
			};
			return await blobClient.uploadData(file.buffer, options);
		} catch (error) {
			logger.error('Upload Error:', error);
			throw error;
		}
	}

	public async deleteFile(
		filename: string,
		dirName: string,
	): Promise<boolean> {
		try {
			filename = this.pathDir(dirName, filename);
			const blobClient = this.getBlobClient(filename);
			return (await blobClient.deleteIfExists()).succeeded;
		} catch (error) {
			logger.error('Delete Error:', error);
			throw error;
		}
	}

	//! utils

	// parses url
	private parseBlobUrl(blobUrl: string) {
		const url = new URL(blobUrl);
		const pathParts = url.pathname.split('/').filter((part) => part !== '');
		// format: /container/folder/filename
		const containerName = pathParts[0];
		const blobName = pathParts.slice(1).join('/');

		return { containerName, blobName };
	}

	// Parses HTTP Range headers (bytes=start-end) into numeric start and end positions.
	private parseRangeHeader(
		rangeHeader: string,
		contentLength: number,
	): [number, number] {
		const parts = rangeHeader.replace(/bytes=/, '').split('-');
		const start = parseInt(parts[0], 10);
		const end = parts[1] ? parseInt(parts[1], 10) : contentLength - 1;
		return [start, end];
	}

	private pathDir(dirName: string, filename: string): string {
		return dirName ? `${dirName}/${filename}` : filename;
	}

	//! below are junk

	public async fileStream(filename: string, dirName = ''): Promise<Buffer> {
		try {
			filename = this.pathDir(dirName, filename);
			const blobClient = this.getBlobClient(filename);
			return await blobClient.downloadToBuffer();
		} catch (error) {
			logger.error('File Stream Error:', error);
		}
	}

	public async fileToBase64(filename: string, dirName = ''): Promise<string> {
		const data = await this.fileStream(filename, dirName);
		return data.toString('base64');
	}

	public async localUploadFile(
		localFilePath: string,
		remoteFileName: string,
		dirName = '',
	): Promise<any> {
		try {
			const fullBlobName = this.pathDir(dirName, remoteFileName);
			const blobClient = this.getBlobClient(fullBlobName);

			// Determine content type (optional - use mime lib if needed)
			const contentType = this.getMimeTypeFromExtension(
				path.extname(localFilePath),
			);

			const fileBuffer = await fs.readFile(localFilePath);

			const options = {
				blobHTTPHeaders: {
					blobContentType: contentType,
				},
			};

			const result = await blobClient.uploadData(fileBuffer, options);

			return {
				url: blobClient.url,
				requestId: result.requestId,
			};
		} catch (error) {
			logger.error('Local Upload Error:', error);
			throw error;
		}
	}

	private getMimeTypeFromExtension(ext: string): string {
		switch (ext.toLowerCase()) {
			case '.jpg':
			case '.jpeg':
				return 'image/jpeg';
			case '.png':
				return 'image/png';
			case '.gif':
				return 'image/gif';
			case '.pdf':
				return 'application/pdf';
			default:
				return 'application/octet-stream';
		}
	}

	public async generateReadSasToken(blobUrl: string) {
		const { containerName, blobName } = this.parseBlobUrl(blobUrl);

		const sasToken = generateBlobSASQueryParameters(
			{
				containerName,
				blobName,
				permissions: BlobSASPermissions.parse('r'), // Read-only
				startsOn: new Date(),
				expiresOn: new Date(Date.now() + 3600 * 1000), // 1 hour expiry
			},
			this.sharedKeyCredential,
		).toString();

		return `${blobUrl}?${sasToken}`;
	}
}

export const fileHandlerService = new FileHandlerService();
