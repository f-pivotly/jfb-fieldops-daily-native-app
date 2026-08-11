export function findDomainSource(dataAccess, domain) {
  return (Array.isArray(dataAccess) ? dataAccess : []).find(
    (d) => d?.domain === domain && d?.source_type === 'domain',
  )
}

export function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
