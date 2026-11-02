export type CategoryOption = { id: number; name: string; parent_id?: number | null };
const labels: Record<string, string> = {
  'Áo': 'Tops', 'Áo thun': 'T-shirts', 'Áo sơ mi': 'Shirts', 'Áo polo': 'Polo shirts', 'Quần': 'Trousers', 'Quần jeans': 'Jeans', 'Quần tây': 'Tailored trousers', 'Quần short': 'Shorts', 'Váy & Đầm': 'Dresses & skirts', 'Đầm dáng xòe': 'Day dresses', 'Đầm xòe': 'Day dresses', 'Chân váy chữ A': 'A-line skirts', 'Đầm dạ hội': 'Evening dresses', 'Áo khoác': 'Outerwear', 'Áo blazer': 'Blazers', 'Áo hoodie': 'Hoodies', 'Áo khoác bomber': 'Bomber jackets', 'Giày': 'Shoes', 'Giày sneaker': 'Sneakers', 'Giày cao gót': 'Heels', 'Giày loafer': 'Loafers', 'Phụ kiện': 'Accessories', 'Túi xách': 'Bags', 'Thắt lưng': 'Belts', 'Kính mắt': 'Eyewear',
};
export const categoryLabel = (name: string) => labels[name] || name;
export function categoryGroups(categories: CategoryOption[]): CategoryOption[] {
  const ids = new Set(categories.map(category => category.id));
  return categories.filter(category => !category.parent_id || !ids.has(category.parent_id)).flatMap(category => {
    const children = categories.filter(child => child.parent_id === category.id);
    return /^(fashion|all products|all|shop)$/i.test(category.name) && children.length ? children : [category];
  });
}
export function updateCatalogQuery(query: string, updates: Record<string, string | null>): string {
  const next = new URLSearchParams(query);
  for (const [key, value] of Object.entries(updates)) {
    if (!value || value === 'all' || (key === 'sort' && value === 'latest')) next.delete(key);
    else next.set(key, value);
  }
  if ('sort' in updates) next.delete('sort_by');
  next.delete('offset'); next.delete('page');
  return '?' + next.toString();
}
