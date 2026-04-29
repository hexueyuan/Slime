/**
 * SSE event
 */
export interface SSEEvent {
  event?: string;
  data: string;
}

/**
 * Parse Server-Sent Events (SSE) stream
 *
 * @param response - Fetch Response object with SSE stream
 * @returns AsyncGenerator<SSEEvent>
 */
export async function* parseSSE(response: Response): AsyncGenerator<SSEEvent> {
  const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();

  if (!reader) {
    throw new Error("No response body");
  }

  let buffer = "";
  let currentEvent: string | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep the last potentially incomplete line

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith("event: ")) {
          currentEvent = trimmedLine.slice(7).trim();
        } else if (trimmedLine.startsWith("data: ")) {
          const data = trimmedLine.slice(6);

          // Stop at [DONE]
          if (data === "[DONE]") {
            return;
          }

          yield {
            event: currentEvent,
            data,
          };
          currentEvent = undefined;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
