/* Test image double avoids the Next.js image optimizer in jsdom. */
/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ImageUploader } from '../components/image-uploader';
import ProductsPage from '../app/products/page';
const {upload,post,patch} = vi.hoisted(()=>({upload:vi.fn(),post:vi.fn(),patch:vi.fn()}));
vi.mock('@/lib/api',()=>({apiUpload:upload,apiPost:post,apiPatch:patch,apiPut:patch}));
vi.mock('@/hooks/use-products',()=>({useProducts:()=>({products:[],total:0,isLoading:false,mutate:async()=>{}})}));
vi.mock('@/hooks/use-categories',()=>({useCategoryOptions:()=>({categories:[]})}));
vi.mock('@/components/header',()=>({Header:()=>null}));
vi.mock('next/image',()=>({default:({src,alt}:{src:string;alt:string})=><img src={src} alt={alt}/>}));
beforeEach(()=>{upload.mockReset();post.mockReset();patch.mockReset();URL.createObjectURL=vi.fn(()=> 'blob:preview');URL.revokeObjectURL=vi.fn();});
it('displays the persisted image returned by the server', async()=>{
  upload.mockResolvedValue({id:'image-1',url:'https://images.example.test/p.png'});
  const saved=vi.fn();
  const {container}=render(<ImageUploader productId={7} onUploadSuccess={saved}/>);
  fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File(['png'],'p.png',{type:'image/png'})]}});
  await waitFor(()=>expect(screen.getByAltText('Product Preview')).toHaveAttribute('src','https://images.example.test/p.png'));
  expect(saved).toHaveBeenCalledWith('https://images.example.test/p.png');
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
