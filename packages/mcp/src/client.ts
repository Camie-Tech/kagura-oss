/**
 * Kagura API Client
 * 
 * HTTP client for communicating with Kagura Cloud Public API v1
 */

import https from 'node:https';
import http from 'node:http';

export interface KaguraClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data: T;
}

export class KaguraClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: KaguraClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://app.kagura.run';
  }

  async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: object
  ): Promise<ApiResponse<T>> {
    return new Promise((resolve) => {
      try {
        const url = new URL(path, this.baseUrl);
        const isHttps = url.protocol === 'https:';
        const requestModule = isHttps ? https : http;

        const options = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'X-Kagura-Api-Key': this.apiKey,
            'User-Agent': 'kagura-mcp/0.1.0',
          },
        };

        const req = requestModule.request(url, options, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve({
                ok: res.statusCode === 200 || res.statusCode === 202,
                status: res.statusCode || 500,
                data: parsed,
              });
            } catch {
              resolve({
                ok: false,
                status: res.statusCode || 500,
                data: { error: 'Invalid JSON response' } as T,
              });
            }
          });
        });

        req.on('error', (err) => {
          resolve({
            ok: false,
            status: 0,
            data: { error: err.message } as T,
          });
        });

        if (body) {
          req.write(JSON.stringify(body));
        }
        req.end();
      } catch (err: any) {
        resolve({
          ok: false,
          status: 0,
          data: { error: err.message } as T,
        });
      }
    });
  }

  // Tests
  async listTests(params?: {
    published?: boolean;
    passing?: boolean;
    limit?: number;
    search?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.published !== undefined) query.set('published', String(params.published));
    if (params?.passing !== undefined) query.set('passing', String(params.passing));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    
    const qs = query.toString();
    return this.request<any>('GET', `/api/v1/tests${qs ? `?${qs}` : ''}`);
  }

  async getTest(testId: string) {
    return this.request<any>('GET', `/api/v1/tests/${testId}`);
  }

  async triggerTests(testIds: string[]) {
    return this.request<any>('POST', '/api/v1/tests/trigger', { testIds });
  }

  async respondToTest(testId: string, resultId: string, response: string) {
    return this.request<any>('POST', `/api/v1/tests/${testId}/respond`, {
      resultId,
      response,
    });
  }

  // Runs
  async listRuns(params?: { status?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    
    const qs = query.toString();
    return this.request<any>('GET', `/api/v1/runs${qs ? `?${qs}` : ''}`);
  }

  async getRunStatus(runId: string) {
    return this.request<any>('GET', `/api/v1/runs/${runId}/status`);
  }

  async getRunResults(runId: string) {
    return this.request<any>('GET', `/api/v1/runs/${runId}/results`);
  }

  async cancelRun(runId: string) {
    return this.request<any>('DELETE', `/api/v1/runs/${runId}`);
  }

  // Test Groups
  async listTestGroups(params?: { limit?: number }) {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    
    const qs = query.toString();
    return this.request<any>('GET', `/api/v1/test-groups${qs ? `?${qs}` : ''}`);
  }

  async triggerTestGroup(groupId: string) {
    return this.request<any>('POST', `/api/v1/test-groups/${groupId}/trigger`, {});
  }

  // Usage
  async getUsage() {
    return this.request<any>('GET', '/api/v1/usage');
  }
}
