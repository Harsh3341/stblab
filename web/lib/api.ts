// Typed client for the .NET backend. Paths are relative because next.config.ts proxies /api/* to the
// API origin, so nothing here needs to know where the backend lives.

const API_BASE = "/api/v1";

export type Volume = { level: number; max: number; muted: boolean };

export type Device = {
  manufacturer: string;
  model: string;
  softwareVersion: string;
};

export type StbState = {
  connected: boolean;
  isOn: boolean | null;
  currentApp: string | null;
  volume: Volume | null;
  device: Device | null;
  features: string[];
};

export type KeyDirection = "SHORT" | "START_LONG" | "END_LONG";

type ProblemDetails = {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
  suggestions?: string[];
};

/** Pulls the most useful sentence out of whatever shape the API failed with. */
function messageFrom(payload: unknown, status: number): string {
  const problem = payload as ProblemDetails | null;

  if (problem?.detail) {
    return problem.detail;
  }

  // ModelState failures come back as ValidationProblemDetails, which has no `detail`.
  const firstFieldError = problem?.errors
    ? Object.values(problem.errors)[0]
    : undefined;

  if (firstFieldError?.length) {
    return firstFieldError[0];
  }

  return problem?.title ?? `Request failed (${status})`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new Error("Cannot reach the API. Is the .NET backend running?");
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(messageFrom(payload, response.status));
  }

  if (payload === null) {
    throw new Error("The API returned an empty response.");
  }

  return payload as T;
}

export function getState(): Promise<StbState> {
  return request<StbState>("/remote/state");
}

export function sendKey(
  key: string,
  direction: KeyDirection = "SHORT",
): Promise<unknown> {
  return request("/remote/key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, direction }),
  });
}

export function sendText(text: string): Promise<unknown> {
  return request("/remote/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export function launchApp(app: string): Promise<unknown> {
  return request("/remote/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app }),
  });
}
