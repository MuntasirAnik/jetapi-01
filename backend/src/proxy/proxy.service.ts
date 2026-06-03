import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';
const FormData = require('form-data');

import * as http from 'http';
import * as https from 'https';
import * as dns from 'dns';
import * as zlib from 'zlib';
import { URL } from 'url';
import { performance } from 'perf_hooks';
import { Readable } from 'stream';

export class ProxyRequestDto {
  method: string;
  url: string;
  headers?: any;
  params?: any;
  body?: any;
}

interface TimingBreakdown {
  dnsMs: number;
  tcpMs: number;
  tlsMs: number;
  ttfbMs: number;
  downloadMs: number;
  totalMs: number;
}

@Injectable()
export class ProxyService {
  constructor(private readonly httpService: HttpService) {}

  /**
   * Execute the HTTP request using Node.js native http/https modules.
   * This gives us direct access to socket events for accurate timing.
   */
  async executeRequest(requestDto: ProxyRequestDto) {
    const overallStart = performance.now();

    try {
      console.log("============ PROXY REQUEST ============");
      console.log("URL:", requestDto.url);
      console.log("METHOD:", requestDto.method);
      console.log("=======================================");

      let finalData = requestDto.body;
      let finalHeaders = { ...requestDto.headers };

      // Handle custom frontend FormData markers
      let isFormData = false;
      if (finalData && typeof finalData === 'object' && finalData._isFormData) {
        const form = new FormData();
        if (Array.isArray(finalData.items)) {
          finalData.items.forEach((item: any) => {
            if (item.key && item.enabled !== false) {
              form.append(item.key, item.value || '');
            }
          });
        }
        finalData = form;
        finalHeaders = { ...finalHeaders, ...form.getHeaders() };
        isFormData = true;
      }

      // Parse URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(requestDto.url);
      } catch {
        throw new Error(`Invalid URL: ${requestDto.url}`);
      }

      const isHttps = parsedUrl.protocol === 'https:';
      const hostname = parsedUrl.hostname;
      const port = parsedUrl.port
        ? parseInt(parsedUrl.port)
        : (isHttps ? 443 : 80);
      const path = parsedUrl.pathname + parsedUrl.search;

      // Serialize body
      let bodyBuffer: Buffer | string | undefined;
      if (finalData !== undefined && finalData !== null) {
        if (isFormData) {
          // FormData needs special handling — fall back to Axios for this
          return this.executeWithAxios(requestDto, finalData, finalHeaders, overallStart);
        } else if (typeof finalData === 'string') {
          bodyBuffer = finalData;
        } else {
          bodyBuffer = JSON.stringify(finalData);
        }
      }

      // Set content-length if we have a body
      if (bodyBuffer && !finalHeaders['Content-Length'] && !finalHeaders['content-length']) {
        finalHeaders['Content-Length'] = Buffer.byteLength(bodyBuffer).toString();
      }

      // ─── Timing markers ───
      let dnsStart = 0;
      let dnsEnd = 0;
      let tcpStart = 0;
      let tcpEnd = 0;
      let tlsStart = 0;
      let tlsEnd = 0;
      let ttfbStart = 0;
      let ttfbEnd = 0;
      let downloadStart = 0;
      let downloadEnd = 0;

      // ─── Make request with native Node.js http/https ───
      const result = await new Promise<{
        status: number;
        statusText: string;
        headers: any;
        data: any;
        timing: TimingBreakdown;
        size: number;
      }>((resolve, reject) => {
        const requestOptions: http.RequestOptions = {
          hostname,
          port,
          path,
          method: (requestDto.method || 'GET').toUpperCase(),
          headers: finalHeaders,
          family: 4, // Force IPv4
        };

        // For HTTPS, disable cert verification for flexibility
        if (isHttps) {
          (requestOptions as https.RequestOptions).rejectUnauthorized = false;
        }

        const requestModule = isHttps ? https : http;
        dnsStart = performance.now();
        tcpStart = performance.now();

        const req = requestModule.request(requestOptions, (res) => {
          // Follow redirects (3xx) — up to 10 hops
          const statusCode = res.statusCode || 0;
          if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
            const redirectUrl = new URL(res.headers.location, requestDto.url).toString();
            console.log(`REDIRECT ${statusCode} -> ${redirectUrl}`);
            // Consume the response body to free the socket
            res.resume();
            // Recursively follow the redirect
            this.executeRequest({ ...requestDto, url: redirectUrl })
              .then(resolve)
              .catch(reject);
            return;
          }

          // First byte received = TTFB end
          ttfbEnd = performance.now();
          downloadStart = performance.now();

          // Decompress response based on content-encoding
          const encoding = (res.headers['content-encoding'] || '').toLowerCase();
          let stream: Readable = res;
          if (encoding === 'gzip' || encoding === 'x-gzip') {
            stream = res.pipe(zlib.createGunzip());
          } else if (encoding === 'deflate') {
            stream = res.pipe(zlib.createInflate());
          } else if (encoding === 'br') {
            stream = res.pipe(zlib.createBrotliDecompress());
          }

          const chunks: Buffer[] = [];

          stream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });

          stream.on('end', () => {
            downloadEnd = performance.now();

            // Parse response body
            const rawBody = Buffer.concat(chunks).toString('utf-8');
            let parsedData: any = rawBody;
            try {
              parsedData = JSON.parse(rawBody);
            } catch {}

            // Convert headers
            const resHeaders: any = {};
            Object.entries(res.headers).forEach(([k, v]) => {
              resHeaders[k] = v;
            });

            const totalMs = Math.round(performance.now() - overallStart);

            // Calculate real timing breakdown
            const dnsMs = Math.max(0, Math.round(dnsEnd - dnsStart));
            const tcpMs = Math.max(0, Math.round(tcpEnd - tcpStart));
            const tlsMs = isHttps ? Math.max(0, Math.round(tlsEnd - tlsStart)) : 0;
            const ttfbMs = Math.max(0, Math.round(ttfbEnd - ttfbStart));
            const dlMs = Math.max(0, Math.round(downloadEnd - downloadStart));

            const timing: TimingBreakdown = {
              dnsMs,
              tcpMs,
              tlsMs,
              ttfbMs,
              downloadMs: dlMs,
              totalMs,
            };

            console.log("TIMING:", JSON.stringify(timing));

            resolve({
              status: res.statusCode || 0,
              statusText: res.statusMessage || '',
              headers: resHeaders,
              data: parsedData,
              timing,
              size: rawBody.length,
            });
          });

          stream.on('error', (err) => {
            reject(err);
          });

          res.on('error', (err) => {
            reject(err);
          });
        });

