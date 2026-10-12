#!/usr/bin/env node
// Local decision checks (ADR-010). Runs first in `pnpm build`.
// Each failure names the ADR it guards and the legal ways forward.
// Changing this file is the maintainer's call: propose it in a PR, do not merge it.
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '.')
const read = (p) => readFileSync(join(root, p), 'utf8')
const failures = []

// ADR-010: every ADR has a row in the CLAUDE.md index.
const index = read('CLAUDE.md')
for (const file of readdirSync(join(root, 'docs/adr')).filter((f) => /^\d{3}-.*\.md$/.test(f))) {
  if (!index.includes(`docs/adr/${file}`)) {
    failures.push(
      `ADR-010: docs/adr/${file} has no row in the CLAUDE.md "Decisions" index.\n` +
        `  Add a row naming what it decides and the paths that require reading it.`,
    )
  }
}

// ADR-001: the compose tag is the tag the ADR records.
const composeTag = read('deploy/docker-compose.yml').match(/image:\s*barassistant\/server:(\S+)/)?.[1]
const adrTag = read('docs/adr/001-bar-assistant-as-upstream-appliance.md').match(/currently\s+`([^`]+)`/)?.[1]
if (!composeTag || !adrTag) {
  failures.push(
    `ADR-001: could not read the pinned tag (compose: ${composeTag ?? 'not found'}, ADR-001: ${adrTag ?? 'not found'}).\n` +
      `  The backend image must be pinned to an exact tag in deploy/docker-compose.yml and recorded in ADR-001.`,
  )
} else if (composeTag !== adrTag) {
  failures.push(
    `ADR-001: deploy/docker-compose.yml pins barassistant/server:${composeTag} but ADR-001 records ${adrTag}.\n` +
      `  A tag bump is the maintainer's call: read the upstream changelog, re-test the client,\n` +
      `  and update ADR-001 in the same PR. If you did not mean to bump it, restore ${adrTag}.`,
  )
}

// ADR-007: the service worker never handles /bar/ or /search/.
const sw = read('public/sw.js')
for (const path of ['/bar/', '/search/']) {
  const guard = new RegExp(`^\\s*if\\s*\\([^\\n]*startsWith\\('${path}'\\)[^\\n]*\\)\\s*return;?\\s*$`, 'm')
  if (!guard.test(sw)) {
    failures.push(
      `ADR-007: public/sw.js no longer returns early for ${path}.\n` +
        `  The API and search are never cached: a stale stock answer is worse than none.\n` +
        `  Keep the early return. If the worker was restructured and still skips ${path},\n` +
        `  update this check in the same PR and say so in the PR body.`,
    )
  }
}

if (failures.length > 0) {
  console.error(`\nscripts/check.mjs: ${failures.length} decision check(s) failed\n`)
  for (const f of failures) console.error(`- ${f}\n`)
  console.error('See CLAUDE.md "Decisions". Do not edit an ADR or this check to make a change pass.\n')
  process.exit(1)
}
console.log('scripts/check.mjs: decision checks passed (ADR-001, ADR-007, ADR-010)')
