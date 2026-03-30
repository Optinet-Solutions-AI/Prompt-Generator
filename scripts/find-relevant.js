#!/usr/bin/env node
/**
 * find-relevant.js
 *
 * Finds source files most likely relevant to a given keyword or problem.
 * Prints file paths + matching lines so Claude can read ONLY what matters.
 *
 * Usage:
 *   node scripts/find-relevant.js "generate variations"
 *   node scripts/find-relevant.js "ImageModal" --show-lines
 *   node scripts/find-relevant.js "supabase" --type ts
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args      = process.argv.slice(2);
const keyword   = args.find(a => !a.startsWith('--'));
const showLines = args.includes('--show-lines');
const typeFlag  = args.indexOf('--type');
const extFilter = typeFlag !== -1 ? `.${args[typeFlag + 1]}` : null;

if (!keyword) {
  console.error('Usage: node scripts/find-relevant.js <keyword> [--show-lines] [--type ts|tsx|js|...]');
  process.exit(1);
}

// Directories to always skip
const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.next', 'build', 'out',
  '.git', 'coverage', 'screenshots',
]);

// File extensions to search
const SEARCH_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.md', '.env',
]);

const results = []; // { file, lines: [{n, text}] }

function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env') continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (extFilter && ext !== extFilter) continue;
    if (!SEARCH_EXTS.has(ext)) continue;

    // Skip huge files
    try {
      const stat = fs.statSync(full);
      if (stat.size > 300_000) continue;
    } catch { continue; }

    let content;
    try { content = fs.readFileSync(full, 'utf8'); }
    catch { continue; }

    const re = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (!re.test(content)) continue;

    const matchLines = [];
    content.split('\n').forEach((line, i) => {
      if (re.test(line)) matchLines.push({ n: i + 1, text: line.trim() });
    });

    results.push({ file: path.relative(process.cwd(), full), lines: matchLines });
  }
}

walk(process.cwd());

if (results.length === 0) {
  console.log(`No files found containing "${keyword}"`);
  process.exit(0);
}

// Sort: files with more matches first
results.sort((a, b) => b.lines.length - a.lines.length);

console.log(`\nFiles relevant to "${keyword}" (${results.length} found):\n`);
for (const r of results) {
  console.log(`  ${r.file}  (${r.lines.length} match${r.lines.length !== 1 ? 'es' : ''})`);
  if (showLines) {
    for (const l of r.lines.slice(0, 5)) {
      console.log(`    L${l.n}: ${l.text.slice(0, 120)}`);
    }
    if (r.lines.length > 5) console.log(`    … and ${r.lines.length - 5} more`);
  }
}

console.log('\nTip: Read only these files instead of the whole codebase to save tokens.');
