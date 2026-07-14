// design-sync prebuild for the EventHub UI kit (package shape, no dist).
// Two jobs, both deterministic — re-run before every converter/driver build:
//   1. Generate the bundle entry: `export *` from every ui/*.tsx except the
//      app-coupled ones, so window.EventHubUI carries every primitive + its
//      compound parts (CardHeader, DialogContent, …) for composition.
//   2. Compile Tailwind → .cache/ds-styles.css (cfg.cssEntry). The repo's
//      client/src/index.css is uncompiled (@tailwind directives) and holds the
//      custom `hover-elevate`/`toggle-elevate` @layer utilities that Button and
//      Badge depend on — so the design bundle needs the *compiled* stylesheet.
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const UI_DIR = 'client/src/components/ui';
// App-coupled — excluded from the bundle entirely (also null in componentSrcMap).
const EXCLUDE = new Set(['LocationButton.tsx']);
const CACHE = '.design-sync/.cache';

mkdirSync(CACHE, { recursive: true });

const files = readdirSync(UI_DIR)
  .filter((f) => f.endsWith('.tsx') && !EXCLUDE.has(f))
  .sort();
const entry =
  files.map((f) => `export * from "@/components/ui/${f.replace(/\.tsx$/, '')}";`).join('\n') + '\n';
writeFileSync(`${CACHE}/ds-entry.tsx`, entry);
console.error(`[prebuild] wrote ds-entry.tsx (${files.length} ui modules)`);

execFileSync(
  'npx',
  [
    'tailwindcss',
    '-c', '.design-sync/tailwind.ds.config.ts',
    '-i', 'client/src/index.css',
    '-o', `${CACHE}/ds-styles.css`,
    '--minify',
  ],
  { stdio: 'inherit' },
);
console.error(`[prebuild] compiled ds-styles.css`);
