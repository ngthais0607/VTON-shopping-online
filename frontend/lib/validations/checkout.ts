import { z } from "zod";

export const checkoutSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  phone: z.string().regex(/^[0-9]{10,11}$/, "Phone number must be 10 to 11 digits"),
  address: z.string().min(5, "Shipping address must be at least 5 characters"),
  city: z.string().min(2, "City name is required"),
});

export type CheckoutFormData = z.infer<typeof checkoutSchema>;
