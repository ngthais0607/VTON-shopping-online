let generation = 0;
const listeners = new Set<() => void>();
export function getAccessToken(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem('token');
}
export function setAccessToken(token: string): void {
  if (typeof window !== 'undefined') localStorage.setItem('token', token);
  listeners.forEach(listener => listener());
}
export function clearAccessToken(): void {
  generation++;
  if (typeof window !== 'undefined') localStorage.removeItem('token');
  listeners.forEach(listener => listener());
}
export function getSessionGeneration(): number { return generation; }
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === 'token' || event.key === null) { generation++; listener(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}
export function safeReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value;
}
