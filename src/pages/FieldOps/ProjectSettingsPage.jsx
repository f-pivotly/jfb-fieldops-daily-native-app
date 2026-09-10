import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Box, ScrollArea, Text, Group, Tabs, TextInput, Button } from '@mantine/core'
import { useProject } from '../../hooks/useProject'
import { useRealizedExcludedDays } from '../../hooks/useRealizedExcludedDays'
import { shouldShowDredgeProgress } from '../../config/dredgeProgress'
import { isPlacementEquipment } from '../../config/placementProgress'
import ScheduledOffDaysCard from '../../components/ScheduledOffDaysCard'
import { todayISO } from './lib/realizedToDate'
import NarrativesTab from '../Admin/ProjectDetail/NarrativesTab'
import DredgeChartTab from './projectSettingsTabs/DredgeChartTab'
import PlacementChartTab from './projectSettingsTabs/PlacementChartTab'
import SpreaderChartTab from './projectSettingsTabs/SpreaderChartTab'
import AttachmentsTab from './projectSettingsTabs/AttachmentsTab'
import SiteEquipmentTab from './projectSettingsTabs/SiteEquipmentTab'
import CoverMetricsTab from './projectSettingsTabs/CoverMetricsTab'

export default function ProjectSettingsPage() {
  const { projectId } = useParams()
  const { project, update: updateProject } = useProject(projectId)
  const { excludedDays, create: createExcluded, remove: removeExcluded } = useRealizedExcludedDays(projectId)
  const isDredging = shouldShowDredgeProgress(project)
  const isPlacement = isPlacementEquipment(project, null, null)
  const isSpreader = project?.is_spreader_active === true

  return (
    <ScrollArea flex={1} style={{ minHeight: 0 }}>
      <Box p={24} maw={1000} mx="auto">
        <Link to={`/projects/${projectId}/reports`} style={{ fontSize: 12 }}>← Project Dashboard</Link>

        <Text fw={700} size="lg" mt={10}>Project Settings · {project?.name ?? ''}</Text>
        <Text size="xs" c="dimmed" mb={16}>Project #{project?.project_code}</Text>

        <Box mb={16}>
          <ProductionPlanCard project={project} onSave={updateProject} />
        </Box>

        <Box mb={16}>
          <CappingSettingsCard project={project} onSave={updateProject} />
        </Box>

        <Box mb={16}>
          <ScheduledOffDaysCard
            projectId={projectId}
            excludedDays={excludedDays}
            today={todayISO()}
            onCreate={createExcluded}
            onRemove={removeExcluded}
          />
        </Box>

        <Tabs defaultValue="narratives">
          <Tabs.List mb={12}>
            <Tabs.Tab value="narratives">Narratives</Tabs.Tab>
            <Tabs.Tab value="metrics">Cover Metrics</Tabs.Tab>
            <Tabs.Tab value="siteEquipment">Site Equipment</Tabs.Tab>
            <Tabs.Tab value="attachments">Attachments</Tabs.Tab>
            {isDredging && <Tabs.Tab value="dredgeChart">Dredge Chart</Tabs.Tab>}
            {isPlacement && <Tabs.Tab value="placementChart">Placement Chart</Tabs.Tab>}
            {isSpreader && <Tabs.Tab value="spreaderChart">Spreader Chart</Tabs.Tab>}
          </Tabs.List>

          <Tabs.Panel value="narratives">
            <NarrativesTab project={project} />
          </Tabs.Panel>
          <Tabs.Panel value="metrics">
            <CoverMetricsTab project={project} />
          </Tabs.Panel>
          <Tabs.Panel value="siteEquipment">
            <SiteEquipmentTab project={project} />
          </Tabs.Panel>
          <Tabs.Panel value="attachments">
            <AttachmentsTab project={project} />
          </Tabs.Panel>
          {isDredging && (
            <Tabs.Panel value="dredgeChart">
              <DredgeChartTab project={project} />
            </Tabs.Panel>
          )}
          {isPlacement && (
            <Tabs.Panel value="placementChart">
              <PlacementChartTab project={project} />
            </Tabs.Panel>
          )}
          {isSpreader && (
            <Tabs.Panel value="spreaderChart">
              <SpreaderChartTab project={project} />
            </Tabs.Panel>
          )}
        </Tabs>
      </Box>
    </ScrollArea>
  )
}

