import { useEffect, useState } from "react";
import { Box, Text, Group, Button, Modal, Checkbox, Avatar, SegmentedControl } from "@mantine/core";
import { IconPlus, IconRefresh } from "@tabler/icons-react";
import { useDomainData } from "../../../hooks/core/useDomainData";
import { useConfirmDialog } from "../../../hooks/ui/useConfirmDialog";
import { useDomainAccess } from "../../../contexts/adminAccessContext";
import { useRoleByCode } from "../../../hooks/iam/useRoleByCode";
import { useAppConfig } from "../../../contexts/appConfigContext";
import { fetchRecordsByField, fetchRoleUsersPage } from "../../../data";
import PaginationBar from "../../../components/PaginationBar";
import ServerPagedSelect from "../../../components/ServerPagedSelect";

const PE_ROLE_CODE = "jfb_project_engineers";
const PM_ROLE_CODE = "jfb_project_managers";

async function resolveRoleUsers(roleIds, userIds) {
  const entries = await Promise.all(
    userIds.map(async (userId) => {
      const results = await Promise.all(roleIds.map((roleId) => fetchRoleUsersPage(roleId, { userId, pageSize: 1 })));
      const user = results.map((r) => r.rows[0]).find(Boolean) ?? null;
      return [userId, user];
    })
  );
  return new Map(entries.filter(([, user]) => user));
}

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

  const { config } = useAppConfig();
  const {
    records: links,
    loading: linksLoading,
    error: linksError,
    creating,
    updating,
    reload,
    create,
    update,
    remove,
    page, setPage, total, hasNext, pageLoading, pageSize,
  } = useDomainData({ domain: "jfb_project_members", system: "core", projectId: project?.id, paginate: true });

  const { roleId: peRoleId, loading: peRoleLoading } = useRoleByCode(PE_ROLE_CODE, { enabled: canCreate });
  const { roleId: pmRoleId, loading: pmRoleLoading } = useRoleByCode(PM_ROLE_CODE, { enabled: canCreate });
  const roleIdsKey = [peRoleId, pmRoleId].filter(Boolean).join(",");
  const userIdsKey = [...new Set(links.map((l) => l.user_id).filter(Boolean))].join(",");
  const usersKey = `${userIdsKey}|${roleIdsKey}`;
  const [usersState, setUsersState] = useState({ key: null, byId: new Map(), error: null });

  useEffect(() => {
    if (!userIdsKey || !roleIdsKey) return;
    let cancelled = false;
    resolveRoleUsers(roleIdsKey.split(","), userIdsKey.split(","))
      .then((byId) => { if (!cancelled) setUsersState({ key: usersKey, byId, error: null }); })
      .catch((err) => { if (!cancelled) setUsersState({ key: usersKey, byId: new Map(), error: err.message }); });
    return () => { cancelled = true; };
  }, [userIdsKey, roleIdsKey, usersKey]);

  const needsUsers = !!userIdsKey && !!roleIdsKey;
  const usersReady = !needsUsers || usersState.key === usersKey;
  const usersById = needsUsers && usersReady ? usersState.byId : new Map();
  const rows = hasProject
    ? links.map((link) => ({ link, user: usersById.get(link.user_id) })).filter((r) => r.user)
    : [];
  const loading = linksLoading || peRoleLoading || pmRoleLoading || !usersReady;
  const error = linksError || (needsUsers ? usersState.error : null);

  const [modalOpen, setModalOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState("pe");
  const [selectedUser, setSelectedUser] = useState(null);
  const selectedUserId = selectedUser?.userId ?? null;
  const activeRoleId = roleFilter === "pe" ? peRoleId : pmRoleId;

  async function fetchUserOptions({ search, page: optionPage, pageSize: optionPageSize }) {
    if (!activeRoleId) return { items: [], hasNext: false };
    const { rows: users, hasNext: optionsHasNext } = await fetchRoleUsersPage(activeRoleId, { page: optionPage, pageSize: optionPageSize, search });
    const existingLinks = await fetchRecordsByField({
      domain: "jfb_project_members", appSlug: config.appSlug, field: "user_id",
      values: users.map((u) => u.userId), filters: { project_id: project.id },
    });
    const linkedIds = new Set(existingLinks.filter((l) => l.is_active !== false).map((l) => l.user_id));
    return {
      items: users.map((u) => ({
        value: u.userId,
        label: u.displayName || u.email,
        user: u,
        disabled: linkedIds.has(u.userId),
        note: linkedIds.has(u.userId) ? "already on team" : null,
      })),
      hasNext: optionsHasNext,
    };
  }

  function openModal() {
    setRoleFilter("pe");
    setSelectedUser(null);
    setModalOpen(true);
  }

  async function handleAdd() {
    if (!selectedUserId || !hasProject) return;
    await create({
      project_id: project.id,
      user_id: selectedUserId,
      email: selectedUser?.email ?? null,
      is_active: true,
    });
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
        {!loading && !error && hasProject && rows.length === 0 && page === 1 && (
          <Text size="xs" c="dimmed" ta="center" py={16}>No team members assigned yet</Text>
        )}
        {!loading && !error && rows.map(({ link, user }) => (
          <Group key={link.id} justify="space-between" p={8} mb={6} style={{ background: "#f5f6f8", border: "1px solid #ebebeb", borderRadius: 6, opacity: link.is_active === false || pageLoading ? 0.5 : 1 }}>
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
        {!loading && !error && hasProject && <PaginationBar page={page} pageSize={pageSize} count={links.length} total={total} hasNext={hasNext} onChange={setPage} disabled={pageLoading} noun="member" />}
      </Box>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">Add to Team</Text>} size="xs">
        <SegmentedControl
          fullWidth
          mb={16}
          value={roleFilter}
          onChange={(v) => {
            setRoleFilter(v);
            setSelectedUser(null);
          }}
          data={[
            { label: "PE", value: "pe" },
            { label: "PM", value: "pm" },
          ]}
        />
        <ServerPagedSelect
          label="User"
          placeholder={activeRoleId ? "Search or choose a user" : "Loading…"}
          fetchPage={fetchUserOptions}
          reloadKey={`${project?.id ?? ""}|${activeRoleId ?? ""}`}
          value={selectedUserId}
          selectedLabel={selectedUser ? selectedUser.displayName || selectedUser.email : null}
          onChange={(v, item) => setSelectedUser(item?.user ?? null)}
          nothingFoundMessage="No matching users"
          noun="user"
          disabled={!activeRoleId}
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
