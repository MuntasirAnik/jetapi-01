const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
  
  const headers: HeadersInit = {
    ...options.headers,
  };
  
  if (token) {
    (headers as any)['Authorization'] = `Bearer ${token}`;
  }
  
  // By default, if sending a body that is a generic object and not FormData, stringify it
  // But wait, existing code might already be stringifying it if it uses fetch natively.
  // We'll leave it to exactly mirror fetch's signature to avoid breaking existing code.

  const finalOptions = {
    ...options,
    headers,
  };

  const response = await fetch(fullUrl, finalOptions);
  
  if (response.status === 401) {
    // Basic auto-logout on 401
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
  }
  
  return response;
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
