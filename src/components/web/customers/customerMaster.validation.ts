import { z } from "zod";

// 1️⃣ Request Schema — validates incoming req.query
export const getAllCustomersRequestSchema = z.object({
  query: z.object({
    page: z
      .string()
      .regex(/^\d+$/, "Page must be a valid number")
      .transform((v) => Number(v))
      .optional()
      .default(1),
    limit: z
      .string()
      .regex(/^\d+$/, "Limit must be a valid number")
      .transform((v) => Number(v))
      .optional()
      .default(10),
    search: z.string().optional().default(""),
    sortBy: z
      .enum(["createdAt", "name", "customerID", "email"])
      .optional()
      .default("createdAt"),
    sortOrder: z
      .string()
      .transform((v) => v?.toUpperCase() || "DESC")
      .refine((v) => ["ASC", "DESC"].includes(v), {
        message: "sortOrder must be ASC or DESC",
      })
      .optional()
      .default("DESC"),
  }),
});

// Infer a TypeScript type for the service layer
export type GetAllCustomersQueryDTO = z.infer<
  typeof getAllCustomersRequestSchema
>["query"];

// 2️⃣ Response Schema — for res.locals structure
export const customerResponseSchema = z.object({
  id: z.uuid(),
  customerID: z.number(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  state: z.string().nullable(),
  pincode: z.string().nullable(),
  gender: z.enum(["male", "female", "other"]).nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const getAllCustomersResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    customers: z.array(customerResponseSchema),
    pagination: z.object({
      currentPage: z.number(),
      totalPages: z.number(),
      totalItems: z.number(),
      itemsPerPage: z.number(),
    }),
  }),
});

