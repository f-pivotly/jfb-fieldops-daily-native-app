import { useState } from "react";
import { Box, Text, Group, Button, Modal, TextInput, Select, NumberInput, Switch } from "@mantine/core";
import { IconAnchor } from "@tabler/icons-react";
import { useEquipment } from "../../../hooks/project/useEquipment";
import { useConfirmDialog } from "../../../hooks/ui/useConfirmDialog";
import { useDomainData } from "../../../hooks/core/useDomainData";
import LoadingSpinner from "../../../components/LoadingSpinner";
import SafeError from "../../../components/SafeError";
import TabToolbar from "./TabToolbar";
import { compareEquipmentSortOrder } from "../../FieldOps/lib/workType";

function toDateInputValue(iso) {
  return iso ? String(iso).slice(0, 10) : "";
}

export default function EquipmentTab({ project }) {
  const hasProject = !!project?.id;
  const { confirm, modal: confirmModal } = useConfirmDialog();
  const { equipment: equipmentRecords, loading, error, creating, updating, reload, create, update, remove } = useEquipment(project?.id);
  const { records: workTypeRecords } = useDomainData({ domain: "jfb_work_types", system: "core" });
  const workTypeData = workTypeRecords.map((r) => ({ value: r.name, label: r.name }));

  const equipment = hasProject ? [...equipmentRecords].sort(compareEquipmentSortOrder) : [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [name, setName] = useState("");
  const [workType, setWorkType] = useState("");
  const [workTypeFrom, setWorkTypeFrom] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [mobilizedOn, setMobilizedOn] = useState("");
  const [demobilizedOn, setDemobilizedOn] = useState("");
  const datesInvalid = !!mobilizedOn && !!demobilizedOn && demobilizedOn < mobilizedOn;

  function openAdd() {
    setEditRow(null);
    setName("");
    setWorkType("");
    setWorkTypeFrom("");
    setSortOrder(equipment.length + 1);
    setMobilizedOn("");
    setDemobilizedOn("");
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setName(row.name ?? "");
    setWorkType(row.work_type ?? "");
    setWorkTypeFrom(toDateInputValue(row.work_type_from));
    setSortOrder(row.sort_order ?? "");
    setMobilizedOn(toDateInputValue(row.mobilized_on));
    setDemobilizedOn(toDateInputValue(row.demobilized_on));
    setModalOpen(true);
  }

  async function handleSave() {
    if (!name.trim() || datesInvalid) return;
    const payload = {
      name: name.trim(),
      work_type: workType || null,
      work_type_from: workType ? (workTypeFrom || null) : null,
      sort_order: sortOrder === "" ? null : Number(sortOrder),
      mobilized_on: mobilizedOn || null,
      demobilized_on: demobilizedOn || null,
    };
    if (editRow) {
      await update(editRow.id, payload);
    } else {
      if (!hasProject) return;
      await create({ ...payload, project_id: project.id });
    }
    setModalOpen(false);
  }

  async function toggleActive(row) {
    await update(row.id, { is_active: row.is_active === false });
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
            <Group gap={8} style={{ opacity: row.is_active === false ? 0.55 : 1 }}>
              <IconAnchor size={14} color="#0F2744" />
              <Text size="xs" fw={600}>{row.name}</Text>
              {row.work_type && (
                <Text size="xs" c="dimmed">
                  {row.work_type}
                  {row.work_type_from ? ` (from ${toDateInputValue(row.work_type_from)})` : ""}
                </Text>
              )}
              {(row.mobilized_on || row.demobilized_on) && (
                <Text size="xs" c="dimmed">
                  {row.mobilized_on ? `Mobilized ${toDateInputValue(row.mobilized_on)}` : ""}
                  {row.mobilized_on && row.demobilized_on ? " · " : ""}
                  {row.demobilized_on ? `Demobilized ${toDateInputValue(row.demobilized_on)}` : ""}
                </Text>
              )}
            </Group>
            <Group gap={10} wrap="nowrap">
              <Button size="xs" variant="subtle" onClick={() => openEdit(row)}>Edit</Button>
              <Button size="xs" variant="subtle" color="red" onClick={() => handleRemove(row)}>Delete</Button>
              <Switch
                size="md"
                color="#1B6B3A"
                checked={row.is_active !== false}
                onChange={() => toggleActive(row)}
                title={row.is_active !== false ? "Active — shown in the operator app and the report editor" : "Retired — hidden from new work, history kept"}
              />
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
        <NumberInput
          label="Sort Order"
          hideControls
          allowDecimal={false}
          value={sortOrder}
          onChange={(v) => setSortOrder(v === "" ? "" : v)}
          mb={16}
        />
        <Group grow mb={16} align="flex-start">
          <TextInput
            type="date"
            label="Mobilized On"
            description="First report date this unit appears on. Blank = no start date."
            value={mobilizedOn}
            onChange={(e) => setMobilizedOn(e.currentTarget.value)}
          />
          <TextInput
            type="date"
            label="Demobilized On"
            description="Last report date this unit appears on. Blank = still on site."
            value={demobilizedOn}
            onChange={(e) => setDemobilizedOn(e.currentTarget.value)}
            error={datesInvalid ? "Must be on or after Mobilized On." : undefined}
          />
        </Group>
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
          <Button size="xs" loading={editRow ? updating : creating} onClick={handleSave} disabled={!name.trim() || datesInvalid} style={{ background: "#0F2744", border: "none" }}>
            Save
          </Button>
        </Group>
      </Modal>

      {confirmModal}
    </Box>
  );
}
