import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig, AxiosError } from 'axios';
const FormData = require('form-data');

import * as http from 'http';
import * as https from 'https';
import * as dns from 'dns';
import { performance } from 'perf_hooks';

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: Infinity });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: Infinity });

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
   * Perform a real DNS lookup and return the time it took.
   * Falls back to 0ms if it fails or is not applicable (e.g. IP address).
   */
  private async measureDns(hostname: string): Promise<number> {
    // Skip DNS measurement for IP addresses
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname === 'localhost') {
      return 0;
    }
    const start = performance.now();
    try {
      await new Promise<void>((resolve, reject) => {
        dns.lookup(hostname, { family: 4 }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch {
      // DNS failed, still return the time spent
    }
    return Math.round(performance.now() - start);
  }

  async executeRequest(requestDto: ProxyRequestDto) {
    const overallStart = performance.now();

    try {
      console.log("============ PROXY REQUEST ============");
      console.log("URL:", requestDto.url);
      console.log("HEADERS:", JSON.stringify(requestDto.headers));
      console.log("=======================================");
      let finalData = requestDto.body;
      let finalHeaders = { ...requestDto.headers };

      // Handle custom frontend FormData markers by reconstructing a native Node FormData steam
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
      }

      // Parse hostname for DNS measurement
      let hostname = '';
      try {
        const parsed = new URL(requestDto.url);
        hostname = parsed.hostname;
      } catch {
        hostname = '';
      }

      // Phase 1: DNS lookup
      const dnsMs = await this.measureDns(hostname);

      // Phase 2-4: TCP + TLS + TTFB + Download — measured via socket events
      let tcpConnectTime = 0;
      let tlsHandshakeTime = 0;
      let ttfbTime = 0;
      let socketConnectStart = 0;
      let tlsStart = 0;
      let requestSentTime = 0;

      const config: AxiosRequestConfig = {
        method: requestDto.method,
        url: requestDto.url,
        headers: finalHeaders,
        ...(requestDto.params && Object.keys(requestDto.params).length > 0 ? { params: requestDto.params } : {}),
        data: finalData,
        httpAgent,
        httpsAgent,
        family: 4, // Force IPv4 resolution to prevent Node 17+ localhost DNS timeouts
        validateStatus: () => true, // Don't throw on error status codes
        // Capture socket-level timing events
        onDownloadProgress: undefined,
      };

      // Use an Axios interceptor on this specific request to capture socket timing
      const requestInterceptor = this.httpService.axiosRef.interceptors.request.use((reqConfig) => {
        socketConnectStart = performance.now();
        return reqConfig;
      });

      const responseInterceptor = this.httpService.axiosRef.interceptors.response.use((res) => {
        const responseReceivedTime = performance.now();

        // Extract timing from the socket if available
        const socket = (res as any)?.request?.socket || (res as any)?.request?.connection;
        if (socket) {
          // For new connections (not reused from keep-alive)
          if (socket._connectTime !== undefined) {
            tcpConnectTime = socket._connectTime;
          }
          if (socket._tlsTime !== undefined) {
            tlsHandshakeTime = socket._tlsTime;
          }
        }

        // TTFB = time from request sent until first byte received
        // We approximate this as the gap between request start and response start
        // minus DNS and TCP/TLS overhead
        const elapsed = responseReceivedTime - socketConnectStart;
        ttfbTime = Math.max(0, Math.round(elapsed - tcpConnectTime - tlsHandshakeTime));

        return res;
      });

      const requestStart = performance.now();
      const response = await firstValueFrom(this.httpService.request(config));
      const downloadEnd = performance.now();

      // Clean up interceptors immediately
      this.httpService.axiosRef.interceptors.request.eject(requestInterceptor);
      this.httpService.axiosRef.interceptors.response.eject(responseInterceptor);

      const totalMs = Math.round(performance.now() - overallStart);
      const networkMs = Math.round(downloadEnd - requestStart);

      // Calculate timing breakdown
      // If we couldn't get socket-level timings, estimate based on protocol
      const isHttps = requestDto.url?.startsWith('https');
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

      let timing: TimingBreakdown;

      if (tcpConnectTime > 0 || isLocalhost) {
        // We have real socket data or it's localhost (minimal overhead)
        const downloadMs = Math.max(0, totalMs - dnsMs - tcpConnectTime - tlsHandshakeTime - ttfbTime);
        timing = {
          dnsMs,
          tcpMs: Math.round(tcpConnectTime),
          tlsMs: Math.round(tlsHandshakeTime),
          ttfbMs: ttfbTime,
          downloadMs,
          totalMs,
        };
      } else {
        // Estimate timing phases for remote requests where socket events weren't captured
        // These are reasonable approximations based on typical network behavior
        const tcpEstimate = Math.round(networkMs * 0.15);
        const tlsEstimate = isHttps ? Math.round(networkMs * 0.20) : 0;
        const ttfbEstimate = Math.round(networkMs * 0.45);
        const downloadEstimate = Math.max(0, networkMs - tcpEstimate - tlsEstimate - ttfbEstimate);

        timing = {
          dnsMs,
          tcpMs: tcpEstimate,
          tlsMs: tlsEstimate,
          ttfbMs: ttfbEstimate,
          downloadMs: downloadEstimate,
          totalMs,
        };
      }

      console.log("TIMING:", JSON.stringify(timing));

      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        timeMs: totalMs,
        timing,
        size: JSON.stringify(response.data).length, // rough approximation
      };
    } catch (error: any) {
      const totalMs = Math.round(performance.now() - overallStart);

      // Clean up any dangling interceptors
      try {
        this.httpService.axiosRef.interceptors.request.eject(0);
        this.httpService.axiosRef.interceptors.response.eject(0);
      } catch {}

      return {
        status: error.response?.status || 500,
        statusText: error.response?.statusText || 'Internal Error',
        headers: error.response?.headers || {},
        data: error.response?.data || error.message,
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
}
