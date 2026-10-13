let inMemoryAccessToken: string | null = null;
let generation = 0;
const listeners = new Set<() => void>();
let sessionNotice: string | null = null;

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
        if (event.data?.type === 'LOGOUT') {
          inMemoryAccessToken = null;
          generation++;
          listeners.forEach(listener => listener());
        }
      };
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
}

export function renewAccessToken(token: string): void {
  inMemoryAccessToken = token;
  listeners.forEach(listener => listener());
}

export function clearAccessToken(): void {
  generation++;
  inMemoryAccessToken = null;
  const channel = getOrCreateAuthChannel();
  if (channel) {
    try {
      channel.postMessage({ type: 'LOGOUT' });
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
