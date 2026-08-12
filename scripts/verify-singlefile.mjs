
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')
const SIZE_BUDGET_BYTES = 2.5 * 1024 * 1024
const EXTERNAL_REF_PATTERN = /src="http|href="http|src="\/|href="\//

const failures = []

let entries
try {
  entries = readdirSync(distDir)
} catch (err) {
  console.error(`Cannot read ${distDir}: ${err.message}`)
  console.error('Run `npm run build` first.')
  process.exit(1)
}

if (entries.length !== 1) {
  failures.push(
    `Expected exactly one file in dist/, found ${entries.length}: ${entries.join(', ')}. ` +
    'A blob-URL iframe cannot resolve any file beside the entry HTML — inline it or remove it.'
  )
}

const indexPath = path.join(distDir, 'index.html')
let html = null
try {
  html = readFileSync(indexPath, 'utf8')
} catch {
  failures.push('dist/index.html does not exist.')
}

if (html !== null) {
  if (html.includes('live_commit')) {
    failures.push('Found the literal string "live_commit" in dist/index.html — submit_mode must stay restricted to {dry_run, mock_commit}.')
  }

  const externalRefMatch = html.match(EXTERNAL_REF_PATTERN)
  if (externalRefMatch) {
    failures.push(`Found an external/root-relative reference in dist/index.html: ${externalRefMatch[0]} — this will not resolve from a blob: URL.`)
  }

  const gzippedSize = gzipSync(Buffer.from(html, 'utf8')).length
  const gzippedMb = (gzippedSize / (1024 * 1024)).toFixed(2)
  if (gzippedSize > SIZE_BUDGET_BYTES) {
    failures.push(`dist/index.html is ${gzippedMb} MB gzipped, over the 2.5 MB budget.`)
  } else {
    console.log(`dist/index.html: ${gzippedMb} MB gzipped (budget: 2.5 MB)`)
  }
}

if (failures.length > 0) {
  console.error('\nverify-singlefile FAILED:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log('verify-singlefile OK — one file, no external refs, no live_commit, within size budget.')
