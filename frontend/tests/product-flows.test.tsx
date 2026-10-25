/* Test image double avoids the Next.js image optimizer in jsdom. */
/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ImageUploader } from '../components/image-uploader';
import ProductsPage from '../app/products/page';
const {get,upload,post,patch,remove,productState,categoryState} = vi.hoisted(()=>({get:vi.fn(),upload:vi.fn(),post:vi.fn(),patch:vi.fn(),remove:vi.fn(),productState:{error:null as Error|null,products:[] as any[],total:0},categoryState:{error:null as Error|null}}));
vi.mock('@/lib/api',()=>({apiGet:get,apiUpload:upload,apiPost:post,apiPatch:patch,apiPut:patch,apiDelete:remove}));
vi.mock('@/components/ui/dropdown-menu',()=>({DropdownMenu:({children}:any)=><div>{children}</div>,DropdownMenuTrigger:({children}:any)=><>{children}</>,DropdownMenuContent:({children}:any)=><div>{children}</div>,DropdownMenuItem:({children,onClick}:any)=><button onClick={onClick}>{children}</button>}));
vi.mock('@/hooks/use-products',()=>({useProducts:()=>({isLoading:false,mutate:async()=>{},...productState})}));
vi.mock('@/hooks/use-categories',()=>({useCategoryOptions:()=>({categories:[],mutate:async()=>{},...categoryState})}));
vi.mock('@/components/header',()=>({Header:()=>null}));
vi.mock('next/image',()=>({default:({src,alt}:{src:string;alt:string})=><img src={src} alt={alt}/>}));
beforeEach(()=>{productState.error=null;productState.products=[];productState.total=0;categoryState.error=null;remove.mockReset();get.mockReset();upload.mockReset();post.mockReset();patch.mockReset();URL.createObjectURL=vi.fn(()=> 'blob:preview');URL.revokeObjectURL=vi.fn();});
const existingProduct={id:7,name:'Existing',price:10,currency:'USD',stock_quantity:10,reserved_quantity:0,sold_quantity:0,is_active:true,category:null,images:[],created_at:null,updated_at:null};
it('reports a delete failure on the product page',async()=>{
  productState.products=[existingProduct];productState.total=1;remove.mockRejectedValue(new Error('Delete unavailable'));
  render(<ProductsPage/>);
  fireEvent.click(screen.getByRole('button',{name:'Delete'}));
  fireEvent.click(screen.getAllByRole('button',{name:'Delete'}).at(-1)!);
  expect(await screen.findByText('Delete unavailable')).toBeInTheDocument();
});
it('returns an empty final page to page one even when the total reaches zero',async()=>{
  productState.products=[existingProduct];productState.total=21;
  const {rerender}=render(<ProductsPage/>);
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,350));});
  fireEvent.click(screen.getByRole('button',{name:'Next'}));
  expect(screen.getByRole('button',{name:'Previous'})).not.toBeDisabled();
  productState.products=[];productState.total=0;rerender(<ProductsPage/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Previous'})).toBeDisabled());
});
it('shows catalog and category failures without an empty success state',()=>{
  productState.error=new Error('Catalog unavailable');categoryState.error=new Error('Categories unavailable');
  render(<ProductsPage/>);
  expect(screen.getByText('Catalog unavailable')).toBeInTheDocument();
  expect(screen.getByText('Categories unavailable')).toBeInTheDocument();
  expect(screen.queryByText('No products found')).not.toBeInTheDocument();
});
it('clears the pending file when its preview is removed',async()=>{
  const selected=vi.fn();
  const {container}=render(<ImageUploader onUploadSuccess={()=>{}} onFileSelected={selected}/>);
  fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File(['a'],'a.png',{type:'image/png'})]}});
  await waitFor(()=>expect(screen.getByAltText('Product Preview')).toBeInTheDocument());
  fireEvent.click(container.querySelector('button.bg-rose-500')!);
  expect(selected).toHaveBeenLastCalledWith(null);
});
it('clears the pending file after a persisted replacement succeeds',async()=>{
  const selected=vi.fn();upload.mockResolvedValue({id:'b',url:'https://images.example.test/b.png'});
  const {container}=render(<ImageUploader productId={7} onUploadSuccess={()=>{}} onFileSelected={selected}/>);
  fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File(['b'],'b.png',{type:'image/png'})]}});
  await waitFor(()=>expect(selected).toHaveBeenLastCalledWith(null));
});
it('retains the replacement file for retry if its immediate upload fails',async()=>{
  const selected=vi.fn();upload.mockRejectedValue(new Error('Replacement unavailable'));
  const file=new File(['b'],'b.png',{type:'image/png'});
  const {container}=render(<ImageUploader productId={7} onUploadSuccess={()=>{}} onFileSelected={selected}/>);
  fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[file]}});
  await screen.findByText('Replacement unavailable');
  expect(selected).toHaveBeenLastCalledWith(file);
});
it('displays the persisted image returned by the server', async()=>{
  upload.mockResolvedValue({id:'image-1',url:'https://images.example.test/p.png'});
  const saved=vi.fn();
  const {container}=render(<ImageUploader productId={7} onUploadSuccess={saved}/>);
  fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File(['png'],'p.png',{type:'image/png'})]}});
  await waitFor(()=>expect(screen.getByAltText('Product Preview')).toHaveAttribute('src','https://images.example.test/p.png'));
  expect(saved).toHaveBeenCalledWith('https://images.example.test/p.png');
  expect(upload.mock.calls[0][1].get('is_primary')).toBe('true');
});

