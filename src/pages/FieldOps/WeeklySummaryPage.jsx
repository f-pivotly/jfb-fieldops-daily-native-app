import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Box, ScrollArea, Text, Group, Button, Stack, Textarea, SimpleGrid, Switch, Table, Modal } from '@mantine/core'
import {
  executeDataView, uploadAttachment, deleteAttachment, readWrittenRecordId,
  executeReport, api, createDomainRecord, fetchCurrentUser, fetchFileById,
} from '../../data'
import { useAppConfig } from '../../contexts/appConfigContext'
import { useProject } from '../../hooks/useProject'
import { useReports } from '../../hooks/useReports'
import { useDomainData } from '../../hooks/useDomainData'
import { useDelayCodes } from '../../hooks/useDelayCodes'
import { useProjectDelayCodes } from '../../hooks/useProjectDelayCodes'
import { useWeeklySummaries } from '../../hooks/useWeeklySummaries'
import { useWeeklySummaryPhotos } from '../../hooks/useWeeklySummaryPhotos'
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
} from './lib/weeklySummary'

const REPORT_SLUG = 'rpt-jfb-weekly-summary'

const SUMMARY_DEBOUNCE_MS = 1200
const PHOTO_SLOTS = [1, 2]

// Core-data domain slug -- must stay exactly this, it's the registered
// Pivotly domain (see domain/jfb_weekly_summary_photos.json). Also passed as
// the Attachments API's domain param. Same pattern as PhotosTab.jsx's
// jfb_report_photos wiring, scoped by (project_id, week_start) instead of a
// single report_id since a weekly photo isn't tied to one daily report.
const PHOTO_DOMAIN = 'jfb_weekly_summary_photos'

// Pivotly's file table enforces a unique constraint on
// (folder_id, logical_name, storage_location) -- renaming to the record's
// own id + a timestamp guarantees a unique logical_name every time. Same
// helper as PhotosTab.jsx.
function withUniqueName(file, uniqueId) {
  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot) : ''
  return new File([file], `${uniqueId}-${Date.now()}${ext}`, { type: file.type })
}

