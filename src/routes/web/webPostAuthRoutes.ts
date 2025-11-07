import { Router } from 'express';
import FileWebController from '@/components/web/file/file-web.controller';
import SessionController from '@/components/web/session/session.controller';
import protect from '@/middleware/protect';

export default function webPostAuthRoutes(): Router {
	const router = Router();

	// User validation
	router.use(protect);

	const sessionController: SessionController = new SessionController();
	router.use('/session', sessionController.register());

	const fileWebController: FileWebController = new FileWebController();
	router.use('/files', fileWebController.register());

	return router;
}
