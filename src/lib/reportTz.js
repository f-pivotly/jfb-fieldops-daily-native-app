let zone

export function setReportTimeZone(tz) {
  zone = tz && String(tz).trim() ? String(tz).trim() : undefined
}

export function reportTimeZone() {
  return zone
}

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}
