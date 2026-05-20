if (!process.env.NEXT_PUBLIC_API_URL) {
  console.error('[api.ts] NEXT_PUBLIC_API_URL is not set. Please configure it in .env.local');
}
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

// Lazy async import to avoid blocking main thread and circular deps
let pushLogFn: ((entry: any) => void) | null = null;
let pushLogResolved = false;
function getPushLog() {
  if (!pushLogResolved && typeof window !== 'undefined') {
    pushLogResolved = true;
    import('@/components/FooterTerminal').then(mod => {
      pushLogFn = mod.pushLog;
    }).catch(() => {});
  }
  return pushLogFn;
}

export async function apiFetch(url: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
  const method = (options.method || 'GET').toUpperCase();
  // Short display path (strip base url)
  const displayUrl = fullUrl.replace(API_BASE_URL, '');

  const headers: HeadersInit = {
    ...options.headers,
  };

  if (token) {
    (headers as any)['Authorization'] = `Bearer ${token}`;
  }

  const finalOptions = {
    ...options,
    headers,
  };

  // Log the request
  const log = getPushLog();
  log?.({ type: 'request', method, url: displayUrl });

  const startTime = performance.now();

  try {
    const response = await fetch(fullUrl, finalOptions);
    const duration = Math.round(performance.now() - startTime);

    // Log the response
    log?.({ type: 'response', method, url: displayUrl, status: response.status, duration });

    if (response.status === 401) {
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login') && !fullUrl.includes('/api/init')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('jetapi_init_cache');
        window.location.href = '/login';
      }
    }

    return response;
  } catch (err: any) {
    const duration = Math.round(performance.now() - startTime);
    log?.({ type: 'error', message: `${method} ${displayUrl} — ${err.message} (${duration}ms)` });
    throw err;
  }
}

export function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

/**
 * Extract the actual error message from a failed API response.
 * NestJS returns { message, error, statusCode } — this grabs `message`.
 * Falls back to the provided default if parsing fails.
 */
export async function getApiError(res: Response, fallback = 'Something went wrong'): Promise<string> {
  try {
    const data = await res.json();
    return data?.message || data?.error || fallback;
  } catch {
    return fallback;
  }
}
