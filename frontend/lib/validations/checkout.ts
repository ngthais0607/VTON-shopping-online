import { z } from "zod";

export const checkoutSchema = z.object({
  fullName: z
    .string()
    .transform((val) => val.trim())
    .refine((val) => val.length >= 2 && val.length <= 100, {
      message: "Customer name must be between 2 and 100 characters",
    }),
  phone: z
    .string()
    .transform((val) => {
      let cleaned = val.replace(/[\s.\-]+/g, "");
      if (cleaned.startsWith("+84")) {
        cleaned = "0" + cleaned.slice(3);
      }
      return cleaned;
    })
    .refine((val) => /^(0)(3|5|7|8|9)\d{8}$/.test(val), {
      message: "Invalid Vietnamese phone number",
    }),
  address: z
    .string()
    .transform((val) => val.trim())
    .refine((val) => val.length >= 10 && val.length <= 1000, {
      message: "Shipping address must be between 10 and 1000 characters",
    }),
  city: z.string().min(2, "City name is required").default("Default City"),
});

export type CheckoutFormData = z.infer<typeof checkoutSchema>;
