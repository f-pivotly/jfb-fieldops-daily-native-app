const HMS = /^(\d{1,2}):(\d{2}):(\d{2})$/

function hmsToSecs(t) {
  const m = HMS.exec(t)
  if (!m) return null
  const h = +m[1], mi = +m[2], s = +m[3]
  if (h > 23 || mi > 59 || s > 59) return null
  return h * 3600 + mi * 60 + s
}

export function parseBkt(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  const header = (lines[0] ?? '').trim()
  const placements = []
  const problems = []
  let blankLines = 0

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    if (!raw || !raw.trim()) { blankLines++; continue }
    const lineNo = i + 1
    const p = raw.trim().split(/\s+/)
    if (p.length !== 8) {
      problems.push({ line: lineNo, text: raw, reason: `expected 8 fields, got ${p.length}` })
      continue
    }
    const nums = p.slice(0, 7).map(Number)
    if (nums.some((n) => !Number.isFinite(n))) {
      problems.push({ line: lineNo, text: raw, reason: 'non-numeric field' })
      continue
    }
    const secsFromClock = hmsToSecs(p[7])
    if (secsFromClock === null) {
      problems.push({ line: lineNo, text: raw, reason: `bad time "${p[7]}"` })
      continue
    }
    if (Math.abs(secsFromClock - nums[6]) > 1) {
      problems.push({
        line: lineNo,
        text: raw,
        reason: `seconds field ${nums[6]} disagrees with clock ${p[7]} (${secsFromClock})`,
      })
      continue
    }
    placements.push({
      line: lineNo,
      x: nums[0],
      y: nums[1],
      elevationFt: -nums[2],
      station: nums[3],
      bucketWidthFt: nums[4],
      bucketLengthFt: nums[5],
      secs: secsFromClock,
      clock: p[7],
    })
  }

  return { header, placements, problems, blankLines }
}

export function bktTimeSpan(placements) {
  if (!placements?.length) return null
  const sorted = [...placements].sort((a, b) => a.secs - b.secs)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  return {
    firstSecs: first.secs,
    lastSecs: last.secs,
    first: first.clock,
    last: last.clock,
    spanHours: (last.secs - first.secs) / 3600,
  }
}

export function bktGaps(placements, minMinutes = 15) {
  const sorted = [...(placements ?? [])].sort((a, b) => a.secs - b.secs)
  const out = []
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].secs - sorted[i - 1].secs
    if (gap >= minMinutes * 60) {
      out.push({
        afterClock: sorted[i - 1].clock,
        beforeClock: sorted[i].clock,
        minutes: Math.round(gap / 60),
      })
    }
  }
  return out.sort((a, b) => b.minutes - a.minutes)
}
