import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Box, ScrollArea, Grid, Text, Badge, Checkbox, Group, Stack, Button, Tabs } from '@mantine/core'
import { REPORT_STATUS_LABEL, REPORT_STATUS_COLOR } from '../../config/reportStatus'
import { shouldShowDredgeProgress } from '../../config/dredgeProgress'
import { shouldShowPlacementProgress } from '../../config/placementProgress'
import { shouldShowSpreaderProgress } from '../../config/spreaderProgress'
import { pickDensity } from './lib/coverDensity'
import { useProject } from '../../hooks/useProject'
import { useReports } from '../../hooks/useReports'
import { useEquipment } from '../../hooks/useEquipment'
import { usePlacementConfig } from '../../hooks/usePlacementConfig'
import { api, createDomainRecord, executeReport, fetchCurrentUser, fetchFileById } from '../../data'
import { useAppConfig } from '../../contexts/appConfigContext'
import { useFieldOpsAction } from '../../contexts/fieldOpsAccessContext'
import {
  buildNarrativeSectionsParam,
  buildDailyActivityByEquipmentParam,
  buildPhotoAssetsParam,
  buildDredgeChartAssetsParam,
  buildSafetyPageDataParam,
  buildProductionComboTotalsByEquipmentParam,
  buildCoverProductionTotalsParam,
  buildFlowAndPipeByEquipmentParam,
  buildDateTableParams,
  buildEquipmentReportNumbers,
  buildCompletionChecklist,
  validatePdfIssues,
} from './lib/reportPdfData'
import PMReviewPanel from './components/PMReviewPanel'
import EventLogTab from './reportEditorTabs/EventLogTab'
import ProductionStatsTab from './reportEditorTabs/ProductionStatsTab'
import PhotosTab from './reportEditorTabs/PhotosTab'
import NarrativesTab from './reportEditorTabs/NarrativesTab'
import MetricsTab from './reportEditorTabs/MetricsTab'
import SafetyTab from './reportEditorTabs/SafetyTab'
import DredgeProgressTab from './reportEditorTabs/DredgeProgressTab'
import PlacementProgressTab from './reportEditorTabs/PlacementProgressTab'
import SpreaderProgressTab from './reportEditorTabs/SpreaderProgressTab'
import WaterQualityTab from './reportEditorTabs/WaterQualityTab'
import AirQualityTab from './reportEditorTabs/AirQualityTab'

const CONTENT_TABS = [
  { key: 'event_log', label: 'Event Log', Comp: EventLogTab },
  { key: 'production', label: 'Production Stats', Comp: ProductionStatsTab },
  { key: 'photos', label: 'Photos', Comp: PhotosTab },
  { key: 'narratives', label: 'Narratives', Comp: NarrativesTab },
  { key: 'metrics', label: 'Metrics', Comp: MetricsTab },
  { key: 'safety', label: 'Safety', Comp: SafetyTab },
]

const DREDGE_PROGRESS_TAB = { key: 'dredge_progress', label: 'Dredge Progress', Comp: DredgeProgressTab }
const PLACEMENT_PROGRESS_TAB = { key: 'placement_progress', label: 'Placement Progress', Comp: PlacementProgressTab }
const SPREADER_PROGRESS_TAB = { key: 'spreader_progress', label: 'Spreader Progress', Comp: SpreaderProgressTab }
const WATER_QUALITY_TAB = { key: 'water_quality', label: 'Water Quality', Comp: WaterQualityTab }
const AIR_QUALITY_TAB = { key: 'air_quality', label: 'Air Quality', Comp: AirQualityTab }

const CHECKLIST_LABELS = {
  event_log_reviewed: 'Event log reviewed',
  transitions_added: 'Transition events added',
  production_stats_entered: 'Production stats entered',
  photos_complete: 'Photos uploaded and labeled',
  narratives_complete: 'Narratives complete',
  metrics_entered: 'Metrics entered',
}

const MOBILIZATION_NA_ITEMS = new Set(['event_log_reviewed', 'production_stats_entered', 'metrics_entered'])
const EMPTY_NA_ITEMS = new Set()

