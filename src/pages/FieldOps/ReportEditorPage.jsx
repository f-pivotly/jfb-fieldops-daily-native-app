import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Box, ScrollArea, Grid, Text, Badge, Checkbox, Stack, Button, Tabs } from '@mantine/core'
import { REPORT_STATUS_LABEL, REPORT_STATUS_COLOR } from '../../config/reportStatus'
import { shouldShowDredgeProgress } from '../../config/dredgeProgress'
import { useProject } from '../../hooks/useProject'
import { useReports } from '../../hooks/useReports'
import { useEquipment } from '../../hooks/useEquipment'
import { api, createDomainRecord, executeReport, fetchCurrentUser, fetchFileById } from '../../data'
import { useAppConfig } from '../../contexts/appConfigContext'
import PMReviewPanel from './components/PMReviewPanel'
import EventLogTab from './reportEditorTabs/EventLogTab'
import ProductionStatsTab from './reportEditorTabs/ProductionStatsTab'
import PhotosTab from './reportEditorTabs/PhotosTab'
import NarrativesTab from './reportEditorTabs/NarrativesTab'
import MetricsTab from './reportEditorTabs/MetricsTab'
import SafetyTab from './reportEditorTabs/SafetyTab'
import DredgeProgressTab from './reportEditorTabs/DredgeProgressTab'

const CONTENT_TABS = [
  { key: 'event_log', label: 'Event Log', Comp: EventLogTab },
  { key: 'production', label: 'Production Stats', Comp: ProductionStatsTab },
  { key: 'photos', label: 'Photos', Comp: PhotosTab },
  { key: 'narratives', label: 'Narratives', Comp: NarrativesTab },
  { key: 'metrics', label: 'Metrics', Comp: MetricsTab },
  { key: 'safety', label: 'Safety', Comp: SafetyTab },
]

const DREDGE_PROGRESS_TAB = { key: 'dredge_progress', label: 'Dredge Progress', Comp: DredgeProgressTab }

const CHECKLIST_LABELS = {
  event_log_reviewed: 'Event log reviewed',
  transitions_added: 'Transition events added',
  production_stats_entered: 'Production stats entered',
  photos_complete: 'Photos uploaded and labeled',
  narratives_complete: 'Narratives complete',
  metrics_entered: 'Metrics entered',
}

// Not yet derived from real report state -- each item should reflect whether
// its tab actually has data (e.g. event_log_reviewed once EventLogTab has
// entries), not a hardcoded flag. Left false rather than faked true/false
// values so the checklist doesn't claim work is done that isn't.
const CHECKLIST_PLACEHOLDER = {
  event_log_reviewed: false,
  transitions_added: false,
  production_stats_entered: false,
  photos_complete: false,
  narratives_complete: false,
  metrics_entered: false,
}

