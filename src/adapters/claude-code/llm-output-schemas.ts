import { z } from "zod";

export const fitProductsOutputSchema = z.strictObject({
  fits: z.array(z.number().int().positive()),
  closest: z.array(z.number().int().positive()),
  note: z.string().min(1).nullable(),
  question: z.string().min(1).nullable(),
});
