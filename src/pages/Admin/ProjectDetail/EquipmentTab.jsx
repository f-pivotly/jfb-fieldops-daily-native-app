import { useState } from "react";
import { Box, Text, Group, Button, Modal, TextInput, Select } from "@mantine/core";
import { IconAnchor } from "@tabler/icons-react";
import { useEquipment } from "../../../hooks/useEquipment";
import { useConfirmDialog } from "../../../hooks/useConfirmDialog";
import { useDomainData } from "../../../hooks/useDomainData";
import LoadingSpinner from "../../../components/LoadingSpinner";
import SafeError from "../../../components/SafeError";
import TabToolbar from "./TabToolbar";

function toDateInputValue(iso) {
  return iso ? String(iso).slice(0, 10) : "";
}

export default function EquipmentTab({ project }) {
  const hasProject = !!project?.id;
  const { confirm, modal: confirmModal } = useConfirmDialog();
  const { equipment: equipmentRecords, loading, error, creating, updating, reload, create, update, remove } = useEquipment(project?.id);
  const { records: workTypeRecords } = useDomainData({ domain: "jfb_work_types", system: "core" });
  const workTypeData = workTypeRecords.map((r) => ({ value: r.name, label: r.name }));

  const equipment = hasProject ? equipmentRecords : [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [name, setName] = useState("");
  const [workType, setWorkType] = useState("");
  const [workTypeFrom, setWorkTypeFrom] = useState("");

  function openAdd() {
    setEditRow(null);
    setName("");
    setWorkType("");
    setWorkTypeFrom("");
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setName(row.name ?? "");
    setWorkType(row.work_type ?? "");
    setWorkTypeFrom(toDateInputValue(row.work_type_from));
    setModalOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      work_type: workType || null,
      work_type_from: workType ? (workTypeFrom || null) : null,
    };
    if (editRow) {
      await update(editRow.id, payload);
    } else {
      if (!hasProject) return;
      await create({ ...payload, project_id: project.id });
    }
    setModalOpen(false);
  }

  async function handleRemove(row) {
    if (!(await confirm(`Delete "${row.name}"?`))) return;
    await remove(row.id);
  }

  return (
    <Box>
      <TabToolbar
        title="Equipment"
        addLabel="Add Equipment"
        onAdd={openAdd}
        onReload={reload}
        disabled={!hasProject}
        disabledHint="Select a project to manage its equipment"
      />

      <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, padding: 12 }}>
        {loading && <LoadingSpinner py={16} />}
        {!loading && <SafeError message={error} />}
        {!loading && !error && !hasProject && (
          <Text size="xs" c="dimmed" ta="center" py={16}>
            Select a project to manage its equipment.
          </Text>
        )}
        {!loading && !error && hasProject && equipment.length === 0 && (
          <Text size="xs" c="dimmed" ta="center" py={16}>No equipment configured</Text>
        )}
        {!loading && !error && equipment.map((row) => (
          <Group key={row.id} justify="space-between" p={8} mb={6} style={{ background: "#f5f6f8", border: "1px solid #ebebeb", borderRadius: 6 }}>
            <Group gap={8}>
              <IconAnchor size={14} color="#0F2744" />
              <Text size="xs" fw={600}>{row.name}</Text>
              {row.work_type && (
                <Text size="xs" c="dimmed">
                  {row.work_type}
                  {row.work_type_from ? ` (from ${toDateInputValue(row.work_type_from)})` : ""}
                </Text>
              )}
            </Group>
            <Group gap={10} wrap="nowrap">
              <Button size="xs" variant="subtle" onClick={() => openEdit(row)}>Edit</Button>
              <Button size="xs" variant="subtle" color="red" onClick={() => handleRemove(row)}>Delete</Button>
            </Group>
          </Group>
        ))}
      </Box>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit" : "Add"} Equipment</Text>} size="sm">
        <TextInput
          label="Equipment Name"
          required
          placeholder="e.g. Kevin Zenke, Michael B"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          mb={16}
          autoFocus
        />
        <Select
          label="Work Type"
          description="Pins this unit's discipline regardless of the project's own work type -- leave blank to inherit the project's. Use this for a mixed-phase project running a dredge and a placement unit on the same job."
          placeholder="Inherit from project"
          data={workTypeData}
          value={workType || null}
          onChange={(v) => setWorkType(v ?? "")}
          clearable
          mb={workType ? 16 : 0}
        />
        {workType && (
          <TextInput
            type="date"
            label="Effective From"
            description="First report date this work type applies from. Leave blank if this unit has only ever done this one thing."
            value={workTypeFrom}
            onChange={(e) => setWorkTypeFrom(e.currentTarget.value)}
            mb={16}
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" loading={editRow ? updating : creating} onClick={handleSave} disabled={!name.trim()} style={{ background: "#0F2744", border: "none" }}>
            Save
          </Button>
        </Group>
      </Modal>

      {confirmModal}
    </Box>
  );
}
