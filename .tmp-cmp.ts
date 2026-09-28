import fs from 'node:fs';
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const mcp = await import('./api/_higgsfield-mcp.ts');
const { buildUgcPrompt, EMPTY_VIDEO_FORM, UGC_STYLES } = await import('./src/lib/ugc-video.ts');
const prompt = buildUgcPrompt({ ...EMPTY_VIDEO_FORM, ...UGC_STYLES[0], brand: 'Roosterbet', dialogue: 'No way… I actually won!' });
console.log('PROMPT:', prompt);
const common = { prompt, aspect_ratio: '9:16', duration: 5 };
const seed = await mcp.submitVideo({ ...common, model: 'seedance_2_5', resolution: '720p', generate_audio: true });
const kling = await mcp.submitVideo({ ...common, model: 'kling3_0', mode: 'pro', sound: 'on' } as never);
console.log('JOBS', JSON.stringify({ seed, kling }));
fs.writeFileSync(process.argv[2] + '/cmp-jobs.json', JSON.stringify({ seed, kling, prompt }));
