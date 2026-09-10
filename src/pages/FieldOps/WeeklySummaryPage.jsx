import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Box, ScrollArea, Text, Group, Button, Stack, Textarea, SimpleGrid, Switch, Modal } from '@mantine/core'
import {
  executeDataView, deleteAttachment, readWrittenRecordId,
  executeReport, api, createDomainRecord, fetchCurrentUser, fetchFileById,
} from '../../data'
import { useAppConfig } from '../../contexts/appConfigContext'
import { useProject } from '../../hooks/useProject'
import { useReports } from '../../hooks/useReports'
import { useDomainData } from '../../hooks/useDomainData'
import { useWeeklySummaries } from '../../hooks/useWeeklySummaries'
import { useWeeklySummaryPhotos } from '../../hooks/useWeeklySummaryPhotos'
import { useAttachmentUpload } from '../../hooks/useAttachmentUpload'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import PhotoSlot from './reportEditorTabs/components/PhotoSlot'
import LoadingSpinner from '../../components/LoadingSpinner'
import SafeError from '../../components/SafeError'
import {
  weekEndISO,
  previousWeekStart,
  nextWeekStart,
  defaultWeeklyWeekStart,
  buildWeeklyReport,
  buildNarrativeSectionsParam,
  buildPhotoAssetsParam,
} from './lib/weeklySummary'
import { buildWeeklyChartAssetsParam } from './lib/reportPdfData'
import { fetchWeekCoverage } from '../../lib/dredge/weeklyChart'

const REPORT_SLUG = 'rpt-jfb-weekly-summary'

const SUMMARY_DEBOUNCE_MS = 1200
const PHOTO_SLOTS = [1, 2]

const PHOTO_DOMAIN = 'jfb_weekly_summary_photos'

function withUniqueName(file, uniqueId) {
  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot) : ''
  return new File([file], `${uniqueId}-${Date.now()}${ext}`, { type: file.type })
}

function fmtNum(n) {
  return Math.round(n ?? 0).toLocaleString()
}
function fmtRate(n) {
  return (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })
}
function fmtHours(n) {
  return (n ?? 0).toFixed(2)
}
function signedNum(n) {
  return `${n >= 0 ? '+' : '-'}${fmtNum(Math.abs(n))}`
}

function buildWeeklyDelayChartParams(report) {
  const maxDelay = report.delaySummary[0]?.hours ?? 1
  const delayRows = report.delaySummary.map((d) => ({
    description: d.description,
    hours: fmtHours(d.hours),
    pct: `${(d.pct * 100).toFixed(0)}%`,
    barPct: Math.round((d.hours / maxDelay) * 100),
  }))
  const half = Math.ceil(delayRows.length / 2)
  return {
    weeklyDelayRowsLeft: delayRows.slice(0, half),
    weeklyDelayRowsRight: delayRows.slice(half),
    weeklyDelayTotalHours: fmtHours(report.delayTotalHours),
    hasWeeklyDelays: delayRows.length > 0,
  }
}

const TODAY_ISO = new Date().toISOString().slice(0, 10)
const DEFAULT_WEEK_START = defaultWeeklyWeekStart(TODAY_ISO)

