import type {
  EvaluationLogDetail,
  EvaluationLogSummary,
  EvaluationResult,
  Page,
  Policy,
  PolicyStats,
  PolicyStatus,
  PolicySummary,
  SavePolicyRequest,
  LookupSummary,
  LookupStatus,
  LookupUploadResponse,
  SaveLookupRequest,
  AuthResponse,
} from '../types';
import { getStoredToken } from '../contexts/AuthContext';

// In development, Vite proxies /api → localhost:8080 (see vite.config.ts).
// In production (Vercel), set VITE_API_BASE_URL to your Render backend URL,
// e.g. https://minerva-engine.onrender.com
const BASE = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v2`;

// ── Authenticated fetch wrapper ───────────────────────────────────────────────
// Automatically attaches Authorization header from localStorage.
// On 401, clears the token and reloads to force a redirect to /login.

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getStoredToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    headers: authHeaders(init?.headers),
  });
  if (res.status === 401) {
    // Token expired or invalid — clear and force a page reload to /login
    localStorage.removeItem('axiom_token');
    window.location.href = '/login';
    return res;   // unreachable, but satisfies TS
  }
  return res;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export async function apiLogin(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse<AuthResponse>(res);
}

export async function apiSignup(name: string, email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  return handleResponse<AuthResponse>(res);
}

export async function apiMe(): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/me`, {
    headers: authHeaders(),
  });
  return handleResponse<AuthResponse>(res);
}

export async function apiForgotPassword(email: string): Promise<void> {
  const res = await fetch(`${BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return handleResponse<void>(res);
}

export async function apiResetPassword(token: string, newPassword: string): Promise<void> {
  const res = await fetch(`${BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  return handleResponse<void>(res);
}

// ── Backward-compat helper ────────────────────────────────────────────────────
// Old backend returns a flat List<PolicySummary> that includes every version.
// New backend returns Page<PolicySummary> (one entry per unique policyId).
// This function normalises both shapes into a Page so the UI always works.

function groupToLatestUnique(summaries: PolicySummary[]): PolicySummary[] {
  const map = new Map<string, PolicySummary>();
  for (const s of summaries) {
    if (!map.has(s.policyId)) {
      map.set(s.policyId, { ...s, versionCount: 1 });
    } else {
      map.get(s.policyId)!.versionCount++;
    }
  }
  return Array.from(map.values());
}

/** Paginated list — one entry per unique policyId (latest version). */
export async function fetchPoliciesPage(page = 0, size = 20): Promise<Page<PolicySummary>> {
  const res = await apiFetch(`${BASE}/policies?page=${page}&size=${size}`);
  const data = await handleResponse<Page<PolicySummary> | PolicySummary[]>(res);

  // New API: already a Page object
  if (!Array.isArray(data)) return data;

  // Old API: flat array of all versions — group and paginate client-side
  const unique = groupToLatestUnique(data);
  const start = page * size;
  return {
    content: unique.slice(start, start + size),
    totalElements: unique.length,
    totalPages: Math.ceil(unique.length / size),
    number: page,
    size,
  };
}

/**
 * Aggregate counts by status — served from its own controller
 * at /api/v2/policy-stats to avoid /{policyId} route conflicts.
 * Returns null when the endpoint is unavailable.
 */
export async function fetchPolicyStats(): Promise<PolicyStats | null> {
  const res = await apiFetch(`${BASE}/policy-stats`);
  if (!res.ok) return null;
  return res.json() as Promise<PolicyStats>;
}

/** @deprecated Use fetchPoliciesPage instead. Kept for versions tab usage. */
export async function fetchPolicies(): Promise<PolicySummary[]> {
  return handleResponse(await apiFetch(`${BASE}/policies`));
}

/** Fetches all unique policies across all pages (for dropdowns etc.) */
export async function fetchAllPolicies(): Promise<PolicySummary[]> {
  const first = await fetchPoliciesPage(0, 100);
  if (first.totalPages <= 1) return first.content;
  const rest = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, i) => fetchPoliciesPage(i + 1, 100))
  );
  return [first, ...rest].flatMap(p => p.content);
}

export async function deletePolicy(policyId: string): Promise<void> {
  const res = await apiFetch(`${BASE}/policies/${policyId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete failed: ${res.status}`);
  }
}

