import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FashionFilters } from '@/components/store/fashion-filters';
import { SalePrice, discountPercent } from '@/components/store/sale-price';

const nav = vi.hoisted(() => ({ replace: vi.fn(), query: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));
vi.mock('swr', () => ({ default: () => ({ data: { genders: [], brands: [], sizes: [], colors: [], categories: [] }, error: undefined }) }));

beforeEach(() => {
  nav.replace.mockClear();
  nav.query = '';
});

describe('discountPercent', () => {
  it.each([
    [80000, 100000, 20],
    [50000, 100000, 50],
    [999999, 1000000, 1], // never shown as 0%
    [100000, 100000, 0],
    [120000, 100000, 0],
    [100, null, 0],
    [100, undefined, 0],
    [100, 0, 0],
    [100, Number.NaN, 0],
    [100, Number.POSITIVE_INFINITY, 0],
  ])('price %s vs original %s is %s%%', (price, compareAt, expected) => {
    expect(discountPercent(price, compareAt as number | null | undefined)).toBe(expected);
  });
});

describe('SalePrice', () => {
  it('shows the original price struck through with a percentage badge', () => {
    const { container } = render(<SalePrice price={80000} compareAt={100000} />);
    expect(container.querySelector('s')).not.toBeNull();
    expect(screen.getByText('-20%')).toBeInTheDocument();
    expect(screen.getByLabelText(/Original price/)).toBeInTheDocument();
  });

  it.each([[null], [undefined], [80000], [50000]])('shows a plain price when the original is %s', (compareAt) => {
    const { container } = render(<SalePrice price={80000} compareAt={compareAt as number | null | undefined} />);
    expect(container.querySelector('s')).toBeNull();
    expect(container.textContent).not.toMatch(/%/);
  });

  it('keeps the prefix before the current price only', () => {
    const { container } = render(<SalePrice price={80000} compareAt={100000} prefix="From " />);
    expect(container.textContent?.startsWith('From ')).toBe(true);
  });
});

describe('sale filter', () => {
  it('turns the on_sale query parameter on and off', () => {
    const { rerender } = render(<FashionFilters />);
    fireEvent.click(screen.getByLabelText('On sale only'));
    expect(nav.replace).toHaveBeenLastCalledWith(expect.stringContaining('on_sale=true'), { scroll: false });
    nav.query = 'on_sale=true';
    rerender(<FashionFilters />);
    expect(screen.getByLabelText('On sale only')).toBeChecked();
    fireEvent.click(screen.getByLabelText('On sale only'));
    expect(nav.replace).toHaveBeenLastCalledWith(expect.not.stringContaining('on_sale'), { scroll: false });
  });
});