it('rejects files above the backend 5MB limit before upload', async () => {
  const { container } = render(<ImageUploader productId={7} onUploadSuccess={() => {}} />);
  const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' });
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
  expect(await screen.findByText(/must not exceed 5MB/)).toBeInTheDocument();
  expect(upload).not.toHaveBeenCalled();
});
it('retries an image failure without creating the product twice', async()=>{
  post.mockResolvedValue({id:7,name:'New product',price:10,currency:'USD',stock_quantity:0,reserved_quantity:0,sold_quantity:0,is_active:true,category:null,description:null,images:[],created_at:null,updated_at:null});
  patch.mockResolvedValue({id:7});
  upload.mockRejectedValueOnce(new Error('Storage offline')).mockResolvedValueOnce({id:'image-1',url:'https://images.example.test/p.png'});
  const {container}=render(<ProductsPage/>);
  fireEvent.click(screen.getByRole('button',{name:'Create Product'}));
  fireEvent.change(screen.getByPlaceholderText('Enter product name'),{target:{value:'New product'}});
  fireEvent.change(screen.getByPlaceholderText('0.00'),{target:{value:'10'}});
  fireEvent.change(document.querySelector('input[type=file]')!,{target:{files:[new File(['png'],'p.png',{type:'image/png'})]}});
  fireEvent.click(screen.getAllByRole('button',{name:'Create Product'}).at(-1)!);
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Storage offline'));
  fireEvent.click(screen.getByRole('button',{name:'Update Product'}));
  await waitFor(()=>expect(upload).toHaveBeenCalledTimes(2));
  expect(post).toHaveBeenCalledTimes(1);
  expect(upload.mock.calls[1][0]).toBe('/products/7/upload-image');
});
it('retains a file input after preview and releases local previews', async()=>{
  const {container,unmount}=render(<ImageUploader onUploadSuccess={()=>{}}/>);
  fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File(['png'],'p.png',{type:'image/png'})]}});
  await waitFor(()=>expect(screen.getByAltText('Product Preview')).toBeInTheDocument());
  expect(container.querySelector('input[type=file]')).not.toBeNull();
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
});
it('displays warning badge when product has no active variants', async () => {
  productState.products = [{ ...existingProduct, variants: [] }];
  productState.total = 1;
  render(<ProductsPage />);
  expect(screen.getByText('Chưa hiển thị trên cửa hàng vì chưa có biến thể')).toBeInTheDocument();
});
it('shows activation guidance when creating a product without active variants', async () => {
  render(<ProductsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Create Product' }));
  expect(screen.getByText('Thêm biến thể rồi kích hoạt')).toBeInTheDocument();
});

it('uses the same primary cover in the admin grid as the product response', () => {
  productState.products = [{ ...existingProduct, images: [{ id: 'cover', url: '/cover.png', is_primary: true }, { id: 'old', url: '/old.png', is_primary: false }] }];
  productState.total = 1;
  render(<ProductsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Grid' }));
  expect(screen.getByAltText('Existing')).toHaveAttribute('src', '/cover.png');
});

it('fetches full admin detail before editing a product from a summary row', async () => {
  productState.products = [{ ...existingProduct, slug: 'existing' }];
  productState.total = 1;
  get.mockResolvedValue({ ...existingProduct, slug: 'existing', variants: [{ id: 101, is_active: true }] });
  render(<ProductsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit Product' }));
  expect(await screen.findByRole('button', { name: 'Update Product' })).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/products/by-slug/existing');
  expect(screen.queryByText('Thêm biến thể rồi kích hoạt')).not.toBeInTheDocument();
});

it('does not claim a summary without variant details has no variants', () => {
  productState.products = [existingProduct];
  productState.total = 1;
  render(<ProductsPage />);
  expect(screen.queryByText('Chưa hiển thị trên cửa hàng vì chưa có biến thể')).not.toBeInTheDocument();
});
