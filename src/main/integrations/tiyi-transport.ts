/** Host-only HTTP bridge; these objects never enter a model tool schema. */
export interface TiyiHttpRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  bodyBase64?: string;
}

export interface TiyiHttpReply {
  status: number;
  headers: Record<string, string>;
  bodyBase64: string;
}

export type TiyiHttpTransport = (request: TiyiHttpRequest, signal?: AbortSignal) => Promise<TiyiHttpReply>;

export class TiyiTransportError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
