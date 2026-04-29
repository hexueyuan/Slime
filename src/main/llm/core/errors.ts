/**
 * LLM 客户端错误类型
 */
export type LLMErrorType = "http_error" | "stream_error" | "aborted";

/**
 * LLM 错误类
 */
export class LLMError extends Error {
  constructor(
    public readonly errorType: LLMErrorType,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "LLMError";
  }
}
