export interface RetrievalResponse {
  sources?: { url?: string; content?: string }[];
}

export interface RetrievalQueryParams {
  question: string;
  context?: string;
}

export interface IRetrievalProvider {
  getName(): string;
  query(params: RetrievalQueryParams): Promise<RetrievalResponse>;
}
