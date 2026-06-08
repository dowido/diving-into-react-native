import { Platform } from 'react-native';

/**
 * Cross-platform shadow helper.
 * - Web: uses modern `boxShadow` CSS property
 * - Native (Android/iOS): uses shadow* props + elevation
 */
export function cardShadow(opts?: {
  color?: string;
  opacity?: number;
  radius?: number;
  offsetY?: number;
  elevation?: number;
}) {
  const {
    color = '#000000',
    opacity = 0.2,
    radius = 10,
    offsetY = 4,
    elevation = 3,
  } = opts ?? {};

  // Convert hex + opacity to rgba for boxShadow
  const r = parseInt(color.slice(1, 3), 16) || 0;
  const g = parseInt(color.slice(3, 5), 16) || 0;
  const b = parseInt(color.slice(5, 7), 16) || 0;

  return Platform.select({
    web: {
      boxShadow: `0px ${offsetY}px ${radius * 2}px rgba(${r},${g},${b},${opacity})`,
    },
    default: {
      shadowColor: color,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: radius,
      elevation,
    },
  }) as object;
}

// ─── Global OpenF1 API Request Queue ─────────────────────────────────────────
//
// All requests to api.openf1.org share a single semaphore so that only
// MAX_CONCURRENT requests run at a time, with a MIN_GAP_MS pause between
// completions. This prevents 429 errors caused by all tabs firing at startup.
//
const MAX_CONCURRENT = 1;  // one-at-a-time to be safe with the free tier
const MIN_GAP_MS = 450;    // minimum ms between releasing the semaphore

let _active = 0;
const _waiters: Array<() => void> = [];

function _acquire(): Promise<void> {
  if (_active < MAX_CONCURRENT) {
    _active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    _waiters.push(resolve);
  });
}

function _release() {
  setTimeout(() => {
    if (_waiters.length > 0) {
      const next = _waiters.shift()!;
      next(); // active count stays the same — next requester takes the slot
    } else {
      _active--;
    }
  }, MIN_GAP_MS);
}

/**
 * Throttled fetch for api.openf1.org.
 *
 * Routes all requests through a global concurrency semaphore (MAX_CONCURRENT=1,
 * MIN_GAP_MS=450) so the app never floods the OpenF1 free tier.
 *
 * Also retries on 429 with exponential backoff.
 *
 * @param url       The full URL to fetch.
 * @param signal    Optional AbortSignal to cancel the request.
 * @param maxRetries Number of 429-retry attempts (default 4).
 * @param baseDelay  Base delay in ms for exponential backoff (default 1500).
 */
export async function fetchWithRetry(
  url: string,
  maxRetries = 4,
  baseDelay = 1500,
  signal?: AbortSignal
): Promise<Response> {
  // Wait for a slot in the global queue
  await _acquire();

  let lastError: Error = new Error('fetch failed');
  try {
    for (let i = 0; i < maxRetries; i++) {
      if (signal?.aborted) {
        const err = new Error('Aborted');
        (err as any).name = 'AbortError';
        throw err;
      }
      try {
        const res = await fetch(url, signal ? { signal } : undefined);
        if (res.status === 429) {
          const wait = baseDelay * Math.pow(2, i);
          await new Promise((r) => setTimeout(r, wait));
          lastError = new Error(`429 Too Many Requests: ${url}`);
          continue;
        }
        return res;
      } catch (err: any) {
        if (err?.name === 'AbortError') throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
        if (i < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, i)));
        }
      }
    }
    throw lastError;
  } finally {
    // Always release the slot so the queue keeps moving
    _release();
  }
}
