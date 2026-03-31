// frontend_service/lib/api.ts
const stripTrailing = (value: string) => value.replace(/\/+$/, "");

function resolveApiBase() {
  if (typeof window === "undefined") {
    const serverBase = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
    if (!serverBase) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Missing API_URL or NEXT_PUBLIC_API_URL for server-side API calls.");
      }
      return "http://localhost:5000";
    }
    return stripTrailing(serverBase);
  }

  const clientBase = process.env.NEXT_PUBLIC_API_BASE;
  if (!clientBase) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Missing NEXT_PUBLIC_API_BASE for client-side API calls.");
    }
    return "/backend";
  }
  return stripTrailing(clientBase);
}

const API_BASE = resolveApiBase();

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
  const authHeaders: Record<string, string> = {};
  if (typeof window !== "undefined") {
    const { getSession } = await import("next-auth/react");
    const session = await getSession();
    const token = session?.user?.backendToken;
    if (token) authHeaders.Authorization = `Bearer ${token}`;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders,
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
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ascendprep:auth-expired"));
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
