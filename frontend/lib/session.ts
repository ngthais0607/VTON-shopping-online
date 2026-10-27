let inMemoryAccessToken: string | null = null;
let generation = 0;
const listeners = new Set<() => void>();
let sessionNotice: string | null = null;
let locallyCleared = false;
const revokedEpochs = new Set<string>();
const EPOCH_KEY = 'truelook_auth_epoch';

function newEpoch(): string { return crypto.randomUUID(); }
function sharedEpoch(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    let epoch = window.localStorage.getItem(EPOCH_KEY);
    if (!epoch) {
      epoch = newEpoch();
      window.localStorage.setItem(EPOCH_KEY, epoch);
    }
    return epoch;
  } catch { return null; }
}
let epoch = sharedEpoch() ?? newEpoch();

// Persist only a random coordination nonce, never a token or user/session identity.
function rotateEpoch(): void {
  epoch = newEpoch();
  try { window.localStorage.setItem(EPOCH_KEY, epoch); } catch { /* memory fallback */ }
}
function reconcileEpoch(notify = false): void {
  const shared = sharedEpoch();
  if (!shared || shared === epoch) return;
  epoch = shared;
  inMemoryAccessToken = null;
  locallyCleared = true;
  generation++;
  if (notify) listeners.forEach(listener => listener());
}

interface TokenSession { sid: string; revision: number; started: number }
function tokenSession(token: unknown): TokenSession | null {
  if (typeof token !== 'string') return null;
  try {
    const data = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!/^[0-9a-f]{32}$/.test(data.sid) || !Number.isSafeInteger(data.sv) || data.sv < 0 || !Number.isSafeInteger(data.session_started_at)) return null;
    return { sid: data.sid, revision: data.sv, started: data.session_started_at };
  } catch { return null; }
}

function publish(message: object): void {
  try { getOrCreateAuthChannel()?.postMessage({ ...message, epoch }); } catch { /* optional channel */ }
}

function acceptPeerToken(token: unknown, installed: boolean): void {
  const next = tokenSession(token);
  const current = tokenSession(inMemoryAccessToken);
  if (!next || revokedEpochs.has(next.sid)) return;
  if (current?.sid === next.sid && current.revision >= next.revision) return;
  if (!installed && (locallyCleared || (current && current.sid !== next.sid))) return;
  if (current?.sid !== next.sid) generation++;
  locallyCleared = false;
  inMemoryAccessToken = token as string;
  sessionNotice = null;
  listeners.forEach(listener => listener());
}

export const AUTH_CHANNEL_NAME = 'truelook_auth_sync';

let authChannel: BroadcastChannel | null = null;

function getOrCreateAuthChannel(): BroadcastChannel | null {
  if (authChannel) return authChannel;
  const channelCtor = typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? window.BroadcastChannel
    : typeof BroadcastChannel !== 'undefined'
      ? BroadcastChannel
      : null;

  if (channelCtor) {
    try {
      authChannel = new channelCtor(AUTH_CHANNEL_NAME);
      authChannel.onmessage = (event: MessageEvent) => {
        reconcileEpoch(true);
        if (event.data?.epoch !== epoch) return;
        if (event.data?.type === 'SYNC') {
          if (tokenSession(inMemoryAccessToken) && !locallyCleared) publish({ type: 'SESSION', token: inMemoryAccessToken });
        }
        if (event.data?.type === 'SESSION' || event.data?.type === 'RENEW') {
          acceptPeerToken(event.data.token, event.data.type === 'SESSION');
        }
        if (event.data?.type === 'LOGOUT') {
          if (typeof event.data.sid === 'string') {
            revokedEpochs.add(event.data.sid);
          }
          inMemoryAccessToken = null;
          locallyCleared = true;
          generation++;
          listeners.forEach(listener => listener());
        }
      };
      authChannel.postMessage({ type: 'SYNC', epoch });
    } catch {
      authChannel = null;
    }
  }
  return authChannel;
}

// Initialize channel if environment supports it
getOrCreateAuthChannel();

export function getAuthChannel(): BroadcastChannel | null {
  return getOrCreateAuthChannel();
}

export function getSessionNotice(): string | null {
  return sessionNotice;
}

export function setSessionNotice(message: string | null): void {
  sessionNotice = message;
  listeners.forEach(listener => listener());
}

export function getAccessToken(): string | null {
  reconcileEpoch();
  return inMemoryAccessToken;
}

export function setAccessToken(token: string): void {
  rotateEpoch();
  generation++;
  sessionNotice = null;
  renewAccessToken(token);
  if (tokenSession(token)) publish({ type: 'SESSION', token });
}

export function renewAccessToken(token: string): void {
  const next = tokenSession(token);
  const current = tokenSession(inMemoryAccessToken);
  if (next) {
    if (current && current.sid !== next.sid) generation++;
  }
  locallyCleared = false;
  inMemoryAccessToken = token;
  if (next) publish({ type: 'RENEW', token });
  listeners.forEach(listener => listener());
}

export function clearAccessToken(): void {
  reconcileEpoch();
  const current = tokenSession(inMemoryAccessToken);
  if (current) revokedEpochs.add(current.sid);
  locallyCleared = true;
  generation++;
  inMemoryAccessToken = null;
  rotateEpoch();
  publish(current ? { type: 'LOGOUT', sid: current.sid } : { type: 'LOGOUT' });
  listeners.forEach(listener => listener());
}

export function getSessionGeneration(): number {
  reconcileEpoch();
  return generation;
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function safeReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value;
}
