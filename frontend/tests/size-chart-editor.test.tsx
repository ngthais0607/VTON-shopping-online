import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SizeChartEditor, sameChart } from '../components/admin/size-chart-editor';
import type { SizeChart, SizeChartPreset } from '../lib/types';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ apiGet: get }));

const preset = (chart: SizeChart, over: Partial<SizeChartPreset> = {}): SizeChartPreset => ({
  preset_key: 'ao-phong', label: 'T-shirt', cloth_type: 'upper', sharing: 'shared',
  shared_with: ['ao-thun', 'ao-polo'], note: 'Shared', gender_table: 'male', unit: 'cm', size_chart: chart, ...over,
});
const TEE: SizeChart = { M: { chest: 102, length: 68 } };
const SHIRT: SizeChart = { M: { chest: 106, length: 72 } };

function Harness({ categoryId, gender = 'male', initial = null, spy }: { categoryId: number | null; gender?: string; initial?: SizeChart | null; spy?: (c: SizeChart | null) => void }) {
  const [chart, setChart] = useState<SizeChart | null>(initial);
  return <SizeChartEditor categoryId={categoryId} gender={gender} value={chart} onChange={(c) => { spy?.(c); setChart(c); }} />;
}
const cell = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

const FAMILIES = [
  { preset_key: 'ao-phong', label: 'T-shirt', cloth_type: 'upper', sharing: 'shared', shared_with: ['ao-thun', 'ao-polo'], note: '', metrics: ['chest'], genders: ['male'] },
  { preset_key: 'ao-hoodie', label: 'Hoodie', cloth_type: 'upper', sharing: 'own', shared_with: ['ao-hoodie'], note: '', metrics: ['chest'], genders: ['male'] },
];
/** Serves the family list always, and the chart answers (in order) for each chart request. */
const serve = (...answers: Array<SizeChartPreset | null>) => {
  const queue = [...answers];
  get.mockImplementation(async (url: string) => {
    if (url === '/products/size-chart-presets') return FAMILIES;
    return queue.length > 1 ? queue.shift() : queue[0];
  });
};
const chartCalls = () => get.mock.calls.map((c) => c[0] as string).filter((u) => u.includes('size-chart-preset?'));

beforeEach(() => get.mockReset());

it('fills the chart that belongs to the picked category', async () => {
  serve(preset(TEE));
  render(<Harness categoryId={4} />);
  await waitFor(() => expect(cell('M Chest').value).toBe('102'));
  expect(chartCalls()).toEqual(['/products/size-chart-preset?category_id=4&gender=male']);
  expect(screen.getByText(/shared by: ao-thun, ao-polo/)).toBeInTheDocument();
});

it('says a chart is the category\'s own when it is not shared', async () => {
  serve(preset(SHIRT, { sharing: 'own', shared_with: ['ao-so-mi'] }));
  render(<Harness categoryId={5} />);
  expect(await screen.findByText(/own chart for this garment type/)).toBeInTheDocument();
});

it('swaps to the new category chart while the chart is still the standard one', async () => {
  serve(preset(TEE), preset(SHIRT));
  const { rerender } = render(<Harness categoryId={4} />);
  await waitFor(() => expect(cell('M Chest').value).toBe('102'));
  rerender(<Harness categoryId={5} />);
  await waitFor(() => expect(cell('M Chest').value).toBe('106'));
});

it('never overwrites a chart the admin edited, and offers the standard one again', async () => {
  serve(preset(TEE), preset(SHIRT));
  const { rerender } = render(<Harness categoryId={4} />);
  await waitFor(() => expect(cell('M Chest').value).toBe('102'));
  fireEvent.change(cell('M Chest'), { target: { value: '99' } });
  rerender(<Harness categoryId={5} />);
  await waitFor(() => expect(chartCalls()).toHaveLength(2));
  expect(cell('M Chest').value).toBe('99');
  fireEvent.click(await screen.findByRole('button', { name: 'Use standard chart' }));
  expect(cell('M Chest').value).toBe('106');
});

it('keeps a stored chart on a product that is opened for editing', async () => {
  serve(preset(TEE));
  render(<Harness categoryId={4} initial={{ M: { chest: 97, length: 66 } }} />);
  await waitFor(() => expect(chartCalls()).toHaveLength(1));
  expect(cell('M Chest').value).toBe('97');
});

it('clears the chart when the new category has none', async () => {
  serve(preset(TEE), null);
  const spy = vi.fn();
  const { rerender } = render(<Harness categoryId={4} spy={spy} />);
  await waitFor(() => expect(cell('M Chest').value).toBe('102'));
  rerender(<Harness categoryId={9} spy={spy} />);
  await waitFor(() => expect(spy).toHaveBeenLastCalledWith(null));
  expect(screen.queryByLabelText('M Chest')).toBeNull();
});

it('does not ask the server before a category is picked', () => {
  serve(null);
  render(<Harness categoryId={null} />);
  expect(chartCalls()).toHaveLength(0);
  expect(screen.getByText(/Pick a category/)).toBeInTheDocument();
});

it('lists every chart family and lets the admin pick one by hand', async () => {
  serve(preset(TEE), preset(SHIRT, { preset_key: 'ao-hoodie', label: 'Hoodie', sharing: 'own', shared_with: ['ao-hoodie'] }));
  render(<Harness categoryId={4} />);
  await waitFor(() => expect(cell('M Chest').value).toBe('102'));
  const select = screen.getByLabelText('Chart type') as HTMLSelectElement;
  expect(Array.from(select.options).map((o) => o.value)).toEqual(['auto', 'ao-phong', 'ao-hoodie']);
  fireEvent.change(select, { target: { value: 'ao-hoodie' } });
  await waitFor(() => expect(cell('M Chest').value).toBe('106'));
  expect(chartCalls().at(-1)).toBe('/products/size-chart-preset?preset_key=ao-hoodie&gender=male');
});

it('replaces even an edited chart when the admin picks a chart type', async () => {
  serve(preset(TEE), preset(SHIRT, { preset_key: 'ao-hoodie' }));
  render(<Harness categoryId={4} />);
  await waitFor(() => expect(cell('M Chest').value).toBe('102'));
  fireEvent.change(cell('M Chest'), { target: { value: '99' } });
  fireEvent.change(screen.getByLabelText('Chart type'), { target: { value: 'ao-hoodie' } });
  await waitFor(() => expect(cell('M Chest').value).toBe('106'));
});

it('works without a category when a chart type is picked', async () => {
  serve(preset(SHIRT, { preset_key: 'ao-hoodie' }));
  render(<Harness categoryId={null} />);
  fireEvent.change(screen.getByLabelText('Chart type'), { target: { value: 'ao-hoodie' } });
  await waitFor(() => expect(cell('M Chest').value).toBe('106'));
});

it('compares charts by numbers, not by key order or typing', () => {
  expect(sameChart({ M: { a: 1, b: 2 } }, { M: { b: '2', a: 1 } })).toBe(true);
  expect(sameChart({ M: { a: 1 } }, { M: { a: 2 } })).toBe(false);
  expect(sameChart({ M: { a: 1 } }, { L: { a: 1 } })).toBe(false);
  expect(sameChart(null, undefined)).toBe(true);
  expect(sameChart({ M: { a: 1 } }, null)).toBe(false);
});