export async function fetchVersions(policyId: string): Promise<PolicySummary[]> {
  return handleResponse(await apiFetch(`${BASE}/policies/${policyId}/versions`));
}

export async function updateStatus(
  policyId: string,
  version: string,
  status: PolicyStatus,
): Promise<PolicySummary> {
  return handleResponse(
    await apiFetch(`${BASE}/policies/${policyId}/versions/${version}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
  );
}

export async function evaluate(
  policyId: string,
  version: string | null,
  context: unknown,
  traceLevel: string,
  evaluatedBy: string,
): Promise<EvaluationResult> {
  const url = version
    ? `${BASE}/policies/${policyId}/versions/${version}/evaluate`
    : `${BASE}/policies/${policyId}/evaluate`;
  return handleResponse(
    await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, traceLevel, evaluatedBy: evaluatedBy || undefined }),
    }),
  );
}

export async function fetchEvaluations(
  policyId: string,
  page: number,
  size: number,
): Promise<Page<EvaluationLogSummary>> {
  return handleResponse(
    await apiFetch(`${BASE}/policies/${policyId}/evaluations?page=${page}&size=${size}&sort=evaluatedAt,desc`),
  );
}

export async function fetchEvaluationDetail(id: string): Promise<EvaluationLogDetail> {
  return handleResponse(await apiFetch(`${BASE}/evaluations/${id}`));
}

export async function createPolicy(req: SavePolicyRequest): Promise<PolicySummary> {
  return handleResponse(
    await apiFetch(`${BASE}/policies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }),
  );
}

export async function fetchPolicyDefinition(policyId: string, version: string): Promise<Policy> {
  return handleResponse(await apiFetch(`${BASE}/policies/${policyId}/versions/${version}/definition`));
}

export async function updateDraftPolicy(
  policyId: string,
  version: string,
  req: SavePolicyRequest,
): Promise<PolicySummary> {
  return handleResponse(
    await apiFetch(`${BASE}/policies/${policyId}/versions/${version}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }),
  );
}

// ── Lookup API ────────────────────────────────────────────────────────────────

export async function fetchLookupsPage(page = 0, size = 20): Promise<Page<LookupSummary>> {
  return handleResponse(await apiFetch(`${BASE}/lookups?page=${page}&size=${size}`));
}

/** Fetches all lookup summaries across all pages (for source selectors etc.) */
export async function fetchAllLookups(): Promise<LookupSummary[]> {
  const first = await fetchLookupsPage(0, 100);
  if (first.totalPages <= 1) return first.content;
  const rest = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, i) => fetchLookupsPage(i + 1, 100))
  );
  return [first, ...rest].flatMap(p => p.content);
}

/** Step 1 of create flow: upload the CSV file to S3, get back a fileRef. */
export async function uploadLookupFile(
  file: File,
  lookupId: string,
  version: string,
): Promise<LookupUploadResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('lookupId', lookupId);
  form.append('version', version);
  return handleResponse(
    await apiFetch(`${BASE}/lookups/upload`, { method: 'POST', body: form }),
  );
}

/** Step 2 of create flow: save the lookup definition record. */
export async function saveLookup(req: SaveLookupRequest): Promise<LookupSummary> {
  return handleResponse(
    await apiFetch(`${BASE}/lookups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }),
  );
}

export async function fetchLookupVersions(lookupId: string): Promise<LookupSummary[]> {
  return handleResponse(await apiFetch(`${BASE}/lookups/${lookupId}/versions`));
}

export async function updateLookupStatus(
  lookupId: string,
  version: string,
  status: LookupStatus,
): Promise<LookupSummary> {
  return handleResponse(
    await apiFetch(`${BASE}/lookups/${lookupId}/versions/${version}/status?status=${status}`, {
      method: 'PATCH',
    }),
  );
}

export async function downloadLookupFile(lookupId: string, version: string): Promise<void> {
  const res = await apiFetch(`${BASE}/lookups/${lookupId}/versions/${version}/download`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Download failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${lookupId}_${version}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function deleteLookup(lookupId: string): Promise<void> {
  const res = await apiFetch(`${BASE}/lookups/${lookupId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete failed: ${res.status}`);
  }
}
