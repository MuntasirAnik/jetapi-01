import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig, AxiosError } from 'axios';
const FormData = require('form-data');

import * as http from 'http';
import * as https from 'https';

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: Infinity });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: Infinity });

export class ProxyRequestDto {
  method: string;
  url: string;
  headers?: any;
  params?: any;
  body?: any;
}

@Injectable()
export class ProxyService {
  constructor(private readonly httpService: HttpService) {}

  async executeRequest(requestDto: ProxyRequestDto) {
    const startTime = Date.now();
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

      const config: AxiosRequestConfig = {
        method: requestDto.method,
        url: requestDto.url,
        headers: finalHeaders,
        params: requestDto.params,
        data: finalData,
        httpAgent,
        httpsAgent,
        family: 4, // Force IPv4 resolution to prevent Node 17+ localhost DNS timeouts
        validateStatus: () => true, // Don't throw on error status codes
      };

      const response = await firstValueFrom(this.httpService.request(config));
      const endTime = Date.now();

      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        timeMs: endTime - startTime,
        size: JSON.stringify(response.data).length, // rough approximation
      };
    } catch (error: any) {
      const endTime = Date.now();
      return {
        status: error.response?.status || 500,
        statusText: error.response?.statusText || 'Internal Error',
        headers: error.response?.headers || {},
        data: error.response?.data || error.message,
        timeMs: endTime - startTime,
        size: 0,
      };
    }
  }
}
