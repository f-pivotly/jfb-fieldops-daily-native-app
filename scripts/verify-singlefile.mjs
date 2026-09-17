
// Build gate for `npm run verify:singlefile`. Run it after `npm run build`.
// The app ships as ONE self-contained HTML file that the Pivotly platform loads
// inside a blob: URL iframe. A blob: document has no origin and no base path, so
// anything the HTML does not carry inline is unreachable at runtime. Everything
// below is a check that the freshly built dist/ still satisfies that contract.
// Exit code 1 = do not ship this build.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve dist/ relative to this script so the command works from any cwd.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')

// Ceiling on the gzipped payload the platform has to push into the iframe.
const SIZE_BUDGET_BYTES = 2.5 * 1024 * 1024

// Matches absolute (http) and root-relative (/) asset references — both forms
// 404 from inside a blob: URL because there is no host to resolve them against.
const EXTERNAL_REF_PATTERN = /src="http|href="http|src="\/|href="\//

// Collect every problem instead of bailing on the first, so one run reports all of them.
const failures = []

// CHECK 0 — dist/ exists at all. A missing directory means the build never ran,
// which is a different mistake than a bad build, so it exits immediately with its own hint.
let entries
try {
  entries = readdirSync(distDir)
} catch (err) {
  console.error(`Cannot read ${distDir}: ${err.message}`)
  console.error('Run `npm run build` first.')
  process.exit(1)
}

// CHECK 1 — dist/ holds exactly one file. Any sibling file or folder (public/ assets,
// a stray chunk vite-plugin-singlefile failed to inline) is dead weight at runtime:
// the iframe can never fetch it. Inline it as a data URI or delete it.
if (entries.length !== 1) {
  failures.push(
    `Expected exactly one file in dist/, found ${entries.length}: ${entries.join(', ')}. ` +
    'A blob-URL iframe cannot resolve any file beside the entry HTML — inline it or remove it.'
  )
}

// Load the entry document. Everything after this point inspects its contents.
const indexPath = path.join(distDir, 'index.html')
let html = null
try {
  html = readFileSync(indexPath, 'utf8')
} catch {
  failures.push('dist/index.html does not exist.')
}

if (html !== null) {
  // CHECK 2 — safety interlock. The bundle must never contain the literal
  // "live_commit": submit_mode is allowed to be dry_run or mock_commit only, so a
  // build that reached this gate cannot write real records against production.
  if (html.includes('live_commit')) {
    failures.push('Found the literal string "live_commit" in dist/index.html — submit_mode must stay restricted to {dry_run, mock_commit}.')
  }

  // CHECK 3 — no unresolvable references left in the markup. Reports only the first
  // match; fix it and re-run to surface the next one.
  const externalRefMatch = html.match(EXTERNAL_REF_PATTERN)
  if (externalRefMatch) {
    failures.push(`Found an external/root-relative reference in dist/index.html: ${externalRefMatch[0]} — this will not resolve from a blob: URL.`)
  }

  // CHECK 4 — size budget. Gzips in memory (nothing is written) to measure what the
  // platform actually transfers, then either fails or prints the headroom you have left.
  const gzippedSize = gzipSync(Buffer.from(html, 'utf8')).length
  const gzippedMb = (gzippedSize / (1024 * 1024)).toFixed(2)
  if (gzippedSize > SIZE_BUDGET_BYTES) {
    failures.push(`dist/index.html is ${gzippedMb} MB gzipped, over the 2.5 MB budget.`)
  } else {
    console.log(`dist/index.html: ${gzippedMb} MB gzipped (budget: 2.5 MB)`)
  }
}

// Verdict. Every failure goes to stderr and the non-zero exit is what lets this be
// chained ahead of a deploy step (`npm run build && npm run verify:singlefile && ...`).
if (failures.length > 0) {
  console.error('\nverify-singlefile FAILED:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log('verify-singlefile OK — one file, no external refs, no live_commit, within size budget.')
