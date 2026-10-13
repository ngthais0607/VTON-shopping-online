import React from 'react';
import axios,{AxiosError,AxiosResponse} from 'axios';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {SWRConfig} from 'swr';
import {expect,it,vi} from 'vitest';
const {replace}=vi.hoisted(()=>({replace:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/dashboard',useRouter:()=>({replace})}));
vi.mock('@/components/sidebar',()=>({Sidebar:()=>null}));
it('retains logout failure after the protected header unmounts',async()=>{
  const original=axios.defaults.adapter;let rejectLogout!:()=>void;
  const {setAccessToken, clearAccessToken}=await import('../lib/session');
  setAccessToken('admin');
  axios.defaults.adapter=async config=>{
    const response={config,data:{id:1,role:'admin'},status:200,statusText:'',headers:{}} as AxiosResponse;
    if(config.url==='/users/logout') await new Promise<void>((_,reject)=>{rejectLogout=()=>reject(new AxiosError('failed',undefined,config,undefined,{...response,status:503,data:{message:'Server logout unavailable'}}));});
    return response;
  };
  try {
    const {LayoutClientWrapper}=await import('../components/layout-client-wrapper');
    const {useSession}=await import('../hooks/use-session');
    function HeaderProbe(){const {logout}=useSession();return <button onClick={()=>logout().catch(()=>{})}>Logout</button>;}
    render(<SWRConfig value={{provider:()=>new Map(),shouldRetryOnError:false}}><LayoutClientWrapper><HeaderProbe/></LayoutClientWrapper></SWRConfig>);
    fireEvent.click(await screen.findByText('Logout'));
    await waitFor(()=>expect(screen.queryByText('Logout')).not.toBeInTheDocument());
    await waitFor(()=>expect(rejectLogout).toBeTypeOf('function'));
    rejectLogout();
    expect(await screen.findByText(/Server logout unavailable/)).toBeInTheDocument();
  }finally{axios.defaults.adapter=original;clearAccessToken();}
});
