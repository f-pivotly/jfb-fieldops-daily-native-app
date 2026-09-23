import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Box, Grid, Text, Table, Group, Button, Select, Stack, TextInput, UnstyledButton } from '@mantine/core'
import { executeDataView, executeReport } from '../../data'
import { useAppConfig } from '../../contexts/appConfigContext'
import { useProject } from '../../hooks/project/useProject'
import { useRealizedExcludedDays } from '../../hooks/project/useRealizedExcludedDays'
import { useProjectMaterials } from '../../hooks/capping/useProjectMaterials'
import { useRealizedScopes } from '../../hooks/project/useRealizedScopes'
import { useProductionWeekBreaks } from '../../hooks/project/useProductionWeekBreaks'
import ReasonDialog from '../../components/ReasonDialog'
import ScheduledOffDaysCard from '../../components/ScheduledOffDaysCard'
import { buildRealizedReport, tonnageMeasure, todayISO, prettyDate, addDaysISO, mondayStartISO } from './lib/realizedToDate'
import { buildRealizedReportParams } from './lib/realizedPdfData'
import { downloadAndLogReport } from './lib/reportDownload'

function fmtRate(n) {
  return (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })
}
function fmtNum(n) {
  return Math.round(n ?? 0).toLocaleString()
}
function fmtHours(n) {
  return (n ?? 0).toFixed(2)
}

