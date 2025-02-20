export interface KnowledgeResponse {
  sources?: { url?: string; content?: string }[];
}

export interface KnowledgeQueryParams {
  question: string;
  context?: string;
}

export interface IKnowledgeProvider {
  getName(): string;
  query(params: KnowledgeQueryParams): Promise<KnowledgeResponse>;
}