export default function ReportEditorPage() {
  const { projectId, date } = useParams()
  const { config } = useAppConfig()
  const { project } = useProject(projectId)
  const { reports, loading: reportsLoading, ensureReport, update: updateReport, updating: reportSaving } = useReports(projectId)
  const report = reports.find((r) => r.report_date === date)
  const status = report?.status ?? 'draft'

  useEffect(() => {
    if (!project || reportsLoading || report) return
    ensureReport({
      project_id: project.id,
      report_date: date,
      status: 'draft',
    })
  }, [project, reportsLoading, report, date, ensureReport])

  const { equipment } = useEquipment(projectId)
  const mobDay = report?.no_production_day ?? false
  const [selectedEquipment, setSelectedEquipment] = useState(null)
  const [tab, setTab] = useState('event_log')
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [checklist, setChecklist] = useState(null)
  const [pdfIssues, setPdfIssues] = useState(null)
  const canSkipPdfValidation = useFieldOpsAction('skip_pdf_validation')
  const effectiveEquipmentId = selectedEquipment ?? equipment[0]?.id ?? null
  const effectiveEquipment = equipment.find((eq) => eq.id === effectiveEquipmentId) ?? null
  const canDownloadPdf = status === 'approved' || status === 'released'
  const canSubmitForReview = status === 'draft'
  const canRelease = useFieldOpsAction('release_report') && status === 'approved'
  const canUnlock = status === 'approved' || status === 'released'
  const [releasing, setReleasing] = useState(false)
  const { config: placementConfig } = usePlacementConfig(project?.id)
  let contentTabs = CONTENT_TABS
  if (shouldShowDredgeProgress(project, effectiveEquipment, date)) contentTabs = [...contentTabs, DREDGE_PROGRESS_TAB]
  if (shouldShowPlacementProgress(project, effectiveEquipment, date, placementConfig)) contentTabs = [...contentTabs, PLACEMENT_PROGRESS_TAB]
  if (shouldShowSpreaderProgress(project, effectiveEquipment, date)) contentTabs = [...contentTabs, SPREADER_PROGRESS_TAB]
  contentTabs = [...contentTabs, WATER_QUALITY_TAB, AIR_QUALITY_TAB]
  const naItems = mobDay ? MOBILIZATION_NA_ITEMS : EMPTY_NA_ITEMS
  const checklistDone = !!checklist && Object.keys(CHECKLIST_LABELS).every((key) => naItems.has(key) || checklist[key])
  const activeTab = contentTabs.some((t) => t.key === tab) ? tab : 'event_log'

  useEffect(() => {
    if (!project?.id || !report?.id) return
    let cancelled = false
    buildCompletionChecklist({ appSlug: config.appSlug, projectId: project.id, reportId: report.id, dateISO: date })
      .then((result) => { if (!cancelled) setChecklist(result) })
      .catch((err) => console.error('Failed to compute completion checklist:', err.message))
    return () => { cancelled = true }
  }, [project?.id, report?.id, date, config.appSlug])

  async function handleSubmitForReview() {
    if (!report?.id) return
    await updateReport(report.id, { status: 'cqc_review' })
  }

  async function handleApprove() {
    if (!report?.id) return
    await updateReport(report.id, { status: 'approved' })
  }

  async function handleSendBack() {
    if (!report?.id) return
    await updateReport(report.id, { status: 'draft' })
  }

  async function handleUnlock() {
    if (!report?.id) return
    await updateReport(report.id, { status: 'draft' })
  }

  async function handleToggleNoProduction(value) {
    if (!report?.id) return
    await updateReport(report.id, { no_production_day: value })
  }

  async function handleRelease() {
    if (!report?.id) return
    setReleasing(true)
    try {
      const me = await fetchCurrentUser()
      await updateReport(report.id, {
        status: 'released',
        released_at: new Date().toISOString(),
        released_by_user_id: me.id,
      })
    } finally {
      setReleasing(false)
    }
  }

  async function handleDownloadPdf(opts = {}) {
    setDownloadingPdf(true)
    setPdfIssues(null)
    try {
      const reportId = report?.id
      const narrativeSections = await buildNarrativeSectionsParam({ appSlug: config.appSlug, projectId, reportId })

      const issues = await validatePdfIssues({ appSlug: config.appSlug, reportId, narrativeSections })
      if (issues.length > 0 && !opts.skipValidation) {
        setPdfIssues(issues)
        return
      }

      const [dailyActivityData, photoAssets, dredgeChartAssets, safetyPageData, productionStatsByEquipment, productionTotals, flowAndPipe] = await Promise.all([
        buildDailyActivityByEquipmentParam({ appSlug: config.appSlug, projectId, project, dateISO: date, equipment }),
        buildPhotoAssetsParam({ appSlug: config.appSlug, reportId }),
        buildDredgeChartAssetsParam({ appSlug: config.appSlug, reportId, project, equipment, dateISO: date }),
        buildSafetyPageDataParam({ appSlug: config.appSlug, projectId, reportId, dateISO: date, project }),
        buildProductionComboTotalsByEquipmentParam({ appSlug: config.appSlug, projectId, project, reportId, dateISO: date, equipment }),
        buildCoverProductionTotalsParam({ projectId, project, dateISO: date }),
        buildFlowAndPipeByEquipmentParam({ appSlug: config.appSlug, projectId, dateISO: date }),
      ])
      const { activitiesByEquipment: dailyActivityByEquipment, delaySummaryByEquipment, opSummaryByEquipment } = dailyActivityData
      const { flowStatsByEquipment, pipeSegments, pipeTotalLength } = flowAndPipe
      const dateTable = buildDateTableParams({ date, project })
      const reportNumberByEquipment = buildEquipmentReportNumbers({ date, equipment })
      const { density: coverDensity } = pickDensity({
        narratives: narrativeSections,
        metricsCount: (productionTotals?.rows ?? []).length,
      })
      const result = await executeReport('rpt-jfb-daily-report', {
        parameters: {
          projectId,
          reportId,
          date,
          noProductionDay: !!report?.no_production_day,
          projectFilter: { id: projectId },
          reportFilter: { report_id: reportId },
          equipmentFilter: { project_id: projectId },
          narrativeSections,
          dailyActivityByEquipment,
          delaySummaryByEquipment,
          opSummaryByEquipment,
          photoAssets,
          dredgeChartAssets,
          safetyPageData,
          productionStatsByEquipment,
          productionTotals,
          flowStatsByEquipment,
          pipeSegments,
          pipeTotalLength,
          reportNumberByEquipment,
          coverDensity,
          ...dateTable,
        },
      })
      const fileRes = await api.get(result.downloadUrl, { responseType: 'blob' })
      const blobUrl = URL.createObjectURL(new Blob([fileRes.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = blobUrl
      const yymmdd = date.replaceAll('-', '').slice(2)
      link.download = `${yymmdd} ${project?.name ?? 'Daily Report'} Daily Report.pdf`
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
            report_id: reportId,
            project_id: projectId,
            report_date: date,
            report_slug: 'rpt-jfb-daily-report',
            report_type: 'daily',
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

              {canSubmitForReview && (
                <Button
                  size="xs"
                  loading={reportSaving}
                  onClick={handleSubmitForReview}
                  disabled={!checklistDone}
                  title={!checklistDone ? 'All 6 checklist items must be complete before sending to PM.' : undefined}
                  style={{ background: '#0F2744', border: 'none' }}
                >
                  Submit for review
                </Button>
              )}

              {canRelease && (
                <Button
                  size="xs"
                  loading={releasing}
                  onClick={handleRelease}
                  style={{ background: '#0F2744', border: 'none' }}
                >
                  Release
                </Button>
              )}

              {canUnlock && (
                <Button size="xs" variant="default" loading={reportSaving} onClick={handleUnlock}>
                  Unlock
                </Button>
              )}

              <Checkbox
                size="xs"
                label="Mobilization day (no production)"
                checked={mobDay}
                onChange={(e) => handleToggleNoProduction(e.currentTarget.checked)}
              />

              <Box>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>Completion</Text>
                <Stack gap={6}>
                  {Object.entries(CHECKLIST_LABELS).map(([key, label]) => {
                    const isNa = naItems.has(key)
                    if (isNa) {
                      return (
                        <Group key={key} gap={6} wrap="nowrap">
                          <Badge size="xs" color="gray" variant="light" title="N/A — Mobilization day (no production)">N/A</Badge>
                          <Text size="xs" c="dimmed" fs="italic">{label}</Text>
                        </Group>
                      )
                    }
                    return (
                      <Checkbox key={key} size="xs" readOnly label={label} checked={!!checklist?.[key]} />
                    )
                  })}
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

              <PMReviewPanel project={project} report={report} equipment={equipment} onApprove={handleApprove} onSendBack={handleSendBack} saving={reportSaving} />

              {canDownloadPdf && (
                <Stack gap={6}>
                  <Button size="xs" loading={downloadingPdf} onClick={() => handleDownloadPdf()}>
                    Download PDF
                  </Button>
                  {pdfIssues && pdfIssues.length > 0 && (
                    <Box p={8} style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6 }}>
                      <Text size="xs" fw={700} c="#92400E" mb={4}>PDF blocked — fix these first:</Text>
                      <Stack gap={2}>
                        {pdfIssues.map((issue) => (
                          <Text key={issue.key} size="xs" c="#92400E">• {issue.message}</Text>
                        ))}
                      </Stack>
                      {canSkipPdfValidation && (
                        <Text
                          size="xs"
                          fw={600}
                          c="#92400E"
                          mt={4}
                          style={{ cursor: 'pointer', textDecoration: 'underline', display: 'inline-block' }}
                          onClick={() => handleDownloadPdf({ skipValidation: true })}
                          title="This override requires the skip_pdf_validation grant."
                        >
                          Generate anyway (override)
                        </Text>
                      )}
                    </Box>
                  )}
                </Stack>
              )}
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 9 }}>
            <Tabs value={activeTab} onChange={setTab} keepMounted={false}>
              <Tabs.List mb={12}>
                {contentTabs.map((t) => (
                  <Tabs.Tab key={t.key} value={t.key}>{t.label}</Tabs.Tab>
                ))}
              </Tabs.List>
              {contentTabs.map((t) => (
                <Tabs.Panel key={t.key} value={t.key}>
                  <t.Comp project={project} report={report} reports={reports} equipment={equipment} selectedEquipmentId={effectiveEquipmentId} />
                </Tabs.Panel>
              ))}
            </Tabs>
          </Grid.Col>
        </Grid>
      </Box>
    </ScrollArea>
  )
}
