export class SupportError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: any
  ) {
    super(message);
    this.name = "SupportError";
  }
}

export interface HttpOptions {
  baseUrl: string;
  getToken: () => string | null | Promise<string | null>;
  /** Called once on a 401; return true if the token was refreshed and the request should be retried. */
  onUnauthorized?: () => Promise<boolean>;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(query?: Query) {
  if (!query) return "";
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

function messageOf(body: any, fallback: string) {
  const m = body?.message;
  if (Array.isArray(m)) return m.join(", ");
  if (typeof m === "string") return m;
  return fallback;
}

export class HttpClient {
  constructor(private readonly opts: HttpOptions) {}

  get baseUrl() {
    return this.opts.baseUrl.replace(/\/+$/, "");
  }

  async request<T>(method: string, path: string, body?: any, query?: Query, retried = false): Promise<T> {
    const token = await this.opts.getToken();
    const res = await fetch(`${this.baseUrl}${path}${qs(query)}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && !retried && this.opts.onUnauthorized && (await this.opts.onUnauthorized())) {
      return this.request<T>(method, path, body, query, true);
    }
    const text = await res.text();
    const json = text ? safeJson(text) : null;
    if (!res.ok) throw new SupportError(messageOf(json, res.statusText || "Request failed"), res.status, json);
    return json as T;
  }

  get<T>(path: string, query?: Query) {
    return this.request<T>("GET", path, undefined, query);
  }
  post<T>(path: string, body?: any) {
    return this.request<T>("POST", path, body ?? {});
  }
  patch<T>(path: string, body?: any) {
    return this.request<T>("PATCH", path, body ?? {});
  }

  /** Multipart upload with progress (XHR — fetch has no upload progress). */
  async upload<T>(path: string, form: FormData, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<T> {
    const send = async (retried: boolean): Promise<T> => {
      const token = await this.opts.getToken();
      const result = await new Promise<{ status: number; body: any }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${this.baseUrl}${path}`);
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
        xhr.onload = () => resolve({ status: xhr.status, body: safeJson(xhr.responseText) });
        xhr.onerror = () => reject(new SupportError("Network error during upload", 0));
        xhr.onabort = () => reject(new SupportError("Upload cancelled", 0));
        signal?.addEventListener("abort", () => xhr.abort());
        xhr.send(form);
      });
      if (result.status === 401 && !retried && this.opts.onUnauthorized && (await this.opts.onUnauthorized())) return send(true);
      if (result.status < 200 || result.status >= 300) {
        throw new SupportError(messageOf(result.body, "Upload failed"), result.status, result.body);
      }
      onProgress?.(1);
      return result.body as T;
    };
    return send(false);
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
