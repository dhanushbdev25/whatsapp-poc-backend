import chokidar, { FSWatcher } from 'chokidar';
import logger from '@/lib/logger';
import { fileLoggerBlob } from '@/utils/fileLoggerBlob';

export function initLogWatcher(): FSWatcher {
	const logDir = './logs';

	const watcher = chokidar.watch(`${logDir}/*.log`, {
		persistent: true,
		ignoreInitial: true,
		usePolling: true,
		interval: 10000,
		awaitWriteFinish: {
			stabilityThreshold: 5000,
			pollInterval: 500,
		},
	});

	watcher.on('add', async () => {
		logger.debug('ADD | FILE STARTED UPLOADING | WATCHER');
		await fileLoggerBlob.uploadFile();
		logger.debug('ADD | FILE STARTED DONE | WATCHER');
	});

	watcher.on('change', async () => {
		logger.debug('CHANGE | FILE STARTED UPLOADING | WATCHER');
		await fileLoggerBlob.uploadFile();
		logger.debug('CHANGE | FILE STARTED DONE | WATCHER');
	});

	watcher.on('error', (error) => {
		logger.error('Chokidar watcher error:', error);
	});

	watcher.on('ready', async () => {
		logger.info('READY | WATCHER');
	});

	return watcher;
}
