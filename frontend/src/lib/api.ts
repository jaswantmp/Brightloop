const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  const res = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const err = await res.json();
      if (typeof err.detail === "string") {
        msg = err.detail;
      } else if (Array.isArray(err.detail) && err.detail[0]?.msg) {
        msg = err.detail[0].msg;
      } else if (err.message) {
        msg = err.message;
      }
    } catch {
      // not JSON
    }
    throw new Error(msg);
  }

  if (res.status === 204) {
    return {} as T;
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export function apiGet<T>(endpoint: string): Promise<T> {
  return request<T>(endpoint, { method: "GET" });
}

export function apiPost<T>(endpoint: string, body?: unknown): Promise<T> {
  return request<T>(endpoint, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiPatch<T>(endpoint: string, body?: unknown): Promise<T> {
  return request<T>(endpoint, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiPut<T>(endpoint: string, body?: unknown): Promise<T> {
  return request<T>(endpoint, {
    method: "PUT",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiDelete<T = unknown>(endpoint: string): Promise<T> {
  return request<T>(endpoint, { method: "DELETE" });
}

