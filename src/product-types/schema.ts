import { z } from "zod";

export const productTypeIdSchema = z.string();

export const productTypeSchema = z.strictObject({
  id: productTypeIdSchema,
  name: z.string().min(1),
});

export const productTypeGroupSchema = z.strictObject({
  id: productTypeIdSchema,
  name: z.string().min(1),
  productTypes: z.array(productTypeSchema),
});

export const vocabularySchema = z.strictObject({
  groups: z.array(productTypeGroupSchema),
});

export const tipoMappingSchema = z.record(z.string().min(1), productTypeIdSchema.nullable());

export type ProductType = z.infer<typeof productTypeSchema>;
export type ProductTypeGroup = z.infer<typeof productTypeGroupSchema>;
export type Vocabulary = z.infer<typeof vocabularySchema>;
export type TipoMapping = z.infer<typeof tipoMappingSchema>;