export default function ReportEditorPage() {
  const { projectId, date } = useParams()
  const { config } = useAppConfig()
  const { project } = useProject(projectId)
  const { reports, loading: reportsLoading, ensureReport } = useReports(projectId)
  const report = reports.find((r) => r.report_date === date)
  const status = report?.status ?? 'draft'

  useEffect(() => {
    // Wait for the real fetch to finish before deciding a report is missing --
    // otherwise an empty-but-still-loading `reports` array reads as "no report
    // exists yet" and creates a duplicate of one that's already there.
    if (!project || reportsLoading || report) return
    ensureReport({
      project_id: project.id,
      report_date: date,
      status: 'draft',
    })
  }, [project, reportsLoading, report, date, ensureReport])

  const { equipment } = useEquipment(projectId)
  const [mobDay, setMobDay] = useState(false)
  const [selectedEquipment, setSelectedEquipment] = useState(null)
  const [tab, setTab] = useState('event_log')
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const effectiveEquipmentId = selectedEquipment ?? equipment[0]?.id ?? null
  const canDownloadPdf = status === 'approved' || status === 'released'
  const contentTabs = shouldShowDredgeProgress(project) ? [...CONTENT_TABS, DREDGE_PROGRESS_TAB] : CONTENT_TABS

  async function handleDownloadPdf() {
    setDownloadingPdf(true)
    try {
      const reportId = report?.id
      const result = await executeReport('rpt-jfb-daily-report', {
        parameters: {
          projectId,
          reportId,
          date,
          // The report's domain-query sources can only be parameterized by
          // mapping their whole `filters` object to one resolved value (see
          // REPORT_PDF_INTEGRATION.md) -- so the caller builds the filter
          // shape each source's CRD query expects, keyed by that domain's
          // actual FK column name.
          projectFilter: { id: projectId },
          reportFilter: { report_id: reportId },
          equipmentFilter: { project_id: projectId },
        },
      })
      // window.open(downloadUrl) navigates the browser directly with no
      // Authorization header, and the download route requires a bearer
      // token -- so fetch the bytes through the authenticated `api`
      // instance instead (it already carries the token as a default
      // header, applied even for an absolute URL like this one), then
      // save via a blob + hidden <a download>, same pattern as
      // jfb-fieldops-daily's own triggerDownload().
      const fileRes = await api.get(result.downloadUrl, { responseType: 'blob' })
      const blobUrl = URL.createObjectURL(new Blob([fileRes.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `${date} ${project?.name ?? 'Daily Report'}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(blobUrl)

      // Best-effort audit log -- a failure here shouldn't block the user
      // from the PDF they already have in hand.
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
            report_id: reportId,
            project_id: projectId,
            report_date: date,
            report_slug: 'rpt-jfb-daily-report',
            generated_at: new Date().toISOString(),
            generated_by_user_id: me.id,
            generated_by_email: me.email,
            // The /execute response calls this `fileKey`, not `fileId` --
            // report-output-store.service.ts's persist() renames it from
            // the internal upload result before returning.
            file_id: result.fileKey ?? null,
            // filesView (Drizzle) maps these to camelCase -- the /v3/files/:id
            // response is logicalName/storagePath, not the snake_case DB names.
            file_name: file?.logicalName ?? null,
            file_path: file?.storagePath ?? null,
            download_url: result.downloadUrl,
          },
        })
      } catch (logErr) {
        console.error('Failed to log report generation:', logErr.message)
      }
    } catch (err) {
      console.error('Report generation failed:', err.message)
    } finally {
      setDownloadingPdf(false)
    }
  }

  return (
    <ScrollArea flex={1} style={{ minHeight: 0 }}>
      <Box p={24} maw={1200} mx="auto">
        <Link to={`/projects/${projectId}/reports`} style={{ fontSize: 12 }}>← Report list</Link>

        <Grid mt={10} gutter="lg">
          <Grid.Col span={{ base: 12, lg: 3 }}>
            <Stack gap="md" p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
              <Box>
                <Text fw={700} size="md">{date}</Text>
                {project && <Text size="xs" c="dimmed">{project.name} · #{project.project_code}</Text>}
              </Box>

              <Box style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text size="xs" tt="uppercase" c="dimmed">Status</Text>
                <Badge size="sm" color={REPORT_STATUS_COLOR[status]}>{REPORT_STATUS_LABEL[status]}</Badge>
              </Box>

              <Checkbox
                size="xs"
                label="Mobilization day (no production)"
                checked={mobDay}
                onChange={(e) => setMobDay(e.currentTarget.checked)}
              />

              <Box>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>Completion</Text>
                <Stack gap={6}>
                  {Object.entries(CHECKLIST_LABELS).map(([key, label]) => (
                    <Checkbox key={key} size="xs" readOnly label={label} checked={CHECKLIST_PLACEHOLDER[key]} />
                  ))}
                </Stack>
              </Box>

              <Box>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>Equipment</Text>
                <Stack gap={4}>
                  {equipment.map((eq) => (
                    <Button
                      key={eq.id}
                      size="xs"
                      variant={effectiveEquipmentId === eq.id ? 'filled' : 'default'}
                      justify="flex-start"
                      onClick={() => setSelectedEquipment(eq.id)}
                    >
                      {eq.name}
                    </Button>
                  ))}
                </Stack>
              </Box>

              <PMReviewPanel />

              {canDownloadPdf && (
                <Button size="xs" loading={downloadingPdf} onClick={handleDownloadPdf}>
                  Download PDF
                </Button>
              )}
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 9 }}>
            <Tabs value={tab} onChange={setTab} keepMounted={false}>
              <Tabs.List mb={12}>
                {contentTabs.map((t) => (
                  <Tabs.Tab key={t.key} value={t.key}>{t.label}</Tabs.Tab>
                ))}
              </Tabs.List>
              {contentTabs.map((t) => (
                <Tabs.Panel key={t.key} value={t.key}>
                  <t.Comp project={project} report={report} equipment={equipment} selectedEquipmentId={effectiveEquipmentId} />
                </Tabs.Panel>
              ))}
            </Tabs>
          </Grid.Col>
        </Grid>
      </Box>
    </ScrollArea>
  )
}