export default function RealizedToDatePage() {
  const { projectId } = useParams()
  const { config } = useAppConfig()
  const { project, loading: projectLoading } = useProject(projectId)
  const {
    excludedDays, create: createExcluded, remove: removeExcluded,
  } = useRealizedExcludedDays(projectId)
  const {
    breaks, creating: addingBreak, create: createBreak, remove: removeBreak,
  } = useProductionWeekBreaks(projectId)
  const { materials } = useProjectMaterials(projectId)

  const today = todayISO()
  const currentWeekStart = addDaysISO(mondayStartISO(today), -7)
  const currentWeekEnd = addDaysISO(currentWeekStart, 6)

  const { scopes } = useRealizedScopes(projectId)
  const activeScopes = useMemo(
    () => [...(scopes ?? [])]
      .filter((sc) => sc.active !== false)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.label).localeCompare(String(b.label))),
    [scopes],
  )
  const [scopeId, setScopeId] = useState(null)
  const scope = useMemo(
    () => activeScopes.find((sc) => sc.id === scopeId) ?? activeScopes[0] ?? null,
    [activeScopes, scopeId],
  )
  const scopeKey = activeScopes.map((sc) => sc.id).join(',')
  const [prevScopeKey, setPrevScopeKey] = useState(scopeKey)
  if (scopeKey !== prevScopeKey) {
    setPrevScopeKey(scopeKey)
    setScopeId(activeScopes[0]?.id ?? null)
  }

  const hasScope = !!scope
  const idList = (v) => (Array.isArray(v) ? v.filter(Boolean).join(',') : '')
  const OPEN_ENDED = '9999-12-31'
  const projectStart = project?.production_start_date
    || (project?.start_date ? project.start_date.slice(0, 10) : '2000-01-01')
  const scopeStart = scope?.start_date ? String(scope.start_date).slice(0, 10) : projectStart
  const scopeEnd = scope?.end_date ? String(scope.end_date).slice(0, 10) : OPEN_ENDED
  const scopeInclude = scope ? idList(scope.include_area_ids) : ''
  const scopeExclude = scope ? idList(scope.exclude_area_ids) : ''

  const [dailyTotals, setDailyTotals] = useState(null)
  const [dailyTotalsError, setDailyTotalsError] = useState(null)
  useEffect(() => {
    if (!project?.id) return
    let cancelled = false
    const view = hasScope ? 'dvw-jfb-realized-daily-totals-scoped-v2' : 'dvw-jfb-realized-daily-totals-v2'
    const params = hasScope
      ? {
        p_project_id: project.id,
        p_start_date: scopeStart,
        p_end_date: scopeEnd,
        p_include_ids: scopeInclude,
        p_exclude_ids: scopeExclude,
      }
      : { p_project_id: project.id, p_start_date: scopeStart }
    executeDataView(view, params)
      .then((rows) => {
        if (cancelled) return
        setDailyTotals(rows.map((r) => ({
          date: r.report_date,
          cy: Number(r.cy) || 0,
          tons: Number(r.tons) || 0,
          sf: Number(r.sf) || 0,
          goh: Number(r.goh) || 0,
          noh: Number(r.noh) || 0,
        })))
      })
      .catch((err) => { if (!cancelled) setDailyTotalsError(err.message) })
    return () => { cancelled = true }
  }, [project?.id, hasScope, scopeStart, scopeEnd, scopeInclude, scopeExclude])

  const [delayRows, setDelayRows] = useState([])
  useEffect(() => {
    if (!project?.id) return
    let cancelled = false
    const view = hasScope ? 'dvw-jfb-realized-delay-summary-scoped-v2' : 'dvw-jfb-realized-delay-summary-v2'
    const base = { p_project_id: project.id, p_start_date: currentWeekStart, p_end_date: currentWeekEnd }
    executeDataView(view, hasScope ? { ...base, p_include_ids: scopeInclude, p_exclude_ids: scopeExclude } : base)
      .then((rows) => { if (!cancelled) setDelayRows(rows) })
      .catch(() => { if (!cancelled) setDelayRows([]) })
    return () => { cancelled = true }
  }, [project?.id, currentWeekStart, currentWeekEnd, hasScope, scopeInclude, scopeExclude])

  // A project paid by the ton reports in TON, and only over its placement
  // phase: averaging the earlier dredging CY with placement tons would be
  // meaningless. Matches the non-native app's Realized To-Date.
  const measure = useMemo(() => tonnageMeasure(materials), [materials])

  const report = useMemo(() => {
    if (!project || !dailyTotals) return null
    const excludedSet = new Set(excludedDays.map((e) => e.exclude_date))
    const reasons = new Map(excludedDays.map((e) => [e.exclude_date, e.reason]))
    let days = dailyTotals
    if (measure) {
      const fromDate = project.placement_start_date ? String(project.placement_start_date).slice(0, 10) : null
      days = dailyTotals
        .filter((d) => !fromDate || d.date >= fromDate)
        .map((d) => ({ ...d, cy: d.tons }))
    }
    const scoped = scope
      ? {
        ...project,
        volume_goal: scope.goal ?? project.volume_goal,
        cy_goh_goal: scope.cy_goh_goal ?? project.cy_goh_goal,
        expected_goh_per_day: scope.expected_goh_per_day ?? project.expected_goh_per_day,
        production_days_per_week: scope.production_days_per_week ?? project.production_days_per_week,
        start_date: scopeStart,
        production_start_date: scopeStart,
      }
      : project
    const baseline = scope ? Number(scope.baseline_cy) || 0 : undefined
    return buildRealizedReport(scoped, days, delayRows, excludedSet, reasons, breaks, today, measure ?? undefined, baseline)
  }, [project, dailyTotals, delayRows, excludedDays, breaks, today, measure, scope, scopeStart])

  const [excludeTarget, setExcludeTarget] = useState(null)
  const [savingExclude, setSavingExclude] = useState(false)
  const [actionError, setActionError] = useState(null)

  async function confirmExclude(reason) {
    if (!projectId || !excludeTarget) return
    setSavingExclude(true)
    try {
      await createExcluded({
        project_id: projectId, exclude_date: excludeTarget, reason,
      })
      setExcludeTarget(null)
    } catch (e) {
      setActionError(e.message)
    } finally {
      setSavingExclude(false)
    }
  }

  async function includeDay(date) {
    const row = excludedDays.find((e) => e.exclude_date === date)
    if (!row) return
    try {
      await removeExcluded(row.id)
    } catch (e) {
      setActionError(e.message)
    }
  }

  const [pdfBusy, setPdfBusy] = useState(false)
  async function handleDownloadPdf() {
    if (!report || !project) return
    setPdfBusy(true)
    try {
      const generatedISO = todayISO()
      const params = buildRealizedReportParams({ report, project, projectCode: project.project_code, generatedISO })
      const result = await executeReport('rpt-jfb-realized-to-date', { parameters: params })
      await downloadAndLogReport({
        result,
        filename: `${generatedISO.replace(/-/g, '')}_${project.project_code}_RealizedToDate.pdf`,
        appSlug: config.appSlug,
        recordData: {
          project_id: projectId,
          report_slug: 'rpt-jfb-realized-to-date',
          report_type: 'realized_to_date',
        },
      })
    } catch (e) {
      setActionError(e.message)
    } finally {
      setPdfBusy(false)
    }
  }

  const loading = projectLoading || (!!project?.id && dailyTotals === null)

  return (
    <>
      <Group justify="space-between" mb={4}>
        <Group gap={12} align="baseline" wrap="wrap">
          <Text fw={700} size="lg">Realized To-Date</Text>
          {activeScopes.length === 1 && (
            <Text size="sm" c="dimmed">{activeScopes[0].label}</Text>
          )}
          {activeScopes.length > 1 && (
            <Select
              size="xs"
              w={260}
              data={activeScopes.map((sc) => ({ value: sc.id, label: sc.label }))}
              value={scope?.id ?? null}
              onChange={(v) => setScopeId(v)}
              allowDeselect={false}
            />
          )}
        </Group>
        <Group gap="md">
          {report && report.weeks.length > 0 && (
            <Button size="xs" variant="outline" loading={pdfBusy} onClick={handleDownloadPdf}>
              {pdfBusy ? 'Generating…' : 'Download PDF'}
            </Button>
          )}
          <Link to={`/projects/${projectId}/reports`} style={{ fontSize: 13 }}>← Reports</Link>
        </Group>
      </Group>
      <Text size="sm" c="dimmed" mb={20}>
        Cumulative production vs goal and completion forecast. Internal report — not client-facing.
      </Text>

      {(dailyTotalsError || actionError) && (
        <Box mb={16} p={12} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6 }}>
          <Text size="sm" c="#b91c1c">{dailyTotalsError || actionError}</Text>
        </Box>
      )}
      {loading && <Text size="sm" c="dimmed">Loading…</Text>}

      {!loading && report && project && (
        <>
          {!report.summary.planEnabled && (
            <Box mb={16} p={12} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6 }}>
              <Text size="sm" c="#92400e">
                Forecast disabled — set <Text span fw={700} fs="normal">Expected GOH/day</Text> and{' '}
                <Text span fw={700} fs="normal">Production days/week</Text> on the{' '}
                <Link to={`/projects/${projectId}/settings`} style={{ textDecoration: 'underline', fontWeight: 600 }}>
                  Project Settings
                </Link>{' '}
                page to enable completion projections.
              </Text>
            </Box>
          )}

          <Grid gutter="lg">
            <Grid.Col span={{ base: 12, lg: 4 }}>
              <Stack gap="md">
                <SummaryCard report={report} />
                <ProjectionsCard report={report} />
                <DelaySummaryCard report={report} />
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, lg: 8 }}>
              <WeeklyLog report={report} onExclude={(date) => setExcludeTarget(date)} onInclude={includeDay} />

              <Box mt="md">
                <ScheduledOffDaysCard
                  projectId={projectId}
                  excludedDays={excludedDays}
                  today={today}
                  onCreate={createExcluded}
                  onRemove={removeExcluded}
                  onError={setActionError}
                />
              </Box>

              <ShutdownManager
                breaks={breaks}
                adding={addingBreak}
                onAdd={async (start, end, reason) => {
                  try {
                    await createBreak({ project_id: projectId, shutdown_start: start, shutdown_end: end, reason: reason || null })
                  } catch (e) {
                    setActionError(e.message)
                  }
                }}
                onRemove={async (id) => {
                  try {
                    await removeBreak(id)
                  } catch (e) {
                    setActionError(e.message)
                  }
                }}
              />
            </Grid.Col>
          </Grid>
        </>
      )}

      <ReasonDialog
        opened={excludeTarget !== null}
        onClose={() => setExcludeTarget(null)}
        title="Exclude this day"
        label={excludeTarget ? `Why is ${prettyDate(excludeTarget)} excluded from the rate & forecast?` : 'Reason'}
        placeholder="e.g. permit hold, equipment casualty"
        confirmLabel="Exclude day"
        confirmColor="red"
        onConfirm={confirmExclude}
        submitting={savingExclude}
      />
    </>
  )
}

