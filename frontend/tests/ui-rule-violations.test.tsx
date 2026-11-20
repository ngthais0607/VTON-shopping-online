import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContainer } from '../components/auth/auth-container';
import { SizeChartEditor } from '../components/admin/size-chart-editor';
import { SizeChartModal } from '../components/store/size-chart-modal';
import { checkoutSchema } from '../lib/validations/checkout';
import { loginSchema, registerSchema } from '../lib/validations/auth';

const { post, get, push } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), push: vi.fn() }));
vi.mock('@/lib/api', () => ({
  apiPost: post,
  apiGet: get,
  loginSession: (identifier: string, password: string) => post('/users/login', { identifier, password }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: () => {} }) }));

beforeEach(() => {
  post.mockReset();
  get.mockReset();
  push.mockReset();
});

// ------------------------------------------------------------------ form schemas

describe('register schema', () => {
  const ok = { username: 'customer', email: 'c@example.com', password: 'longenough' };
  it.each([
    ['username too short', { username: 'ab' }],
    ['blank username', { username: '' }],
    ['email without domain', { email: 'c@' }],
    ['email with spaces', { email: 'a b@example.com' }],
    ['empty email', { email: '' }],
    ['password of 7 chars', { password: '1234567' }],
    ['password over 72 bytes', { password: 'x'.repeat(73) }],
    ['password with NUL', { password: 'abc\0defghi' }],
    ['multi-byte password over 72 bytes', { password: '€'.repeat(25) }],
  ])('refuses %s', (_label, patch) => {
    expect(registerSchema.safeParse({ ...ok, ...patch }).success).toBe(false);
  });

  it('accepts the valid baseline and exactly 72 bytes', () => {
    expect(registerSchema.safeParse(ok).success).toBe(true);
    expect(registerSchema.safeParse({ ...ok, password: 'x'.repeat(72) }).success).toBe(true);
  });

  it('does not leak unknown keys into the payload', () => {
    const parsed = registerSchema.parse({ ...ok, role: 'admin', is_admin: true });
    expect(parsed).not.toHaveProperty('role');
    expect(parsed).not.toHaveProperty('is_admin');
  });
});

describe('login schema', () => {
  it.each([[{ email: '', password: 'x' }], [{ email: 'a', password: '' }], [{}]])('refuses %j', (value) => {
    expect(loginSchema.safeParse(value).success).toBe(false);
  });
});

describe('checkout schema', () => {
  const ok = { fullName: 'Nguyen Van A', phone: '0901234567', address: '12 Nguyen Hue, District 1' };
  it.each([
    ['blank name', { fullName: '   ' }],
    ['one-letter name', { fullName: 'A' }],
    ['name over 100 chars', { fullName: 'n'.repeat(101) }],
    ['letters in phone', { phone: '09012abcde' }],
    ['phone too short', { phone: '090123456' }],
    ['phone too long', { phone: '09012345678' }],
    ['landline prefix', { phone: '0201234567' }],
    ['foreign number', { phone: '+1 415 555 0100' }],
    ['address of spaces', { address: '          ' }],
    ['short address', { address: '1 St' }],
    ['address over 1000 chars', { address: 'a'.repeat(1001) }],
  ])('refuses %s', (_label, patch) => {
    expect(checkoutSchema.safeParse({ ...ok, ...patch }).success).toBe(false);
  });

  it('normalises +84, dots, dashes and spaces to the local format', () => {
    for (const phone of ['+84901234567', '090.123.4567', '090-123-4567', ' 090 123 4567 ']) {
      expect(checkoutSchema.parse({ ...ok, phone }).phone).toBe('0901234567');
    }
  });

  it('trims the name and address', () => {
    const parsed = checkoutSchema.parse({ ...ok, fullName: '  Anna  ', address: '  12 Nguyen Hue, D1  ' });
    expect(parsed.fullName).toBe('Anna');
    expect(parsed.address).toBe('12 Nguyen Hue, D1');
  });
});

// ------------------------------------------------------------------ auth screen under server errors

function submitLogin(identifier = 'customer', password = 'secret-pass') {
  fireEvent.change(screen.getByPlaceholderText('Email or Username'), { target: { value: identifier } });
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: password } });
  fireEvent.submit(screen.getByPlaceholderText('Password').closest('form')!);
}

