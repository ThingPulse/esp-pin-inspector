#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';

const ROOT = new URL('..', import.meta.url);
const PROJECT_ROOT = ROOT.pathname; // path to repo root
const ASSETS_DIR = path.join(PROJECT_ROOT, 'src', 'assets', 'chips');
const SCHEMA_PATH = path.join(PROJECT_ROOT, 'schemas', 'chip.schema.json');

async function loadSchema() {
  const schemaRaw = await readFile(SCHEMA_PATH, 'utf8');
  return JSON.parse(schemaRaw);
}

async function listChipDirs() {
  try {
    const items = await readdir(ASSETS_DIR, { withFileTypes: true });
    return items.filter(d => d.isDirectory()).map(d => path.join(ASSETS_DIR, d.name));
  } catch (e) {
    return [];
  }
}

async function validateAll() {
  const schema = await loadSchema();
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const dirs = await listChipDirs();
  let ok = true;
  for (const dir of dirs) {
    const p = path.join(dir, 'chip.json');
    try {
      const raw = await readFile(p, 'utf8');
      const data = JSON.parse(raw);
      const valid = validate(data);
      if (!valid) {
        ok = false;
        console.error(`Invalid: ${p}`);
        console.error(validate.errors);
      } else {
        console.log(`Valid: ${p}`);
      }
    } catch (e) {
      ok = false;
      console.error(`Failed to validate ${p}:`, e.message);
    }
  }
  if (!ok) process.exit(1);
}

validateAll();

