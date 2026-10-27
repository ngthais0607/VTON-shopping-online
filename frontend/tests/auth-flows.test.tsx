import { expect, it } from 'vitest';
import { loginSchema, registerSchema } from '../lib/validations/auth';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthContainer } from '../components/auth/auth-container';
const {post,get,push} = vi.hoisted(()=>({post:vi.fn(),get:vi.fn(),push:vi.fn()}));
vi.mock('@/lib/api',()=>({apiPost:post,apiGet:get,loginSession:(identifier:string,password:string)=>post('/users/login',{identifier,password})}));
vi.mock('next/navigation',()=>({useRouter:()=>({push,refresh:()=>{}})}));
it('rejects short new passwords but accepts short existing login passwords', () => {
  expect(registerSchema.safeParse({username:'customer',email:'c@example.com',password:'1234567'}).success).toBe(false);
  expect(loginSchema.safeParse({email:'c@example.com',password:'old'}).success).toBe(true);
});
it('accepts username login and sends the backend identifier field',async()=>{
  post.mockResolvedValue({access_token:'test',refresh_token:'refresh',token_type:'bearer'});
  get.mockResolvedValue({id:1,role:'customer'});
  render(<AuthContainer defaultTab="signin"/>);
  fireEvent.change(screen.getByPlaceholderText('Email or Username'),{target:{value:'customer'}});
  fireEvent.change(screen.getByPlaceholderText('Password'),{target:{value:'old'}});
  fireEvent.submit(screen.getByPlaceholderText('Password').closest('form')!);
  await waitFor(()=>expect(post).toHaveBeenCalledWith('/users/login',{identifier:'customer',password:'old'}));
});
it('validates the bcrypt byte boundary and NUL for new passwords', () => {
  const user = {username:'customer',email:'c@example.com'};
  expect(registerSchema.safeParse({...user,password:'a'.repeat(72)}).success).toBe(true);
  expect(registerSchema.safeParse({...user,password:'é'.repeat(37)}).success).toBe(false);
  expect(registerSchema.safeParse({...user,password:'abc\0defghi'}).success).toBe(false);
});

it('navigates after admin identity resolves without a delayed redirect', async () => {
  push.mockClear();
  post.mockResolvedValue({ access_token: 'test' });
  get.mockResolvedValue({ id: 1, role: 'admin' });
  render(<AuthContainer defaultTab="signin" />);
  fireEvent.change(screen.getByPlaceholderText('Email or Username'), { target: { value: 'admin' } });
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'old' } });
  fireEvent.submit(screen.getByPlaceholderText('Password').closest('form')!);
  await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'), { timeout: 150 });
});