function StatRow({ label, value, hint, color }) {
  return (
    <Box py={4} style={{ borderBottom: '1px solid var(--mantine-color-gray-1)' }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Text size="10px" c="dimmed" tt="uppercase">{label}</Text>
        <Text size="sm" fw={500} c={color} ta="right">{value}</Text>
      </Group>
      {hint && <Text size="10px" c="dimmed" ta="right">{hint}</Text>}
    </Box>
  )
}

function Card({ title, children, noPad }) {
  return (
    <Box style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, overflow: 'hidden' }}>
      <Box p={noPad ? '12px 16px' : 16} pb={noPad ? 8 : 16}>
        <Text fw={700} size="sm" mb={noPad ? 0 : 8}>{title}</Text>
        {!noPad && children}
      </Box>
      {noPad && children}
    </Box>
  )
}

function SummaryCard({ report }) {
  const s = report.summary
  const aheadBehind =
    s.daysAheadBehind == null
      ? '—'
      : s.daysAheadBehind >= 0
        ? `${s.daysAheadBehind.toFixed(1)} days ahead`
        : `${Math.abs(s.daysAheadBehind).toFixed(1)} days behind`
  return (
    <Card title={s.projectName}>
      <StatRow label="Goal" value={`${fmtNum(s.goal)} ${s.unit}`} />
      <StatRow label={`${s.unit} to date`} value={`${fmtNum(s.toDate)} ${s.unit}`} />
      {s.plannedToDate != null && (
        <StatRow
          label={s.paceByGoh
            ? `Expected at ${fmtRate(s.bidRate)} ${s.unit}/GOH × ${fmtNum(s.totalGoh)} GOH worked`
            : `Planned at ${fmtNum(s.anticipatedDailyProduction ?? 0)} ${s.unit}/day`}
          value={`${fmtNum(s.plannedToDate)} ${s.unit}`}
        />
      )}
      {s.cyAheadOfPace != null && (
        <StatRow
          label={s.cyAheadOfPace >= 0 ? `${s.unit} ahead of pace` : `${s.unit} behind pace`}
          value={`${s.cyAheadOfPace >= 0 ? '+' : '-'}${fmtNum(Math.abs(s.cyAheadOfPace))} ${s.unit}`}
          color={s.cyAheadOfPace >= 0 ? 'green' : 'red'}
        />
      )}
      <StatRow label={`${s.unit} remaining to goal`} value={`${fmtNum(s.remaining)} ${s.unit}`} />
      <StatRow label="Percent complete" value={`${(s.pctComplete * 100).toFixed(1)}%`} />
      <StatRow label="Bid goal rate" value={`${fmtRate(s.bidRate)} ${s.unit}/GOH`} />
      <StatRow label="Current overall rate" value={`${fmtRate(s.currentRate)} ${s.unit}/GOH`} />
      <StatRow
        label="Anticipated daily production"
        value={s.anticipatedDailyProduction == null ? '—' : `${fmtNum(s.anticipatedDailyProduction)} ${s.unit}/day`}
      />
      <StatRow label="Pace" value={aheadBehind} />
    </Card>
  )
}

