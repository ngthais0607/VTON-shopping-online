import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ProductFormFields } from '@/components/admin/product-form-fields';
import { cleanPercent, percentOff, priceAfterDiscount, pricesFor } from '@/lib/sale-pricing';
import type { ProductFormData } from '@/lib/types';

vi.mock('@/components/image-uploader', () => ({ ImageUploader: () => null }));
vi.mock('@/components/admin/product-images', () => ({ AdminProductImages: () => null }));
vi.mock('@/components/admin/size-chart-editor', () => ({ SizeChartEditor: () => null }));
vi.mock('@/components/admin/try-on-status', () => ({ TryOnStatus: () => null }));

describe('sale pricing helpers', () => {
  it.each([
    [1000000, 20, 800000],
    [1000000, 0, 1000000],
    [999, 33, 669],
    [1000000, 99, 10000],
    [1000000, 150, 10000], // clamped to 99%
    [1000000, -5, 1000000],
    [1000000, Number.NaN, 1000000],
  ])('%s with %s%% off costs %s', (regular, percent, expected) => {
    expect(priceAfterDiscount(regular, percent)).toBe(expected);
  });

  it('keeps cents for other currencies', () => {
    expect(priceAfterDiscount(19.99, 15, 'USD')).toBe(16.99);
  });

  it('stores the typed price as the original price only while a discount applies', () => {
    expect(pricesFor(1000000, 20)).toEqual({ price: 800000, compare_at_price: 1000000 });
    expect(pricesFor(1000000, 0)).toEqual({ price: 1000000, compare_at_price: null });
    expect(pricesFor(0, 20)).toEqual({ price: 0, compare_at_price: null });
  });

  it('reads the percentage back exactly for whole percents', () => {
    for (const regular of [1000, 99000, 1000000, 2590000]) {
      for (let percent = 1; percent <= 99; percent++) {
        expect(percentOff(priceAfterDiscount(regular, percent), regular)).toBe(percent);
      }
    }
  });

  it.each([[null], [undefined], [0], [80000], [50000]])('percentOff ignores an original price of %s', (compareAt) => {
    expect(percentOff(80000, compareAt as number | null | undefined)).toBe(0);
  });

  it('cleans odd percent input', () => {
    expect([cleanPercent(12.6), cleanPercent(0), cleanPercent(-1), cleanPercent(500)]).toEqual([13, 0, 0, 99]);
  });
});

function Harness({ initial, spy }: { initial: Partial<ProductFormData>; spy: (data: ProductFormData) => void }) {
  const [data, setData] = useState<ProductFormData>({ name: 'x', price: 0, currency: 'VND', is_active: false, ...initial });
  spy(data);
  return (
    <ProductFormFields
      formData={data}
      onChange={(key, value) => setData((current) => ({ ...current, [key]: value }))}
      categories={[]}
      editingProduct={null}
      saveError={null}
      stagedImages={[]}
      onStagedImagesChange={() => {}}
      onBusyChange={() => {}}
      onImagesChange={() => {}}
      onProductsChanged={() => {}}
      onGarmentSelected={() => {}}
    />
  );
}

function setup(initial: Partial<ProductFormData> = {}) {
  let latest!: ProductFormData;
  render(<Harness initial={initial} spy={(data) => { latest = data; }} />);
  return () => latest;
}

describe('admin price + discount fields', () => {
  it('typing a discount turns the price into the original price and computes the sale price', () => {
    const data = setup();
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '1000000' } });
    fireEvent.change(screen.getByLabelText(/Discount %/), { target: { value: '20' } });
    expect(data().price).toBe(800000);
    expect(data().compare_at_price).toBe(1000000);
    expect(screen.getByLabelText('Price')).toHaveValue(1000000);
    expect(screen.getByText(/Sale price/)).toBeInTheDocument();
  });

  it('changing the price while on sale keeps the same discount', () => {
    const data = setup({ price: 800000, compare_at_price: 1000000 });
    expect(screen.getByLabelText(/Discount %/)).toHaveValue(20);
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '500000' } });
    expect(data().price).toBe(400000);
    expect(data().compare_at_price).toBe(500000);
  });

  it('clearing the discount ends the sale and restores the full price', () => {
    const data = setup({ price: 800000, compare_at_price: 1000000 });
    fireEvent.change(screen.getByLabelText(/Discount %/), { target: { value: '' } });
    expect(data().price).toBe(1000000);
    expect(data().compare_at_price).toBeNull();
    expect(screen.queryByText(/Sale price/)).toBeNull();
  });

  it('never allows 100% or more', () => {
    const data = setup({ price: 1000000 });
    fireEvent.change(screen.getByLabelText(/Discount %/), { target: { value: '100' } });
    expect(data().price).toBe(10000);
  });

  it('does nothing special when no discount is entered', () => {
    const data = setup();
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '250000' } });
    expect(data().price).toBe(250000);
    expect(data().compare_at_price).toBeNull();
  });
});
