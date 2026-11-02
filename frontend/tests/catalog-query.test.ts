import { describe, expect, it } from 'vitest';
import { updateCatalogQuery, categoryGroups, categoryLabel } from '../lib/catalog-presentation';

describe('catalog navigation', () => {
  it('replaces a URL sort without losing the chosen category and removes pagination', () => {
    expect(updateCatalogQuery('category_id=4&sort=price_asc&offset=12&page=2', { sort: 'latest' })).toBe('?category_id=4');
  });
  it('clears an existing search and category while preserving other facets', () => {
    expect(updateCatalogQuery('search=shirt&category_id=4&gender=female', { search: null, category_id: null })).toBe('?gender=female');
  });
  it('unwraps a generic taxonomy container and keeps children out of the top-level list', () => {
    const data = [{ id: 1, name: 'Fashion', parent_id: null }, { id: 2, name: 'Áo', parent_id: 1 }, { id: 3, name: 'Áo thun', parent_id: 2 }, { id: 4, name: 'Giày', parent_id: 1 }];
    expect(categoryGroups(data).map(item => item.id)).toEqual([2, 4]);
    expect(categoryLabel('Áo thun')).toBe('T-shirts');
  });
});