function ProjectionsCard({ report }) {
  return (
    <Card title="Projected completion">
      <Table fz="sm" withRowBorders={false}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Scenario</Table.Th>
            <Table.Th ta="right">Rate</Table.Th>
            <Table.Th ta="right">Days left</Table.Th>
            <Table.Th ta="right">Est. finish</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {report.projections.map((p) => (
            <Table.Tr key={p.key}>
              <Table.Td>{p.label}</Table.Td>
              <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtRate(p.rateCyPerGoh)}</Table.Td>
              <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {p.complete ? '—' : p.workDaysRemaining != null ? p.workDaysRemaining : '—'}
              </Table.Td>
              <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {p.complete ? 'Complete' : p.estCompletionDate ? prettyDate(p.estCompletionDate) : '—'}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Text size="10px" c="dimmed" mt={8}>
        Rate = {report.summary.unit}/GOH over each window. Days left = production work-days to finish at
        that rate. Finish date uses the project's expected GOH/day &amp; production days/week.
      </Text>
    </Card>
  )
}

function DelaySummaryCard({ report }) {
  const { delaySummary, delayTotalHours } = report
  return (
    <Card title="Delay summary · this week">
      {delaySummary.length === 0 ? (
        <Text size="sm" c="dimmed">No delays logged this week.</Text>
      ) : (
        <Table fz="sm" withRowBorders={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Description</Table.Th>
              <Table.Th ta="right">Hours</Table.Th>
              <Table.Th ta="right">%</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {delaySummary.map((d) => (
              <Table.Tr key={d.description}>
                <Table.Td>{d.description}</Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtHours(d.hours)}</Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{(d.pct * 100).toFixed(0)}%</Table.Td>
              </Table.Tr>
            ))}
            <Table.Tr style={{ borderTop: '1px solid var(--mantine-color-gray-3)', fontWeight: 600 }}>
              <Table.Td>Total</Table.Td>
              <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtHours(delayTotalHours)}</Table.Td>
              <Table.Td />
            </Table.Tr>
          </Table.Tbody>
        </Table>
      )}
    </Card>
  )
}

function WeeklyLog({ report, onExclude, onInclude }) {
  const unit = report.summary.unit
  if (report.weeks.length === 0) {
    return (
      <Box style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }} px={24} py={40} ta="center">
        <Text size="sm" c="dimmed">No released reports with production yet. The log fills in as daily reports are released.</Text>
      </Box>
    )
  }
  return (
    <Card title="Weekly log" noPad>
      <Table fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Date</Table.Th>
            <Table.Th ta="right">{unit}</Table.Th>
            <Table.Th ta="right">GOH</Table.Th>
            <Table.Th ta="right">{unit}/GOH</Table.Th>
            <Table.Th ta="right">Running {unit}</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {report.weeks.map((wk) => (
            <WeekBlock key={wk.projectWeek} wk={wk} onExclude={onExclude} onInclude={onInclude} />
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  )
}

function WeekBlock({ wk, onExclude, onInclude }) {
  return (
    <>
      <Table.Tr style={{ background: 'rgba(15,39,68,0.04)' }}>
        <Table.Td colSpan={6}>
          <Text size="xs" fw={700} tt="uppercase" c="#0F2744">Week {wk.projectWeek}</Text>
        </Table.Td>
      </Table.Tr>
      {wk.rows.map((r) => (
        <Table.Tr key={r.date} style={r.excluded ? { color: 'var(--mantine-color-gray-5)', background: 'var(--mantine-color-gray-0)' } : undefined}>
          <Table.Td>
            {prettyDate(r.date)}
            {r.excluded && r.reason && <Text size="10px" fs="italic">Excluded — {r.reason}</Text>}
          </Table.Td>
          <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(r.cy)}</Table.Td>
          <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtHours(r.goh)}</Table.Td>
          <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtRate(r.cyPerGoh)}</Table.Td>
          <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.excluded ? '—' : fmtNum(r.runningCy)}</Table.Td>
          <Table.Td ta="right">
            {r.excluded ? (
              <UnstyledButton onClick={() => onInclude(r.date)}><Text size="xs" c="#0F2744" style={{ textDecoration: 'underline' }}>Include</Text></UnstyledButton>
            ) : (
              <UnstyledButton onClick={() => onExclude(r.date)}><Text size="xs" c="dimmed" style={{ textDecoration: 'underline' }}>Exclude</Text></UnstyledButton>
            )}
          </Table.Td>
        </Table.Tr>
      ))}
      <Table.Tr style={{ borderTop: '1px solid var(--mantine-color-gray-3)', background: 'var(--mantine-color-gray-0)', fontWeight: 600 }}>
        <Table.Td><Text size="xs" tt="uppercase">Week {wk.projectWeek} subtotal</Text></Table.Td>
        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(wk.subtotalCy)}</Table.Td>
        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtHours(wk.subtotalGoh)}</Table.Td>
        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmtRate(wk.subtotalGoh > 0 ? wk.subtotalCy / wk.subtotalGoh : 0)}
        </Table.Td>
        <Table.Td colSpan={2} />
      </Table.Tr>
    </>
  )
}

