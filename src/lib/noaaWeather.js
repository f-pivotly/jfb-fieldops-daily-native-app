// NOAA / NWS weather fetch helper for the Safety tab Climate section.
// Ported from jfb-fieldops-daily/src/lib/noaaWeather.ts. All fetch() calls
// route through fetchExternalJson (../data) rather than calling fetch()
// directly -- this project's eslint config forbids fetch() outside
// src/data/index.js, matching the existing pattern used by
// src/lib/dredge/aerial.js for the USGS basemap call.
//
// Strategy: try up to 5 nearest NWS stations (recent ~7 days, official
// data). If NWS returns nothing, fall back to Open-Meteo's archive
// endpoint (NOAA-derived reanalysis, back to 1940). Within the NWS path,
// precip specifically prefers the station's own reading and only
// cross-checks Open-Meteo's forecast endpoint when the station logged
// zero -- Open-Meteo is a gridded model and can badly overshoot a point
// measurement.
import { fetchExternalJson } from '../data'

const NWS_BASE = 'https://api.weather.gov'

export class NoaaFetchError extends Error {
  constructor(message) {
    super(message)
    this.name = 'NoaaFetchError'
  }
}

function cToF(c) {
  return c === null ? null : (c * 9) / 5 + 32
}
function msToMph(ms) {
  return ms === null ? null : ms * 2.23694
}
function kmhToMph(kmh) {
  return kmh === null ? null : kmh / 1.60934
}
function mmToIn(mm) {
  return mm === null ? null : mm / 25.4
}

function speedToMph(value, unitCode) {
  if (value === null || !unitCode) return null
  if (unitCode.endsWith('m_s-1') || unitCode.includes('m/s')) return msToMph(value)
  if (unitCode.endsWith('km_h-1') || unitCode.includes('km/h')) return kmhToMph(value)
  if (unitCode.includes('mph') || unitCode.includes('mi_h-1')) return value
  return null
}
function tempToF(value, unitCode) {
  if (value === null || !unitCode) return null
  if (unitCode.endsWith('degC') || unitCode.includes('°C')) return cToF(value)
  if (unitCode.endsWith('degF') || unitCode.includes('°F')) return value
  return null
}
function precipToIn(value, unitCode) {
  if (value === null || !unitCode) return null
  if (unitCode.includes('mm') || unitCode.endsWith('m')) return mmToIn(value)
  if (unitCode.includes('in')) return value
  return null
}

function compassFromDegrees(deg) {
  if (deg === null) return null
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const idx = Math.round((deg % 360) / 45) % 8
  return dirs[idx] ?? null
}

function roundOrNull(n) {
  return n === null || n === undefined ? null : Math.round(n)
}

