export const TONE_STATUS_KEY = {
  positive: 'pass',
  negative: 'fail',
  caution: 'warn',
  info: 'review',
  neutral: 'na',
}

const POSITIVE = ['matched', 'confirmed', 'ok', 'pass', 'passed', 'active', 'new', 'complete', 'approved', 'succeeded', 'resolved', 'sent', 'submitted', 'current', 'healthy', 'clean', 'normal', 'synced', 'online']
const NEGATIVE = ['unmatched', 'failed', 'fail', 'error', 'blocked', 'blocking', 'rejected', 'critical', 'not_found', 'failed_retryable', 'failed_permanent', 'silent_failure']
const CAUTION = ['pending', 'needs_review', 'review', 'variance', 'warn', 'warning', 'rerun_requested', 'in_progress', 'pending_approval', 'quiet_expected', 'degraded', 'queued', 'running', 'ambiguous', 'stale', 'needs_rerun', 'offline']
const INFO = ['waived', 'overridden', 'manual', 'recovering']

export function toneFor(val) {
  const v = (val || '').toLowerCase()
  if (POSITIVE.includes(v)) return 'positive'
  if (NEGATIVE.includes(v)) return 'negative'
  if (CAUTION.includes(v)) return 'caution'
  if (INFO.includes(v)) return 'info'
  return 'neutral'
}
