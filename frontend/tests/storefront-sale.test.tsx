import { fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
import Storefront from '../app/store/components/Storefront';
const state = vi.hoisted(() => ({ query: 'category_id=2&sort=price_asc&search=shirt', replace: vi.fn(), products: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(state.query), useRouter: () => ({ replace: state.replace }) }));
vi.mock('@/hooks/use-session', () => ({ useSession: () => ({user:null}) }));
vi.mock('@/hooks/use-products', () => ({useProducts: state.products}));
vi.mock('@/hooks/use-categories', () => ({useCategoryOptions: () => ({categories:[{id:2,name:'Áo'}]})}));
vi.mock('../app/store/components/Header', () => ({Header: () => null}));
vi.mock('../app/store/components/Footer', () => ({Footer: () => null}));
vi.mock('../app/store/components/HeroSection', () => ({HeroSection: () => null}));
vi.mock('../app/store/components/LuxurySections', () => ({CategoryStories:()=>null,EditorialStory:()=>null,ProductRail:()=>null,BrandValues:()=>null,Newsletter:()=>null}));
vi.mock('../app/store/components/FeaturedProducts', () => ({FeaturedProducts: (props: any) => <><button onClick={() => props.setSortBy('latest')}>Newest</button><button onClick={() => props.setSearchQuery('')}>Clear search</button><button onClick={() => props.setCurrentPage(2)}>Page two</button><button onClick={props.onResetFilters}>Clear filters</button></>}));
beforeEach(() => {state.query='';state.replace.mockClear();state.products.mockReset().mockReturnValue({products:[],total:0,isLoading:false});});
it('asks the API for sale items only when on_sale=true is in the URL', () => {
  state.query='on_sale=true';
  render(<Storefront listing />);
  expect(state.products).toHaveBeenLastCalledWith(expect.objectContaining({on_sale:true}));
});
it.each(['','on_sale=false','on_sale=1','on_sale=TRUE','on_sale='])('does not filter by sale for "%s"', (query) => {
  state.query=query;
  render(<Storefront listing />);
  expect(state.products).toHaveBeenLastCalledWith(expect.objectContaining({on_sale:false}));
});
it('clearing the filters also drops on_sale', () => {
  state.query='on_sale=true&gender=male';
  render(<Storefront listing />);
  fireEvent.click(screen.getByText('Clear filters'));
  expect(state.replace).toHaveBeenLastCalledWith('?',{scroll:false});
});