// Aggregates one station's raw hourly observations into a daily summary.
function aggregate(obs) {
  if (obs.length === 0) {
    return {
      tempHighF: null, tempLowF: null, windHighMph: null, windGustsMph: null,
      windAvgMph: null, windDirection: null, precipTodayIn: null, conditions: null,
    }
  }

  const tempsF = []
  const windsMph = []
  const gustsMph = []
  const windDirs = []
  let precipAny = false
  const precipByHour = new Map()
  const conditionCounts = new Map()

  for (const o of obs) {
    const tF = tempToF(o.temperatureC, o.temperatureUnit)
    if (tF !== null) tempsF.push(tF)

    const w = speedToMph(o.windSpeed, o.windSpeedUnit)
    if (w !== null) windsMph.push(w)

    const g = speedToMph(o.windGust, o.windGustUnit)
    if (g !== null) gustsMph.push(g)

    if (o.windDirectionDeg !== null) windDirs.push(o.windDirectionDeg)

    // precipitationLastHour is a TRAILING-hour total; a dense station
    // re-reports the same hour every few minutes, so summing every ob
    // multiplies the same rain. Keep ONE value per clock hour (the last
    // ob in the hour) and sum those.
    const p = precipToIn(o.precipLastHour, o.precipUnit)
    if (p !== null) {
      precipAny = true
      const hourKey = o.timestamp ? o.timestamp.slice(0, 13) : `noTs-${precipByHour.size}`
      const prev = precipByHour.get(hourKey)
      if (!prev || (o.timestamp ?? '') >= prev.ts) precipByHour.set(hourKey, { ts: o.timestamp ?? '', inches: p })
    }

    if (o.textDescription) {
      conditionCounts.set(o.textDescription, (conditionCounts.get(o.textDescription) ?? 0) + 1)
    }
  }

  let conditions = null
  let maxCount = 0
  for (const [k, v] of conditionCounts) {
    if (v > maxCount) { conditions = k; maxCount = v }
  }

  // Wind direction = circular mean.
  let avgDirDeg = null
  if (windDirs.length > 0) {
    let sumSin = 0
    let sumCos = 0
    for (const d of windDirs) {
      const r = (d * Math.PI) / 180
      sumSin += Math.sin(r)
      sumCos += Math.cos(r)
    }
    avgDirDeg = (Math.atan2(sumSin, sumCos) * 180) / Math.PI
    if (avgDirDeg < 0) avgDirDeg += 360
  }

  const precipSum = [...precipByHour.values()].reduce((a, v) => a + v.inches, 0)

  return {
    tempHighF: tempsF.length > 0 ? Math.round(Math.max(...tempsF)) : null,
    tempLowF: tempsF.length > 0 ? Math.round(Math.min(...tempsF)) : null,
    windHighMph: windsMph.length > 0 ? Math.round(Math.max(...windsMph)) : null,
    windGustsMph: gustsMph.length > 0 ? Math.round(Math.max(...gustsMph)) : null,
    windAvgMph: windsMph.length > 0 ? Math.round(windsMph.reduce((a, b) => a + b, 0) / windsMph.length) : null,
    windDirection: compassFromDegrees(avgDirDeg),
    precipTodayIn: precipAny ? Math.round(precipSum * 100) / 100 : null,
    conditions,
  }
}

const WMO_CODE_LABELS = {
  0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Freezing Fog',
  51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
  56: 'Light Freezing Drizzle', 57: 'Freezing Drizzle',
  61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
  66: 'Light Freezing Rain', 67: 'Freezing Rain',
  71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 77: 'Snow Grains',
  80: 'Light Rain Showers', 81: 'Rain Showers', 82: 'Heavy Rain Showers',
  85: 'Light Snow Showers', 86: 'Snow Showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with Hail', 99: 'Heavy Thunderstorm with Hail',
}

// Open-Meteo Archive -- daily weather summary going back to 1940. Used
// when NWS has no observations at all for the requested date/location.
async function fetchOpenMeteoArchive(lat, lng, reportDateISO) {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
    `&start_date=${reportDateISO}&end_date=${reportDateISO}` +
    `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,precipitation_sum,weather_code` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`
  let json
  try {
    json = await fetchExternalJson(url)
  } catch (err) {
    throw new NoaaFetchError(`Open-Meteo archive failed: ${err.message}`)
  }
  const d = json.daily
  if (!d || !d.temperature_2m_max || d.temperature_2m_max.length === 0) {
    throw new NoaaFetchError(json.reason ?? 'Open-Meteo returned no daily data for this date / location.')
  }
  const i = 0
  const code = d.weather_code?.[i] ?? null
  return {
    tempHighF: roundOrNull(d.temperature_2m_max[i]),
    tempLowF: roundOrNull(d.temperature_2m_min?.[i] ?? null),
    windHighMph: roundOrNull(d.wind_speed_10m_max?.[i] ?? null),
    windGustsMph: roundOrNull(d.wind_gusts_10m_max?.[i] ?? null),
    windAvgMph: null,
    windDirection: compassFromDegrees(d.wind_direction_10m_dominant?.[i] ?? null),
    precipTodayIn:
      d.precipitation_sum?.[i] !== null && d.precipitation_sum?.[i] !== undefined
        ? Math.round(d.precipitation_sum[i] * 100) / 100
        : null,
    conditions: code !== null ? (WMO_CODE_LABELS[code] ?? `Code ${code}`) : null,
    source: 'Open-Meteo',
    sourceLabel: 'Open-Meteo Archive',
    observationCount: 1,
  }
}

// Open-Meteo Forecast endpoint -- covers today + recent past days. Used
// only to cross-check NWS precipitation when the station logged zero
// (most stations leave precipitationLastHour null even when it rained).
async function fetchOpenMeteoForecastPrecip(lat, lng, reportDateISO) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=precipitation_sum&past_days=14&forecast_days=1` +
    `&precipitation_unit=inch&timezone=auto`
  try {
    const json = await fetchExternalJson(url)
    const times = json.daily?.time ?? []
    const precips = json.daily?.precipitation_sum ?? []
    const idx = times.indexOf(reportDateISO)
    if (idx < 0) return null
    const v = precips[idx]
    if (v === null || v === undefined) return null
    return Math.round(v * 100) / 100
  } catch {
    return null
  }
}

