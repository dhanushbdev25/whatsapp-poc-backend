import { Router } from 'express';
import AuthWebController from '../../components/web/auth/auth-web.controller';
import OrderWebController from '../../components/web/orders/orderMaster/orderMaster.controller';
import WebhookWebController from '../../components/web/webhook/webhook-web.controller';
import VirtualTryOnController from '@/components/web/customers/VirtualTryOnApis/virtualTryOn.controller';
/**
 * Here, you can register routes by instantiating the controller.
 *
 */
export default function webPreAuthRoutes(): Router {
	const router = Router();
	const authWebController: AuthWebController = new AuthWebController();
	router.use('/auth', authWebController.register());

	const webhookWebController: WebhookWebController =
		new WebhookWebController();
	router.use('/webhook', webhookWebController.register());
	const orderWebController: OrderWebController = new OrderWebController();
	router.use('/orders', orderWebController.register());

	const virtualTryOnController: VirtualTryOnController =
		new VirtualTryOnController();
	router.use('/virtual-tryon', virtualTryOnController.register());

	return router;
}
