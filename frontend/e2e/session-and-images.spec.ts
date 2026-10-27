import { test, expect, type Page } from '@playwright/test';

const api = `${process.env.E2E_API_URL}/api/v1`;

async function authenticatedPage(page: Page) {
  const me = page.waitForResponse(response => response.url().endsWith('/users/me') && response.status() === 200);
  await page.goto('/store');
  return (await me).json();
}

test('tabs share refreshed cookies while devices and logout remain independent', async ({ browser }) => {
  const first = await browser.newContext();
  const other = await browser.newContext();
  const username = `browser_${Date.now()}`;
  const password = 'BrowserTestPassword!482';
  try {
    const registration = await first.request.post(`${api}/users/register`, { data: {username, email: `${username}@example.com`, password} });
    expect(registration.status()).toBe(201);
    for (const context of [first, other]) {
      const login = await context.request.post(`${api}/users/login`, {data: {identifier: username, password}});
      expect(login.status()).toBe(200);
    }
    const a = await first.newPage(), b = await first.newPage();
    const identities = await Promise.all([authenticatedPage(a), authenticatedPage(b)]);
    expect(identities.map(identity => identity.username)).toEqual([username, username]);
    const refreshErrors: number[] = [];
    for (const page of [a, b]) page.on('response', response => {
      if (response.url().endsWith('/users/refresh') && response.status() !== 200) refreshErrors.push(response.status());
    });
    const reloaded = [a, b].map(page => page.waitForResponse(response => response.url().endsWith('/users/me') && response.status() === 200));
    await Promise.all([a.reload(), b.reload()]);
    for (const response of await Promise.all(reloaded)) expect((await response.json()).username).toBe(username);
    expect(refreshErrors).toEqual([]);
    expect((await other.request.post(`${api}/users/refresh`, {data: {}})).status()).toBe(200);

    let releaseRefresh!: () => void;
    let markRefreshStarted!: () => void;
    const held = new Promise<void>(resolve => { releaseRefresh = resolve; });
    const started = new Promise<void>(resolve => { markRefreshStarted = resolve; });
    let rejectOnce = true;
    await b.route('**/users/me', async route => {
      if (rejectOnce) { rejectOnce = false; await route.fulfill({status: 401, contentType: 'application/json', body: '{}'}); }
      else await route.continue();
    });
    await b.route('**/users/refresh', async route => {
      const response = await route.fetch(); markRefreshStarted(); await held;
      await route.fulfill({response});
    });
    const reload = b.reload();
    await started;
    const loggedOut = a.waitForResponse(response => response.url().endsWith('/users/logout'));
    await a.getByRole('button', {name: new RegExp(username)}).click();
    await a.getByRole('button', {name: 'Sign Out', exact: true}).click();
    releaseRefresh();
    await reload;
    expect((await loggedOut).status()).toBe(204);
    await b.unroute('**/users/me'); await b.unroute('**/users/refresh');
    await expect(b.getByRole('button', {name: new RegExp(username)})).toHaveCount(0);
    expect((await first.request.post(`${api}/users/refresh`, {data: {}})).status()).toBe(401);
    const refreshed = await other.request.post(`${api}/users/refresh`, {data: {}});
    expect(refreshed.status()).toBe(200);
    const access = (await refreshed.json()).access_token;
    expect((await first.request.post(`${api}/users/login`, {data: {identifier: username, password}})).status()).toBe(200);
    const changed = await other.request.patch(`${api}/users/me/password`, {headers: {Authorization: `Bearer ${access}`}, data: {current_password: password, new_password: 'ChangedBrowserPassword!483'}});
    expect(changed.status()).toBe(204);
    expect((await other.request.post(`${api}/users/refresh`, {data: {}})).status()).toBe(401);
    expect((await first.request.post(`${api}/users/refresh`, {data: {}})).status()).toBe(401);
  } finally { await first.close(); await other.close(); }
});

test('real MinIO image is reachable directly and through Next optimization', async ({ page, request }) => {
  const source = process.env.E2E_IMAGE_URL;
  const path = process.env.E2E_IMAGE_PATH;
  expect(source).toBeTruthy(); expect(path).toBeTruthy();
  expect((await request.get(source!)).status()).toBe(200);
  const optimized = `/_next/image?url=${encodeURIComponent(path!)}&w=64&q=75`;
  expect((await request.get(optimized)).status()).toBe(200);
  await page.goto('/store');
  const dimensions = await page.evaluate(async url => {
    const image = new Image(); image.src = url; document.body.append(image);
    await image.decode(); return { width: image.naturalWidth, height: image.naturalHeight };
  }, optimized);
  expect(dimensions.width).toBeGreaterThan(0);
  expect(dimensions.height).toBeGreaterThan(0);
});

test('Quick Buy selects a variant before adding it and self-hosted pages skip Vercel Analytics', async ({ page, request }) => {
  const catalogResponse = await request.get(`${api}/products?limit=1`);
  expect(catalogResponse.status()).toBe(200);
  const product = (await catalogResponse.json()).items[0];
  expect(product).toBeTruthy();
  const analyticsRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/_vercel/insights/')) analyticsRequests.push(request.url());
  });
  await page.goto('/store');
  await page.getByRole('button', { name: 'Quick Buy', exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/store/products/${product.slug}$`));
  await expect(page.getByRole('button', { name: /^Purchase ·/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Size M', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm vào giỏ hàng', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('truelook_cart_v2') || '[]'))).toEqual([
    { variantId: expect.any(Number), productId: product.id, quantity: 1 },
  ]);
  expect(analyticsRequests).toEqual([]);
  await expect(page.locator('script[src*="/_vercel/insights/"]')).toHaveCount(0);
});
