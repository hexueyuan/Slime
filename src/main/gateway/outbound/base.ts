export async function httpRequest(
  url: string,
  options: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeout?: number;
  },
): Promise<Response> {
  const controller = new AbortController();
  const timer = options.timeout ? setTimeout(() => controller.abort(), options.timeout) : undefined;

  try {
    const res = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
    return res;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<{ event?: string; data: string }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop()!;

      for (const part of parts) {
        if (!part.trim()) continue;

        let event: string | undefined;
        const dataLines: string[] = [];

        for (const line of part.split("\n")) {
          if (line.startsWith("event:")) {
            event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const d = line.slice(5).trim();
            if (d === "[DONE]") return;
            dataLines.push(d);
          }
        }

        if (dataLines.length > 0) {
          yield { event, data: dataLines.join("\n") };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
