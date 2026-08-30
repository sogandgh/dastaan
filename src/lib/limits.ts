import { apiFetch, describeError } from './api';

export type LimitUsage = { used: number; max: number; label: string };
export type Limits = Record<string, LimitUsage>;

export async function getLimits(): Promise<Limits> {
  const res = await apiFetch('/api/limits');
  if (!res.ok) throw new Error(await describeError(res));
  return res.json();
}
