// middleware/parseRequest.ts
import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod/v4';
import formatError from '@/abstractions/formatError';

type Schemas = {
	body?: ZodType<any>;
	query?: ZodType<any>;
	params?: ZodType<any>;
};

export function parseRequest<T extends Schemas>(schemas: T = {} as T) {
	type BodyType = T['body'] extends ZodType<infer U> ? U : undefined;
	type QueryType = T['query'] extends ZodType<infer U> ? U : undefined;
	type ParamsType = T['params'] extends ZodType<infer U> ? U : undefined;
	type HandlerFunc = (
		req: Request & {
			zodBody: BodyType;
			zodQuery: QueryType;
			zodParams: ParamsType;
		},
		res: Response,
		next: NextFunction,
	) => Promise<any>;

	return function handlerFunctionWithZod(handler: HandlerFunc) {
		return async function (
			req: Request,
			res: Response,
			next: NextFunction,
		) {
			try {
				if (schemas.body)
					req.zodBody = schemas.body.parse(req.body) as BodyType;
				if (schemas.query)
					req.zodQuery = schemas.query.parse(req.query) as QueryType;
				if (schemas.params)
					req.zodParams = schemas.params.parse(
						req.params,
					) as ParamsType;
			} catch (err) {
				return formatError(next, err);
			}
			await handler(req as any, res, next);
		};
	};
}