function ShutdownManager({ breaks, adding, onAdd, onRemove }) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')

  async function add() {
    if (!start || !end) return
    await onAdd(start, end, reason.trim())
    setStart('')
    setEnd('')
    setReason('')
  }

  return (
    <Box mt="md" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }} p={16}>
      <Text fw={700} size="sm" mb={4}>Shutdown periods</Text>
      <Text size="xs" c="dimmed" mb={12}>
        Mark permit holds / demob periods. The project-week counter pauses during these dates.
      </Text>
      {breaks.length > 0 && (
        <Stack gap={4} mb={12}>
          {breaks.map((b) => (
            <Group key={b.id} justify="space-between">
              <Text size="sm">
                {prettyDate(b.shutdown_start)} → {prettyDate(b.shutdown_end)}
                {b.reason && <Text span c="dimmed"> · {b.reason}</Text>}
              </Text>
              <UnstyledButton onClick={() => onRemove(b.id)}><Text size="xs" c="dimmed" style={{ textDecoration: 'underline' }}>Remove</Text></UnstyledButton>
            </Group>
          ))}
        </Stack>
      )}
      <Group align="flex-end" gap={8}>
        <TextInput size="xs" label="Start" type="date" value={start} onChange={(e) => setStart(e.currentTarget.value)} />
        <TextInput size="xs" label="End" type="date" value={end} onChange={(e) => setEnd(e.currentTarget.value)} />
        <TextInput size="xs" label="Reason (optional)" placeholder="e.g. permit hold" value={reason} onChange={(e) => setReason(e.currentTarget.value)} style={{ flex: 1, minWidth: 140 }} />
        <Button size="xs" loading={adding} disabled={!start || !end} onClick={add} style={{ background: '#0F2744', border: 'none' }}>Add</Button>
      </Group>
    </Box>
  )
}
