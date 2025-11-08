import { Router } from 'express';
import AuthWebController from '../../components/web/auth/auth-web.controller';
import FileWebController from '../../components/web/file/file-web.controller';
import WebhookWebController from '../../components/web/webhook/webhook-web.controller';

/**
 * Here, you can register routes by instantiating the controller.
 *
 */
export default function webPreAuthRoutes(): Router {
	const router = Router();

	const fileWebController: FileWebController = new FileWebController();
	router.use('/file', fileWebController.register()); // some foldername can be protected

	const authWebController: AuthWebController = new AuthWebController();
	router.use('/auth', authWebController.register());

	const webhookWebController: WebhookWebController =
		new WebhookWebController();
	router.use('/webhook', webhookWebController.register());

	return router;
}
