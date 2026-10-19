/** Keep configured storage images same-origin so Next can optimize them in Docker. */
export function normalizeStorageUrls<T>(value: T): T {
  const base = (process.env.NEXT_PUBLIC_IMAGE_HOST || 'http://localhost:9000').replace(/\/+$/, '');
  function visit(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(visit);
    if (!input || typeof input !== 'object') return input;
    return Object.fromEntries(Object.entries(input).map(([key, item]) => [
      key,
      (key === 'url' || key === 'image_url') && typeof item === 'string' && item.startsWith(base + '/')
        ? '/storage/' + item.slice(base.length + 1)
        : visit(item),
    ]));
  }
  return visit(value) as T;
}
