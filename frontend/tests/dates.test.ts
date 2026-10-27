import { expect, it } from 'vitest';
import * as utils from '../lib/utils';
it('renders missing and invalid dates as unavailable rather than epoch or crashing',()=>{
  const display = (utils as typeof utils & {displayDate?:(value:string|null,pattern?:string)=>string}).displayDate;
  expect(typeof display).toBe('function');
  expect(display!(null)).toBe('N/A');
  expect(display!('invalid')).toBe('N/A');
  expect(display!('2026-10-12T00:00:00Z','yyyy-MM-dd')).toBe('2026-10-12');
});
