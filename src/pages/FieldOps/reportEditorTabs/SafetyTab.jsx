import { Box, Text, SimpleGrid, Table, Stack, Group, Button, TextInput, NumberInput, Textarea, Select, Checkbox, FileButton, UnstyledButton } from '@mantine/core'
import { useState, useEffect } from 'react'
import { IconPlus, IconTrash, IconEye } from '@tabler/icons-react'
import { downloadAttachment, createDomainRecord, updateDomainRecord, readWrittenRecordId, executeDataView, fetchCurrentUser } from '../../../data'
import { fetchNoaaDailySummary } from '../../../lib/noaaWeather'
import { useCultureTenants } from '../../../hooks/useCultureTenants'
import { useProject } from '../../../hooks/useProject'
import { useReportSafety } from '../../../hooks/useReportSafety'
import { useReportSafetyForm } from '../../../hooks/useReportSafetyForm'
import { useReportCrewSummary } from '../../../hooks/useReportCrewSummary'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { useFieldOpsAction } from '../../../contexts/fieldOpsAccessContext'
import { useAppConfig } from '../../../contexts/appConfigContext'
import SiteEquipmentTab from '../projectSettingsTabs/SiteEquipmentTab'
import { usePrefillOffer } from './hooks/usePrefillOffer'
import { useSignatureUpload } from './hooks/useSignatureUpload'
import { useCrewSeeding } from './hooks/useCrewSeeding'
import { priorReportsFor, findMostRecentCrewSummary, findMostRecentPlanOfDay, fetchUserSignature, formatMonthDay } from './hooks/safetyHistoryLookups'

// Daily Safety Updates (including Culture Tenant), Sign-off (both
// preparer and SSHO name/signature), Crew Summary, and Climate Summary
// are all wired to real jfb_report_safety_v2 / jfb_report_crew_summary_v2
// persistence. Remaining gaps are tracked in SAFETY_GAPS.md.

const EMPTY_DAILY_UPDATES = {
  jhaAhaReviewed: '',
  highRiskTask: '',
  toolboxTopic: '',
  afternoonTopic: '',
  incidents: '',
  planOfDay: '',
  nextDaySummary: '',
}

function dailyUpdatesFromRow(row) {
  return {
    jhaAhaReviewed: row?.jha_aha_reviewed ?? '',
    highRiskTask: row?.high_risk_task ?? '',
    toolboxTopic: row?.safety_meeting_topic ?? '',
    afternoonTopic: row?.afternoon_meeting_topic ?? '',
    incidents: row?.incidents_to_report ?? '',
    planOfDay: row?.plan_of_day ?? '',
    nextDaySummary: row?.next_day_summary ?? '',
  }
}

const DAILY_UPDATE_COLUMNS = {
  jhaAhaReviewed: 'jha_aha_reviewed',
  highRiskTask: 'high_risk_task',
  toolboxTopic: 'safety_meeting_topic',
  afternoonTopic: 'afternoon_meeting_topic',
  incidents: 'incidents_to_report',
  planOfDay: 'plan_of_day',
  nextDaySummary: 'next_day_summary',
}

const EMPTY_CLIMATE = {
  tempHighF: null,
  tempLowF: null,
  windHigh: null,
  windGusts: null,
  windAvg: null,
  windDirection: '',
  precipTodayIn: null,
  conditions: '',
}

const CLIMATE_COLUMNS = {
  tempHighF: 'temp_high_f',
  tempLowF: 'temp_low_f',
  windHigh: 'wind_high_mph',
  windGusts: 'wind_gusts_mph',
  windAvg: 'wind_avg_mph',
  windDirection: 'wind_direction',
  precipTodayIn: 'precip_today_in',
  conditions: 'conditions',
}

function climateFromRow(row) {
  return {
    tempHighF: row?.temp_high_f ?? null,
    tempLowF: row?.temp_low_f ?? null,
    windHigh: row?.wind_high_mph ?? null,
    windGusts: row?.wind_gusts_mph ?? null,
    windAvg: row?.wind_avg_mph ?? null,
    windDirection: row?.wind_direction ?? '',
    precipTodayIn: row?.precip_today_in ?? null,
    conditions: row?.conditions ?? '',
  }
}

const WIND_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

// Reference app's actual server-enforced Supabase Storage bucket limit
// (sql/2026-06-04_signatures.sql: 524288 bytes / 512KB) -- its own UI
// copy says "500KB", which doesn't match what it enforces. Native has no
// dedicated bucket/size cap at all yet, so this is the one real number to
// enforce and advertise consistently, checked client-side before upload.
const MAX_SIGNATURE_BYTES = 524288

