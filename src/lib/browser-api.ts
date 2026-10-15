export async function browserApi<T>(path: string, body?: unknown): Promise<T> {
  // Bound both headers and response-body reads. A timeout is an unknown outcome,
  // not proof that the server failed to save; callers retain their draft/key.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    return await readResponse<T>(path, body, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function readResponse<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      signal,
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      headers:
        body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    if (signal.aborted) throw new Error("Hết thời gian chờ xác nhận. Nội dung vẫn được giữ; hãy kiểm tra trạng thái yêu cầu hoặc thử lại.");
    throw new Error(
      "Mất kết nối. Kiểm tra mạng và thử lại; nội dung bạn nhập vẫn được giữ lại.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    if (signal.aborted) throw new Error("Hết thời gian chờ xác nhận. Nội dung vẫn được giữ; hãy kiểm tra trạng thái yêu cầu hoặc thử lại.");
    throw new Error("Máy chủ chưa phản hồi đúng. Vui lòng thử lại.");
  }
  if (!response.ok || result.success !== true)
    throw new Error(result.error?.message || "Không thể hoàn tất yêu cầu.");
  return result.data as T;
}
