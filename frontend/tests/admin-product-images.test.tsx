/* eslint-disable @next/next/no-img-element */
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
import { AdminProductImages } from '../components/admin/product-images';
const { remove, upload, patch } = vi.hoisted(() => ({ remove: vi.fn(), upload: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ apiDelete: remove, apiUpload: upload, apiPatch: patch }));
vi.mock('next/image', () => ({ default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }));
const images = [{ id: 'one', url: '/one.png', is_primary: true }, { id: 'two', url: '/two.png', is_primary: false }];
beforeEach(() => { remove.mockReset(); upload.mockReset(); patch.mockReset(); });

it('deletes the chosen image and updates the gallery after server success', async () => {
  remove.mockResolvedValue(undefined);
  const changed = vi.fn();
  render(<AdminProductImages productId={7} images={images} onImagesChange={changed} onUploadSuccess={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete image 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete image' }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith([images[1]]));
  expect(remove).toHaveBeenCalledWith('/products/7/images/one');
});

it('keeps the image and allows retry when deletion fails', async () => {
  remove.mockRejectedValue(new Error('Storage temporarily unavailable'));
  const changed = vi.fn();
  render(<AdminProductImages productId={7} images={images} onImagesChange={changed} onUploadSuccess={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete image 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete image' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Storage temporarily unavailable');
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Delete image' })).toBeEnabled();
});

it('uses the server fallback order after deleting a repeatedly replaced cover', async () => {
  remove.mockResolvedValue(undefined);
  const changed = vi.fn();
  const gallery = [
    { id: 'cover', url: '/cover.png', is_primary: true, sort_order: 0 },
    { id: 'b', url: '/b.png', is_primary: false, sort_order: 0 },
    { id: 'a', url: '/a.png', is_primary: false, sort_order: 0 },
  ];
  render(<AdminProductImages productId={7} images={gallery} onImagesChange={changed} onUploadSuccess={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete image 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete image' }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith([gallery[2], gallery[1]]));
});

it('uploads a garment-only image tagged with its type and colour without taking over the cover', async () => {
  upload.mockResolvedValue({ id: 'three', url: '/three.png', kind: 'flat_lay', color_name: 'Đỏ', is_primary: false });
  const changed = vi.fn();
  const { container } = render(
    <AdminProductImages productId={7} images={images} colors={['Đỏ', 'Đen']} onImagesChange={changed} onUploadSuccess={() => {}} />,
  );
  fireEvent.change(screen.getByLabelText('Upload next image as'), { target: { value: 'flat_lay' } });
  fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'Đỏ' } });
  fireEvent.change(container.querySelector('input[type=file]')!, {
    target: { files: [new File(['png'], 'flat.png', { type: 'image/png' })] },
  });
  await waitFor(() => expect(upload).toHaveBeenCalled());
  const form = upload.mock.calls[0][1] as FormData;
  expect(upload.mock.calls[0][0]).toBe('/products/7/upload-image');
  expect(form.get('kind')).toBe('flat_lay');
  expect(form.get('color_name')).toBe('Đỏ');
  expect(form.get('is_primary')).toBe('false');
  await waitFor(() => expect(changed).toHaveBeenCalled());
  const next = changed.mock.calls[0][0] as Array<{ id: string; is_primary?: boolean }>;
  expect(next.map(image => image.id)).toEqual(['one', 'two', 'three']);
  expect(next.find(image => image.id === 'one')?.is_primary).toBe(true);
});

it('does not take over the cover when a model photo is added to a product that already has images', async () => {
  upload.mockResolvedValue({ id: 'four', url: '/four.png', kind: 'model_photo', is_primary: false });
  const { container } = render(
    <AdminProductImages productId={7} images={images} onImagesChange={() => {}} onUploadSuccess={() => {}} />,
  );
  fireEvent.change(container.querySelector('input[type=file]')!, {
    target: { files: [new File(['png'], 'm.png', { type: 'image/png' })] },
  });
  await waitFor(() => expect(upload).toHaveBeenCalled());
  const form = upload.mock.calls[0][1] as FormData;
  expect(form.get('kind')).toBe('model_photo');
  expect(form.get('color_name')).toBeNull();
  expect(form.get('is_primary')).toBe('false');
});

it('makes the first image of a product its cover', async () => {
  upload.mockResolvedValue({ id: 'first', url: '/first.png', kind: 'model_photo', is_primary: true });
  const { container } = render(
    <AdminProductImages productId={7} images={[]} onImagesChange={() => {}} onUploadSuccess={() => {}} />,
  );
  fireEvent.change(container.querySelector('input[type=file]')!, {
    target: { files: [new File(['png'], 'm.png', { type: 'image/png' })] },
  });
  await waitFor(() => expect(upload).toHaveBeenCalled());
  expect((upload.mock.calls[0][1] as FormData).get('is_primary')).toBe('true');
});

it('sets an existing image as the cover and moves it first', async () => {
  patch.mockResolvedValue({ id: 'two', url: '/two.png', is_primary: true });
  const changed = vi.fn();
  render(<AdminProductImages productId={7} images={images} onImagesChange={changed} onUploadSuccess={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Set image 2 as cover' }));
  await waitFor(() => expect(changed).toHaveBeenCalled());
  expect(patch).toHaveBeenCalledWith('/products/7/images/two', { is_primary: true });
  const next = changed.mock.calls[0][0] as Array<{ id: string; is_primary?: boolean }>;
  expect(next.map(image => image.id)).toEqual(['two', 'one']);
  expect(next[1].is_primary).toBe(false);
});

it('tags an existing image with a colour', async () => {
  patch.mockResolvedValue({ id: 'two', url: '/two.png', is_primary: false, color_name: 'Đen' });
  const changed = vi.fn();
  render(<AdminProductImages productId={7} images={images} colors={['Đỏ', 'Đen']} onImagesChange={changed} onUploadSuccess={() => {}} />);
  fireEvent.change(screen.getByLabelText('Colour for image 2'), { target: { value: 'Đen' } });
  await waitFor(() => expect(changed).toHaveBeenCalled());
  expect(patch).toHaveBeenCalledWith('/products/7/images/two', { color_name: 'Đen' });
});

it('never makes a try-on garment the cover, even for a product without images', async () => {
  upload.mockResolvedValue({ id: 'g', url: '/g.png', kind: 'vton_garment', is_primary: false });
  const { container } = render(
    <AdminProductImages productId={7} images={[]} onImagesChange={() => {}} onUploadSuccess={() => {}} />,
  );
  fireEvent.change(screen.getByLabelText('Upload next image as'), { target: { value: 'vton_garment' } });
  fireEvent.change(container.querySelector('input[type=file]')!, {
    target: { files: [new File(['png'], 'g.png', { type: 'image/png' })] },
  });
  await waitFor(() => expect(upload).toHaveBeenCalled());
  expect((upload.mock.calls[0][1] as FormData).get('is_primary')).toBe('false');
});
