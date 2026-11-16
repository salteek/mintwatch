// Mintwatch: a token launch radar for make.fun's token-radar-01 (Node 22, standard library only).
//
// Reads the sealed snapshot (/input/snapshot.json, or --input <file|dir>), prices it with
// dashboard/model.js (the same file the page runs, so the board and the page cannot disagree),
// and writes /output: board.json, data.js (the snapshot and the board for the page), dashboard/,
// screenshots/ and dossier.json.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const model = createRequire(import.meta.url)('./dashboard/model.js');

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && at + 1 < process.argv.length ? process.argv[at + 1]! : fallback;
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
if (!existsSync(inputFile)) {
  process.stderr.write(`mintwatch: no snapshot at ${inputFile}\n`);
  process.exit(2);
}

const snapshot = JSON.parse(readFileSync(inputFile, 'utf8'));
const radar = model.buildRadar(snapshot);
const rows = model.boardRows(radar);

// The gate's rules, checked before anything is written.
const problems: string[] = [];
const slugs = new Set(snapshot.protocols.map((p: { slug: string }) => p.slug));
if (rows.length < 100 || rows.length > 4000) problems.push(`${rows.length} rows`);
for (const w of snapshot.watchlist) if (!rows.some((r: { slug: string }) => r.slug === w)) problems.push(`watchlist ${w} missing`);
rows.forEach((r: any, i: number) => {
  if (!slugs.has(r.slug)) problems.push(`unknown slug ${r.slug}`);
  if (r.rank !== i + 1) problems.push(`rank ${r.rank} at ${i}`);
  if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1) problems.push(`value ${r.slug}`);
  if (i && r.implied_value_usd > rows[i - 1].implied_value_usd) problems.push(`order at ${r.slug}`);
  if (r.farm_steps.length < 3 || r.farm_steps.length > 12) problems.push(`steps ${r.slug}`);
  for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) problems.push(`step length ${r.slug}`);
});
if (problems.length) {
  process.stderr.write(`mintwatch: the board would fail the gate: ${problems.slice(0, 5).join('; ')}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ model: 'mintwatch-1', as_of: radar.as_of, fit: radar.fit, test: radar.test, rows })}\n`);
// The page re-runs model.js on this same snapshot and checks every row against the board.
const board = rows.map((r: any) => [r.slug, r.rank, r.implied_value_usd]);
writeFileSync(join(out, 'data.js'), `window.SNAPSHOT=${JSON.stringify(snapshot)};\nwindow.BOARD=${JSON.stringify(board)};\n`);

// Copy a directory's regular files, and drop any file a previous run left in `to` that the source no
// longer holds (a stale screenshot would otherwise reach the dossier and break its image cap).
function copyDir(from: string, to: string): string[] {
  mkdirSync(to, { recursive: true });
  const names = readdirSync(from).filter((n) => !n.startsWith('.') && statSync(join(from, n)).isFile()).sort();
  for (const n of readdirSync(to)) if (!names.includes(n) && statSync(join(to, n)).isFile()) unlinkSync(join(to, n));
  for (const n of names) copyFileSync(join(from, n), join(to, n));
  return names;
}
copyDir(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyDir(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`mintwatch: screenshots/ holds ${shots.length} images; hand in 3\n`);
  process.exit(1);
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));
process.stdout.write(`mintwatch: ${rows.length} rows (${radar.counts.watch} watchlist), fit on ${radar.counts.traded} traded tokens, LOO miss x${radar.test.median_miss} vs flat x${radar.test.flat_miss}\n`);
