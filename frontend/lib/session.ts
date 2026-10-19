let inMemoryAccessToken: string | null = null;
let generation = 0;
const listeners = new Set<() => void>();
let sessionNotice: string | null = null;
let locallyCleared = false;
let latestSessionStart = -1;
const revokedEpochs = new Set<string>();

interface TokenSession { sid: string; revision: number; started: number }
function tokenSession(token: unknown): TokenSession | null {
  if (typeof token !== 'string') return null;
  try {
    const data = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!/^[0-9a-f]{32}$/.test(data.sid) || !Number.isSafeInteger(data.sv) || data.sv < 0 || !Number.isSafeInteger(data.session_started_at)) return null;
    return { sid: data.sid, revision: data.sv, started: data.session_started_at };
  } catch { return null; }
}

function publish(message: unknown): void {
  try { getOrCreateAuthChannel()?.postMessage(message); } catch { /* optional channel */ }
}

function acceptPeerToken(token: unknown, installed: boolean): void {
  const next = tokenSession(token);
  const current = tokenSession(inMemoryAccessToken);
  if (!next || revokedEpochs.has(next.sid) || next.started < latestSessionStart) return;
  if (current?.sid === next.sid && current.revision >= next.revision) return;
  if (!installed && (locallyCleared || (current && current.sid !== next.sid))) return;
  if (current?.sid !== next.sid) generation++;
  latestSessionStart = next.started;
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
        if (event.data?.type === 'SYNC') {
          if (tokenSession(inMemoryAccessToken) && !locallyCleared) publish({ type: 'SESSION', token: inMemoryAccessToken });
        }
        if (event.data?.type === 'SESSION' || event.data?.type === 'RENEW') {
          acceptPeerToken(event.data.token, event.data.type === 'SESSION');
        }
        if (event.data?.type === 'LOGOUT') {
          const current = tokenSession(inMemoryAccessToken);
          if (typeof event.data.sid === 'string') {
            revokedEpochs.add(event.data.sid);
            if (current && current.sid !== event.data.sid) return;
          }
          inMemoryAccessToken = null;
          locallyCleared = true;
          generation++;
          listeners.forEach(listener => listener());
        }
      };
      authChannel.postMessage({ type: 'SYNC' });
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
  return inMemoryAccessToken;
}

export function setAccessToken(token: string): void {
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
    latestSessionStart = Math.max(latestSessionStart, next.started);
  }
  locallyCleared = false;
  inMemoryAccessToken = token;
  if (next) publish({ type: 'RENEW', token });
  listeners.forEach(listener => listener());
}

export function clearAccessToken(): void {
  const current = tokenSession(inMemoryAccessToken);
  if (current) revokedEpochs.add(current.sid);
  locallyCleared = true;
  generation++;
  inMemoryAccessToken = null;
  const channel = getOrCreateAuthChannel();
  if (channel) {
    try {
      channel.postMessage(current ? { type: 'LOGOUT', sid: current.sid, started: current.started } : { type: 'LOGOUT' });
    } catch {
      // Ignore errors if channel is already closed
    }
  }
  listeners.forEach(listener => listener());
}

export function getSessionGeneration(): number {
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