function ProductionPlanCard({ project, onSave }) {
  const [form, setForm] = useState({ expectedGohPerDay: '', productionDaysPerWeek: '', productionStartDate: '' })
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [error, setError] = useState(null)
  const [syncedFor, setSyncedFor] = useState(null)

  if (project?.id && syncedFor !== project.id) {
    setSyncedFor(project.id)
    setForm({
      expectedGohPerDay: project.expected_goh_per_day != null ? String(project.expected_goh_per_day) : '',
      productionDaysPerWeek: project.production_days_per_week != null ? String(project.production_days_per_week) : '',
      productionStartDate: project.production_start_date ?? '',
    })
  }

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(t)
  }, [error])

  async function save() {
    if (!project?.id) return
    setSaving(true)
    setError(null)
    try {
      await onSave(project.id, {
        expected_goh_per_day: form.expectedGohPerDay.trim() === '' ? null : Number(form.expectedGohPerDay),
        production_days_per_week: form.productionDaysPerWeek.trim() === '' ? null : Number(form.productionDaysPerWeek),
        production_start_date: form.productionStartDate || null,
      })
      setSavedAt(Date.now())
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const bidGoalRate = project?.cy_goh_goal ?? null
  const unit = project?.primary_measure || 'CY'

  return (
    <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
      <Group justify="space-between" mb={2}>
        <Text fw={700} size="sm">Production plan (Realized To-Date forecast)</Text>
        {savedAt && <Text size="10px" tt="uppercase" c="green" fw={600}>Saved ✓</Text>}
      </Group>
      <Text size="xs" c="dimmed" mb={10}>
        Bid goal rate ({bidGoalRate != null ? bidGoalRate : '—'} {unit}/GOH) × expected GOH/day = anticipated
        daily production. Bid goal rate is set once during project setup, not editable here.
      </Text>
      <Group align="flex-end" gap="md">
        <TextInput
          label="Expected GOH/day" size="xs" type="number" w={140}
          value={form.expectedGohPerDay}
          onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, expectedGohPerDay: v })) }}
        />
        <TextInput
          label="Production days/week" size="xs" type="number" w={160}
          value={form.productionDaysPerWeek}
          onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, productionDaysPerWeek: v })) }}
        />
        <TextInput
          label="Production start date" size="xs" type="date" w={160}
          value={form.productionStartDate}
          onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, productionStartDate: v })) }}
        />
        <Button size="xs" loading={saving} onClick={save} style={{ background: '#0F2744', border: 'none' }}>Save plan</Button>
      </Group>
      {error && <Text size="10px" c="red" mt={6}>{error}</Text>}
    </Box>
  )
}

function CappingSettingsCard({ project, onSave }) {
  const [factor, setFactor] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [error, setError] = useState(null)
  const [syncedFor, setSyncedFor] = useState(null)

  if (project?.id && syncedFor !== project.id) {
    setSyncedFor(project.id)
    setFactor(project.cap_conversion_factor != null ? String(project.cap_conversion_factor) : '')
  }

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(t)
  }, [error])

  async function save() {
    if (!project?.id) return
    const trimmed = factor.trim()
    const factorN = trimmed === '' ? null : Number(trimmed)
    if (factorN != null && !Number.isFinite(factorN)) {
      setError('Enter a valid number.')
      return
    }
    if (factorN != null && factorN <= 0) {
      setError('Conversion factor must be greater than 0.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(project.id, { cap_conversion_factor: factorN })
      setSavedAt(Date.now())
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
      <Group justify="space-between" mb={2}>
        <Text fw={700} size="sm">Capping settings</Text>
        {savedAt && <Text size="10px" tt="uppercase" c="green" fw={600}>Saved ✓</Text>}
      </Group>
      <Text size="xs" c="dimmed" mb={10}>
        Tons → CY conversion factor (CY = tons ÷ factor). Pre-fills the capping daily entry; the
        value used is snapshotted onto each production row, so updating it here only affects
        future rows.
      </Text>
      <Group align="flex-end" gap="md">
        <TextInput
          label="Conversion factor (tons/CY)" size="xs" type="number" w={180}
          placeholder="e.g. 1.35"
          value={factor}
          onChange={(e) => { const v = e.currentTarget.value; setFactor(v) }}
        />
        <Button size="xs" loading={saving} onClick={save} style={{ background: '#0F2744', border: 'none' }}>Save</Button>
      </Group>
      {error && <Text size="10px" c="red" mt={6}>{error}</Text>}
    </Box>
  )
}
