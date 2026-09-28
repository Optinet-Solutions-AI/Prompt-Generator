import fs from 'node:fs';
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const mcp = await import('./api/_higgsfield-mcp.ts');
const S = process.argv[2]; const jobs = JSON.parse(fs.readFileSync(S + '/cmp-jobs.json', 'utf8'));
const t0 = Date.now(); const done: Record<string, unknown> = {};
while (Date.now() - t0 < 12 * 60 * 1000 && Object.keys(done).length < 2) {
  for (const k of ['seed', 'kling']) {
    if (done[k]) continue;
    const s = await mcp.videoStatus(jobs[k]);
    if (!['queued', 'pending', 'in_progress', 'processing', 'unknown'].includes(s.status)) {
      done[k] = s; console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${k}: ${s.status} ${s.url || s.error || ''}`);
    }
  }
  await new Promise(r => setTimeout(r, 5000));
}
fs.writeFileSync(S + '/cmp-results.json', JSON.stringify(done));
