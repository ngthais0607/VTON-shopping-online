import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import OrderSuccessPage from '../app/store/orders/success/page';
const {search} = vi.hoisted(()=>({search:new URLSearchParams('order_ids=11,12')}));
vi.mock('next/navigation',()=>({useSearchParams:()=>search}));
vi.mock('../app/store/components/Header',()=>({Header:()=>null}));
vi.mock('../app/store/components/Footer',()=>({Footer:()=>null}));
it('links every returned order without claiming confirmed payment',()=>{
  render(<OrderSuccessPage/>);
  expect(screen.getByRole('link',{name:'#11'})).toHaveAttribute('href','/store/orders/11');
  expect(screen.getByRole('link',{name:'#12'})).toHaveAttribute('href','/store/orders/12');
  expect(screen.queryByText('Confirmed',{exact:true})).not.toBeInTheDocument();
});
