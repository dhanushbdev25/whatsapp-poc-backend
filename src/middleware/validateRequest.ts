import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";

export const validateRequest =
  (schema: z.ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request object
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Request Validation failed",
          errors: error,
        });
      }
      next(error);
    }
  };
