// Scratch runner: uses the REAL stored connection via api/_higgsfield-mcp.ts.
import fs from 'node:fs';
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const mcp = await import('./api/_higgsfield-mcp.ts');
const [tool, args] = process.argv.slice(2);
const out = await mcp.callTool(tool, JSON.parse(args));
console.log(out.text.slice(0, 6000));
if (process.env.SHOW_DATA) console.log('DATA', JSON.stringify(out.data).slice(0, 6000));
