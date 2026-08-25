#!/usr/bin/env node
/**
 * Log completed work to the PMS kanban board.
 *
 *   node scripts/pms-update.mjs items.json
 *   node scripts/pms-update.mjs --check          # auth check only, writes nothing
 *
 * items.json is an array of:
 *   { "title": "...", "description": "...", "priority": "HIGH"|"MEDIUM"|"LOW" }
 *
 * WHY THE ODD CREATE-THEN-MOVE DANCE:
 * The board's Daily Report counts a task only if its activity log contains a
 * "MOVED → Done" event. Creating a card directly in Done logs only CREATED, so
 * the work never shows up in the report — it looks done on the board and is
 * invisible in the thing people actually read. Every card is therefore created
 * in Review/QA and then moved into Done.
 *
 * WHY WE READ EVERY CARD BACK:
 * PATCH is all-or-nothing. One bad field (a full ISO timestamp in dueDate, say)
 * returns 400 and silently discards the description and priority too, leaving a
 * card that exists, is assigned, and has an empty body — which looks like
 * success from the outside. So each card is re-fetched and asserted.
 *
 * Config comes from .env.local: PMS_BASE_URL, PMS_PROJECT_ID, PMS_API_TOKEN,
 * PMS_USER_ID, PMS_DONE_COLUMN_ID, PMS_REVIEW_COLUMN_ID.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) throw new Error('.env.local not found — cannot read PMS config');
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  const need = ['PMS_BASE_URL', 'PMS_PROJECT_ID', 'PMS_API_TOKEN', 'PMS_USER_ID',
                'PMS_DONE_COLUMN_ID', 'PMS_REVIEW_COLUMN_ID'];
  const missing = need.filter(k => !env[k]);
  if (missing.length) throw new Error(`.env.local is missing: ${missing.join(', ')}`);
  return env;
}

const env = loadEnv();
const BASE = env.PMS_BASE_URL;

async function api(method, route, body) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.PMS_API_TOKEN}`,
      'Content-Type': 'application/json',
      // Some state-changing routes check these for CSRF.
      Origin: BASE,
      Referer: `${BASE}/`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status} ${text.slice(0, 200)}`);
  return json;
}

// Plain YYYY-MM-DD. The API rejects a full ISO timestamp with
// "Invalid ISO date" even though that is the format it stores and returns.
function today() {
  return new Date().toISOString().slice(0, 10);
}

async function logItem(item, i, total) {
  const label = `[${i + 1}/${total}] ${item.title}`;

  // 1. Create in Review/QA — never directly in Done (see header).
  const created = await api('POST', `/api/projects/${env.PMS_PROJECT_ID}/tasks`, {
    title: item.title,
    columnId: env.PMS_REVIEW_COLUMN_ID,
    projectId: env.PMS_PROJECT_ID,
    createdById: env.PMS_USER_ID,
    priority: item.priority || 'MEDIUM',
  });
  const id = created?.id || created?.task?.id;
  if (!id) throw new Error(`${label}: created but no task id in response`);

  // 2. Body + assignee. Kept as one PATCH so a field error is loud, not partial.
  await api('PATCH', `/api/tasks/${id}`, {
    description: item.description,
    priority: item.priority || 'MEDIUM',
    dueDate: today(),
    assigneeIds: [env.PMS_USER_ID],
  });

  // 3. Move into Done so the Daily Report sees a MOVED → Done activity.
  await api('PATCH', `/api/tasks/${id}/move`, { columnId: env.PMS_DONE_COLUMN_ID, position: 0 });

  // 4. Read back — do not trust the write.
  const check = await api('GET', `/api/tasks/${id}`);
  const t = check?.task || check;
  const problems = [];
  if (!t.description || t.description.length < 40) problems.push(`description too short (${t.description?.length ?? 0} chars)`);
  if (!(t.assignees?.length || t.assigneeIds?.length)) problems.push('no assignee');
  const col = t.columnId || t.column?.id;
  if (col !== env.PMS_DONE_COLUMN_ID) problems.push(`not in Done (col ${col})`);

  console.log(problems.length ? `  FAIL ${label} — ${problems.join('; ')}` : `  ok   ${label}`);
  return problems.length === 0;
}

const arg = process.argv[2];

if (arg === '--check') {
  await api('GET', `/api/projects/${env.PMS_PROJECT_ID}/tasks`);
  const p = await api('GET', `/api/projects/${env.PMS_PROJECT_ID}`);
  console.log(`auth ok — project "${p.name}" (${p.status})`);
  process.exit(0);
}

if (!arg) {
  console.error('usage: node scripts/pms-update.mjs <items.json> | --check');
  process.exit(1);
}

const items = JSON.parse(fs.readFileSync(arg, 'utf8'));
console.log(`logging ${items.length} item(s) to "${env.PMS_PROJECT_ID}"\n`);

let ok = 0;
for (let i = 0; i < items.length; i++) {
  try {
    if (await logItem(items[i], i, items.length)) ok++;
  } catch (e) {
    console.log(`  FAIL [${i + 1}/${items.length}] ${items[i].title} — ${e.message}`);
  }
}
console.log(`\n${ok}/${items.length} logged and verified`);
process.exit(ok === items.length ? 0 : 1);
