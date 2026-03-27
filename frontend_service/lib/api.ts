// frontend_service/lib/api.ts

const stripTrailing = (value: string) => value.replace(/\/+$/, "");

const SERVER_API_BASE = stripTrailing(
  process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"
);

const CLIENT_API_BASE = stripTrailing(process.env.NEXT_PUBLIC_API_BASE || "/backend");

const API_BASE = typeof window === "undefined" ? SERVER_API_BASE : CLIENT_API_BASE;

export class ApiError extends Error {
  status: number;
  statusText: string;
  data?: unknown;

  constructor(message: string, status: number, statusText: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.data = data;
  }
}

// Helper to join paths cleanly
export function apiUrl(path: string) {
  const cleanPath = path.replace(/^\/+/, "");
  if (API_BASE.endsWith("/api") && cleanPath.startsWith("api/")) {
    const trimmedPath = cleanPath.replace(/^api\//, "");
    return `${API_BASE}/${trimmedPath}`;
  }
  return `${API_BASE}/${cleanPath}`;
}

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const url = apiUrl(endpoint);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = `API Error: ${response.status} ${response.statusText}`;
    let errorData: unknown;
    try {
      errorData = await response.json();
      if (
        typeof errorData === "object" &&
        errorData !== null &&
        "message" in errorData &&
        typeof (errorData as { message?: unknown }).message === "string"
      ) {
        errorMessage = (errorData as { message: string }).message;
      }
    } catch {
      // If JSON parse fails, keep default message
    }
    throw new ApiError(errorMessage, response.status, response.statusText, errorData);
  }

  return response;
};

export const getJson = async <T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const res = await apiFetch(endpoint, { ...options, method: "GET" });
  return res.json();
};

export const postJson = async <T = any>(
  endpoint: string,
  data: any,
  options: RequestInit = {}
): Promise<T> => {
  const res = await apiFetch(endpoint, {
    ...options,
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json();
};
