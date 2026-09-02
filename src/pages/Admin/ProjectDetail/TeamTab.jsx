import { useState } from "react";
import { Box, Text, Group, Button, Modal, Select, Checkbox, Avatar, SegmentedControl } from "@mantine/core";
import { IconPlus, IconRefresh } from "@tabler/icons-react";
import { useDomainData } from "../../../hooks/useDomainData";
import { useConfirmDialog } from "../../../hooks/useConfirmDialog";
import { useDomainAccess } from "../../../contexts/adminAccessContext";
import { useRoleUsers } from "../../../hooks/useRoleUsers";
import { useRoleByCode } from "../../../hooks/useRoleByCode";

const PE_ROLE_CODE = "jfb_project_engineers";
const PM_ROLE_CODE = "jfb_project_managers";

function initials(fullName) {
  return (fullName || "")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "?";
}

export default function TeamTab({ project }) {
  const hasProject = !!project?.id;
  const { confirm, modal: confirmModal } = useConfirmDialog();
  const { canCreate, canUpdate, canDelete } = useDomainAccess("jfb_project_members");

  const {
    records: links,
    loading,
    error,
    creating,
    updating,
    reload,
    create,
    update,
    remove,
  } = useDomainData({ domain: "jfb_project_members", system: "core", projectId: project?.id });

  const { roleId: peRoleId, loading: peRoleLoading } = useRoleByCode(PE_ROLE_CODE, { enabled: canCreate });
  const { roleId: pmRoleId, loading: pmRoleLoading } = useRoleByCode(PM_ROLE_CODE, { enabled: canCreate });
  const { users: peUsers, loading: peUsersLoading } = useRoleUsers(peRoleId, { enabled: canCreate && !!peRoleId });
  const { users: pmUsers, loading: pmUsersLoading } = useRoleUsers(pmRoleId, { enabled: canCreate && !!pmRoleId });
  const usersLoading = peRoleLoading || pmRoleLoading || peUsersLoading || pmUsersLoading;

  const usersById = new Map(
    [...peUsers, ...pmUsers].map((u) => [u.userId, u])
  );
  const rows = hasProject
    ? links.map((link) => ({ link, user: usersById.get(link.user_id) })).filter((r) => r.user)
    : [];

  const linkedUserIds = new Set(links.filter((l) => l.is_active !== false).map((l) => l.user_id));

  const [modalOpen, setModalOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState("pe");
  const [selectedUserId, setSelectedUserId] = useState(null);

  const availableUsers = (roleFilter === "pe" ? peUsers : pmUsers).filter(
    (u) => !linkedUserIds.has(u.userId)
  );
  let userSelectPlaceholder = "Choose a user";
  if (usersLoading) userSelectPlaceholder = "Loading…";
  else if (availableUsers.length === 0) userSelectPlaceholder = "No available users";

  function openModal() {
    setRoleFilter("pe");
    setSelectedUserId(null);
    setModalOpen(true);
  }

  async function handleAdd() {
    if (!selectedUserId || !hasProject) return;
    await create({ project_id: project.id, user_id: selectedUserId, is_active: true });
    setModalOpen(false);
  }

  async function toggleActive(link) {
    await update(link.id, { is_active: link.is_active === false });
  }

  async function handleRemove(row) {
    if (!(await confirm(`Remove "${row.user.displayName ?? row.user.email}" from this project's team?`))) return;
    await remove(row.link.id);
  }

  return (
    <Box>
      <Group justify="space-between" mb={12}>
        <Text fw={700} size="sm">Project Team</Text>
        <Group gap={8}>
          <Box onClick={reload} style={{ cursor: "pointer", color: "#aaa", display: "flex", alignItems: "center" }} title="Refresh">
            <IconRefresh size={14} />
          </Box>
          {canCreate && (
            <Button
              size="xs"
              leftSection={<IconPlus size={12} />}
              onClick={openModal}
              disabled={!hasProject}
              title={hasProject ? undefined : "Select a project to manage its team"}
              style={{ background: "#0F2744", border: "none" }}
            >
              Add to Team
            </Button>
          )}
        </Group>
      </Group>

      <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, padding: 12 }}>
        {loading && <Text size="xs" c="dimmed" ta="center" py={16}>Loading…</Text>}
        {!loading && error && <Text size="xs" c="red" ta="center" py={16}>{error}</Text>}
        {!loading && !error && !hasProject && (
          <Text size="xs" c="dimmed" ta="center" py={16}>Select a project to manage its team.</Text>
        )}
        {!loading && !error && hasProject && rows.length === 0 && (
          <Text size="xs" c="dimmed" ta="center" py={16}>No team members assigned yet</Text>
        )}
        {!loading && !error && rows.map(({ link, user }) => (
          <Group key={link.id} justify="space-between" p={8} mb={6} style={{ background: "#f5f6f8", border: "1px solid #ebebeb", borderRadius: 6, opacity: link.is_active === false ? 0.5 : 1 }}>
            <Group gap={10}>
              <Avatar size={26} radius="xl" style={{ background: "#0F2744", color: "#fff", fontSize: 10, fontWeight: 700 }}>
                {initials(user.displayName || user.email)}
              </Avatar>
              <Box>
                <Text size="xs" fw={600}>{user.displayName || user.email}</Text>
                {user.email && <Text size="10px" c="dimmed">{user.email}</Text>}
              </Box>
            </Group>
            <Group gap={10}>
              {canUpdate && (
                <Checkbox size="xs" checked={link.is_active !== false} onChange={() => toggleActive(link)} label={link.is_active === false ? "Hidden" : "Active"} disabled={updating} />
              )}
              {canDelete && (
                <Button size="xs" variant="subtle" color="red" onClick={() => handleRemove({ link, user })}>Remove</Button>
              )}
            </Group>
          </Group>
        ))}
      </Box>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">Add to Team</Text>} size="xs">
        <SegmentedControl
          fullWidth
          mb={16}
          value={roleFilter}
          onChange={(v) => {
            setRoleFilter(v);
            setSelectedUserId(null);
          }}
          data={[
            { label: "PE", value: "pe" },
            { label: "PM", value: "pm" },
          ]}
        />
        <Select
          label="User"
          placeholder={userSelectPlaceholder}
          data={availableUsers.map((u) => ({ value: u.userId, label: u.displayName || u.email }))}
          value={selectedUserId}
          onChange={setSelectedUserId}
          searchable
          disabled={usersLoading || availableUsers.length === 0}
          mb={16}
        />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" loading={creating} onClick={handleAdd} disabled={!selectedUserId} style={{ background: "#0F2744", border: "none" }}>Add</Button>
        </Group>
      </Modal>

      {confirmModal}
    </Box>
  );
}