export default function WeeklySummaryPage() {
  const { projectId } = useParams()
  const { config } = useAppConfig()
  const [aiOn, setAiOn] = useState(false)
  const [weekStart, setWeekStart] = useState(DEFAULT_WEEK_START)
  const weekEnd = weekEndISO(weekStart)
  const isDefaultWeek = weekStart === DEFAULT_WEEK_START

  const { project, loading: projectLoading, error: projectError } = useProject(projectId)
  const {
    summaries, loading: summariesLoading, error: summariesError,
    create: createSummary, update: updateSummary,
  } = useWeeklySummaries(projectId)
  const { reports, loading: reportsLoading, error: reportsError } = useReports(projectId)
  const { records: sections, loading: sectionsLoading, error: sectionsError } = useDomainData({
    domain: 'jfb_project_report_narratives',
    system: 'core',
    projectId,
  })
  const { records: dredgeConfigRecords } = useDomainData({
    domain: 'jfb_dredge_config',
    system: 'core',
    projectId,
  })
  const { records: contentRows, loading: contentLoading, error: contentError } = useDomainData({
    domain: 'jfb_report_narratives_v2',
    system: 'core',
    projectId,
  })
  const {
    photos, loading: photosLoading, error: photosError,
    create: createPhoto, update: updatePhoto, remove: removePhoto,
  } = useWeeklySummaryPhotos(projectId)

  const [dailyTotals, setDailyTotals] = useState(null)
  const [dailyTotalsError, setDailyTotalsError] = useState(null)
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const startDate = project?.production_start_date || (project?.start_date ? project.start_date.slice(0, 10) : '2000-01-01')
    executeDataView('dvw-jfb-realized-daily-totals', { p_project_id: projectId, p_start_date: startDate })
      .then((rows) => { if (!cancelled) setDailyTotals(rows) })
      .catch((err) => { if (!cancelled) setDailyTotalsError(err.message) })
    return () => { cancelled = true }
  }, [projectId, project?.production_start_date, project?.start_date])

  const [delayRows, setDelayRows] = useState([])
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    executeDataView('dvw-jfb-realized-delay-summary', { p_project_id: projectId, p_start_date: weekStart, p_end_date: weekEnd })
      .then((rows) => { if (!cancelled) setDelayRows(rows) })
      .catch(() => { if (!cancelled) setDelayRows([]) })
    return () => { cancelled = true }
  }, [projectId, weekStart, weekEnd])

  const loading =
    projectLoading || reportsLoading || sectionsLoading || contentLoading ||
    summariesLoading || photosLoading || dailyTotals === null
  const error =
    projectError || reportsError || sectionsError || contentError ||
    summariesError || photosError || dailyTotalsError

  const [photoUploading, setPhotoUploading] = useState({ 1: false, 2: false })
  const [photoSlotErrors, setPhotoSlotErrors] = useState({ 1: null, 2: null })
  const [removingSlot, setRemovingSlot] = useState(null)
  const photoFor = (n) => photos.find((p) => p.week_start === weekStart && p.photo_number === n) ?? null

  const photoUpload = useAttachmentUpload()
  const { busy: downloadingPdf, error: pdfError, run: runDownloadPdf } = useAsyncAction()

  async function handlePhotoUpload(slot, file, label) {
    setPhotoUploading((u) => ({ ...u, [slot]: true }))
    setPhotoSlotErrors((e) => ({ ...e, [slot]: null }))
    try {
      const existing = photoFor(slot)
      const previousFileId = existing?.photo_file_path || null
      let recordId

      if (existing) {
        recordId = existing.id
        await updatePhoto(recordId, {
          label,
          original_file_name: file.name,
          uploaded_by: config?.user?.id ?? null,
          uploaded_date_time: new Date().toISOString(),
        })
      } else {
        const res = await createPhoto({
          project_id: projectId,
          week_start: weekStart,
          photo_number: slot,
          label,
          original_file_name: file.name,
          uploaded_by: config?.user?.id ?? null,
          uploaded_date_time: new Date().toISOString(),
        })
        recordId = readWrittenRecordId(res)
      }
      if (!recordId) throw new Error('Could not resolve the saved photo record.')

      await photoUpload.upload({
        recordId,
        domain: PHOTO_DOMAIN,
        field: 'photo_file_path',
        file: withUniqueName(file, recordId),
        previousFileId,
        update: updatePhoto,
      })
    } catch (e) {
      setPhotoSlotErrors((er) => ({ ...er, [slot]: e?.message || 'Upload failed.' }))
    } finally {
      setPhotoUploading((u) => ({ ...u, [slot]: false }))
    }
  }

  async function handlePhotoLabelChange(slot, label) {
    const target = photoFor(slot)
    if (!target || target.label === label) return
    try {
      await updatePhoto(target.id, { label })
    } catch (e) {
      setPhotoSlotErrors((er) => ({ ...er, [slot]: e?.message || 'Could not save label.' }))
    }
  }

  async function confirmPhotoRemove() {
    const slot = removingSlot
    setRemovingSlot(null)
    const target = photoFor(slot)
    if (!target) return
    setPhotoUploading((u) => ({ ...u, [slot]: true }))
    setPhotoSlotErrors((er) => ({ ...er, [slot]: null }))
    try {
      if (target.photo_file_path) {
        await deleteAttachment({ fileId: target.photo_file_path, domain: PHOTO_DOMAIN, coreRecordId: target.id })
      }
      await removePhoto(target.id)
    } catch (e) {
      setPhotoSlotErrors((er) => ({ ...er, [slot]: e?.message || 'Delete failed.' }))
    } finally {
      setPhotoUploading((u) => ({ ...u, [slot]: false }))
    }
  }

  async function handleSaveSummary(summaryRow, sectionLabel, text) {
    const now = new Date().toISOString()
    if (!summaryRow) {
      await createSummary({
        project_id: projectId,
        week_start: weekStart,
        section_key: sectionLabel,
        content: text,
        edited_by: config?.user?.id ?? null,
        edited_at: now,
      })
    } else {
      await updateSummary(summaryRow.id, { content: text, edited_by: config?.user?.id ?? null, edited_at: now })
    }
  }

  async function handleDownloadPdf() {
    if (!report) return
    await runDownloadPdf(async () => {
      const narrativeSections = buildNarrativeSectionsParam(sections, summaries, weekStart)
      const weeklyPhotoAssets = await buildPhotoAssetsParam(photos, weekStart)
      const weeklyChartAssets = dredgeConfigRecords.length > 0
        ? Object.values(await buildWeeklyChartAssetsParam({ appSlug: config.appSlug, projectId, weekStart, weekEnd }))
        : []
      const p = report.production
      const hasPlan = p.anticipatedDailyProduction != null
      const result = await executeReport(REPORT_SLUG, {
        parameters: {
          projectId,
          projectFilter: { id: projectId },
          equipmentFilter: { project_id: projectId },
          weekStart,
          weekEnd,
          releasedCount: report.releasedCount,
          narrativeSections,
          weeklyPhotoAssets,
          weeklyChartAssets,
          unit: report.unit,
          weeklyProduction: {
            weekCy: fmtNum(p.weekCy),
            weekSf: fmtNum(p.weekSf),
            weekGoh: fmtHours(p.weekGoh),
            weekNoh: fmtHours(p.weekNoh),
            weekCyPerGoh: fmtRate(p.weekCyPerGoh),
            toDateCy: fmtNum(p.toDateCy),
            goal: p.goal > 0 ? fmtNum(p.goal) : null,
            pctComplete: p.goal > 0 ? `${(p.pctComplete * 100).toFixed(1)}%` : null,
            hasPlan,
            plannedWeekCy: hasPlan ? fmtNum(p.plannedWeekCy) : null,
            weekVariance: hasPlan ? signedNum(p.weekVariance) : null,
            weekVariancePositive: hasPlan ? p.weekVariance >= 0 : null,
            plannedToDateCy: hasPlan ? fmtNum(p.plannedToDateCy) : null,
            toDateVariance: hasPlan ? signedNum(p.toDateVariance) : null,
            toDateVariancePositive: hasPlan ? p.toDateVariance >= 0 : null,
          },
          ...buildWeeklyDelayChartParams(report),
        },
      })
      const fileRes = await api.get(result.downloadUrl, { responseType: 'blob' })
      const blobUrl = URL.createObjectURL(new Blob([fileRes.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `${weekStart} to ${weekEnd} ${project?.name ?? 'Weekly Summary'}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(blobUrl)

      try {
        const [me, file] = await Promise.all([
          fetchCurrentUser(),
          result.fileKey ? fetchFileById(result.fileKey) : Promise.resolve(null),
        ])
        await createDomainRecord({
          domain: 'jfb_report_generations',
          system: 'core',
          appSlug: config.appSlug,
          recordData: {
            report_id: null,
            project_id: projectId,
            report_date: weekStart,
            report_slug: REPORT_SLUG,
            report_type: 'weekly',
            generated_at: new Date().toISOString(),
            generated_by_user_id: me.id,
            generated_by_email: me.email,
            file_id: result.fileKey ?? null,
            file_name: file?.logicalName ?? null,
            file_path: file?.storagePath ?? null,
            download_url: result.downloadUrl,
          },
        })
      } catch (logErr) {
        console.error('Failed to log report generation:', logErr.message)
      }
    })
  }

  const [progressDredgeCount, setProgressDredgeCount] = useState(null)

  useEffect(() => {
    if (!projectId || dredgeConfigRecords.length === 0) return
    let cancelled = false
    setProgressDredgeCount(null)
    fetchWeekCoverage({ appSlug: config.appSlug, projectId, weekStartISO: weekStart, weekEndISO: weekEnd })
      .then((byEquipment) => {
        if (cancelled) return
        let n = 0
        for (const cov of byEquipment.values()) if (cov.weekRings.length || cov.priorRings.length) n++
        setProgressDredgeCount(n)
      })
      .catch(() => { if (!cancelled) setProgressDredgeCount(null) })
    return () => { cancelled = true }
  }, [projectId, weekStart, weekEnd, dredgeConfigRecords.length, config.appSlug])

  const report = !loading && !error
    ? buildWeeklyReport({ project, weekStart, reports, sections, contentRows, dailyTotals, delayRows })
    : null

  return (
    <ScrollArea flex={1} style={{ minHeight: 0 }}>
      <Box p={24} maw={900} mx="auto">
        <Group justify="space-between" mb={4}>
          <Text fw={700} size="lg">Weekly Summary</Text>
          <Group gap="md">
            {report && report.releasedCount > 0 && (
              <Button size="xs" variant="outline" loading={downloadingPdf} onClick={handleDownloadPdf}>
                {downloadingPdf ? 'Generating…' : 'Download PDF'}
              </Button>
            )}
            <Link to={`/projects/${projectId}/reports`} style={{ fontSize: 13 }}>← Reports</Link>
          </Group>
        </Group>
        <Text size="sm" c="dimmed" mb={16}>
          Client-facing roll-up of the week's daily narratives, production, and delays.
        </Text>

        {loading && <LoadingSpinner py={16} />}
        {!loading && <SafeError message={error} />}

        {!loading && !error && (
          <>
            <Group justify="space-between" p={12} mb={20} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
              <Text
                size="sm"
                onClick={() => setWeekStart((w) => previousWeekStart(w))}
                style={{ cursor: 'pointer' }}
              >
                ← Previous week
              </Text>
              <Box ta="center">
                <Text size="sm" fw={500}>{weekStart} – {weekEnd}</Text>
                <Text size="10px" c="dimmed">{report.releasedCount} released reports this week</Text>
              </Box>
              <Text
                size="sm"
                c={isDefaultWeek ? 'dimmed' : undefined}
                onClick={isDefaultWeek ? undefined : () => setWeekStart((w) => nextWeekStart(w))}
                style={{ cursor: isDefaultWeek ? 'not-allowed' : 'pointer' }}
                title={isDefaultWeek ? "Can't view the still-in-progress current week" : undefined}
              >
                Next week →
              </Text>
            </Group>

            {report.releasedCount === 0 ? (
              <Box p={24} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, textAlign: 'center' }}>
                <Text size="sm" c="dimmed">
                  No released reports for this week. Use the week navigation above to find a week with released
                  dailies. (Drafts and reports still in PM Review don't appear here.)
                </Text>
              </Box>
            ) : (
            <>
            <Group justify="space-between" p={12} mb={20} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
              <Box>
                <Text size="sm" fw={500}>AI first-draft summary</Text>
                <Text size="10px" c="dimmed">
                  {aiOn ? 'Sections seeded with a draft summary.' : 'Off — sections seeded with daily entries to summarize by hand.'}
                </Text>
              </Box>
              <Switch checked={aiOn} onChange={(e) => setAiOn(e.currentTarget.checked)} />
            </Group>

            <Text fw={600} mb={4}>Narrative summary</Text>
            <Text size="10px" c="dimmed" mb={10}>Each section shows the week's daily entries as reference.</Text>
            <Stack gap="md" mb={20}>
              {report.sections.length === 0 && (
                <Text size="xs" c="dimmed">No narrative sections configured for this project yet.</Text>
              )}
              {report.sections.map((s) => {
                const summaryRow = summaries.find((row) => row.week_start === weekStart && row.section_key === s.label)
                return (
                  <Box key={s.key} p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
                    <Text size="sm" fw={600} mb={6}>{s.label}</Text>
                    <Stack gap={2} mb={8}>
                      {s.entries.length === 0 && (
                        <Text size="xs" c="dimmed">No released daily entries for this section this week.</Text>
                      )}
                      {s.entries.map((e) => (
                        <Text key={e.date} size="xs" c="dimmed">{e.date} — {e.text}</Text>
                      ))}
                    </Stack>
                    <WeeklySummaryTextarea
                      summaryRow={summaryRow}
                      onSave={(text) => handleSaveSummary(summaryRow, s.label, text)}
                    />
                  </Box>
                )
              })}
            </Stack>

            <Text fw={600} mb={4}>Photos</Text>
            <Text size="10px" c="dimmed" mb={10}>Two photos for the weekly PDF. JPEG / PNG / HEIC · 10 MB max.</Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }} mb={20}>
              {PHOTO_SLOTS.map((n) => (
                <PhotoSlot
                  key={n}
                  slotNumber={n}
                  photo={photoFor(n)}
                  uploading={photoUploading[n]}
                  error={photoSlotErrors[n]}
                  onUpload={(file, label) => handlePhotoUpload(n, file, label)}
                  onLabelChange={(label) => handlePhotoLabelChange(n, label)}
                  onRemove={() => setRemovingSlot(n)}
                  canEdit
                />
              ))}
            </SimpleGrid>

            {dredgeConfigRecords.length > 0 && (
              <Box p={16} mb={20} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
                <Text size="sm">
                  <Text span fw={600}>Weekly progress chart: </Text>
                  {progressDredgeCount === null ? (
                    <Text span c="dimmed">checking…</Text>
                  ) : progressDredgeCount > 0 ? (
                    <Text span c="teal">
                      {progressDredgeCount} dredge{progressDredgeCount === 1 ? '' : 's'} with coverage — a chart page will be added to the PDF.
                    </Text>
                  ) : (
                    <Text span c="dimmed">
                      no saved dredge progress for this week's dates yet — no chart page will be added. (Charts come from daily progress saved in the Dredge Progress tab.)
                    </Text>
                  )}
                </Text>
              </Box>
            )}

            <SimpleGrid cols={{ base: 1, sm: 2 }} mb={20}>
              <ProductionCard report={report} />
              <DelayCard report={report} />
            </SimpleGrid>
            </>
            )}

            <SafeError message={pdfError} />

            <Modal
              opened={removingSlot != null}
              onClose={() => setRemovingSlot(null)}
              title={<Text fw={700} size="sm">{`Remove photo ${removingSlot ?? ''}?`}</Text>}
              size="sm"
            >
              <Text size="sm" mb={16}>The file will be deleted from storage.</Text>
              <Group justify="flex-end">
                <Button variant="default" size="xs" onClick={() => setRemovingSlot(null)}>Cancel</Button>
                <Button size="xs" color="red" onClick={confirmPhotoRemove}>Remove</Button>
              </Group>
            </Modal>
          </>
        )}
      </Box>
    </ScrollArea>
  )
}

function WeeklySummaryTextarea({ summaryRow, onSave }) {
  const [draft, setDraft] = useState(summaryRow?.content ?? '')
  const [saveState, setSaveState] = useState('idle')
  const [syncedRowId, setSyncedRowId] = useState(summaryRow?.id)
  const timerRef = useRef(null)
  const draftRef = useRef(draft)
  const onSaveRef = useRef(onSave)

  useEffect(() => {
    draftRef.current = draft
  })
  useEffect(() => {
    onSaveRef.current = onSave
  })

  if (summaryRow?.id !== syncedRowId && saveState !== 'pending' && saveState !== 'saving') {
    setSyncedRowId(summaryRow?.id)
    setDraft(summaryRow?.content ?? '')
  }

  const flushSave = async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if ((summaryRow?.content ?? '') === draftRef.current) return
    setSaveState('saving')
    try {
      await onSaveRef.current(draftRef.current)
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }
  const flushSaveRef = useRef(flushSave)
  useEffect(() => {
    flushSaveRef.current = flushSave
  })

  useEffect(
    () => () => {
      void flushSaveRef.current()
    },
    [],
  )

  function handleChange(next) {
    setDraft(next)
    setSaveState('pending')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void flushSaveRef.current()
    }, SUMMARY_DEBOUNCE_MS)
  }

  return (
    <>
      <Group justify="space-between" mb={4}>
        <Text size="10px" c="dimmed">Weekly summary</Text>
        <SaveIndicator state={saveState} />
      </Group>
      <Textarea
        autosize
        minRows={2}
        value={draft}
        onBlur={() => void flushSave()}
        onChange={(e) => handleChange(e.currentTarget.value)}
        placeholder="Write a week-level summary — don't copy the daily entries."
      />
    </>
  )
}

function SaveIndicator({ state }) {
  switch (state) {
    case 'pending':
      return <Text size="10px" c="dimmed">…</Text>
    case 'saving':
      return <Text size="10px" c="blue">Saving</Text>
    case 'saved':
      return <Text size="10px" c="teal" fw={600}>✓ Saved</Text>
    case 'error':
      return <Text size="10px" c="red" fw={600}>⚠ Save failed</Text>
    default:
      return null
  }
}

function ProductionCard({ report }) {
  const p = report.production
  const unit = report.unit
  const hasPlan = p.anticipatedDailyProduction != null
  return (
    <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
      <Text fw={600} size="sm" mb={8}>Production</Text>

      <Text size="10px" fw={700} tt="uppercase" c="dimmed" mb={2}>This week</Text>
      <Row label={`Actual ${unit}`} value={`${fmtNum(p.weekCy)} ${unit}`} />
      {hasPlan && (
        <>
          <Row label={`Planned ${unit}`} value={`${fmtNum(p.plannedWeekCy)} ${unit}`} />
          <Row label="Variance" value={`${signedNum(p.weekVariance)} ${unit}`} highlight={p.weekVariance >= 0 ? 'green' : 'red'} />
        </>
      )}
      <Row label="Area" value={`${fmtNum(p.weekSf)} SF`} />
      <Row label="Operating hours (GOH)" value={fmtHours(p.weekGoh)} />
      <Row label="Net operating hours (NOH)" value={fmtHours(p.weekNoh)} />
      <Row label={`${unit}/GOH`} value={fmtRate(p.weekCyPerGoh)} />

      <Text size="10px" fw={700} tt="uppercase" c="dimmed" mt={10} mb={2}>Project to date</Text>
      <Row label={`Actual ${unit}`} value={`${fmtNum(p.toDateCy)} ${unit}`} />
      {hasPlan && (
        <>
          <Row label={`Planned ${unit}`} value={`${fmtNum(p.plannedToDateCy)} ${unit}`} />
          <Row label="Variance" value={`${signedNum(p.toDateVariance)} ${unit}`} highlight={p.toDateVariance >= 0 ? 'green' : 'red'} />
        </>
      )}
      {p.goal > 0 && (
        <>
          <Row label="Contract goal" value={`${fmtNum(p.goal)} ${unit}`} />
          <Row label="Percent complete" value={`${(p.pctComplete * 100).toFixed(1)}%`} />
        </>
      )}

      {!hasPlan && (
        <Text size="10px" c="dimmed" mt={8}>
          Planned {unit} needs the production plan (bid rate + expected GOH/day) set on the Project Settings page.
        </Text>
      )}
    </Box>
  )
}

function DelayCard({ report }) {
  const { delaySummary, delayTotalHours } = report
  return (
    <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
      <Text fw={600} size="sm" mb={8}>Delay summary · this week</Text>
      {delaySummary.length === 0 ? (
        <Text size="xs" c="dimmed">No delays logged this week.</Text>
      ) : (
        <Stack gap={4}>
          {delaySummary.map((d) => (
            <Group key={d.description} justify="space-between" gap={8}>
              <Text size="xs">{d.description}</Text>
              <Group gap={10}>
                <Text size="xs" fw={600}>{fmtHours(d.hours)}h</Text>
                <Text size="xs" c="dimmed" w={30} ta="right">{(d.pct * 100).toFixed(0)}%</Text>
              </Group>
            </Group>
          ))}
          <Group justify="space-between" mt={4} pt={4} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <Text size="xs" fw={700}>Total</Text>
            <Text size="xs" fw={700}>{fmtHours(delayTotalHours)}h</Text>
          </Group>
        </Stack>
      )}
    </Box>
  )
}

const ROW_COLORS = { green: 'teal', red: 'red' }

function Row({ label, value, highlight }) {
  const color = ROW_COLORS[highlight]
  return (
    <Group justify="space-between" gap={8} py={2} style={{ borderBottom: '1px solid var(--mantine-color-gray-1)' }}>
      <Text size="10px" c="dimmed" tt="uppercase">{label}</Text>
      <Text size="xs" fw={600} c={color}>{value}</Text>
    </Group>
  )
}
