import { useMemo, useState } from "react";
import { Box, Text, Group, Button, Modal, Avatar, Badge, Table, TextInput, Select, SegmentedControl, Menu } from "@mantine/core";
import { IconPlus, IconRefresh, IconSearch } from "@tabler/icons-react";
import { useAppConfig } from "../../contexts/appConfigContext";
import { useDomainAccess } from "../../contexts/adminAccessContext";
import { useConfirmDialog } from "../../hooks/ui/useConfirmDialog";
import { usePagedRows } from "../../hooks/ui/usePagedRows";
import { TEAM_ROLES, useTeamDirectory } from "../../hooks/project/useTeamDirectory";
import { fetchRecordPage, likeFilter } from "../../data";
import PaginationBar from "../../components/PaginationBar";
import ServerPagedSelect from "../../components/ServerPagedSelect";
import SafeError from "../../components/SafeError";

const ROLE_FILTERS = [{ label: "All", value: "all" }, ...TEAM_ROLES.map((r) => ({ label: r.label, value: r.label }))];

const nameOf = (user) => user?.displayName || user?.email || "Unknown user";

function initials(name) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "?";
}

function projectLabel(project) {
  if (!project) return "Unknown project";
  return project.project_code != null ? `${project.name} (#${project.project_code})` : project.name;
}

