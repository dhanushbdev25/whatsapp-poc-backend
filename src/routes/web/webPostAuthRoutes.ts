import { Router } from 'express';
import CustomerController from '@/components/web/customers/customerMaster/customerMaster.controller';
import ProductController from '@/components/web/products/products.controller';
import SessionController from '@/components/web/session/session.controller';
import protect from '@/middleware/protect';
import OrderMasterPostAuthController from '@/components/web/orders/OrderMasterPostAuth/orderMasterPostAuth.controller';

export default function webPostAuthRoutes(): Router {
	const router = Router();

	// User validation
	router.use(protect);

	const sessionController: SessionController = new SessionController();
	router.use('/session', sessionController.register());

	const customerController: CustomerController = new CustomerController();
	router.use('/customers', customerController.register());

	const productController: ProductController = new ProductController();
	router.use('/products', productController.register());

	const orderPostAuthController : OrderMasterPostAuthController = new OrderMasterPostAuthController();
	router.use('/orders/postAuth', orderPostAuthController.register());

	return router;
}
