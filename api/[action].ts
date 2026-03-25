import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL             = process.env.SUPABASE_URL             || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function sbHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey':        SUPABASE_SERVICE_ROLE_KEY,
    ...extra,
  };
}

async function sbGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Supabase GET failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function sbPost(path: string, body: object, extra?: Record<string, string>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: sbHeaders(extra),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase POST failed (${res.status}): ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function sbPatch(path: string, body: object) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: sbHeaders({ 'Prefer': 'return=representation' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH failed (${res.status}): ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function sbDelete(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'DELETE',
    headers: sbHeaders(),
  });
  if (!res.ok) throw new Error(`Supabase DELETE failed (${res.status}): ${await res.text()}`);
  return true;
}

// Routes that still go through n8n (they involve GPT calls we want to keep there)
const N8N_ROUTES: Record<string, string | undefined> = {
  'regenerate-reference': process.env.N8N_WEBHOOK_REGENERATE_REFERENCE,
  'convert-to-html':      process.env.N8N_WEBHOOK_CONVERT_HTML,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;

  try {
    // ── Routes that still use n8n ──────────────────────────────────────────
    if (N8N_ROUTES[action] !== undefined) {
      const webhookUrl = N8N_ROUTES[action];
      if (!webhookUrl) {
        return res.status(500).json({ error: `n8n webhook not configured for: ${action}` });
      }
      const isGet = req.method === 'GET';
      const upstream = await fetch(webhookUrl, {
        method: isGet ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: isGet ? undefined : JSON.stringify(req.body),
      });
      if (!upstream.ok) {
        const errorText = await upstream.text();
        return res.status(500).json({ error: `n8n webhook failed for ${action}`, details: errorText });
      }
      return res.status(200).json(await upstream.json());
    }

    // ── Routes now handled directly via Supabase ───────────────────────────
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured' });
    }

    // LIST PROMPTS — used by the reference dropdown
    if (action === 'list-prompts') {
      const data = await sbGet(
        'web_image_analysis?select=id,prompt_name,brand_name,prompt_category&order=prompt_name.asc'
      );
      return res.status(200).json(Array.isArray(data) ? data : []);
    }

    // SAVE AS REFERENCE — save a blended/generated prompt as a new reference
    // Also handles 'save-prompt' (same operation — insert a new record)
    if (action === 'save-as-reference' || action === 'save-prompt') {
      const {
        title, brand_name, prompt_category,
        format_layout, primary_object, subject,
        lighting, mood, background,
        positive_prompt, negative_prompt,
        prompt_name,   // some callers send prompt_name directly
        image_name,
      } = req.body;

      const row = {
        prompt_name:     prompt_name || title || '',
        brand_name:      brand_name  || '',
        prompt_category: prompt_category || null,
        image_name:      image_name      || null,
        format_layout:   format_layout   || null,
        primary_object:  primary_object  || null,
        subject:         subject         || null,
        lighting:        lighting        || null,
        mood:            mood            || null,
        background:      background      || null,
        positive_prompt: positive_prompt || null,
        negative_prompt: negative_prompt || null,
      };

      const data = await sbPost(
        'web_image_analysis',
        row,
        { 'Prefer': 'return=representation' }
      );
      const result = Array.isArray(data) ? data[0] : data;
      return res.status(200).json(result);
    }

    // REMOVE REFERENCE — delete a prompt by its Supabase UUID
    if (action === 'remove-reference') {
      const { recordId } = req.body;
      if (!recordId) return res.status(400).json({ error: 'recordId is required' });
      await sbDelete(`web_image_analysis?id=eq.${recordId}`);
      return res.status(200).json({ success: true });
    }

    // RENAME REFERENCE — update the prompt_name
    if (action === 'rename-reference') {
      const { recordId, newName } = req.body;
      if (!recordId || !newName) return res.status(400).json({ error: 'recordId and newName are required' });
      const data = await sbPatch(
        `web_image_analysis?id=eq.${recordId}`,
        { prompt_name: newName }
      );
      const result = Array.isArray(data) ? data[0] : data;
      return res.status(200).json(result || { success: true });
    }

    // DELETE GENERATED IMAGE — remove from generated_images table AND storage file
    if (action === 'delete-generated-image') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id is required' });

      // 1. Fetch the record first to get storage_path
      const rows = await sbGet(`generated_images?id=eq.${id}&select=storage_path,public_url`);
      const row = Array.isArray(rows) ? rows[0] : rows;

      // 2. Delete the actual file from Supabase Storage (if storage_path exists)
      if (row?.storage_path) {
        try {
          const storagePath = row.storage_path;
          // Supabase Storage API: DELETE /storage/v1/object/{bucket}/{path}
          // storage_path format is typically "bucket-name/folder/file.png"
          const storageRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${storagePath}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey':        SUPABASE_SERVICE_ROLE_KEY,
            },
          });
          if (!storageRes.ok) {
            console.warn(`Storage delete failed (${storageRes.status}) for ${storagePath} — continuing with DB delete`);
          }
        } catch (e) {
          console.warn('Storage file delete failed, continuing with DB delete:', e);
        }
      }

      // 3. Delete the database row
      await sbDelete(`generated_images?id=eq.${id}`);
      return res.status(200).json({ success: true });
    }

    return res.status(404).json({ error: `Unknown API route: ${action}` });

  } catch (error) {
    console.error(`Error in API route "${action}":`, error);
    return res.status(500).json({
      error: `Failed to call ${action}`,
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
