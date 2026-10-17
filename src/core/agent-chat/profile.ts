import { z } from "zod";

export const profileSchema = z.object({
  postalCode: z.string().regex(/^\d{4}$/),
});

export type Profile = z.infer<typeof profileSchema>;