        // ─── Socket event listeners for real timing capture ───
        req.on('socket', (socket) => {
          // DNS lookup completed
          socket.on('lookup', () => {
            dnsEnd = performance.now();
            // TCP handshake starts after DNS
            tcpStart = performance.now();
          });

          // TCP handshake completed
          socket.on('connect', () => {
            tcpEnd = performance.now();
            if (isHttps) {
              // TLS starts right after TCP connect
              tlsStart = performance.now();
            } else {
              // For HTTP, request is sent right after TCP
              ttfbStart = performance.now();
            }
          });

          // TLS handshake completed (HTTPS only)
          socket.on('secureConnect', () => {
            tlsEnd = performance.now();
            // TTFB starts after TLS
            ttfbStart = performance.now();
          });

          // If socket is already connected (reused), capture immediately
          if (socket.connecting === false) {
            dnsEnd = dnsStart;      // no DNS needed
            tcpEnd = tcpStart;      // already connected
            tlsEnd = tlsStart;      // already secure
            ttfbStart = performance.now();
          }
        });

        req.on('error', (err) => {
          reject(err);
        });

        // Set a timeout
        req.setTimeout(30000, () => {
          req.destroy(new Error('Request timeout after 30s'));
        });

        // Write body and send
        if (bodyBuffer) {
          req.write(bodyBuffer);
        }
        req.end();
      });

      return {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
        data: result.data,
        timeMs: result.timing.totalMs,
        timing: result.timing,
        size: result.size,
      };
    } catch (error: any) {
      const totalMs = Math.round(performance.now() - overallStart);
      console.error("PROXY ERROR:", error.message);

      return {
        status: error.response?.status || 0,
        statusText: error.response?.statusText || error.code || 'Error',
        headers: error.response?.headers || {},
        data: error.message || 'Request failed',
        timeMs: totalMs,
        timing: {
          dnsMs: 0,
          tcpMs: 0,
          tlsMs: 0,
          ttfbMs: 0,
          downloadMs: 0,
          totalMs,
        },
        size: 0,
      };
    }
  }

  /**
   * Fallback: use Axios for complex body types (FormData with file uploads).
   * Timing is estimated since Axios doesn't expose socket events reliably.
   */
  private async executeWithAxios(
    requestDto: ProxyRequestDto,
    finalData: any,
    finalHeaders: any,
    overallStart: number,
  ) {
    // Do a real DNS lookup first
    let dnsMs = 0;
    let hostname = '';
    try {
      hostname = new URL(requestDto.url).hostname;
    } catch {}
    const isHttps = requestDto.url?.startsWith('https');
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (hostname && !isLocalhost && !/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
      const dnsStart = performance.now();
      try {
        await new Promise<void>((resolve, reject) => {
          dns.lookup(hostname, { family: 4 }, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } catch {}
      dnsMs = Math.round(performance.now() - dnsStart);
    }

    const config: AxiosRequestConfig = {
      method: requestDto.method,
      url: requestDto.url,
      headers: finalHeaders,
      data: finalData,
      httpAgent: new http.Agent({ keepAlive: false }),
      httpsAgent: new https.Agent({ keepAlive: false, rejectUnauthorized: false }),
      family: 4,
      validateStatus: () => true,
    };

    const requestStart = performance.now();
    const response = await firstValueFrom(this.httpService.request(config));
    const networkMs = Math.round(performance.now() - requestStart);
    const totalMs = Math.round(performance.now() - overallStart);

    // Estimate timing phases
    const remainingMs = Math.max(0, networkMs - dnsMs);
    const tcpMs = Math.round(remainingMs * 0.12);
    const tlsMs = isHttps ? Math.round(remainingMs * 0.18) : 0;
    const overhead = tcpMs + tlsMs;
    const ttfbMs = Math.round((remainingMs - overhead) * 0.65);
    const downloadMs = Math.max(0, remainingMs - overhead - ttfbMs);

    const timing: TimingBreakdown = {
      dnsMs,
      tcpMs,
      tlsMs,
      ttfbMs,
      downloadMs,
      totalMs,
    };

    console.log("TIMING (Axios fallback):", JSON.stringify(timing));

    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
      timeMs: totalMs,
      timing,
      size: JSON.stringify(response.data).length,
    };
  }
}
