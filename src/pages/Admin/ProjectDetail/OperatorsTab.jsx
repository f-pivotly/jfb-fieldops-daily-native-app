import { useState } from "react";
import { Box, Text, Group, Button, Modal, TextInput, Select, Checkbox, Avatar, SegmentedControl } from "@mantine/core";
import { IconPlus, IconRefresh } from "@tabler/icons-react";
import { useDomainData } from "../../../hooks/useDomainData";
import { useConfirmDialog } from "../../../hooks/useConfirmDialog";
import { useDomainAccess } from "../../../contexts/adminAccessContext";

function initials(fullName) {
  return (fullName || "")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "?";
}

const EMPTY_NEW_OPERATOR = { name: "", email: "" };

export default function OperatorsTab({ project }) {
  const hasProject = !!project?.id;
  const { confirm, modal: confirmModal } = useConfirmDialog();
  const { canCreate: canCreateOperator } = useDomainAccess("jfb_operators");
  const {
    canCreate: canCreateLink,
    canUpdate: canUpdateLink,
    canDelete: canDeleteLink,
  } = useDomainAccess("jfb_project_operators");

  const {
    records: allOperators,
    creating: creatingOperator,
    create: createOperator,
  } = useDomainData({ domain: "jfb_operators", system: "core" });

  const {
    records: links,
    loading,
    error,
    creating: linking,
    updating,
    reload,
    create: createLink,
    update: updateLink,
    remove: removeLink,
  } = useDomainData({ domain: "jfb_project_operators", system: "core", projectId: project?.id });

  const operatorsById = new Map(allOperators.map((o) => [o.id, o]));
  const rows = hasProject
    ? [...links]
        .map((link) => ({ link, operator: operatorsById.get(link.operator_id) }))
        .filter((r) => r.operator)
    : [];

  const linkedOperatorIds = new Set(links.filter((l) => l.is_active !== false).map((l) => l.operator_id));
  const availableOperators = allOperators.filter((o) => !linkedOperatorIds.has(o.id));

  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState("existing");
  const [newOperator, setNewOperator] = useState(EMPTY_NEW_OPERATOR);
  const [existingOperatorId, setExistingOperatorId] = useState(null);

  function openModal() {
    setMode(availableOperators.length > 0 || !canCreateOperator ? "existing" : "new");
    setNewOperator(EMPTY_NEW_OPERATOR);
    setExistingOperatorId(null);
    setModalOpen(true);
  }

  async function handleAddExisting() {
    if (!existingOperatorId || !hasProject) return;
    await createLink({ project_id: project.id, operator_id: existingOperatorId, is_active: true });
    setModalOpen(false);
  }

  async function handleAddNew() {
    if (!newOperator.name.trim() || !hasProject) return;
    const res = await createOperator({ name: newOperator.name.trim(), email: newOperator.email.trim() || null });
    const operatorId = res?.data?.id;
    if (!operatorId) return;
    await createLink({ project_id: project.id, operator_id: operatorId, is_active: true });
    setModalOpen(false);
  }

  async function toggleActive(link) {
    await updateLink(link.id, { is_active: link.is_active === false });
  }

  async function handleRemove(row) {
    if (!(await confirm(`Remove "${row.operator.name}" from this project?`))) return;
    await removeLink(row.link.id);
  }

  return (
    <Box>
      <Group justify="space-between" mb={12}>
        <Text fw={700} size="sm">Operators</Text>
        <Group gap={8}>
          <Box onClick={reload} style={{ cursor: "pointer", color: "#aaa", display: "flex", alignItems: "center" }} title="Refresh">
            <IconRefresh size={14} />
          </Box>
          {canCreateLink && (
            <Button
              size="xs"
              leftSection={<IconPlus size={12} />}
              onClick={openModal}
              disabled={!hasProject}
              title={hasProject ? undefined : "Select a project to manage its operators"}
              style={{ background: "#0F2744", border: "none" }}
            >
              Add Operator
            </Button>
          )}
        </Group>
      </Group>

      <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, padding: 12 }}>
        {loading && <Text size="xs" c="dimmed" ta="center" py={16}>Loading…</Text>}
        {!loading && error && <Text size="xs" c="red" ta="center" py={16}>{error}</Text>}
        {!loading && !error && !hasProject && (
          <Text size="xs" c="dimmed" ta="center" py={16}>Select a project to manage its operators.</Text>
        )}
        {!loading && !error && hasProject && rows.length === 0 && (
          <Text size="xs" c="dimmed" ta="center" py={16}>No operators assigned yet</Text>
        )}
        {!loading && !error && rows.map(({ link, operator }) => (
          <Group key={link.id} justify="space-between" p={8} mb={6} style={{ background: "#f5f6f8", border: "1px solid #ebebeb", borderRadius: 6, opacity: link.is_active === false ? 0.5 : 1 }}>
            <Group gap={10}>
              <Avatar size={26} radius="xl" style={{ background: "#0F2744", color: "#fff", fontSize: 10, fontWeight: 700 }}>
                {initials(operator.name)}
              </Avatar>
              <Box>
                <Text size="xs" fw={600}>{operator.name}</Text>
                {operator.email && <Text size="10px" c="dimmed">{operator.email}</Text>}
              </Box>
            </Group>
            <Group gap={10}>
              {canUpdateLink && (
                <Checkbox size="xs" checked={link.is_active !== false} onChange={() => toggleActive(link)} label={link.is_active === false ? "Hidden" : "Active"} disabled={updating} />
              )}
              {canDeleteLink && (
                <Button size="xs" variant="subtle" color="red" onClick={() => handleRemove({ link, operator })}>Remove</Button>
              )}
            </Group>
          </Group>
        ))}
      </Box>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">Add Operator</Text>} size="xs">
        {canCreateOperator && (
          <SegmentedControl
            fullWidth
            mb={16}
            value={mode}
            onChange={setMode}
            data={[
              { label: "Existing Operator", value: "existing" },
              { label: "New Operator", value: "new" },
            ]}
          />
        )}

        {mode === "existing" && (
          <>
            <Select
              label="Operator"
              placeholder={availableOperators.length === 0 ? "No available operators" : "Choose an operator"}
              data={availableOperators.map((o) => ({ value: o.id, label: o.name }))}
              value={existingOperatorId}
              onChange={setExistingOperatorId}
              searchable
              disabled={availableOperators.length === 0}
              mb={16}
            />
            <Group justify="flex-end">
              <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button size="xs" loading={linking} onClick={handleAddExisting} disabled={!existingOperatorId} style={{ background: "#0F2744", border: "none" }}>Add</Button>
            </Group>
          </>
        )}

        {mode === "new" && canCreateOperator && (
          <>
            <TextInput
              label="Full Name"
              required
              placeholder="First Last"
              value={newOperator.name}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setNewOperator((f) => ({ ...f, name: value }));
              }}
              mb={10}
              autoFocus
            />
            <TextInput
              label="Email"
              placeholder="Optional"
              value={newOperator.email}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setNewOperator((f) => ({ ...f, email: value }));
              }}
              mb={16}
            />
            <Group justify="flex-end">
              <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button size="xs" loading={creatingOperator || linking} onClick={handleAddNew} disabled={!newOperator.name.trim()} style={{ background: "#0F2744", border: "none" }}>Add</Button>
            </Group>
          </>
        )}
      </Modal>

      {confirmModal}
    </Box>
  );
}
