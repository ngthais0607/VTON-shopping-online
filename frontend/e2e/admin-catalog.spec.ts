import { test, expect } from '@playwright/test';

test.use({ video: 'on', viewport: { width: 1440, height: 1000 } });
test('admin manages clothing categories, draft products, variants and images', async ({ page }, testInfo) => {
  test.skip(process.env.RUN_ADMIN_CRUD_E2E !== '1', 'Opt-in disposable local admin CRUD');
  test.setTimeout(180000);
  page.setDefaultTimeout(25000);
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/_next/image')) console.log('Image response', response.status(), response.url());
  });
  page.on('console', message => { if (message.type() === 'error') console.log('Browser error:', message.text()); });
  page.on('requestfailed', request => console.log('Failed request', request.url(), request.failure()));
  const api = process.env.E2E_API_URL!;
  const login = await page.request.post(`${api}/users/login`, { data: { identifier: 'admin@example.com', password: process.env.DEMO_ADMIN_PASSWORD || 'DemoAdmin!482' } });
  expect(login.status()).toBe(200);
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` };
  const suffix = Date.now().toString();
  const categoryName = `Áo demo ${suffix}`;
  const productName = `Demo cotton shirt ${suffix}`;
  let categoryId: number | undefined, productId: number | undefined;
  let productSlug = "";
  const imageIds: string[] = [];
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAK0lEQVR4nO3OIQEAAAwEoetfeovxBoGnq1tKQEBAQEBAQEBAQEBAQEBgHXhUDfhqRFDd3gAAAABJRU5ErkJggg==', 'base64');
  try {
    await page.goto('/categories');
    await expect(page.getByRole('heading', { name: 'Clothing categories' })).toBeVisible();
    const groups = page.getByRole('region', { name: 'Clothing groups' });
    await expect(groups.getByRole('button')).toHaveCount(4);
    await expect(groups.getByText('Giày', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/admin-categories.png', fullPage: true });
    await page.getByRole('button', { name: 'Create Category', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill(categoryName);
    const root = await (await page.request.get(`${api}/categories?limit=100`, { headers })).json();
    const ao = root.items.find((category: { slug: string }) => category.slug === 'ao');
    await dialog.getByLabel(/Parent Category/).selectOption(String(ao.id));
    const categoryCreated = page.waitForResponse(r => r.url().endsWith('/categories') && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Create Category', exact: true }).click();
    const categoryResponse = await categoryCreated;
    expect(categoryResponse.status()).toBe(201);
    categoryId = (await categoryResponse.json()).id;
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: `Actions for ${categoryName}` }).click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Description', { exact: true }).fill('Clothing subcategory verified in the browser.');
    await page.getByRole('button', { name: 'Update Category', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    await page.goto('/products');
    await page.getByRole('button', { name: 'Create Product', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Enter product name').fill(productName);
    await dialog.getByPlaceholder('0.00').fill('250000');
    await dialog.getByRole('combobox', { name: 'Category', exact: true }).click();
    await page.getByRole('option', { name: categoryName, exact: true }).click();
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'shirt.png', mimeType: 'image/png', buffer: png });
    await expect(dialog.getByAltText('Product Preview')).toBeVisible();
    const created = page.waitForResponse(r => r.url().endsWith('/products') && r.request().method() === 'POST');
    const firstUpload = page.waitForResponse(r => /\/products\/\d+\/upload-image$/.test(r.url()) && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Create Product', exact: true }).click();
    const productResponse = await created;
    expect(productResponse.status()).toBe(201);
    const productData = await productResponse.json();
    productId = productData.id;
    productSlug = productData.slug;
    const firstImageResponse = await firstUpload;
    expect(firstImageResponse.status()).toBe(201);
    imageIds.push((await firstImageResponse.json()).id);
    await expect(dialog).not.toBeVisible();

    const row = () => page.getByRole('row').filter({ hasText: productName });
    await row().getByRole('button').last().click();
    await page.getByRole('menuitem', { name: 'Tạo biến thể (Matrix)', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Quần áo (XS - XXL)', exact: true }).click();
    await dialog.getByRole('button', { name: 'Đen', exact: true }).click();
    await dialog.getByRole('button', { name: 'Tạo ma trận biến thể', exact: true }).click();
    await expect(dialog).not.toBeVisible();

    await row().getByRole('button').last().click();
    await page.getByRole('menuitem', { name: 'Edit Product', exact: true }).click();
    dialog = page.getByRole('dialog');
    const replaced = page.waitForResponse(r => /\/products\/\d+\/upload-image$/.test(r.url()) && r.request().method() === 'POST');
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'new-cover.png', mimeType: 'image/png', buffer: png });
    const replacement = await replaced;
    expect(replacement.status()).toBe(201);
    const cover = await replacement.json();
    imageIds.push(cover.id);
    await expect(dialog.getByAltText('Product Preview')).toHaveAttribute('src', new RegExp(cover.id));
    await dialog.getByAltText('Product Preview').scrollIntoViewIfNeeded();
    await expect.poll(() => dialog.getByAltText('Product Preview').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await dialog.getByRole('button', { name: 'Delete image 2', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete image', exact: true }).click();
    await expect(page.getByRole('alertdialog')).not.toBeVisible();
    await page.screenshot({ path: 'test-results/admin-product-images.png', fullPage: true });
    await dialog.getByPlaceholder('0.00').fill('280000');
    await dialog.getByRole('combobox', { name: /Active Status/ }).click();
    await page.getByRole('option', { name: 'Active (Kích hoạt)', exact: true }).click();
    await dialog.getByRole('button', { name: 'Update Product', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const detail = await (await page.request.get(`${api}/products/by-slug/${productSlug}`, { headers })).json();
    expect(detail.price).toBe(280000);
    expect(detail.images[0].id).toBe(cover.id);
    expect(detail.is_active).toBe(true);
    expect(detail.variants.length).toBe(6);
    // Remove the remaining test object before soft-deleting its product.
    expect((await page.request.delete(`${api}/products/${productId}/images/${cover.id}`, { headers })).status()).toBe(204);

    await row().getByRole('button').last().click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(row()).toHaveCount(0);
    await page.goto('/categories');
    await page.getByRole('button', { name: `Actions for ${categoryName}` }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('button', { name: `Actions for ${categoryName}` })).toHaveCount(0);
    await testInfo.attach('categories', { path: 'test-results/admin-categories.png', contentType: 'image/png' });
    await testInfo.attach('product-images', { path: 'test-results/admin-product-images.png', contentType: 'image/png' });
  } finally {
    if (productId) {
      for (const id of imageIds) await page.request.delete(`${api}/products/${productId}/images/${id}`, { headers });
      await page.request.delete(`${api}/products/${productId}`, { headers });
    }
    if (categoryId) await page.request.delete(`${api}/categories/${categoryId}`, { headers });
  }
});