export default function SafetyTab({ project, report, reports = [] }) {
  const { config } = useAppConfig()
  const { cultureTenants } = useCultureTenants()
  const { update: updateProject, updating: savingLocation } = useProject(project?.id)
  const canEditLocation = useFieldOpsAction('manage_project_location')

  // Shared save/error indicator for the whole tab, mirroring the reference
  // app's top-right "Saved ✓" label and top-of-tab red error banner --
  // every save path below reports into this via markSuccess/markError.
  const { message: saved, error: saveError, markSuccess, markError } = useAsyncAction()

  const {
    reportSafety, loading: safetyLoading,
    create: createReportSafety, update: updateReportSafety,
  } = useReportSafety(report?.id)
  const {
    onFieldChange: onSafetyFieldChange, flush: flushSafetyField,
    saveImmediate: saveSafetyImmediate, ensureRow: ensureSafetyRow,
  } = useReportSafetyForm({ reportId: report?.id, reportSafety, create: createReportSafety, update: updateReportSafety })

  function handleFieldBlur() {
    flushSafetyField().then(markSuccess).catch((err) => markError(err.message))
  }

  const activeTenants = cultureTenants
    .filter((t) => t.active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const [tenantId, setTenantId] = useState(null)
  const selectedTenant = activeTenants.find((t) => t.id === tenantId) ?? null

  const [updates, setUpdates] = useState(EMPTY_DAILY_UPDATES)
  function setUpdate(key, value) {
    setUpdates((prev) => ({ ...prev, [key]: value }))
    onSafetyFieldChange(DAILY_UPDATE_COLUMNS[key], value)
  }

  const [sshoName, setSshoName] = useState('')
  function setSshoNameField(value) {
    setSshoName(value)
    onSafetyFieldChange('ssho_name', value)
  }

  const [preparerName, setPreparerName] = useState('')
  function setPreparerNameField(value) {
    setPreparerName(value)
    onSafetyFieldChange('signature_name', value)
  }

  // Declared here (rather than down by the rest of the Climate Summary
  // state) because the sync block below sets both on load -- a `const`
  // referenced before its declaration in the same function throws, so
  // these can't live below that block the way climate's later logic does.
  const [climate, setClimate] = useState(EMPTY_CLIMATE)
  const [precipBaseToday, setPrecipBaseToday] = useState(0)

  // Seed the form from jfb_report_safety_v2 once, per report, after its fetch
  // resolves -- gated on !safetyLoading rather than reportSafety itself,
  // since a null row (no Safety data saved yet for this report) is a valid
  // terminal state, not a sign the fetch is still in flight.
  const [safetySyncedFor, setSafetySyncedFor] = useState(null)
  if (report?.id && !safetyLoading && safetySyncedFor !== report.id) {
    setSafetySyncedFor(report.id)
    setTenantId(reportSafety?.culture_tenant_id ?? null)
    setUpdates(dailyUpdatesFromRow(reportSafety))
    setSshoName(reportSafety?.ssho_name ?? '')
    setPreparerName(reportSafety?.signature_name ?? config.user?.name ?? '')
    setClimate(climateFromRow(reportSafety))
    setPrecipBaseToday(Number(reportSafety?.precip_today_in ?? 0) || 0)
  }

  function selectTenant(id) {
    setTenantId(id)
    saveSafetyImmediate('culture_tenant_id', id).then(markSuccess).catch((err) => markError(err.message))
  }

  const {
    crewSummary, loading: crewLoading,
    create: createCrewRow, update: updateCrewRow, remove: removeCrewRow,
  } = useReportCrewSummary(report?.id)

  const { seeding: crewSeeding } = useCrewSeeding({
    report, reports, appSlug: config.appSlug, crewLoading, crewSummary, createCrewRow,
  })

  const [crew, setCrew] = useState([])
  const [crewSyncedFor, setCrewSyncedFor] = useState(null)
  // Seeding creates rows one at a time, so crewSummary can briefly hold
  // only some of the seeded rows -- crewSeeding gates the sync below so a
  // partial snapshot never gets locked in as "synced" mid-seed.
  if (report?.id && !crewLoading && !crewSeeding && crewSummary.length > 0 && crewSyncedFor !== report.id) {
    setCrewSyncedFor(report.id)
    setCrew(
      [...crewSummary]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((r) => ({
          id: r.id, category: r.category ?? '', count: r.count ?? 0,
          hours: Number(r.hours) || 0, sort_order: r.sort_order ?? 0,
        })),
    )
  }

  const crewAllBlank = crew.length > 0 && crew.every((c) => (c.count ?? 0) === 0 && (c.hours ?? 0) === 0)

  // "Use crew from M/D" pre-fill: only offered once every current crew row
  // is blank, same gate as the reference app, so a real entry is never
  // silently overwritten.
  const crewOffer = usePrefillOffer({
    enabled: !!report?.id && !crewLoading && crewAllBlank,
    fetchOffer: () => findMostRecentCrewSummary(priorReportsFor(reports, report), config.appSlug),
    deps: [report?.id, crewLoading, crewAllBlank, reports, config.appSlug],
  })

  function updateCrew(id, patch) {
    setCrew((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }
  function flushCrewField(id) {
    const row = crew.find((c) => c.id === id)
    if (!row) return
    updateCrewRow(id, { category: row.category, count: row.count, hours: row.hours })
      .then(markSuccess)
      .catch((err) => {
        console.error('Failed to save crew row:', err.message)
        markError(err.message)
      })
  }
  async function addCrew() {
    if (!report?.id) return
    const nextSort = crew.length === 0 ? 10 : Math.max(...crew.map((c) => c.sort_order ?? 0)) + 10
    try {
      const res = await createCrewRow({ report_id: report.id, category: '', count: 0, hours: 0, sort_order: nextSort })
      const newId = readWrittenRecordId(res)
      if (newId) setCrew((prev) => [...prev, { id: newId, category: '', count: 0, hours: 0, sort_order: nextSort }])
      markSuccess()
    } catch (err) {
      console.error('Failed to add crew row:', err.message)
      markError(err.message)
    }
  }
  async function removeCrew(id) {
    setCrew((prev) => prev.filter((c) => c.id !== id))
    try {
      await removeCrewRow(id)
      markSuccess()
    } catch (err) {
      console.error('Failed to delete crew row:', err.message)
      markError(err.message)
    }
  }
  async function acceptCrewPrefill() {
    if (!crewOffer.offer || crewOffer.accepting) return
    try {
      await crewOffer.runAccept(async () => {
        const priorByCategory = new Map(crewOffer.offer.rows.map((r) => [r.category, r]))
        await Promise.all(
          crew.map(async (row) => {
            const prior = priorByCategory.get(row.category)
            if (!prior) return
            const count = prior.count ?? 0
            const hours = Number(prior.hours) || 0
            updateCrew(row.id, { count, hours })
            await updateCrewRow(row.id, { count, hours })
          }),
        )
      })
      crewOffer.setPreviewOpen(false)
      markSuccess()
    } catch (err) {
      console.error('Failed to insert crew from prior report:', err.message)
      markError(err.message)
    }
  }

  // "Use plan from M/D" pre-fill: fetched unconditionally on report load
  // (not gated on the field being blank), matching the reference app --
  // deliberate, so the button reappears if a PE clears a pre-filled
  // field. Only the button's own visibility is gated on the field being
  // empty, at render time below.
  const planOffer = usePrefillOffer({
    enabled: !!report?.id && !safetyLoading,
    fetchOffer: () => findMostRecentPlanOfDay(priorReportsFor(reports, report), config.appSlug),
    deps: [report?.id, safetyLoading, reports, config.appSlug],
  })
  function acceptPlanPrefill() {
    if (!planOffer.offer) return
    setUpdates((prev) => ({ ...prev, planOfDay: planOffer.offer.content }))
    saveSafetyImmediate(DAILY_UPDATE_COLUMNS.planOfDay, planOffer.offer.content)
      .then(markSuccess)
      .catch((err) => markError(err.message))
    planOffer.setPreviewOpen(false)
  }

  function setClimateField(key, value) {
    setClimate((prev) => ({ ...prev, [key]: value }))
    onSafetyFieldChange(CLIMATE_COLUMNS[key], value)
  }

  // Precip MTD / Project Total: derived live via a Pivotly data view (sums
  // precip_today_in across every report for this project, same as the
  // reference app's fetchPrecipSums), not stored fields. precipBaseToday
  // caches the value precip_today_in had at load time (set in the sync
  // block above) so typing updates the displayed sums optimistically
  // before the 2s debounce actually saves: display = sums + (typed - base).
  const [precipSums, setPrecipSums] = useState({ mtdIn: 0, ptdIn: 0 })
  useEffect(() => {
    if (!project?.id || !report?.report_date) return
    let cancelled = false
    const monthStart = `${report.report_date.slice(0, 7)}-01`
    executeDataView('dvw-jfb-precip-sums', {
      p_project_id: project.id, p_month_start: monthStart, p_end_date: report.report_date,
    })
      .then((rows) => {
        if (cancelled) return
        const row = rows?.[0] ?? {}
        setPrecipSums({ mtdIn: Number(row.mtd_in) || 0, ptdIn: Number(row.ptd_in) || 0 })
      })
      .catch((err) => console.error('Failed to load precip sums:', err.message))
    return () => { cancelled = true }
  }, [project?.id, report?.report_date])
  const precipDelta = (Number(climate.precipTodayIn) || 0) - precipBaseToday
  const displayMtdIn = precipSums.mtdIn + precipDelta
  const displayPtdIn = precipSums.ptdIn + precipDelta

  const [locationProjectId, setLocationProjectId] = useState(project?.id ?? null)
  const [location, setLocation] = useState({
    latitude: project?.latitude != null ? String(project.latitude) : '',
    longitude: project?.longitude != null ? String(project.longitude) : '',
  })
  if (project && project.id !== locationProjectId) {
    setLocationProjectId(project.id)
    setLocation({
      latitude: project.latitude != null ? String(project.latitude) : '',
      longitude: project.longitude != null ? String(project.longitude) : '',
    })
  }
  const [locationSavedAt, setLocationSavedAt] = useState(null)
  const [locationError, setLocationError] = useState(null)
  async function saveLocation() {
    if (!project?.id) return
    const latRaw = location.latitude.trim()
    const lngRaw = location.longitude.trim()
    if (latRaw === '' && lngRaw === '') {
      setLocationError(null)
      await updateProject(project.id, { latitude: null, longitude: null })
      setLocationSavedAt((n) => (n ?? 0) + 1)
      return
    }
    const lat = Number(latRaw)
    const lng = Number(lngRaw)
    if (latRaw === '' || lngRaw === '' || Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setLocationError('Latitude must be between -90 and 90, longitude between -180 and 180.')
      return
    }
    setLocationError(null)
    try {
      await updateProject(project.id, { latitude: lat, longitude: lng })
      setLocationSavedAt((n) => (n ?? 0) + 1)
    } catch (err) {
      markError(err.message)
    }
  }

  const [noaaFetching, setNoaaFetching] = useState(false)
  const [noaaMessage, setNoaaMessage] = useState(null)
  // Reads the local location form state (what was actually just typed/saved),
  // not the project prop -- the parent doesn't refetch/re-pass a fresh
  // project object after this component's own saveLocation() call, so
  // project.latitude/longitude can stay stale (still null) even right after
  // a successful save. location state is always current.
  const hasLatLng = location.latitude.trim() !== '' && location.longitude.trim() !== ''
    && !Number.isNaN(Number(location.latitude)) && !Number.isNaN(Number(location.longitude))
  async function handleNoaaFetch() {
    if (!hasLatLng || !report?.report_date) return
    setNoaaFetching(true)
    setNoaaMessage(null)
    try {
      const summary = await fetchNoaaDailySummary(Number(location.latitude), Number(location.longitude), report.report_date)
      const patch = {}
      const localPatch = {}
      const apply = (col, key, value) => { patch[col] = value; localPatch[key] = value }
      if (summary.tempHighF !== null) apply('temp_high_f', 'tempHighF', summary.tempHighF)
      if (summary.tempLowF !== null) apply('temp_low_f', 'tempLowF', summary.tempLowF)
      if (summary.windHighMph !== null) apply('wind_high_mph', 'windHigh', summary.windHighMph)
      if (summary.windGustsMph !== null) apply('wind_gusts_mph', 'windGusts', summary.windGustsMph)
      if (summary.windAvgMph !== null) apply('wind_avg_mph', 'windAvg', summary.windAvgMph)
      if (summary.windDirection !== null) apply('wind_direction', 'windDirection', summary.windDirection)
      if (summary.precipTodayIn !== null) apply('precip_today_in', 'precipTodayIn', summary.precipTodayIn)
      if (summary.conditions !== null) apply('conditions', 'conditions', summary.conditions)
      setClimate((prev) => ({ ...prev, ...localPatch }))
      const rowId = await ensureSafetyRow()
      if (rowId) await updateReportSafety(rowId, patch)
      setNoaaMessage(
        summary.source === 'NWS'
          ? `Filled from NWS station ${summary.sourceLabel} (${summary.observationCount} hourly obs).`
          : `Filled from ${summary.sourceLabel} — date is outside the NWS 7-day window, used NOAA-derived archive as fallback.`,
      )
      markSuccess()
    } catch (err) {
      setNoaaMessage(`NOAA fetch failed: ${err.message}`)
    } finally {
      setNoaaFetching(false)
    }
  }

  const [saveAsDefaultSignature, setSaveAsDefaultSignature] = useState(false)

  const [currentUserId, setCurrentUserId] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetchCurrentUser()
      .then((me) => { if (!cancelled) setCurrentUserId(me?.id ?? null) })
      .catch((err) => console.error('Failed to fetch current user:', err.message))
    return () => { cancelled = true }
  }, [])

  // The signed-in user's own saved default signature -- offered as a
  // preview/accept pre-fill on the preparer signature block (same UX
  // pattern as "Use plan from M/D") when this report has none of its own
  // yet. Once accepted it's copied onto this report's real
  // signature_image_path, so PDF generation needs no fallback logic of
  // its own -- it already reads that column. Scoped to the preparer
  // block only, not SSHO: "my saved signature" only makes sense for the
  // person currently filling out the report, and the SSHO is typically
  // someone else. Kept separate from usePrefillOffer/useSignatureUpload:
  // the fetched row is also consumed by preparerSignature's onUploaded
  // "save as default" branch below, so it can't be an opaque offer value.
  const [userSignature, setUserSignature] = useState(null)
  useEffect(() => {
    if (!currentUserId) return
    let cancelled = false
    fetchUserSignature(currentUserId, config.appSlug)
      .then((row) => { if (!cancelled) setUserSignature(row) })
      .catch((err) => console.error('Failed to load saved signature:', err.message))
    return () => { cancelled = true }
  }, [currentUserId, config.appSlug])

  const [userSignatureUrl, setUserSignatureUrl] = useState(null)
  useEffect(() => {
    if (!userSignature?.signature_image_path) return
    let cancelled = false
    downloadAttachment(userSignature.signature_image_path)
      .then((blob) => { if (!cancelled) setUserSignatureUrl(URL.createObjectURL(blob)) })
      .catch((err) => {
        console.error('Failed to load saved signature image:', err.message)
        if (!cancelled) markError(`Failed to load saved signature: ${err.message}`)
      })
    return () => { cancelled = true }
  }, [userSignature?.signature_image_path, markError])

  const preparerSignature = useSignatureUpload({
    existingFileId: reportSafety?.signature_image_path,
    ensureRecordId: ensureSafetyRow,
    updateRecord: updateReportSafety,
    domain: 'jfb_report_safety_v2',
    column: 'signature_image_path',
    maxBytes: MAX_SIGNATURE_BYTES,
    onUploaded: async (fileId, file) => {
      if (!saveAsDefaultSignature || !currentUserId) return
      if (userSignature?.id) {
        await updateDomainRecord({
          domain: 'jfb_user_signatures', system: 'core', appSlug: config.appSlug,
          recordId: userSignature.id, recordData: { signature_image_path: fileId },
        })
        setUserSignature((prev) => ({ ...prev, signature_image_path: fileId }))
      } else {
        const res = await createDomainRecord({
          domain: 'jfb_user_signatures', system: 'core', appSlug: config.appSlug,
          recordData: { user_id: currentUserId, signature_image_path: fileId },
        })
        setUserSignature({ id: readWrittenRecordId(res), user_id: currentUserId, signature_image_path: fileId })
      }
      setUserSignatureUrl(URL.createObjectURL(file))
    },
    onSaved: markSuccess,
    onError: (msg) => {
      console.error('Failed to upload signature:', msg)
      markError(msg)
    },
  })

  const [savedSignaturePreview, setSavedSignaturePreview] = useState(false)
  async function acceptSavedSignature() {
    if (!userSignature?.signature_image_path) return
    const rowId = await ensureSafetyRow()
    if (!rowId) return
    try {
      await updateReportSafety(rowId, { signature_image_path: userSignature.signature_image_path })
      preparerSignature.setUrl(userSignatureUrl)
      setSavedSignaturePreview(false)
      markSuccess()
    } catch (err) {
      console.error('Failed to use saved signature:', err.message)
      markError(err.message)
    }
  }

  const sshoSignature = useSignatureUpload({
    existingFileId: reportSafety?.ssho_signature_image_path,
    ensureRecordId: ensureSafetyRow,
    updateRecord: updateReportSafety,
    domain: 'jfb_report_safety_v2',
    column: 'ssho_signature_image_path',
    maxBytes: MAX_SIGNATURE_BYTES,
    onSaved: markSuccess,
    onError: (msg) => {
      console.error('Failed to upload SSHO signature:', msg)
      markError(msg)
    },
  })

  const crewTotalCount = crew.reduce((sum, c) => sum + (Number(c.count) || 0), 0)
  const crewTotalHours = crew.reduce((sum, c) => sum + (Number(c.hours) || 0), 0)

  const signaturePreviewLabel = preparerSignature.url ? 'Uploaded for this report' : 'No signature uploaded'

  return (
    <Stack gap="lg">
      {saveError && (
        <Box style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px' }}>
          <Text size="sm" c="#b91c1c">{saveError}</Text>
        </Box>
      )}
      {saved && !saveError && (
        <Text size="10px" tt="uppercase" c="green" ta="right" fw={600} style={{ letterSpacing: 0.5 }}>Saved ✓</Text>
      )}

      <Section title="Culture Tenant — Keys to Our Success">
        <Text size="xs" c="dimmed" mb={8}>Pick the tenant covered in today's safety meeting.</Text>
        <Select
          size="xs"
          placeholder="— Select tenant —"
          data={activeTenants.map((t) => ({ value: t.id, label: t.name }))}
          value={tenantId}
          onChange={selectTenant}
          searchable
        />
        {selectedTenant && (
          <Box mt={8} p={8} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6 }}>
            <Text size="xs" c="#374151" fs="italic">
              <Text span fw={700} fs="normal">{selectedTenant.name}:</Text> {selectedTenant.description}
            </Text>
          </Box>
        )}
      </Section>

      <Section title="Daily Safety Updates">
        <Text size="xs" c="dimmed" mb={10}>
          7 fixed rows render on the safety page. Blank fields appear as “N/A” on the PDF.
        </Text>
        <Stack gap={10}>
          <Field label="JHA / AHA Reviewed">
            <Textarea size="xs" minRows={2} placeholder="N/A" value={updates.jhaAhaReviewed} onChange={(e) => setUpdate('jhaAhaReviewed', e.currentTarget.value)} onBlur={handleFieldBlur} />
          </Field>
          <Field label="High Risk Task of the Day">
            <Textarea size="xs" minRows={2} placeholder='e.g. "Bin Block Placement"' value={updates.highRiskTask} onChange={(e) => setUpdate('highRiskTask', e.currentTarget.value)} onBlur={handleFieldBlur} />
          </Field>
          <Field label="Daily Safety / Tool Box Topic (morning)">
            <Textarea size="xs" minRows={2} value={updates.toolboxTopic} onChange={(e) => setUpdate('toolboxTopic', e.currentTarget.value)} onBlur={handleFieldBlur} />
          </Field>
          <Field label="Afternoon Safety Meeting Topic">
            <Textarea size="xs" minRows={2} value={updates.afternoonTopic} onChange={(e) => setUpdate('afternoonTopic', e.currentTarget.value)} onBlur={handleFieldBlur} />
          </Field>
          <Field label="Incidents to Report">
            <Textarea size="xs" minRows={2} placeholder="N/A" value={updates.incidents} onChange={(e) => setUpdate('incidents', e.currentTarget.value)} onBlur={handleFieldBlur} />
          </Field>
          <Field label="Plan of the Day">
            {!updates.planOfDay && planOffer.offer && !planOffer.previewOpen && (
              <PrefillLink label={`Use plan from ${formatMonthDay(planOffer.offer.reportDate)}`} onClick={() => planOffer.setPreviewOpen(true)} />
            )}
            {planOffer.previewOpen && planOffer.offer && (
              <PrefillPreviewBox reportDate={planOffer.offer.reportDate} onAccept={acceptPlanPrefill} onCancel={() => planOffer.setPreviewOpen(false)}>
                <Text size="xs" mb={8}>{planOffer.offer.content}</Text>
              </PrefillPreviewBox>
            )}
            <Textarea size="xs" minRows={3} placeholder="e.g. Dredging Operations" value={updates.planOfDay} onChange={(e) => setUpdate('planOfDay', e.currentTarget.value)} onBlur={handleFieldBlur} />
          </Field>
          {project?.show_next_day_summary && (
            <Field label="Summary of Next Day's Expected Work">
              <Textarea size="xs" minRows={3} value={updates.nextDaySummary} onChange={(e) => setUpdate('nextDaySummary', e.currentTarget.value)} onBlur={handleFieldBlur} />
            </Field>
          )}
        </Stack>
      </Section>

      <Section title="Crew Summary">
        {crewAllBlank && crewOffer.offer && !crewOffer.previewOpen && (
          <PrefillLink label={`Use crew from ${formatMonthDay(crewOffer.offer.reportDate)}`} onClick={() => crewOffer.setPreviewOpen(true)} mb={8} />
        )}
        {crewOffer.previewOpen && crewOffer.offer && (
          <PrefillPreviewBox reportDate={crewOffer.offer.reportDate} onAccept={acceptCrewPrefill} onCancel={() => crewOffer.setPreviewOpen(false)} accepting={crewOffer.accepting}>
            <Table withTableBorder={false} verticalSpacing={2} fz="xs" mb={8}>
              <Table.Thead>
                <Table.Tr><Table.Th>Staff</Table.Th><Table.Th ta="right">Count</Table.Th><Table.Th ta="right">Hours</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {crewOffer.offer.rows.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td>{r.category}</Table.Td>
                    <Table.Td ta="right">{r.count ?? 0}</Table.Td>
                    <Table.Td ta="right">{(Number(r.hours) || 0).toFixed(2)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </PrefillPreviewBox>
        )}
        <Table withTableBorder verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr><Table.Th>Staff</Table.Th><Table.Th ta="right">Count</Table.Th><Table.Th ta="right">Hours</Table.Th><Table.Th style={{ width: 40 }} /></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {crew.map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td><TextInput size="xs" value={c.category} onChange={(e) => updateCrew(c.id, { category: e.currentTarget.value })} onBlur={() => flushCrewField(c.id)} /></Table.Td>
                <Table.Td><NumberInput size="xs" hideControls value={c.count} onChange={(v) => updateCrew(c.id, { count: v })} onBlur={() => flushCrewField(c.id)} /></Table.Td>
                <Table.Td><NumberInput size="xs" hideControls value={c.hours} onChange={(v) => updateCrew(c.id, { hours: v })} onBlur={() => flushCrewField(c.id)} /></Table.Td>
                <Table.Td>
                  <Box onClick={() => removeCrew(c.id)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex' }}>
                    <IconTrash size={13} />
                  </Box>
                </Table.Td>
              </Table.Tr>
            ))}
            {crewLoading && crew.length === 0 && (
              <Table.Tr><Table.Td colSpan={4}><Text size="xs" c="dimmed">Loading crew…</Text></Table.Td></Table.Tr>
            )}
          </Table.Tbody>
          {crew.length > 0 && (
            <Table.Tfoot>
              <Table.Tr style={{ borderTop: '2px solid #d1d5db' }}>
                <Table.Td><Text size="xs" fw={700}>Total</Text></Table.Td>
                <Table.Td ta="right"><Text size="xs" fw={700}>{crewTotalCount}</Text></Table.Td>
                <Table.Td ta="right"><Text size="xs" fw={700}>{crewTotalHours.toFixed(2)}</Text></Table.Td>
                <Table.Td />
              </Table.Tr>
            </Table.Tfoot>
          )}
        </Table>
        <Group justify="space-between" align="center" mt={8}>
          <Button
            size="xs" variant="default" leftSection={<IconPlus size={11} />} onClick={addCrew}
            style={{ border: '1px solid rgba(15,39,68,0.3)', color: '#0F2744', background: '#fff' }}
          >
            Add crew
          </Button>
          <Text size="10px" c="dimmed" fs="italic">Added crews flow forward — the next daily on this project will include them by default.</Text>
        </Group>
      </Section>

      <Section title="Climate Summary">
        <Box mb={10} p={8} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6 }}>
          <Group justify="space-between" mb={6}>
            <Text size="10px" fw={700} tt="uppercase" c="#374151">Project Location</Text>
            {locationSavedAt && <Text size="10px" tt="uppercase" c="green" fw={600}>Saved ✓</Text>}
          </Group>
          {canEditLocation ? (
            <>
              <Group gap={8} align="flex-end">
                <TextInput
                  size="xs" label="Latitude (-90 to 90)" placeholder="e.g. 43.804" value={location.latitude}
                  onChange={(e) => { const v = e.currentTarget.value; setLocation((p) => ({ ...p, latitude: v })) }}
                  onBlur={saveLocation}
                />
                <TextInput
                  size="xs" label="Longitude (-180 to 180)" placeholder="e.g. -91.155" value={location.longitude}
                  onChange={(e) => { const v = e.currentTarget.value; setLocation((p) => ({ ...p, longitude: v })) }}
                  onBlur={saveLocation}
                />
                {savingLocation && <Text size="10px" c="dimmed">Saving…</Text>}
              </Group>
              {locationError && <Text size="10px" c="red" mt={4}>{locationError}</Text>}
            </>
          ) : (
            <Text size="xs" c="dimmed">
              {project?.latitude != null && project?.longitude != null
                ? `${Number(project.latitude).toFixed(4)}°, ${Number(project.longitude).toFixed(4)}°`
                : 'Not set — ask a PM/Admin to configure.'}
            </Text>
          )}
        </Box>
        <Text size="xs" c="dimmed" mb={8}>
          Fetch high/low/wind/precip from NOAA for the report date — fills any field the station reported and leaves your manual entries for the rest.
        </Text>
        <Button
          size="xs" variant="default" mb={8} loading={noaaFetching} onClick={handleNoaaFetch} disabled={!hasLatLng}
          title={hasLatLng ? 'Pull observations from the nearest NWS station' : "Set this project's latitude/longitude above to enable NOAA fetch"}
        >
          Fetch from NOAA
        </Button>
        {noaaMessage && (
          <Text size="xs" mb={8} p={6} style={{
            borderRadius: 4,
            background: noaaMessage.startsWith('NOAA fetch failed') ? '#fef2f2' : '#f0fdf4',
            color: noaaMessage.startsWith('NOAA fetch failed') ? '#991b1b' : '#166534',
            border: `1px solid ${noaaMessage.startsWith('NOAA fetch failed') ? '#fecaca' : '#bbf7d0'}`,
          }}>
            {noaaMessage}
          </Text>
        )}
        <SimpleGrid cols={2} spacing="sm">
          <NumberInput size="xs" label="Temperature High (°F)" value={climate.tempHighF} onChange={(v) => setClimateField('tempHighF', v)} onBlur={handleFieldBlur} />
          <NumberInput size="xs" label="Temperature Low (°F)" value={climate.tempLowF} onChange={(v) => setClimateField('tempLowF', v)} onBlur={handleFieldBlur} />
          <NumberInput size="xs" label="Wind High (MPH)" value={climate.windHigh} onChange={(v) => setClimateField('windHigh', v)} onBlur={handleFieldBlur} />
          <NumberInput size="xs" label="Wind Gusts (MPH)" value={climate.windGusts} onChange={(v) => setClimateField('windGusts', v)} onBlur={handleFieldBlur} />
          <NumberInput size="xs" label="Wind Average (MPH)" value={climate.windAvg} onChange={(v) => setClimateField('windAvg', v)} onBlur={handleFieldBlur} />
          <Select size="xs" label="Wind Direction" placeholder="NW, S, etc." data={WIND_DIRECTIONS} value={climate.windDirection} onChange={(v) => { setClimateField('windDirection', v); handleFieldBlur() }} />
          <NumberInput size="xs" label="Precipitation Today (IN)" decimalScale={2} value={climate.precipTodayIn} onChange={(v) => setClimateField('precipTodayIn', v)} onBlur={handleFieldBlur} />
          <ReadOnlyStat label="Precipitation MTD (IN)" value={displayMtdIn.toFixed(2)} hint="Sum of daily precip this calendar month" />
        </SimpleGrid>
        <Box maw="50%" mt="sm">
          <ReadOnlyStat label="Precipitation Project Total (IN)" value={displayPtdIn.toFixed(2)} hint="Sum of daily precip since project start" />
        </Box>
        <TextInput size="xs" label="Conditions" mt={10} placeholder="Light Rain, Sunny, Overcast…" value={climate.conditions} onChange={(e) => setClimateField('conditions', e.currentTarget.value)} onBlur={handleFieldBlur} />
      </Section>

      <Section title="Sign-off">
        <Text size="xs" c="dimmed" fs="italic" mb={10}>
          “I Certify that this Report is Correct to the Best of my Knowledge”
        </Text>
        <Stack gap={16}>
          <Box>
            <TextInput
              size="xs" label={project?.show_ssho_field ? 'Report Preparer' : 'Signed by'} value={preparerName} mb={10}
              onChange={(e) => setPreparerNameField(e.currentTarget.value)}
              onBlur={handleFieldBlur}
            />
            <Text size="xs" fw={500} c="#374151" mb={4}>Electronic signature</Text>
            <Text size="xs" c="dimmed" mb={6}>{signaturePreviewLabel}</Text>
            {!preparerSignature.url && userSignatureUrl && !savedSignaturePreview && (
              <PrefillLink label="Use my saved signature" onClick={() => setSavedSignaturePreview(true)} mb={8} />
            )}
            {savedSignaturePreview && userSignatureUrl && (
              <Box mb={8} p={8} style={{ background: 'rgba(15,39,68,0.04)', border: '1px solid rgba(15,39,68,0.4)', borderRadius: 6 }}>
                <img src={userSignatureUrl} alt="Saved signature" style={{ height: 40, display: 'block', marginBottom: 6 }} />
                <Group gap={8}>
                  <Button size="xs" onClick={acceptSavedSignature} style={{ background: '#0F2744', border: 'none' }}>Accept and use</Button>
                  <Button size="xs" variant="default" onClick={() => setSavedSignaturePreview(false)}>Cancel</Button>
                </Group>
              </Box>
            )}
            {preparerSignature.url && <img src={preparerSignature.url} alt="Signature" style={{ height: 40, display: 'block', marginBottom: 6 }} />}
            <Group gap={12} align="center">
              <FileButton onChange={preparerSignature.upload} accept="image/png,image/jpeg,image/webp">
                {(props) => (
                  <UnstyledButton {...props} disabled={preparerSignature.uploading}>
                    <Text size="xs" c="#0F2744" style={{ textDecoration: 'underline' }}>
                      {preparerSignature.uploading ? 'Uploading…' : preparerSignature.url ? 'Replace signature' : 'Upload signature'}
                    </Text>
                  </UnstyledButton>
                )}
              </FileButton>
              <Checkbox size="xs" label="Also save as my default signature" checked={saveAsDefaultSignature} onChange={(e) => setSaveAsDefaultSignature(e.currentTarget.checked)} />
            </Group>
            {preparerSignature.url && (
              <UnstyledButton onClick={preparerSignature.remove} mt={4}>
                <Text size="xs" c="red">Remove this report's signature</Text>
              </UnstyledButton>
            )}
            <Text size="10px" c="dimmed" mt={4}>PNG / JPG / WebP, ≤ {MAX_SIGNATURE_BYTES / 1024} KB</Text>
            {preparerSignature.error && <Text size="10px" c="red" mt={2}>{preparerSignature.error}</Text>}
          </Box>
          {project?.show_ssho_field && (
            <Box pt={16} style={{ borderTop: '1px solid #e5e7eb' }}>
              <TextInput
                size="xs" label="Project SSHO" placeholder="SSHO name" value={sshoName} mb={4}
                onChange={(e) => setSshoNameField(e.currentTarget.value)}
                onBlur={handleFieldBlur}
              />
              <Text size="11px" c="dimmed" fs="italic" mb={8}>
                Prints below the Report Preparer line on the safety page with its own certification.
              </Text>
              <Text size="xs" fw={500} c="#374151" mb={4}>SSHO Electronic signature</Text>
              {sshoSignature.url && <img src={sshoSignature.url} alt="SSHO signature" style={{ height: 40, display: 'block', marginBottom: 6 }} />}
              <FileButton onChange={sshoSignature.upload} accept="image/png,image/jpeg,image/webp">
                {(props) => (
                  <UnstyledButton {...props} disabled={sshoSignature.uploading}>
                    <Text size="xs" c="#0F2744" style={{ textDecoration: 'underline' }}>
                      {sshoSignature.uploading ? 'Uploading…' : sshoSignature.url ? 'Replace signature' : 'Upload signature'}
                    </Text>
                  </UnstyledButton>
                )}
              </FileButton>
              <Text size="10px" c="dimmed" mt={4}>PNG / JPG / WebP, ≤ {MAX_SIGNATURE_BYTES / 1024} KB</Text>
              {sshoSignature.error && <Text size="10px" c="red" mt={2}>{sshoSignature.error}</Text>}
            </Box>
          )}
        </Stack>
      </Section>

      <SiteEquipmentTab project={project} reportDate={report?.report_date} />
    </Stack>
  )
}

