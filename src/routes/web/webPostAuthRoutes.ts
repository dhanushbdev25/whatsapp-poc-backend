import { Router } from 'express';
import CustomerController from '@/components/web/customers/customerMaster/customerMaster.controller';
import SessionController from '@/components/web/session/session.controller';
import protect from '@/middleware/protect';

export default function webPostAuthRoutes(): Router {
	const router = Router();

	// User validation
	router.use(protect);

	const sessionController: SessionController = new SessionController();
	router.use('/session', sessionController.register());
	const customerController: CustomerController = new CustomerController();
	router.use('/customers', customerController.register());

	return router;
}