// A jfb_project_delay_codes row either points at a master code (code/category
// come from jfb_delay_codes) or is a project-specific custom code with no
// master match (those fields live on the row itself) -- same resolution as
// EventLogTab.jsx's resolveDelayCode.
function resolveDelayLabel(delayCodeId, projectDelayCodeById, masterDelayCodeById) {
  if (!delayCodeId) return null
  const row = projectDelayCodeById.get(delayCodeId)
  if (!row) return null
  const master = row.delay_code_id ? masterDelayCodeById.get(row.delay_code_id) : null
  return (master ? master.code : row.code) || (master ? master.category : row.category) || null
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
  const { records: contentRows, loading: contentLoading, error: contentError } = useDomainData({
    domain: 'jfb_report_narratives_v2',
    system: 'core',
    projectId,
  })
  const { records: activities, loading: activitiesLoading, error: activitiesError } = useDomainData({
    domain: 'jfb_daily_activities',
    system: 'core',
    projectId,
  })
  const { delayCodes: masterDelayCodes, loading: masterDelayLoading, error: masterDelayError } = useDelayCodes()
  const { projectDelayCodes, loading: projectDelayLoading, error: projectDelayError } = useProjectDelayCodes(projectId)
  const {
    photos, loading: photosLoading, error: photosError,
    create: createPhoto, update: updatePhoto, remove: removePhoto,
  } = useWeeklySummaryPhotos(projectId)

  const loading =
    projectLoading || reportsLoading || sectionsLoading || contentLoading ||
    activitiesLoading || masterDelayLoading || projectDelayLoading || summariesLoading || photosLoading
  const error =
    projectError || reportsError || sectionsError || contentError ||
    activitiesError || masterDelayError || projectDelayError || summariesError || photosError

  const [photoUploading, setPhotoUploading] = useState({ 1: false, 2: false })
  const [photoSlotErrors, setPhotoSlotErrors] = useState({ 1: null, 2: null })
  const [removingSlot, setRemovingSlot] = useState(null)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  const photoFor = (n) => photos.find((p) => p.week_start === weekStart && p.photo_number === n) ?? null

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

      const uploadRes = await uploadAttachment({ coreRecordId: recordId, domain: PHOTO_DOMAIN, file: withUniqueName(file, recordId) })
      await updatePhoto(recordId, { photo_file_path: uploadRes.fileId })

      if (previousFileId && previousFileId !== uploadRes.fileId) {
        await deleteAttachment({ fileId: previousFileId, domain: PHOTO_DOMAIN, coreRecordId: recordId })
      }
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
      // File first, then the record -- a failure leaves an orphaned record
      // (visible, fixable) rather than an orphaned file (invisible, easy to
      // miss). Same ordering PhotosTab.jsx uses.
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

  // Everything the report's Handlebars template needs is already computed on
  // this page (unlike the daily report, which needed its own reportPdfData.js
  // fetch-and-join module) -- so parameters are built directly from state,
  // no extra data source calls. Only `project` is a real dataSource on the
  // report side, for the header block.
  async function handleDownloadPdf() {
    setDownloadingPdf(true)
    setPdfError(null)
    try {
      const narrativeSections = buildNarrativeSectionsParam(sections, summaries, weekStart)
      const result = await executeReport(REPORT_SLUG, {
        parameters: {
          projectId,
          projectFilter: { id: projectId },
          weekStart,
          weekEnd,
          releasedCount: report.releasedCount,
          narrativeSections,
          weeklyProduction: production.week && production.toDate
            ? {
                weekCy: production.week.cy.toLocaleString(),
                weekSf: production.week.sf.toLocaleString(),
                toDateCy: production.toDate.cy.toLocaleString(),
                toDateSf: production.toDate.sf.toLocaleString(),
                goal: project?.volume_goal != null ? Number(project.volume_goal).toLocaleString() : null,
              }
            : null,
          weeklyDelays: report.hours.byDelayLabel.map((d) => ({ description: d.description, hours: d.hours.toFixed(1) })),
          weeklyDelayTotalHours: report.hours.delayApprox.toFixed(1),
        },
      })
      // window.open would navigate with no Authorization header, and the
      // download route requires a bearer token -- fetch the bytes through
      // the authenticated `api` instance instead, same pattern as
      // ReportEditorPage.jsx's handleDownloadPdf.
      const fileRes = await api.get(result.downloadUrl, { responseType: 'blob' })
      const blobUrl = URL.createObjectURL(new Blob([fileRes.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `${weekStart} to ${weekEnd} ${project?.name ?? 'Weekly Summary'}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(blobUrl)

      // Best-effort audit log -- a failure here shouldn't block the user
      // from the PDF they already have in hand. No single report_id exists
      // for a week, so it's left null; report_date stands in for the period.
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
    } catch (err) {
      setPdfError(err.message)
    } finally {
      setDownloadingPdf(false)
    }
  }

  // No dedicated "loading" flag -- mirrors useAutoMetricValues.js's pattern
  // of only ever calling setState from inside the async callback, never
  // synchronously in the effect body. `production.week === null && !error`
  // stands in for "still loading" instead.
  const [production, setProduction] = useState({ week: null, toDate: null, error: null })

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const toDateStart = project?.start_date ? project.start_date.slice(0, 10) : '2000-01-01'
    const params = (start, end) => ({ p_project_id: projectId, p_start_date: start, p_end_date: end, p_equipment_id: null })
    Promise.all([
      executeDataView('dvw-jfb-metric-cy', params(weekStart, weekEnd)),
      executeDataView('dvw-jfb-metric-sf', params(weekStart, weekEnd)),
      executeDataView('dvw-jfb-metric-cy', params(toDateStart, weekEnd)),
      executeDataView('dvw-jfb-metric-sf', params(toDateStart, weekEnd)),
    ])
      .then(([cyWeek, sfWeek, cyToDate, sfToDate]) => {
        if (cancelled) return
        const read = (res, col) => Number(res?.[0]?.[col] ?? 0)
        setProduction({
          week: { cy: read(cyWeek, 'total_volume'), sf: read(sfWeek, 'total_area') },
          toDate: { cy: read(cyToDate, 'total_volume'), sf: read(sfToDate, 'total_area') },
          error: null,
        })
      })
      .catch((err) => {
        if (cancelled) return
        setProduction({ week: null, toDate: null, error: err.message })
      })
    return () => { cancelled = true }
  }, [projectId, weekStart, weekEnd, project?.start_date])

  const projectDelayCodeById = new Map(projectDelayCodes.map((r) => [r.id, r]))
  const masterDelayCodeById = new Map(masterDelayCodes.map((m) => [m.id, m]))

  const report = !loading && !error
    ? buildWeeklyReport({
        weekStart,
        reports,
        sections,
        contentRows,
        activities,
        resolveDelayLabel: (id) => resolveDelayLabel(id, projectDelayCodeById, masterDelayCodeById),
      })
    : null

  return (
    <ScrollArea flex={1} style={{ minHeight: 0 }}>
      <Box p={24} maw={900} mx="auto">
        <Group justify="space-between" mb={4}>
          <Text fw={700} size="lg">Weekly Summary</Text>
          <Link to={`/projects/${projectId}/reports`} style={{ fontSize: 13 }}>← Reports</Link>
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

            <SimpleGrid cols={{ base: 1, sm: 2 }} mb={20}>
              <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
                <Text fw={600} size="sm" mb={8}>Production</Text>
                {!production.week && !production.error && <Text size="xs" c="dimmed">Loading…</Text>}
                {production.error && <SafeError message={production.error} />}
                {production.week && production.toDate && (
                  <>
                    <Text size="sm">This week: {production.week.cy.toLocaleString()} CY · {production.week.sf.toLocaleString()} SF</Text>
                    <Text size="sm">Project to date: {production.toDate.cy.toLocaleString()} CY · {production.toDate.sf.toLocaleString()} SF</Text>
                    {project?.volume_goal != null && (
                      <Text size="sm" c="dimmed">Goal: {Number(project.volume_goal).toLocaleString()}</Text>
                    )}
                  </>
                )}
                <Text size="10px" c="dimmed" mt={6}>
                  Operating hours aren't shown — jfb_daily_activities has no category field to compute them from yet.
                </Text>
              </Box>
              <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
                <Text fw={600} size="sm" mb={4}>Delay summary · this week</Text>
                <Text size="10px" c="dimmed" mb={8}>
                  Approximate — based on which activities have a delay code attached, not a true operating/delay/bookend split.
                </Text>
                <Table fz="sm" withRowBorders={false}>
                  <Table.Tbody>
                    {report.hours.byDelayLabel.length === 0 && (
                      <Table.Tr><Table.Td><Text size="xs" c="dimmed">No delay-coded activity this week.</Text></Table.Td></Table.Tr>
                    )}
                    {report.hours.byDelayLabel.map((d) => (
                      <Table.Tr key={d.description}>
                        <Table.Td>{d.description}</Table.Td>
                        <Table.Td ta="right">{d.hours.toFixed(1)}h</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Box>
            </SimpleGrid>

            <Button size="xs" loading={downloadingPdf} onClick={handleDownloadPdf}>Download PDF</Button>
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

// Debounced autosave textarea for one section's weekly summary -- same
// shape as NarrativesTab.jsx's NarrativeSectionCard (debounce, flush on
// blur/unmount, save-state indicator), minus the FWW conflict handling:
// jfb_weekly_summaries uses plain lww, unlike jfb_report_narratives_v2.
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

  // Re-sync from the domain when the underlying row changes (e.g. after the
  // first save brings back a real row, or switching weeks) -- but not while
  // a save is pending/in-flight, so we don't clobber what's still being
  // typed. Adjusting state during render rather than in an effect, since
  // this derives state from a prop change.
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

  // Flush any pending save on unmount -- switching weeks shouldn't leave
  // typed text unsaved.
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
