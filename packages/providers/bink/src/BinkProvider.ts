import axios from 'axios';
import {
  IRetrievalProvider,
  RetrievalQueryParams,
  RetrievalResponse,
} from '@binkai/retrieval-plugin';

export interface BinkProviderConfig {
  apiKey: string;
  baseUrl: string;
}

export class BinkProvider implements IRetrievalProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: BinkProviderConfig) {
    if (!config.baseUrl) {
      throw new Error('BINK_API_URL are required');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
  }

  getName(): string {
    return 'bink';
  }

  async query(params: RetrievalQueryParams): Promise<RetrievalResponse> {
    try {
      const response = await axios.post(`${this.baseUrl}`, params, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      return { sources: [{ content: response.data }] };
    } catch (error: any) {
      console.error('error', error);
      if (axios.isAxiosError(error)) {
        throw new Error(`Bink API error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }
}
