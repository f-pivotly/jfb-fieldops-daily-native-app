import { fetchExternalJson } from '../../data'

export const PENOBSCOT_TIDE_STATION = '8414612'
export const PENOBSCOT_TIDE_STATION_NAME = 'Bangor, ME'

const COOPS = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'

function compact(dateISO) {
  return dateISO.replace(/-/g, '')
}

function nextDayISO(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function coopsUrl(params) {
  const url = new URL(COOPS)
  url.search = new URLSearchParams({
    product: 'predictions',
    application: 'jfb-fieldops-daily',
    datum: 'MLLW',
    units: 'english',
    format: 'json',
    ...params,
  }).toString()
  return url.toString()
}

export async function fetchTideHiLo(dateISO, station = PENOBSCOT_TIDE_STATION) {
  const out = []
  try {
    const j = await fetchExternalJson(coopsUrl({
      interval: 'hilo',
      station,
      begin_date: compact(dateISO),
      end_date: compact(dateISO),
      time_zone: 'lst_ldt',
    }))
    for (const p of j.predictions ?? []) {
      const v = Number(p.v)
      if (!Number.isFinite(v)) continue
      const [hh, mm] = p.t.slice(11, 16).split(':').map(Number)
      const ampm = hh >= 12 ? 'PM' : 'AM'
      const h12 = hh % 12 === 0 ? 12 : hh % 12
      out.push({
        timeLabel: `${h12}:${String(mm).padStart(2, '0')} ${ampm}`,
        heightFt: Math.round(v * 100) / 100,
        type: p.type === 'H' ? 'High' : 'Low',
      })
    }
  } catch {
    return out
  }
  return out
}

export async function fetchTidePredictions(dateISO, station = PENOBSCOT_TIDE_STATION) {
  const out = new Map()
  try {
    const j = await fetchExternalJson(coopsUrl({
      station,
      begin_date: compact(dateISO),
      end_date: compact(nextDayISO(dateISO)),
      time_zone: 'gmt',
      interval: '6',
    }))
    for (const p of j.predictions ?? []) {
      const t = Date.parse(`${p.t.replace(' ', 'T')}:00Z`)
      const v = Number(p.v)
      if (Number.isFinite(t) && Number.isFinite(v)) out.set(t, v)
    }
  } catch {
    return out
  }
  return out
}
