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

/**
 * Utility: fetch with automatic retry on 429 (rate limit).
 * Waits `retryDelay`ms before each retry.
 */
export async function fetchWithRetry(
  url: string,
  maxRetries = 3,
  retryDelay = 1200
): Promise<Response> {
  let lastError: Error = new Error('fetch failed');
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url);
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, retryDelay * (i + 1)));
      continue;
    }
    return res;
  }
  throw lastError;
}
