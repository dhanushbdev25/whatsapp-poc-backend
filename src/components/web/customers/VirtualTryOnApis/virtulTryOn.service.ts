import axios from 'axios';
import FormData from 'form-data';
import { StatusCodes } from 'http-status-codes';
import env from '@/env';
import { handleServiceError } from '@/utils/serviceErrorHandler';

export const virtualTryOnService = {
	async fetchReferenceImages() {
		const REFERENCE_API_URL = `${env.WHATSAPP_TRY_ON_BASE_API}/reference-images`;

		try {
			const response = await axios.get(REFERENCE_API_URL, {
				params: { category: 'hairstyles' },
				headers: {
					'Content-Type': 'multipart/form-data',
					skip_zrok_interstitial: 'image',
				},
			});

			return {
				data: response.data,
				message: 'Reference images fetched successfully',
			};
		} catch (error: any) {
			handleServiceError(
				error,
				'Failed to fetch reference images',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'fetchReferenceImages',
			);
		}
	},

	async virtualTryOn(req: any) {
		const TRY_ON_URL = `${env.WHATSAPP_TRY_ON_BASE_API}/virtual_try_on`;

		try {
			// ✅ Rebuild the FormData
			const formData = new FormData();
			formData.append('category', req.body.category);
			formData.append('image_id', req.body.image_id);

			// Add file from memory
			if (req.file) {
				formData.append('src_image', req.file.buffer, {
					filename: req.file.originalname,
					contentType: req.file.mimetype,
				});
			}

			const response = await axios.post(TRY_ON_URL, formData, {
				headers: {
					...formData.getHeaders(),
					skip_zrok_interstitial: 'image',
				},
			});
			console.log('Virtual Try-On Response:', response);
			return {
				data: response.data,
				message: 'Virtual try-on result fetched successfully',
			};
		} catch (error: any) {
			handleServiceError(
				error,
				'Failed to forward virtual try-on request',
				StatusCodes.INTERNAL_SERVER_ERROR,
				'virtualTryOn',
			);
		}
	},
};
