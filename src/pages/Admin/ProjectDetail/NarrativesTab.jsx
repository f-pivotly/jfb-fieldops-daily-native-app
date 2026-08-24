import { useState } from "react";
import { Box, Text, Group, Button, Table, Modal, TextInput, NumberInput, Checkbox } from "@mantine/core";
import { IconPlus, IconRefresh } from "@tabler/icons-react";
import { useDomainData } from "../../../hooks/useDomainData";
import { useConfirmDialog } from "../../../hooks/useConfirmDialog";
import { useAppConfig } from "../../../contexts/appConfigContext";
import { createDomainRecord } from "../../../data";
import LoadingSpinner from "../../../components/LoadingSpinner";
import SafeError from "../../../components/SafeError";

const EMPTY_FORM = { narrative_label: "", date: "", sort_order: 0, is_active: true };

function toDateInputValue(iso) {
  return iso ? String(iso).slice(0, 10) : "";
}

export default function NarrativesTab({ project }) {
  const hasProject = !!project?.id;
  const { config } = useAppConfig();
  const { confirm, modal: confirmModal } = useConfirmDialog();
  const { records, loading, error, creating, updating, reload, create, update, remove } = useDomainData({
    domain: "jfb_project_report_narratives",
    system: "core",
    projectId: project?.id,
  });
  const { records: defaultSections } = useDomainData({ domain: "jfb_narrative_section_defaults", system: "core" });

  const rows = hasProject ? [...records].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) : [];

  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [seeding, setSeeding] = useState(false);

  // Bypasses the useDomainData hook's create() (which reloads the whole list
  // after every single call) and calls createDomainRecord directly, reloading
  // once at the end -- same pattern as DelayCodesTab's "Load from Master List".
  async function handleSeedDefaults() {
    if (!hasProject) return;
    setSeeding(true);
    try {
      const toSeed = [...defaultSections]
        .filter((d) => d.is_active !== false)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      for (const d of toSeed) {
        await createDomainRecord({
          domain: "jfb_project_report_narratives",
          system: "core",
          appSlug: config.appSlug,
          recordData: { project_id: project.id, narrative_label: d.label, sort_order: d.sort_order, is_active: true },
        });
      }
      await reload();
    } finally {
      setSeeding(false);
    }
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openAdd() {
    const nextSort = rows.length === 0 ? 10 : Math.max(...rows.map((r) => r.sort_order ?? 0)) + 10;
    setForm({ ...EMPTY_FORM, sort_order: nextSort });
    setAddOpen(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setForm({
      narrative_label: row.narrative_label ?? "",
      date: toDateInputValue(row.date),
      sort_order: row.sort_order ?? 0,
      is_active: row.is_active ?? true,
    });
  }

  async function handleAddSave() {
    if (!form.narrative_label.trim() || !hasProject) return;
    await create({
      project_id: project.id,
      narrative_label: form.narrative_label.trim(),
      date: form.date || null,
      sort_order: form.sort_order,
      is_active: true,
    });
    setAddOpen(false);
  }

  async function handleEditSave() {
    if (!editRow || !form.narrative_label.trim()) return;
    await update(editRow.id, {
      narrative_label: form.narrative_label.trim(),
      date: form.date || null,
      sort_order: form.sort_order,
      is_active: form.is_active,
    });
    setEditRow(null);
  }

  async function toggleActive(row) {
    await update(row.id, { is_active: !row.is_active });
  }

  async function handleDelete(row) {
    if (!(await confirm(`Permanently delete the "${row.narrative_label}" narrative section?`))) return;
    await remove(row.id);
  }

  return (
    <Box>
      <Group justify="space-between" mb={12}>
        <Text fw={700} size="sm">Narrative Sections</Text>
        <Group gap={8}>
          <Box onClick={reload} style={{ cursor: "pointer", color: "#aaa", display: "flex", alignItems: "center" }} title="Refresh">
            <IconRefresh size={14} />
          </Box>
          <Button
            size="xs"
            leftSection={<IconPlus size={12} />}
            onClick={openAdd}
            disabled={!hasProject}
            title={hasProject ? undefined : "Select a project to manage its narrative sections"}
            style={{ background: "#0F2744", border: "none" }}
          >
            Add Section
          </Button>
        </Group>
      </Group>

      <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, padding: 12 }}>
        {loading && <LoadingSpinner py={16} />}
        {!loading && <SafeError message={error} />}
        {!loading && !error && !hasProject && (
          <Text size="xs" c="dimmed" ta="center" py={16}>
            Select a project to manage its narrative sections.
          </Text>
        )}
        {!loading && !error && hasProject && rows.length === 0 && (
          <Box ta="center" py={16}>
            <Text size="xs" c="dimmed" mb={10}>No narrative sections configured yet. Click + Add Section to start.</Text>
            <Button size="xs" variant="default" loading={seeding} onClick={handleSeedDefaults}>
              Seed from defaults
            </Button>
          </Box>
        )}
        {!loading && !error && hasProject && rows.length > 0 && (
          <Table withTableBorder verticalSpacing="xs" fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Label</Table.Th>
                <Table.Th>Date</Table.Th>
                <Table.Th>Sort Order</Table.Th>
                <Table.Th>Active</Table.Th>
                <Table.Th style={{ width: 140 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>{r.narrative_label}</Table.Td>
                  <Table.Td>{toDateInputValue(r.date) || "—"}</Table.Td>
                  <Table.Td>{r.sort_order ?? "—"}</Table.Td>
                  <Table.Td>
                    <Checkbox
                      size="xs"
                      checked={!!r.is_active}
                      label={r.is_active ? "Active" : "Hidden"}
                      onChange={() => toggleActive(r)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={10} wrap="nowrap">
                      <Button size="xs" variant="subtle" onClick={() => openEdit(r)}>Edit</Button>
                      <Button size="xs" variant="subtle" color="red" onClick={() => handleDelete(r)}>Delete</Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Box>

      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title={<Text fw={700} size="sm">Add Narrative Section</Text>} size="sm">
        <TextInput
          label="Label"
          required
          placeholder="Display name shown to PE"
          value={form.narrative_label}
          onChange={(e) => setField("narrative_label", e.currentTarget.value)}
          mb={10}
          autoFocus
        />
        <TextInput
          label="Date"
          type="date"
          value={form.date}
          onChange={(e) => setField("date", e.currentTarget.value)}
          mb={10}
        />
        <NumberInput
          label="Sort Order"
          hideControls
          value={form.sort_order}
          onChange={(v) => setField("sort_order", Number(v) || 0)}
          mb={10}
        />
        <Group justify="flex-end" mt={10}>
          <Button variant="default" size="xs" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            size="xs"
            loading={creating}
            onClick={handleAddSave}
            disabled={!form.narrative_label.trim()}
            style={{ background: "#0F2744", border: "none" }}
          >
            Add Section
          </Button>
        </Group>
      </Modal>

      <Modal opened={!!editRow} onClose={() => setEditRow(null)} title={<Text fw={700} size="sm">Edit Narrative Section</Text>} size="sm">
        <TextInput
          label="Label"
          required
          value={form.narrative_label}
          onChange={(e) => setField("narrative_label", e.currentTarget.value)}
          mb={10}
        />
        <TextInput
          label="Date"
          type="date"
          value={form.date}
          onChange={(e) => setField("date", e.currentTarget.value)}
          mb={10}
        />
        <NumberInput
          label="Sort Order"
          hideControls
          value={form.sort_order}
          onChange={(v) => setField("sort_order", Number(v) || 0)}
          mb={10}
        />
        <Checkbox
          label="Active"
          checked={form.is_active}
          onChange={(e) => setField("is_active", e.currentTarget.checked)}
          mb={16}
        />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setEditRow(null)}>Cancel</Button>
          <Button size="xs" loading={updating} onClick={handleEditSave} disabled={!form.narrative_label.trim()} style={{ background: "#0F2744", border: "none" }}>
            Save Changes
          </Button>
        </Group>
      </Modal>

      {confirmModal}
    </Box>
  );
}
