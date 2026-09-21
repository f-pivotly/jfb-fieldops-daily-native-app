import { useState } from "react";
import { Box, Text, Group, Button, Table, Modal, TextInput, NumberInput, Checkbox } from "@mantine/core";
import { useDomainData } from "../../../hooks/useDomainData";
import { useConfirmDialog } from "../../../hooks/useConfirmDialog";
import { useAppConfig } from "../../../contexts/appConfigContext";
import { createDomainRecord } from "../../../data";
import LoadingSpinner from "../../../components/LoadingSpinner";
import SafeError from "../../../components/SafeError";
import { uniqueSectionKey, slugifySectionKey } from "../../../lib/narrativeSectionKey";
import TabToolbar from "./TabToolbar";

const EMPTY_FORM = { section_key: "", narrative_label: "", date: "", sort_order: 0, is_active: true };

function sanitizeSectionKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

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

  const addKey = (form.section_key ?? "").replace(/^_+|_+$/g, "");
  const addKeyTaken = !!addKey && rows.some((r) => r.section_key === addKey);

  async function handleSeedDefaults() {
    if (!hasProject) return;
    setSeeding(true);
    try {
      const toSeed = [...defaultSections]
        .filter((d) => d.is_active !== false)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const usedKeys = [];
      for (const d of toSeed) {
        const sectionKey = uniqueSectionKey(d.label, usedKeys);
        usedKeys.push(sectionKey);
        await createDomainRecord({
          domain: "jfb_project_report_narratives",
          system: "core",
          appSlug: config.appSlug,
          recordData: { project_id: project.id, narrative_label: d.label, section_key: sectionKey, sort_order: d.sort_order, is_active: true },
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
      section_key: row.section_key ?? "",
      narrative_label: row.narrative_label ?? "",
      date: toDateInputValue(row.date),
      sort_order: row.sort_order ?? 0,
      is_active: row.is_active ?? true,
    });
  }

  function handleSectionKeyBlur() {
    if (!form.section_key && form.narrative_label.trim()) {
      setField("section_key", uniqueSectionKey(form.narrative_label, rows.map((r) => r.section_key).filter(Boolean)));
    } else if (form.section_key) {
      setField("section_key", slugifySectionKey(form.section_key));
    }
  }

  async function handleAddSave() {
    if (!addKey || addKeyTaken || !form.narrative_label.trim() || !hasProject) return;
    await create({
      project_id: project.id,
      narrative_label: form.narrative_label.trim(),
      section_key: addKey,
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
      <TabToolbar
        title="Narrative Sections"
        addLabel="Add Section"
        onAdd={openAdd}
        onReload={reload}
        disabled={!hasProject}
        disabledHint="Select a project to manage its narrative sections"
      />

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
                <Table.Th>Section Key</Table.Th>
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
                  <Table.Td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.section_key || "—"}</Table.Td>
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
          label="Section Key"
          required
          placeholder="lowercase_with_underscores"
          description="Stable identifier. Cannot change after creation."
          inputWrapperOrder={["label", "input", "description", "error"]}
          value={form.section_key}
          onChange={(e) => setField("section_key", sanitizeSectionKey(e.currentTarget.value))}
          onBlur={handleSectionKeyBlur}
          error={addKeyTaken ? `A section with key "${addKey}" already exists.` : undefined}
          styles={{ input: { fontFamily: "monospace" } }}
          mb={10}
          autoFocus
        />
        <TextInput
          label="Label"
          required
          placeholder="Display name shown to PE"
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
        <Group justify="flex-end" mt={10}>
          <Button variant="default" size="xs" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            size="xs"
            loading={creating}
            onClick={handleAddSave}
            disabled={!addKey || addKeyTaken || !form.narrative_label.trim()}
            style={{ background: "#0F2744", border: "none" }}
          >
            Add Section
          </Button>
        </Group>
      </Modal>

      <Modal opened={!!editRow} onClose={() => setEditRow(null)} title={<Text fw={700} size="sm">Edit Narrative Section</Text>} size="sm">
        <TextInput
          label="Section Key"
          description="Immutable after creation."
          inputWrapperOrder={["label", "input", "description"]}
          value={form.section_key ?? ""}
          readOnly
          disabled
          styles={{ input: { fontFamily: "monospace" } }}
          mb={10}
        />
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
