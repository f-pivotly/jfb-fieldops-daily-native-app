import { useState } from "react";
import { Box, Text, Group, Button, Modal, TextInput } from "@mantine/core";
import { IconPlus, IconAnchor, IconRefresh } from "@tabler/icons-react";
import { useDomainData } from "../../../hooks/useDomainData";
import LoadingSpinner from "../../../components/LoadingSpinner";
import SafeError from "../../../components/SafeError";

export default function EquipmentTab({ project }) {
  const { records, loading, error, creating, updating, reload, create, update, remove } = useDomainData({
    domain: "equipments",
    system: "core",
  });

  const hasProjectKey = !!project?.project_id;
  const equipment = hasProjectKey ? records.filter((r) => r.project_id === project.project_id) : [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [name, setName] = useState("");

  function openAdd() {
    setEditRow(null);
    setName("");
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setName(row.name ?? "");
    setModalOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) return;
    if (editRow) {
      await update(editRow.id, { name: name.trim() });
    } else {
      if (!hasProjectKey) return;
      await create({ name: name.trim(), project_id: project.project_id });
    }
    setModalOpen(false);
  }

  async function handleRemove(row) {
    if (!confirm(`Delete "${row.name}"?`)) return;
    await remove(row.id);
  }

  return (
    <Box>
      <Group justify="space-between" mb={12}>
        <Text fw={700} size="sm">Equipment</Text>
        <Group gap={8}>
          <Box onClick={reload} style={{ cursor: "pointer", color: "#aaa", display: "flex", alignItems: "center" }} title="Refresh">
            <IconRefresh size={14} />
          </Box>
          <Button
            size="xs"
            leftSection={<IconPlus size={12} />}
            onClick={openAdd}
            disabled={!hasProjectKey}
            title={hasProjectKey ? undefined : "This project has no project_id set, so equipment can't be linked to it yet"}
            style={{ background: "#0F2744", border: "none" }}
          >
            Add Equipment
          </Button>
        </Group>
      </Group>

      <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, padding: 12 }}>
        {loading && <LoadingSpinner py={16} />}
        {!loading && <SafeError message={error} />}
        {!loading && !error && !hasProjectKey && (
          <Text size="xs" c="dimmed" ta="center" py={16}>
            This project has no project_id set, so equipment can't be linked to it yet.
          </Text>
        )}
        {!loading && !error && hasProjectKey && equipment.length === 0 && (
          <Text size="xs" c="dimmed" ta="center" py={16}>No equipment configured</Text>
        )}
        {!loading && !error && equipment.map((row) => (
          <Group key={row.id} justify="space-between" p={8} mb={6} style={{ background: "#f5f6f8", border: "1px solid #ebebeb", borderRadius: 6 }}>
            <Group gap={8}>
              <IconAnchor size={14} color="#0F2744" />
              <Text size="xs" fw={600}>{row.name}</Text>
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
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" loading={editRow ? updating : creating} onClick={handleSave} disabled={!name.trim()} style={{ background: "#0F2744", border: "none" }}>
            Save
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}
