// frontend_service/lib/api.ts
// 1. Get the Backend URL from environment or default to localhost
const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_URL ||
  "http://localhost:5000"
).replace(/\/+$/, "");

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
    } catch (e) {
      // If JSON parse fails, ignore
    }
    throw new ApiError(errorMessage, response.status, response.statusText, errorData);
  }

  return response;
};

// 2. These were missing! We add them back now.
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