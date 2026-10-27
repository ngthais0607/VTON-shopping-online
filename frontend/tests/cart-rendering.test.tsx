/* eslint-disable @next/next/no-img-element */
import React, {useEffect} from 'react';
import {render, screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {CartProvider,useCart} from '../app/store/context/CartContext';
import {CartDrawer} from '../app/store/components/CartDrawer';
vi.mock('next/image',()=>({default:({src,alt}:{src:string;alt:string})=><img src={src} alt={alt}/>}));
function OpenCart(){const {setIsCartOpen}=useCart();useEffect(()=>{setIsCartOpen(true);},[setIsCartOpen]);return <CartDrawer/>;}
it('renders safely after restoring malformed nested product fields',()=>{
  localStorage.setItem('fastapi_store_cart',JSON.stringify([{quantity:1,product:{id:1,name:'Valid name',price:25,currency:'USD',stock_quantity:2,reserved_quantity:0,sold_quantity:0,is_active:true,category:{name:{bad:true}},images:[{url:{bad:true}}],image_url:{bad:true}}}]));
  expect(()=>render(<CartProvider><OpenCart/></CartProvider>)).not.toThrow();
  expect(screen.queryByText('Valid name')).not.toBeInTheDocument();
});
