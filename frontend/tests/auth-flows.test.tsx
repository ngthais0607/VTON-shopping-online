import { expect, it } from 'vitest';
import { loginSchema, registerSchema } from '../lib/validations/auth';
it('rejects short new passwords but accepts short existing login passwords', () => {
  expect(registerSchema.safeParse({username:'customer',email:'c@example.com',password:'1234567'}).success).toBe(false);
  expect(loginSchema.safeParse({email:'c@example.com',password:'old'}).success).toBe(true);
});
it('validates the bcrypt byte boundary and NUL for new passwords', () => {
  const user = {username:'customer',email:'c@example.com'};
  expect(registerSchema.safeParse({...user,password:'a'.repeat(72)}).success).toBe(true);
  expect(registerSchema.safeParse({...user,password:'é'.repeat(37)}).success).toBe(false);
  expect(registerSchema.safeParse({...user,password:'abc\0defghi'}).success).toBe(false);
});
