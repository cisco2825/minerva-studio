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
} from '../types';

const BASE = '/api/v2';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

/** Paginated list — one entry per unique policyId (latest version). */
export async function fetchPoliciesPage(page = 0, size = 20): Promise<Page<PolicySummary>> {
  return handleResponse(await fetch(`${BASE}/policies?page=${page}&size=${size}`));
}

/** Aggregate counts by status — cheap single DB query. */
export async function fetchPolicyStats(): Promise<PolicyStats> {
  return handleResponse(await fetch(`${BASE}/policies/stats`));
}

/** @deprecated Use fetchPoliciesPage instead. Kept for versions tab usage. */
export async function fetchPolicies(): Promise<PolicySummary[]> {
  return handleResponse(await fetch(`${BASE}/policies`));
}

export async function fetchVersions(policyId: string): Promise<PolicySummary[]> {
  return handleResponse(await fetch(`${BASE}/policies/${policyId}/versions`));
}

export async function updateStatus(
  policyId: string,
  version: string,
  status: PolicyStatus,
): Promise<PolicySummary> {
  return handleResponse(
    await fetch(`${BASE}/policies/${policyId}/versions/${version}/status`, {
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
    await fetch(url, {
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
    await fetch(`${BASE}/policies/${policyId}/evaluations?page=${page}&size=${size}&sort=evaluatedAt,desc`),
  );
}

export async function fetchEvaluationDetail(id: string): Promise<EvaluationLogDetail> {
  return handleResponse(await fetch(`${BASE}/evaluations/${id}`));
}

export async function createPolicy(req: SavePolicyRequest): Promise<PolicySummary> {
  return handleResponse(
    await fetch(`${BASE}/policies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }),
  );
}

export async function fetchPolicyDefinition(policyId: string, version: string): Promise<Policy> {
  return handleResponse(await fetch(`${BASE}/policies/${policyId}/versions/${version}/definition`));
}

export async function updateDraftPolicy(
  policyId: string,
  version: string,
  req: SavePolicyRequest,
): Promise<PolicySummary> {
  return handleResponse(
    await fetch(`${BASE}/policies/${policyId}/versions/${version}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }),
  );
}