// Fetch a one-day weather summary for a location + report date. Throws
// NoaaFetchError only when BOTH NWS and Open-Meteo fail.
export async function fetchNoaaDailySummary(lat, lng, reportDateISO) {
  let points
  try {
    points = await fetchExternalJson(`${NWS_BASE}/points/${lat},${lng}`)
  } catch (err) {
    throw new NoaaFetchError(`NWS /points failed: ${err.message}`)
  }
  const stationsUrl = points.properties?.observationStations
  if (!stationsUrl) {
    throw new NoaaFetchError('NWS returned no observation-stations URL for this point.')
  }

  let stationsJson
  try {
    stationsJson = await fetchExternalJson(stationsUrl)
  } catch (err) {
    throw new NoaaFetchError(`NWS stations list failed: ${err.message}`)
  }
  const stations = (stationsJson.features ?? [])
    .map((f) => ({ id: f.properties?.stationIdentifier ?? '', name: f.properties?.name ?? '' }))
    .filter((s) => s.id)
  if (stations.length === 0) {
    throw new NoaaFetchError('No observation stations found near this project.')
  }

  const start = `${reportDateISO}T00:00:00Z`
  const end = `${reportDateISO}T23:59:59Z`
  const tried = []
  const MAX_STATIONS = 5
  for (const station of stations.slice(0, MAX_STATIONS)) {
    tried.push(station.id)
    let obsJson
    try {
      obsJson = await fetchExternalJson(
        `${NWS_BASE}/stations/${station.id}/observations?start=${start}&end=${end}`,
      )
    } catch {
      continue // try the next station
    }

    const obs = (obsJson.features ?? []).map((f) => ({
      timestamp: f.properties?.timestamp ?? null,
      temperatureC: f.properties?.temperature?.value ?? null,
      temperatureUnit: f.properties?.temperature?.unitCode,
      windSpeed: f.properties?.windSpeed?.value ?? null,
      windSpeedUnit: f.properties?.windSpeed?.unitCode,
      windGust: f.properties?.windGust?.value ?? null,
      windGustUnit: f.properties?.windGust?.unitCode,
      windDirectionDeg: f.properties?.windDirection?.value ?? null,
      precipLastHour: f.properties?.precipitationLastHour?.value ?? null,
      precipUnit: f.properties?.precipitationLastHour?.unitCode,
      textDescription: f.properties?.textDescription ?? null,
    }))
    if (obs.length === 0) continue

    const summary = aggregate(obs)

    // Precip source: prefer the station's own reading whenever it
    // reported any precip -- fall back to Open-Meteo's forecast endpoint
    // only when the station logged NO precip at all.
    const omPrecip =
      summary.precipTodayIn == null ? await fetchOpenMeteoForecastPrecip(lat, lng, reportDateISO) : null
    const finalPrecip = summary.precipTodayIn != null ? summary.precipTodayIn : omPrecip

    return { ...summary, precipTodayIn: finalPrecip, source: 'NWS', sourceLabel: station.id, observationCount: obs.length }
  }

  // NWS came back empty across all tried stations -- fall back to
  // Open-Meteo's archive.
  try {
    return await fetchOpenMeteoArchive(lat, lng, reportDateISO)
  } catch (openMeteoErr) {
    throw new NoaaFetchError(
      `No data from NWS (${tried.length} nearest station${tried.length === 1 ? '' : 's'}: ${tried.join(', ')}) or Open-Meteo (${openMeteoErr.message}).`,
    )
  }
}
