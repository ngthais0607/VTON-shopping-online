import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { TryOnStatus } from '../components/admin/try-on-status';
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ apiGet: get }));
beforeEach(() => get.mockReset());

it('explains what to do for a new product before it is saved', () => {
  render(<TryOnStatus />);
  expect(screen.getByText(/product photo is needed first/)).toBeInTheDocument();
  expect(get).not.toHaveBeenCalled();
});
it('tells the admin the garment image is missing', async () => {
  get.mockResolvedValue({ eligible: false, reason: 'garment_image_missing' });
  render(<TryOnStatus productId={7} />);
  expect(await screen.findByText(/no usable photo yet/)).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/vton/products/7/eligibility');
});
it('confirms when try-on is live', async () => {
  get.mockResolvedValue({ eligible: true, reason: null });
  render(<TryOnStatus productId={7} />);
  expect(await screen.findByText(/Try-on is live/)).toBeInTheDocument();
});
it('does not block the form if the status comes back empty', async () => {
  get.mockResolvedValue(undefined);
  render(<TryOnStatus productId={7} />);
  expect(await screen.findByText(/status is unavailable/)).toBeInTheDocument();
});
