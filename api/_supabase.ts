// Shared Supabase helper used by all API routes.
// Uses server-side env vars (no VITE_ prefix — these never go to the browser).

export const SUPABASE_URL             = process.env.SUPABASE_URL             || '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function supabaseHeaders(): Record<string, string> {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey':        SUPABASE_SERVICE_ROLE_KEY,
  };
}

/** Simple GET helper — returns parsed JSON or throws */
export async function supabaseGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: supabaseHeaders(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase GET failed (${res.status}): ${err}`);
  }
  return res.json();
}

/** POST/upsert helper */
export async function supabasePost(path: string, body: object, extra?: Record<string, string>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), ...extra },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase POST failed (${res.status}): ${err}`);
  }
  // 201/204 may have no body
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

/** PATCH helper */
export async function supabasePatch(path: string, body: object) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase PATCH failed (${res.status}): ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

/** DELETE helper */
export async function supabaseDelete(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'DELETE',
    headers: supabaseHeaders(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase DELETE failed (${res.status}): ${err}`);
  }
  return true;
}
