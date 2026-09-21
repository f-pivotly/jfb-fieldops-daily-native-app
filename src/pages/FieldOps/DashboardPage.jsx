import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, SimpleGrid, Text, Group, ScrollArea } from '@mantine/core'
import { useHover } from '@mantine/hooks'
import { useVisibleProjects } from '../../hooks/useVisibleProjects'
import { useAppConfig } from '../../contexts/appConfigContext'
import { fetchDomainRecords } from '../../data'
import { REPORT_STATUS_LABEL } from '../../config/reportStatus'
import { todayISO, prettyDate } from './lib/realizedToDate'
import LoadingSpinner from '../../components/LoadingSpinner'
import SafeError from '../../components/SafeError'

const STATUS_STYLE = {
  no_report: { background: '#F3F4F6', color: '#4B5563', ring: '#E5E7EB' },
  draft: { background: '#F1F5F9', color: '#334155', ring: '#E2E8F0' },
  cqc_review: { background: '#FFFBEB', color: '#92400E', ring: '#FCD34D' },
  approved: { background: '#ECFDF5', color: '#047857', ring: '#A7F3D0' },
  released: { background: '#047857', color: '#FFFFFF', ring: '#047857' },
}

async function loadDashboardDetails(appSlug, projectIds, today) {
  const [equipmentRes, todayRes, lastReportRows] = await Promise.all([
    fetchDomainRecords({ domain: 'jfb_equipments', system: 'core', appSlug, filters: { is_active: true }, limit: 1000 }),
    fetchDomainRecords({ domain: 'jfb_reports', system: 'core', appSlug, filters: { report_date: today }, limit: 500 }),
    Promise.all(
      projectIds.map((projectId) =>
        fetchDomainRecords({
          domain: 'jfb_reports', system: 'core', appSlug,
          filters: { project_id: projectId },
          sortCol: 'report_date', sortDir: 'desc', limit: 1,
        }).then((res) => [projectId, res?.data?.[0]?.report_date ?? null]),
      ),
    ),
  ])

  const equipmentCounts = {}
  for (const row of equipmentRes?.data ?? []) {
    equipmentCounts[row.project_id] = (equipmentCounts[row.project_id] ?? 0) + 1
  }
  const todayStatus = {}
  for (const row of todayRes?.data ?? []) {
    todayStatus[row.project_id] = row.status
  }
  const lastReportDates = Object.fromEntries(
    lastReportRows.map(([id, date]) => [id, date ? String(date).slice(0, 10) : null]),
  )
  return { equipmentCounts, todayStatus, lastReportDates }
}

export default function DashboardPage() {
  const { config } = useAppConfig()
  const { projects, loading, error } = useVisibleProjects()
  const [details, setDetails] = useState(null)
  const today = todayISO()

  const activeProjects = projects
    .filter((p) => p.is_active)
    .slice()
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  const projectIdsKey = activeProjects.map((p) => p.id).join(',')

  const detailsKey = `${config.appSlug}|${today}|${projectIdsKey}`

  useEffect(() => {
    if (loading || !config.appSlug) return
    let cancelled = false
    const ids = projectIdsKey ? projectIdsKey.split(',') : []
    loadDashboardDetails(config.appSlug, ids, today)
      .then((data) => { if (!cancelled) setDetails({ key: detailsKey, data, error: null }) })
      .catch((err) => { if (!cancelled) setDetails({ key: detailsKey, data: null, error: err.message }) })
    return () => { cancelled = true }
  }, [loading, config.appSlug, projectIdsKey, today, detailsKey])

  const current = details?.key === detailsKey ? details : null
  const pageError = error || current?.error || null
  const data = current?.data ?? null
  const ready = !loading && !pageError && data !== null

  return (
    <ScrollArea flex={1} style={{ minHeight: 0 }}>
      <Box maw={1280} mx="auto" px={16} py={32}>
        <Group justify="space-between" align="baseline" mb={24}>
          <Text size="24px" fw={600} c="#111827">Project Dashboard</Text>
          <Text size="sm" c="#6B7280">Today is {prettyDate(today)}</Text>
        </Group>

        <SafeError message={pageError} />

        {!pageError && (loading || data === null) && <LoadingSpinner py={24} />}

        {ready && activeProjects.length === 0 && (
          <Box ta="center" px={24} py={40} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 6 }}>
            <Text fw={500} c="#374151">No projects assigned.</Text>
            <Text size="sm" c="#6B7280" mt={4}>Contact your administrator to be assigned to a project.</Text>
          </Box>
        )}

        {ready && activeProjects.length > 0 && (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing={16}>
            {activeProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                status={data.todayStatus[project.id] ?? 'no_report'}
                equipmentCount={data.equipmentCounts[project.id] ?? 0}
                lastReportDate={data.lastReportDates[project.id] ?? null}
              />
            ))}
          </SimpleGrid>
        )}
      </Box>
    </ScrollArea>
  )
}

function ProjectCard({ project, status, equipmentCount, lastReportDate }) {
  const navigate = useNavigate()
  const { hovered, ref } = useHover()

  return (
    <Box
      ref={ref}
      p={20}
      onClick={() => navigate(`/projects/${project.id}/reports`)}
      style={{
        cursor: 'pointer',
        background: '#fff',
        borderRadius: 8,
        border: `1px solid ${hovered ? '#0F2744' : '#E5E7EB'}`,
        boxShadow: hovered ? '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)' : 'none',
        transition: 'border-color 150ms, box-shadow 150ms',
      }}
    >
      <Group justify="space-between" align="flex-start" gap={8} wrap="nowrap" mb={12}>
        <Box style={{ minWidth: 0 }}>
          <Text fw={600} c="#111827" lh={1.25} truncate="end" title={project.name}>{project.name}</Text>
          <Text size="xs" c="#6B7280" mt={2}>#{project.project_code} · {project.client_name}</Text>
        </Box>
        <StatusBadge status={status} />
      </Group>

      <SimpleGrid cols={2} spacing={12} verticalSpacing={8} mt={16}>
        <Detail label="Equipment" value={`${equipmentCount} ${equipmentCount === 1 ? 'unit' : 'units'}`} />
        <Detail label="Work type" value={project.work_type} truncate />
        <Box style={{ gridColumn: 'span 2' }}>
          <Detail label="Last report" value={lastReportDate ? prettyDate(lastReportDate) : 'None yet'} />
        </Box>
      </SimpleGrid>
    </Box>
  )
}

function StatusBadge({ status }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.no_report
  return (
    <Text
      span
      fw={500}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 9999,
        background: style.background,
        color: style.color,
        boxShadow: `inset 0 0 0 1px ${style.ring}`,
        whiteSpace: 'nowrap',
      }}
    >
      {REPORT_STATUS_LABEL[status] ?? REPORT_STATUS_LABEL.no_report}
    </Text>
  )
}

function Detail({ label, value, truncate = false }) {
  return (
    <Box style={{ minWidth: 0 }}>
      <Text size="10px" c="#9CA3AF" style={{ textTransform: 'uppercase', letterSpacing: '0.025em' }}>{label}</Text>
      <Text size="xs" fw={500} c="#111827" truncate={truncate ? 'end' : undefined} title={truncate ? value : undefined}>{value}</Text>
    </Box>
  )
}
