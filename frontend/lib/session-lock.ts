/** One cookie mutation at a time across tabs that support Web Locks. */
export function withSessionLock<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('truelook-refresh', work);
  }
  return work();
}