export default function AdminTeamSection() {
  const { config } = useAppConfig();
  const { canCreate, canUpdate, canDelete } = useDomainAccess("jfb_project_members");
  const { confirm, modal: confirmModal } = useConfirmDialog();
  const { data, loading, error, reload, addMembership, setMembershipActive, removeMembership } = useTeamDirectory();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState(null);
  const [addFor, setAddFor] = useState(null);
  const [addProject, setAddProject] = useState(null);
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState(null);

  const rows = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    return [...data.usersById.values()]
      .map((user) => ({
        user,
        memberships: data.links
          .filter((l) => l.user_id === user.userId)
          .map((link) => ({ link, project: data.projectsById.get(link.project_id) }))
          .sort((a, b) => projectLabel(a.project).localeCompare(projectLabel(b.project))),
      }))
      .filter(({ user, memberships }) =>
        (roleFilter === "all" || user.roles.includes(roleFilter)) &&
        (!projectFilter || memberships.some((m) => m.link.project_id === projectFilter)) &&
        (!term || `${user.displayName ?? ""} ${user.email ?? ""}`.toLowerCase().includes(term)))
      .sort((a, b) => nameOf(a.user).localeCompare(nameOf(b.user)));
  }, [data, search, roleFilter, projectFilter]);

  const { pageRows, page, setPage, total, pageSize } = usePagedRows(rows);

  const projectFilterOptions = useMemo(() => {
    if (!data) return [];
    return [...data.projectsById.values()]
      .map((p) => ({ value: p.id, label: projectLabel(p) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data]);

  const otherUserLinks = data ? data.links.filter((l) => !data.usersById.has(l.user_id)).length : 0;

  async function fetchProjectOptions({ search: term, page: optionPage, pageSize: optionPageSize }) {
    const nameFilter = likeFilter(term);
    const { rows: projects, hasNext } = await fetchRecordPage({
      domain: "jfb_projects", appSlug: config.appSlug, page: optionPage, pageSize: optionPageSize,
      filters: { is_active: true, ...(nameFilter ? { name: nameFilter } : {}) },
      sortCol: "name", sortDir: "asc",
    });
    const activeIds = new Set(
      (data?.links ?? []).filter((l) => l.user_id === addFor?.userId && l.is_active !== false).map((l) => l.project_id)
    );
    return {
      items: projects.map((p) => ({
        value: p.id,
        label: projectLabel(p),
        project: p,
        disabled: activeIds.has(p.id),
        note: activeIds.has(p.id) ? "already on team" : null,
      })),
      hasNext,
    };
  }

  function openAdd(user) {
    setAddFor(user);
    setAddProject(null);
    setActionError(null);
  }

  async function handleAdd() {
    if (!addFor || !addProject) return;
    setAdding(true);
    setActionError(null);
    try {
      await addMembership(addFor, addProject.id);
      setAddFor(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to add to project.");
    } finally {
      setAdding(false);
    }
  }

  async function runAction(action, fallback) {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : fallback);
    }
  }

  async function handleRemove(user, membership) {
    if (!(await confirm(`Remove "${nameOf(user)}" from ${projectLabel(membership.project)}?`))) return;
    await runAction(() => removeMembership(membership.link), "Failed to remove from project.");
  }

  function changeFilter(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  return (
    <Box>
      <Text fw={700} size="lg" mb={4}>Team</Text>
      <Text size="xs" c="dimmed" mb={16}>All PE/PM users and the projects they are assigned to</Text>

      <Group justify="space-between" align="flex-end" mb={12} wrap="wrap">
        <Group align="flex-end" gap="sm" wrap="wrap">
          <TextInput
            size="xs" w={240} placeholder="Search name or email"
            leftSection={<IconSearch size={12} />}
            value={search}
            onChange={(e) => changeFilter(setSearch)(e.currentTarget.value)}
          />
          <SegmentedControl size="xs" data={ROLE_FILTERS} value={roleFilter} onChange={changeFilter(setRoleFilter)} />
          <Select
            size="xs" w={260} placeholder="All projects" clearable searchable
            data={projectFilterOptions}
            value={projectFilter}
            onChange={changeFilter(setProjectFilter)}
            nothingFoundMessage="No projects with team members"
          />
        </Group>
        <Box onClick={reload} style={{ cursor: "pointer", color: "#aaa", display: "flex", alignItems: "center" }} title="Refresh">
          <IconRefresh size={14} />
        </Box>
      </Group>

      <SafeError message={actionError} mb={8} />

      <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, padding: 12 }}>
        {loading && !data && <Text size="xs" c="dimmed" ta="center" py={16}>Loading…</Text>}
        {error && <Text size="xs" c="red" ta="center" py={16}>{error}</Text>}

        {data?.missingRoles.length > 0 && (
          <Text size="xs" c="orange" mb={8}>
            Role {data.missingRoles.join(", ")} was not found on this environment. Run the JFB roles seed, then refresh.
          </Text>
        )}

        {data && data.usersById.size === 0 && (
          <Text size="xs" c="dimmed" ta="center" py={16}>
            No users have the PE (jfb_project_engineers) or PM (jfb_project_managers) role yet. Give users one of these roles in
            the Pivotly Portal, then refresh.
          </Text>
        )}

        {data && data.usersById.size > 0 && rows.length === 0 && (
          <Text size="xs" c="dimmed" ta="center" py={16}>No users match these filters.</Text>
        )}

        {data && rows.length > 0 && (
          <Table verticalSpacing="xs" fz="xs" style={{ opacity: loading ? 0.6 : 1 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>User</Table.Th>
                <Table.Th style={{ width: 90 }}>Role</Table.Th>
                <Table.Th>Projects</Table.Th>
                <Table.Th style={{ width: 140 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pageRows.map(({ user, memberships }) => (
                <Table.Tr key={user.userId}>
                  <Table.Td>
                    <Group gap={10} wrap="nowrap">
                      <Avatar size={26} radius="xl" style={{ background: "#0F2744", color: "#fff", fontSize: 10, fontWeight: 700 }}>
                        {initials(nameOf(user))}
                      </Avatar>
                      <Box>
                        <Text size="xs" fw={600}>{nameOf(user)}</Text>
                        {user.email && user.displayName && <Text size="10px" c="dimmed">{user.email}</Text>}
                      </Box>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {user.roles.map((r) => <Badge key={r} size="xs" color="gray" variant="light">{r}</Badge>)}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    {memberships.length === 0 ? (
                      <Text size="xs" c="dimmed" fs="italic">Not on any project</Text>
                    ) : (
                      <Group gap={6}>
                        {memberships.map((m) => (
                          <MembershipBadge
                            key={m.link.id}
                            membership={m}
                            canUpdate={canUpdate}
                            canDelete={canDelete}
                            onToggle={() => runAction(() => setMembershipActive(m.link, m.link.is_active === false), "Failed to update membership.")}
                            onRemove={() => handleRemove(user, m)}
                          />
                        ))}
                      </Group>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {canCreate && (
                      <Button size="xs" variant="subtle" leftSection={<IconPlus size={12} />} onClick={() => openAdd(user)}>
                        Add to project
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        {data && rows.length > 0 && (
          <PaginationBar page={page} pageSize={pageSize} count={pageRows.length} total={total} onChange={setPage} noun="user" />
        )}

        {otherUserLinks > 0 && (
          <Text size="10px" c="dimmed" mt={8}>
            {otherUserLinks} project assignment(s) belong to users without the PE or PM role and are not listed.
          </Text>
        )}
      </Box>

      <Modal opened={!!addFor} onClose={() => setAddFor(null)} title={<Text fw={700} size="sm">Add to Project</Text>} size="sm">
        <Text size="xs" mb={10}>
          User: <Text span fw={700}>{nameOf(addFor)}</Text>
        </Text>
        <ServerPagedSelect
          label="Project"
          placeholder="Search or choose a project"
          fetchPage={fetchProjectOptions}
          reloadKey={addFor?.userId ?? ""}
          value={addProject?.id ?? null}
          selectedLabel={addProject ? projectLabel(addProject) : null}
          onChange={(v, item) => setAddProject(item?.project ?? null)}
          nothingFoundMessage="No matching projects"
          noun="project"
          mb={16}
        />
        <SafeError message={actionError} mb={8} />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setAddFor(null)}>Cancel</Button>
          <Button size="xs" loading={adding} onClick={handleAdd} disabled={!addProject} style={{ background: "#0F2744", border: "none" }}>Add</Button>
        </Group>
      </Modal>

      {confirmModal}
    </Box>
  );
}

function MembershipBadge({ membership, canUpdate, canDelete, onToggle, onRemove }) {
  const hidden = membership.link.is_active === false;
  const badge = (
    <Badge
      size="sm"
      variant={hidden ? "outline" : "light"}
      color={hidden ? "gray" : "brennanNavy"}
      style={{ cursor: canUpdate || canDelete ? "pointer" : "default", textTransform: "none" }}
      title={hidden ? "Hidden on this project" : undefined}
    >
      {projectLabel(membership.project)}{hidden ? " · hidden" : ""}
    </Badge>
  );
  if (!canUpdate && !canDelete) return badge;
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>{badge}</Menu.Target>
      <Menu.Dropdown>
        {canUpdate && <Menu.Item onClick={onToggle}>{hidden ? "Show on project" : "Hide on project"}</Menu.Item>}
        {canDelete && <Menu.Item color="red" onClick={onRemove}>Remove from project</Menu.Item>}
      </Menu.Dropdown>
    </Menu>
  );
}
