/**
 * Typed fetch helper for all ASTNUM API routes.
 * Envelope contract: { ok: true, data } | { ok: false, error: { code, message } }
 */

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Static APK build (NEXT_PUBLIC_STATIC=1, inlined at export time): dispatch
  // to the in-browser adapter instead of the (non-existent) API routes. The
  // dynamic import keeps dev/server builds from ever bundling the adapter and
  // its seed data — the branch is dead code unless the flag was set at build.
  if (process.env.NEXT_PUBLIC_STATIC === "1") {
    const { localApiRequest } = await import("@/lib/local-api");
    return localApiRequest<T>(path, init);
  }

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError("network_error", "NETWORK_ERROR", 0);
  }

  let body: Envelope<T>;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError("bad_response", "BAD_RESPONSE", res.status);
  }

  if (!res.ok || !body.ok) {
    const err =
      !body.ok && "error" in body
        ? body.error
        : { code: `HTTP_${res.status}`, message: `Request failed (${res.status})` };
    throw new ApiError(err.message, err.code, res.status);
  }

  return body.data;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

/**
 * Mutating helpers — on success they schedule a home-screen-widget refresh
 * (debounced ~900ms in lib/widgets/sync; no-op on web). The import is
 * dynamic so this module stays free of the widget bundle at init time and
 * the api → widgets → api cycle only closes lazily.
 */
async function mutated<T>(p: Promise<T>): Promise<T> {
  const result = await p;
  try {
    const { scheduleWidgetSync } = await import("@/lib/widgets/sync");
    scheduleWidgetSync();
  } catch {
    /* widget sync is best-effort — never fail a mutation over it */
  }
  return result;
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return mutated(request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }));
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return mutated(request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }));
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return mutated(request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }));
}

export function apiDelete<T>(path: string): Promise<T> {
  return mutated(request<T>(path, { method: "DELETE" }));
}
