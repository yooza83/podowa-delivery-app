export interface GeocodeApiResult {
  address: string;
  ok: boolean;
  lat?: number;
  lng?: number;
  message?: string;
}

export interface OptimizeApiResult {
  searchOption: number;
  label: string;
  ok: boolean;
  message?: string;
  totalDistanceM?: number;
  totalTimeSec?: number;
  totalFareWon?: number;
  visitOrder?: string[];
  path?: [number, number][];
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (password: string) =>
    request<{ ok: boolean }>("/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  me: () => request<{ authed: boolean }>("/auth/me"),

  getConfig: () =>
    request<{ farmName: string; farmAddress: string }>("/config"),

  geocode: (addresses: string[]) =>
    request<{ results: GeocodeApiResult[] }>("/geocode", {
      method: "POST",
      body: JSON.stringify({ addresses }),
    }),

  optimize: (
    start: { name: string; lat: number; lng: number },
    waypoints: { id: string; lat: number; lng: number }[]
  ) =>
    request<{ results: OptimizeApiResult[] }>("/optimize", {
      method: "POST",
      body: JSON.stringify({ start, waypoints }),
    }),
};

export { ApiError };
