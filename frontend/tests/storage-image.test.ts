import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

it('normalizes variant lookup image URLs used by the cart', async () => {
  vi.stubEnv('NEXT_PUBLIC_IMAGE_HOST', 'http://localhost:9000');
  const { normalizeStorageUrls } = await import('../lib/storage-image');
  expect(normalizeStorageUrls({image_url: 'http://localhost:9000/product-images/cart.png'}).image_url).toBe('/storage/product-images/cart.png');
});

it('uses same-origin storage paths for configured product image URLs', async () => {
  vi.stubEnv('NEXT_PUBLIC_IMAGE_HOST', 'http://localhost:9000');
  const { normalizeStorageUrls } = await import('../lib/storage-image');
  const value = normalizeStorageUrls({ items: [{images: [{url: 'http://localhost:9000/product-images/a.png'}]}] });
  expect(value.items[0].images[0].url).toBe('/storage/product-images/a.png');
});

it('leaves other origins and hostile prefix lookalikes unchanged', async () => {
  vi.stubEnv('NEXT_PUBLIC_IMAGE_HOST', 'http://localhost:9000');
  const { normalizeStorageUrls } = await import('../lib/storage-image');
  for (const url of ['https://images.example.test/a.png', 'http://localhost:9000.evil.test/a.png']) {
    expect(normalizeStorageUrls({url}).url).toBe(url);
  }
});