function Section({ title, children }) {
  return (
    <Box style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 16 }}>
      <Text size="sm" fw={700} mb={12}>{title}</Text>
      {children}
    </Box>
  )
}

function Field({ label, children }) {
  return (
    <Box>
      <Text size="xs" fw={600} mb={4}>{label}</Text>
      {children}
    </Box>
  )
}

function ReadOnlyStat({ label, value, hint }) {
  return (
    <Box>
      <Text size="10px" c="dimmed" mb={2}>{label}</Text>
      <Box style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, padding: '6px 8px' }}>
        <Text size="xs" ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</Text>
      </Box>
      {hint && <Text size="10px" c="dimmed" fs="italic" mt={2}>{hint}</Text>}
    </Box>
  )
}

function PrefillLink({ label, onClick, mb }) {
  return (
    <Box
      onClick={onClick}
      mb={mb}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
        padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(15,39,68,0.3)',
        background: '#fff',
      }}
    >
      <IconEye size={12} color="#0F2744" />
      <Text size="11px" c="#0F2744">{label}</Text>
    </Box>
  )
}

function PrefillPreviewBox({ reportDate, onAccept, onCancel, accepting = false, children }) {
  return (
    <Box mb={10} p={10} style={{ background: 'rgba(15,39,68,0.04)', border: '1px solid rgba(15,39,68,0.4)', borderRadius: 6 }}>
      <Group justify="space-between" mb={6}>
        <Text size="10px" fw={700} tt="uppercase" c="#0F2744">Preview — from {formatMonthDay(reportDate)} report</Text>
        <Text size="10px" c="dimmed" fs="italic">You can edit after inserting.</Text>
      </Group>
      {children}
      <Group gap={8}>
        <Button size="xs" loading={accepting} onClick={onAccept} style={{ background: '#0F2744', border: 'none' }}>Accept and insert</Button>
        <Button size="xs" variant="default" onClick={onCancel}>Cancel</Button>
      </Group>
    </Box>
  )
}
