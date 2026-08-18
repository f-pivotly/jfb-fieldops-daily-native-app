import { useState } from "react";
import {
  Box,
  Text,
  Group,
  Button,
  Table,
  Modal,
  TextInput,
  NumberInput,
  Select,
  Checkbox,
  SimpleGrid,
} from "@mantine/core";
import { IconPlus, IconRefresh } from "@tabler/icons-react";
import { useDomainData } from "../../hooks/useDomainData";
import { usePicklist } from "../../hooks/usePicklist";
import LoadingSpinner from "../../components/LoadingSpinner";
import SafeError from "../../components/SafeError";

const FALLBACK_WORK_TYPE = "Hydraulic Dredging";
const FALLBACK_PRIMARY_MEASURE = "CY";

const EMPTY_FORM = {
  name: "",
  project_code: "",
  client_name: "",
  work_type: FALLBACK_WORK_TYPE,
  start_date: "",
  end_date: "",
  volume_goal: "",
  primary_measure: FALLBACK_PRIMARY_MEASURE,
  site_city: "",
  site_state: "",
  area_lvl1_label: "Area",
  area_lvl2_label: "",
  area_lvl3_label: "",
  is_tsca_zone_tracking: false,
  is_soil_type: true,
  is_pipe_tracking: true,
};


function toFormValues(row, areaLevels = []) {
  const labelAt = (depth) => areaLevels.find((l) => l.depth === depth)?.label ?? "";
  return {
    name: row.name ?? "",
    project_code: row.project_code ?? "",
    client_name: row.client_name ?? "",
    work_type: row.work_type ?? FALLBACK_WORK_TYPE,
    start_date: row.start_date ? String(row.start_date).slice(0, 10) : "",
    end_date: row.end_date ? String(row.end_date).slice(0, 10) : "",
    volume_goal: row.volume_goal ?? "",
    primary_measure: row.primary_measure ?? FALLBACK_PRIMARY_MEASURE,
    site_city: row.site_city ?? "",
    site_state: row.site_state ?? "",
    area_lvl1_label: labelAt(1) || "Area",
    area_lvl2_label: labelAt(2),
    area_lvl3_label: labelAt(3),
    is_tsca_zone_tracking: row.is_tsca_zone_tracking ?? false,
    is_soil_type: row.is_soil_type ?? true,
    is_pipe_tracking: row.is_pipe_tracking ?? true,
  };
}

function toPayload(form) {
  return {
    name: form.name.trim(),
    project_code: form.project_code === "" ? null : Number(form.project_code),
    client_name: form.client_name.trim() || null,
    work_type: form.work_type,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    volume_goal: form.volume_goal === "" ? null : Number(form.volume_goal),
    primary_measure: form.primary_measure,
    site_city: form.site_city.trim() || null,
    site_state: form.site_state.trim().toUpperCase() || null,
    is_tsca_zone_tracking: form.is_tsca_zone_tracking,
    is_soil_type: form.is_soil_type,
    is_pipe_tracking: form.is_pipe_tracking,
  };
}

