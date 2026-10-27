import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().min(1, "Email is required").email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters")
    .refine(value => new TextEncoder().encode(value).length <= 72 && !value.includes('\0'), 'Password must be at most 72 UTF-8 bytes and contain no NUL'),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});

export type RegisterFormData = z.infer<typeof registerSchema>;
