/**
 * i18n parity check.
 *
 * `en.json` is the reference: `types/dictionary.ts` derives `Dictionary` from it,
 * so any registered locale missing a key breaks the build with an opaque
 * "Two different types with this name exist" error several files away from the
 * cause. This turns that into a readable failure.
 *
 * Also reports dictionary files that exist on disk but are not registered in
 * `dictionaries.ts` — those render nothing and are a latent build break the
 * moment someone wires them up.
 *
 * Usage: node scripts/check-i18n.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const dictDir = join(root, 'dictionaries');
const REFERENCE = 'en';

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? flatten(value, path)
      : [path];
  });

const keysOf = (locale) =>
  new Set(flatten(JSON.parse(readFileSync(join(dictDir, `${locale}.json`), 'utf8'))));

// Locales actually wired into the app, read straight from dictionaries.ts so the
// two can never disagree.
const source = readFileSync(join(root, 'dictionaries.ts'), 'utf8');
const registered = [...source.matchAll(/^\s*(\w+):\s*\(\)\s*=>\s*import\(/gm)].map((m) => m[1]);

const onDisk = readdirSync(dictDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

if (!registered.includes(REFERENCE)) {
  console.error(`✖ reference locale "${REFERENCE}" is not registered in dictionaries.ts`);
  process.exit(1);
}

const reference = keysOf(REFERENCE);
let failed = false;

for (const locale of registered) {
  if (locale === REFERENCE) continue;
  const keys = keysOf(locale);
  const missing = [...reference].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !reference.has(k));

  if (missing.length || extra.length) {
    failed = true;
    console.error(`✖ ${locale}.json`);
    if (missing.length) console.error(`    missing ${missing.length}: ${missing.join(', ')}`);
    if (extra.length) console.error(`    not in ${REFERENCE} (${extra.length}): ${extra.join(', ')}`);
  } else {
    console.log(`✓ ${locale}.json — ${keys.size} keys`);
  }
}

const unregistered = onDisk.filter((l) => !registered.includes(l));
if (unregistered.length) {
  console.log('');
  for (const locale of unregistered) {
    const count = keysOf(locale).size;
    console.log(
      `! ${locale}.json is not registered in dictionaries.ts — ${count}/${reference.size} keys. ` +
        `It renders nothing today; registering it before the keys are complete breaks the build.`
    );
  }
}

if (failed) {
  console.error(`\n${registered.length} registered locales, reference "${REFERENCE}" — parity check failed.`);
  process.exit(1);
}

console.log(`\n${registered.length} registered locales in parity with "${REFERENCE}".`);
