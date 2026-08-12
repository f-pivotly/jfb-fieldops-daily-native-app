import { useState } from "react";
import { Box, Text, Group, Button, Modal, TextInput, Checkbox, Avatar } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { SAMPLE_PROJECT_OPERATORS } from "../../../data/adminProjectDetailSampleData";

function initials(fullName) {
  return (fullName || "")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "?";
}

export default function OperatorsTab() {
  const [operators, setOperators] = useState(SAMPLE_PROJECT_OPERATORS);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");

  function handleAdd() {
    if (!name.trim()) return;
    setOperators((prev) => [...prev, { id: `op-${Date.now()}`, full_name: name.trim(), active: true }]);
    setName("");
    setModalOpen(false);
  }

  function toggleActive(row) {
    setOperators((prev) => prev.map((o) => (o.id === row.id ? { ...o, active: !o.active } : o)));
  }

  function remove(row) {
    if (!confirm(`Remove "${row.full_name}" from this project?`)) return;
    setOperators((prev) => prev.filter((o) => o.id !== row.id));
  }

  return (
    <Box>
      <Group justify="space-between" mb={12}>
        <Text fw={700} size="sm">Operators</Text>
        <Button size="xs" leftSection={<IconPlus size={12} />} onClick={() => setModalOpen(true)} style={{ background: "#0F2744", border: "none" }}>Add Operator</Button>
      </Group>

      <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, padding: 12 }}>
        {operators.length === 0 && <Text size="xs" c="dimmed" ta="center" py={16}>No operators assigned yet</Text>}
        {operators.map((row) => (
          <Group key={row.id} justify="space-between" p={8} mb={6} style={{ background: "#f5f6f8", border: "1px solid #ebebeb", borderRadius: 6, opacity: row.active ? 1 : 0.5 }}>
            <Group gap={10}>
              <Avatar size={26} radius="xl" style={{ background: "#0F2744", color: "#fff", fontSize: 10, fontWeight: 700 }}>
                {initials(row.full_name)}
              </Avatar>
              <Text size="xs" fw={600}>{row.full_name}</Text>
            </Group>
            <Group gap={10}>
              <Checkbox size="xs" checked={row.active} onChange={() => toggleActive(row)} title="Active" />
              <Button size="xs" variant="subtle" color="red" onClick={() => remove(row)}>Remove</Button>
            </Group>
          </Group>
        ))}
      </Box>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">Add Operator</Text>} size="xs">
        <TextInput
          label="Full Name"
          required
          placeholder="First Last"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          mb={16}
          autoFocus
        />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" onClick={handleAdd} disabled={!name.trim()} style={{ background: "#0F2744", border: "none" }}>Add</Button>
        </Group>
      </Modal>
    </Box>
  );
}
