import { Request, Response, Router } from 'express';
import multer from 'multer';
import { virtualTryOnService } from './virtulTryOn.service';
import BaseApi from '@/components/BaseApi';

const upload = multer({ storage: multer.memoryStorage() }); // store file in memory

export default class VirtualTryOnController extends BaseApi {
	constructor() {
		super();
	}

	public register(): Router {
		this.router.get(
			'/reference-images',
			this.getReferenceImages.bind(this),
		);
		this.router.post(
			'/',
			upload.single('src_image'),
			this.forwardVirtualTryOn.bind(this),
		);
		return this.router;
	}

	public async getReferenceImages(req: Request, res: Response) {
		const { data, message } =
			await virtualTryOnService.fetchReferenceImages();
		res.locals = { data, message };
		super.send(res);
	}

	public async forwardVirtualTryOn(req: Request, res: Response) {
		const { data, message } = await virtualTryOnService.virtualTryOn(req);
		res.locals = { data, message };
		super.send(res);
	}
}