describe('sign-in screen', () => {
  it('does not call the server when a field is empty', async () => {
    render(<AuthContainer defaultTab="signin" />);
    fireEvent.submit(screen.getByPlaceholderText('Password').closest('form')!);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(post).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it.each([
    ['401', Object.assign(new Error('Invalid credentials'), { status: 401 })],
    ['429', Object.assign(new Error('Too many attempts'), { status: 429 })],
    ['500', Object.assign(new Error('Internal Server Error'), { status: 500 })],
    ['network failure', new TypeError('Failed to fetch')],
  ])('stays on the page without navigating after a %s', async (_label, error) => {
    post.mockRejectedValue(error);
    render(<AuthContainer defaultTab="signin" />);
    submitLogin();
    await waitFor(() => expect(post).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
  });

  it('survives a server answer without tokens or user', async () => {
    post.mockResolvedValue({});
    get.mockResolvedValue(null);
    render(<AuthContainer defaultTab="signin" />);
    submitLogin();
    await waitFor(() => expect(post).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
  });

  it('sends hostile text as plain data and never as markup', async () => {
    post.mockRejectedValue(new Error('<img src=x onerror=alert(1)>'));
    const { container } = render(<AuthContainer defaultTab="signin" />);
    submitLogin('<script>alert(1)</script>', "' OR 1=1 --");
    await waitFor(() => expect(post).toHaveBeenCalledWith('/users/login', { identifier: '<script>alert(1)</script>', password: "' OR 1=1 --" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img[onerror]')).toBeNull();
  });

  it('a double submit does not log in twice while the first is pending', async () => {
    let release: (value: unknown) => void = () => {};
    post.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    render(<AuthContainer defaultTab="signin" />);
    submitLogin();
    submitLogin();
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls.length).toBeLessThanOrEqual(1);
    release({ access_token: 't' });
  });
});

// ------------------------------------------------------------------ size chart: legacy / malformed data

const MALFORMED: Array<[string, unknown]> = [
  ['null row', { S: null, M: { chest: 96 } }],
  ['first row null', { S: null }],
  ['string row', { S: 'wide' }],
  ['array row', { S: [1, 2, 3] }],
  ['row with null value', { S: { chest: null, waist: 80 } }],
  ['row with text value', { S: { chest: 'n/a' } }],
  ['empty chart', {}],
  ['rows with different metrics', { S: { chest: 90 }, M: { waist: 80 } }],
  ['huge numbers', { S: { chest: 1e308 } }],
];

describe('size guide modal', () => {
  it.each(MALFORMED)('does not crash on %s', (_label, chart) => {
    expect(() => render(<SizeChartModal isOpen onClose={() => {}} sizeChart={chart as never} />)).not.toThrow();
  });

  it('shows the general guide when the product chart is empty', () => {
    render(<SizeChartModal isOpen onClose={() => {}} sizeChart={{}} />);
    expect(screen.getByText(/General guide/)).toBeInTheDocument();
  });

  it('converts to inches and back', () => {
    render(<SizeChartModal isOpen onClose={() => {}} sizeChart={{ M: { chest: 101.6 } }} />);
    expect(screen.getByText('102')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'inch' }));
    expect(screen.getByText('40.0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'cm' }));
    expect(screen.getByText('102')).toBeInTheDocument();
  });
});

describe('size chart editor', () => {
  it.each(MALFORMED)('does not crash on a stored chart with %s', (_label, chart) => {
    get.mockResolvedValue([]);
    expect(() => render(<SizeChartEditor categoryId={null} gender="male" value={chart as never} onChange={() => {}} />)).not.toThrow();
  });

  it('never emits NaN when non-numeric text is typed', () => {
    get.mockResolvedValue([]);
    const onChange = vi.fn();
    render(<SizeChartEditor categoryId={null} gender="male" value={{ M: { chest: 96 } }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('M Chest'), { target: { value: 'abc' } });
    for (const [chart] of onChange.mock.calls) expect(Number.isNaN(chart.M.chest)).toBe(false);
  });

  it('can clear a cell without producing NaN', () => {
    get.mockResolvedValue([]);
    const onChange = vi.fn();
    render(<SizeChartEditor categoryId={null} gender="male" value={{ M: { chest: 96 } }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('M Chest'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ M: { chest: '' } });
  });

  it('keeps working when the preset endpoint fails', async () => {
    get.mockRejectedValue(new Error('boom'));
    render(<SizeChartEditor categoryId={4} gender="male" value={null} onChange={() => {}} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId('size-chart-editor')).toBeInTheDocument();
  });
});
