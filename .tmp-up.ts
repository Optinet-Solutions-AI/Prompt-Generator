import fs from 'node:fs';
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const mcp = await import('./api/_higgsfield-mcp.ts');
const raw = await mcp.callTool('media_upload', { filename: 'probe.jpg', content_type: 'image/jpeg' });
console.log('TEXT', raw.text.replace(/https:[^\s"]+/g, '<url>').slice(0, 1200));
console.log('DATA', JSON.stringify(raw.data).replace(/https:[^"]+/g, '<url>').slice(0, 1200));