export default function AdminProjectsSection({ onConfigure }) {
  const { records, loading, error, creating, updating, reload, create, update } = useDomainData({
    domain: "jfb_projects",
    system: "core",
  });
  const {
    records: areaLevelRecords,
    create: createAreaLevel,
    update: updateAreaLevel,
  } = useDomainData({ domain: "jfb_project_area_levels", system: "core" });
  const { values: workTypeOptions, labels: workTypeLabels } = usePicklist("pkl-jfb-work-type");
  const { values: primaryMeasureOptions, labels: primaryMeasureLabels } = usePicklist("pkl-jfb-primary-measure");
  const workTypeData = workTypeOptions.map((v) => ({ value: v, label: workTypeLabels[v] ?? v }));
  const primaryMeasureData = primaryMeasureOptions.map((v) => ({ value: v, label: primaryMeasureLabels[v] ?? v }));

  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  function openCreate() {
    setEditRow(null);
    setForm({
      ...EMPTY_FORM,
      work_type: workTypeOptions[0] ?? FALLBACK_WORK_TYPE,
      primary_measure: primaryMeasureOptions[0] ?? FALLBACK_PRIMARY_MEASURE,
    });
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditRow(row);
    const levels = areaLevelRecords.filter((l) => l.project_id === row.id);
    setForm(toFormValues(row, levels));
    setModalOpen(true);
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Create/update the depth-1/2/3 jfb_project_area_levels rows for a project
  // from the form's 3 label inputs. Never deletes a level if its label is
  // cleared -- clearing a label in this form just leaves the existing level
  // (and anything nested under it) untouched rather than risking orphaning
  // jfb_project_areas rows that reference it.
  async function syncAreaLevels(projectId) {
    const existing = areaLevelRecords.filter((l) => l.project_id === projectId);
    const desired = [
      { depth: 1, label: form.area_lvl1_label.trim() || "Area" },
      { depth: 2, label: form.area_lvl2_label.trim() },
      { depth: 3, label: form.area_lvl3_label.trim() },
    ];
    for (const d of desired) {
      if (!d.label) continue;
      const match = existing.find((l) => l.depth === d.depth);
      if (!match) {
        await createAreaLevel({ project_id: projectId, depth: d.depth, label: d.label, sort_order: d.depth });
      } else if (match.label !== d.label) {
        await updateAreaLevel(match.id, { label: d.label });
      }
    }
  }

  async function handleSave() {
    if (!form.name.trim() || !form.project_code) return;
    const payload = toPayload(form);
    let projectId = editRow?.id;
    if (editRow) {
      await update(editRow.id, payload);
    } else {
      const res = await create({ ...payload, is_active: true });
      projectId = res?.data?.id;
    }
    if (projectId) await syncAreaLevels(projectId);
    setModalOpen(false);
  }

  async function toggleActive(row, checked) {
    await update(row.id, { is_active: checked });
  }

  return (
    <Box>
      <Group justify="space-between" mb={12} align="flex-start">
        <Box>
          <Text fw={700} size="lg">
            Projects
          </Text>
          <Text size="xs" c="dimmed">
            Manage all projects and their configurations
          </Text>
        </Box>
        <Group gap={8}>
          <Box onClick={reload} style={{ cursor: "pointer", color: "#aaa", display: "flex", alignItems: "center" }} title="Refresh">
            <IconRefresh size={14} />
          </Box>
          <Button
            size="xs"
            leftSection={<IconPlus size={13} />}
            onClick={openCreate}
            style={{ background: "#0F2744", border: "none" }}
          >
            New Project
          </Button>
        </Group>
      </Group>

      <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, overflow: "hidden" }}>
        <Box p={16}>
          {loading && <LoadingSpinner py={24} />}
          {!loading && <SafeError message={error} />}
          {!loading && !error && records.length === 0 && (
            <Text size="xs" c="#aaa" ta="center" py={24}>
              No projects yet
            </Text>
          )}
          {!loading && !error && records.length > 0 && (
            <Box style={{ overflowX: "auto" }}>
              <Table striped highlightOnHover withTableBorder withColumnBorders style={{ fontSize: 12, minWidth: 760 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Project</Table.Th>
                    <Table.Th>Code</Table.Th>
                    <Table.Th>Client</Table.Th>
                    <Table.Th>Work Type</Table.Th>
                    <Table.Th>Goal</Table.Th>
                    <Table.Th>End Date</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th style={{ width: 190 }} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {records.map((row) => (
                    <Table.Tr key={row.id}>
                      <Table.Td style={{ fontWeight: 600, color: "#333" }}>{row.name}</Table.Td>
                      <Table.Td>{row.project_code ?? "—"}</Table.Td>
                      <Table.Td>{row.client_name ?? "—"}</Table.Td>
                      <Table.Td>{row.work_type ?? "—"}</Table.Td>
                      <Table.Td>
                        {row.volume_goal ? `${Number(row.volume_goal).toLocaleString()} ${row.primary_measure ?? "CY"}` : "—"}
                      </Table.Td>
                      <Table.Td>{row.end_date ?? "—"}</Table.Td>
                      <Table.Td>
                        <Checkbox
                          size="xs"
                          checked={!!row.is_active}
                          label={row.is_active ? "Active" : "Inactive"}
                          onChange={(e) => toggleActive(row, e.currentTarget.checked)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Group gap={10} wrap="nowrap">
                          <Button size="xs" variant="subtle" onClick={() => onConfigure?.(row)}>Configure</Button>
                          <Button size="xs" variant="subtle" onClick={() => openEdit(row)}>Edit</Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>
          )}
        </Box>
      </Box>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={<Text fw={700} size="sm">{editRow ? "Edit Project" : "New Project"}</Text>}
        size="lg"
      >
        <SimpleGrid cols={2} spacing="sm" mb={16}>
          <TextInput label="Project Name" required placeholder="e.g. Fountain Lake Phase 3" value={form.name} onChange={(e) => setField("name", e.currentTarget.value)} />
          <NumberInput label="Project Code" required placeholder="e.g. 182601" hideControls value={form.project_code} onChange={(v) => setField("project_code", v)} />
          <TextInput label="Client" placeholder="Client name" value={form.client_name} onChange={(e) => setField("client_name", e.currentTarget.value)} />
          <Select label="Work Type" data={workTypeData} value={form.work_type} onChange={(v) => setField("work_type", v ?? FALLBACK_WORK_TYPE)} />
          <TextInput label="Start Date" type="date" value={form.start_date} onChange={(e) => setField("start_date", e.currentTarget.value)} />
          <TextInput label="Target End Date" type="date" value={form.end_date} onChange={(e) => setField("end_date", e.currentTarget.value)} />
          <NumberInput label="Volume Goal (CY)" placeholder="e.g. 85000" hideControls value={form.volume_goal} onChange={(v) => setField("volume_goal", v)} />
          <Select label="Primary Measure" data={primaryMeasureData} value={form.primary_measure} onChange={(v) => setField("primary_measure", v ?? FALLBACK_PRIMARY_MEASURE)} />
          <TextInput label="Site City" placeholder="e.g. Crofton" value={form.site_city} onChange={(e) => setField("site_city", e.currentTarget.value)} />
          <TextInput label="Site State" placeholder="e.g. NE" maxLength={2} value={form.site_state} onChange={(e) => setField("site_state", e.currentTarget.value.toUpperCase())} />
        </SimpleGrid>

        <Text size="10px" fw={700} c="dimmed" mb={8} style={{ textTransform: "uppercase", letterSpacing: ".5px" }}>
          Area Level Labels
        </Text>
        <SimpleGrid cols={3} spacing="sm" mb={16}>
          <TextInput label="Level 1 Label" placeholder="e.g. Basin, Area, Cell" value={form.area_lvl1_label} onChange={(e) => setField("area_lvl1_label", e.currentTarget.value)} />
          <TextInput label="Level 2 Label" placeholder="Optional" value={form.area_lvl2_label} onChange={(e) => setField("area_lvl2_label", e.currentTarget.value)} />
          <TextInput label="Level 3 Label" placeholder="Optional" value={form.area_lvl3_label} onChange={(e) => setField("area_lvl3_label", e.currentTarget.value)} />
        </SimpleGrid>

        <Text size="10px" fw={700} c="dimmed" mb={8} style={{ textTransform: "uppercase", letterSpacing: ".5px" }}>
          Feature Flags
        </Text>
        <Group gap={20} mb={20}>
          <Checkbox label="TSCA Zone Tracking" checked={form.is_tsca_zone_tracking} onChange={(e) => setField("is_tsca_zone_tracking", e.currentTarget.checked)} />
          <Checkbox label="Soil Type" checked={form.is_soil_type} onChange={(e) => setField("is_soil_type", e.currentTarget.checked)} />
          <Checkbox label="Pipe Tracking" checked={form.is_pipe_tracking} onChange={(e) => setField("is_pipe_tracking", e.currentTarget.checked)} />
        </Group>

        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button
            size="xs"
            loading={editRow ? updating : creating}
            onClick={handleSave}
            disabled={!form.name.trim() || !form.project_code}
            style={{ background: "#0F2744", border: "none" }}
          >
            Save Project
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}
