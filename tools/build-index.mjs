#!/usr/bin/env node
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url);
const PROJECT_ROOT = ROOT.pathname; // path to repo root
const CHIPS_DIR = path.join(PROJECT_ROOT, 'src', 'assets', 'chips');
const OUT_FILE = path.join(CHIPS_DIR, 'chips-index.json');

async function listChips() {
  let items = [];
  try {
    items = await readdir(CHIPS_DIR, { withFileTypes: true });
  } catch (e) {
    return [];
  }
  const dirs = items.filter(d => d.isDirectory()).map(d => d.name);
  const results = [];
  for (const id of dirs) {
    try {
      const raw = await readFile(path.join(CHIPS_DIR, id, 'chip.json'), 'utf8');
      const chip = JSON.parse(raw);
      results.push({ id: chip.chipId ?? id, name: chip.name ?? id });
    } catch {
      // skip
    }
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

async function main() {
  const chips = await listChips();
  await writeFile(OUT_FILE, JSON.stringify(chips, null, 2) + '\n');
  console.log(`Wrote ${OUT_FILE} (${chips.length} chips)`);
}

main();

