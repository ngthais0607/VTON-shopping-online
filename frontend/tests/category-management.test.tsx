import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import CategoriesPage from '../app/categories/page';

const { post, patch, remove, state, mutate, refreshOptions } = vi.hoisted(() => ({
  post: vi.fn(), patch: vi.fn(), remove: vi.fn(), mutate: vi.fn(), refreshOptions: vi.fn(),
  state: { categories: [{ id: 2, name: 'Áo thun', slug: 'ao-thun', parent_id: 1, description: '' }] },
}));
vi.mock('@/lib/api', () => ({ apiPost: post, apiPatch: patch, apiDelete: remove }));
vi.mock('@/hooks/use-categories', () => ({
  useCategories: () => ({ categories: state.categories, total: 21, isLoading: false, mutate }),
  useCategoryOptions: () => ({ categories: [
    { id: 1, name: 'Áo', slug: 'ao', parent_id: null },
    { id: 2, name: 'Áo thun', slug: 'ao-thun', parent_id: 1 },
    { id: 3, name: 'Quần', slug: 'quan', parent_id: null },
    { id: 4, name: 'Váy & Đầm', slug: 'vay-dam', parent_id: null },
    { id: 22, name: 'Áo khoác', slug: 'ao-khoac', parent_id: null },
  ], isLoading: false, mutate: refreshOptions }),
}));
vi.mock('@/components/header', () => ({ Header: ({ title }: { title: string }) => <h1>{title}</h1> }));
beforeEach(() => { post.mockReset(); patch.mockReset(); remove.mockReset(); mutate.mockReset(); refreshOptions.mockReset(); });

it('offers only root parents, including parents outside the visible page', () => {
  render(<CategoriesPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Create Category' }));
  const selector = screen.getByLabelText(/Parent Category/);
  expect(within(selector).getByRole('option', { name: 'Áo khoác' })).toBeInTheDocument();
  expect(within(selector).queryByRole('option', { name: 'Áo thun' })).not.toBeInTheDocument();
});

it('shows the clothing scope and parent of each subcategory', () => {
  render(<CategoriesPage />);
  expect(screen.getByRole('heading', { name: 'Clothing categories' })).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Clothing groups' })).getByRole('button', { name: /Áo khoác/ })).toBeInTheDocument();
  expect(within(screen.getByRole('row', { name: /Áo thun/ })).getByText('Áo', { exact: true })).toBeInTheDocument();
});

it('keeps the form pending and refreshes parent options after a successful create', async () => {
  let finish!: () => void;
  post.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
  render(<CategoriesPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Create Category' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Áo len' } });
  const save = within(screen.getByRole('dialog')).getByRole('button', { name: 'Create Category' });
  fireEvent.click(save);
  expect(save).toBeDisabled();
  await act(async () => finish());
  expect(post).toHaveBeenCalledTimes(1);
  expect(refreshOptions).toHaveBeenCalled();
});
