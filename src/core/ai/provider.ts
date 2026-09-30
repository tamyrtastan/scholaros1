export interface AiRequest {
  system: string;
  user: string;
  maxTokens: number;
}
export interface AiResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}
export interface AiProvider {
  name: string;
  model: string;
  complete(req: AiRequest): Promise<AiResponse>;
}
