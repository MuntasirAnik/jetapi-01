const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Lazy import to avoid circular deps in SSR
let pushLogFn: ((entry: any) => void) | null = null;
function getPushLog() {
  if (!pushLogFn && typeof window !== 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@/components/FooterTerminal');
      pushLogFn = mod.pushLog;
    } catch {}
  }
  return pushLogFn;
}

export async function apiFetch(url: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  
  // Resolve API Base URL dynamically
  let baseUrl = API_BASE_URL;
  
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    if (baseUrl.includes('localhost:3001')) {
       const isIpRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
       if (isIpRegex.test(window.location.hostname)) {
         baseUrl = `http://${window.location.hostname}:3001`;
       } else {
         baseUrl = 'https://jetapi-production-6ca.up.railway.app';
       }
    }
  }

  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? url : `/${url}`}`;
  const method = (options.method || 'GET').toUpperCase();
  // Short display path (strip base url)
  const displayUrl = fullUrl.replace(baseUrl, '');
  
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
