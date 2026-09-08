import {
  clickResponseSchema,
  popularResponseSchema,
  searchResponseSchema,
  type ClickResponse,
  type PopularResponse,
  type SearchResponse,
} from '@serverless-search/shared';

interface RequestOptions {
  signal: AbortSignal;
}

export interface ProductApi {
  getPopular(options: RequestOptions): Promise<PopularResponse>;
  search(query: string, options: RequestOptions): Promise<SearchResponse>;
  recordClick(id: string, options: RequestOptions): Promise<ClickResponse>;
}

export class HttpProductApi implements ProductApi {
  public constructor(private readonly baseUrl: string) {}

  public async getPopular(options: RequestOptions): Promise<PopularResponse> {
    const payload = await this.request('/popular?limit=5', { method: 'GET', ...options });
    return popularResponseSchema.parse(payload);
  }

  public async search(query: string, options: RequestOptions): Promise<SearchResponse> {
    const parameters = new URLSearchParams({ limit: '5' });
    parameters.set('q', query);
    const payload = await this.request(`/search?${parameters}`, { method: 'GET', ...options });
    return searchResponseSchema.parse(payload);
  }

  public async recordClick(id: string, options: RequestOptions): Promise<ClickResponse> {
    const payload = await this.request(`/products/${encodeURIComponent(id)}/click`, {
      method: 'POST',
      ...options,
    });
    return clickResponseSchema.parse(payload);
  }

  private async request(path: string, options: RequestInit): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, options);

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }

    return response.json();
  }
}
