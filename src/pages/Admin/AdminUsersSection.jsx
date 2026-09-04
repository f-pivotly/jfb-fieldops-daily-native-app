import { useState } from "react";
import { Box, Text, Group, Button, Table, Badge, Modal, TextInput, Select, PasswordInput, Tabs } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { USER_ROLES } from "../../data/adminSampleData";
import AttachmentTestPanel from "./AttachmentTestPanel";

const LIVE_PROJECTS_PLACEHOLDER = [];

const CROSS_PROJECT_ROLES = new Set(["admin", "director"]);
const EMPTY_FORM = { full_name: "", email: "", role: "operator", project_name: LIVE_PROJECTS_PLACEHOLDER[0], password: "" };

export default function AdminUsersSection() {
  const [users, setUsers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  function openAdd() {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const passwordValid = form.password.length >= 8;
  const canSave = form.full_name.trim() && form.email.trim() && passwordValid;

  function handleSave() {
    if (!canSave) return;
    const crossProject = CROSS_PROJECT_ROLES.has(form.role);
    setUsers((prev) => [
      ...prev,
      {
        id: `usr-${Date.now()}`,
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        role: form.role,
        project_name: crossProject ? "All Projects" : form.project_name,
        active: true,
      },
    ]);
    setModalOpen(false);
  }

  function toggleActive(row) {
    setUsers((prev) => prev.map((u) => (u.id === row.id ? { ...u, active: !u.active } : u)));
  }

  return (
    <Box>
      <Text fw={700} size="lg" mb={12}>Users</Text>

      <Tabs defaultValue="users" keepMounted={false}>
        <Tabs.List mb={16}>
          <Tabs.Tab value="users">Users</Tabs.Tab>
          <Tabs.Tab value="attachment-test">Attachment Test</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="users">
          <UsersTab
            users={users}
            openAdd={openAdd}
            toggleActive={toggleActive}
            modalOpen={modalOpen}
            setModalOpen={setModalOpen}
            form={form}
            setField={setField}
            passwordValid={passwordValid}
            canSave={canSave}
            handleSave={handleSave}
          />
        </Tabs.Panel>

        <Tabs.Panel value="attachment-test">
          <AttachmentTestPanel />
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}

function UsersTab({ users, openAdd, toggleActive, modalOpen, setModalOpen, form, setField, passwordValid, canSave, handleSave }) {
  return (
    <Box>
      <Group justify="space-between" mb={16}>
        <Text size="xs" c="dimmed">Not wired to a real domain yet</Text>
        <Button size="xs" leftSection={<IconPlus size={13} />} onClick={openAdd} style={{ background: "#0F2744", border: "none" }}>Add User</Button>
      </Group>

      <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, overflow: "hidden" }}>
        <Box p={16} style={{ overflowX: "auto" }}>
          <Table striped highlightOnHover withTableBorder withColumnBorders style={{ fontSize: 12, minWidth: 700 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Assigned Project</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th style={{ width: 90 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users.map((u) => (
                <Table.Tr key={u.id}>
                  <Table.Td style={{ fontWeight: 600 }}>{u.full_name}</Table.Td>
                  <Table.Td>{u.email}</Table.Td>
                  <Table.Td>
                    <Badge size="xs" color="gray">{u.role.toUpperCase()}</Badge>
                  </Table.Td>
                  <Table.Td>{u.project_name ?? "—"}</Table.Td>
                  <Table.Td>
                    <Badge size="xs" color={u.active ? "green" : "gray"} variant="light">{u.active ? "Active" : "Inactive"}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Button size="xs" variant="subtle" onClick={() => toggleActive(u)}>
                      {u.active ? "Deactivate" : "Activate"}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      </Box>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">Add User</Text>} size="sm">
        <TextInput label="Full Name" required value={form.full_name} onChange={(e) => setField("full_name", e.currentTarget.value)} mb={10} autoFocus />
        <TextInput label="Email" required type="email" value={form.email} onChange={(e) => setField("email", e.currentTarget.value)} mb={10} />
        <Select label="Role" required data={USER_ROLES} value={form.role} onChange={(v) => setField("role", v ?? "operator")} mb={10} />
        {!CROSS_PROJECT_ROLES.has(form.role) && (
          <Select label="Assigned Project" required data={LIVE_PROJECTS_PLACEHOLDER} value={form.project_name} onChange={(v) => setField("project_name", v)} mb={10} />
        )}
        <PasswordInput
          label="Temporary Password"
          required
          description="User will need to change this on first login"
          value={form.password}
          onChange={(e) => setField("password", e.currentTarget.value)}
          error={form.password && !passwordValid ? "Minimum 8 characters" : null}
          mb={16}
        />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" onClick={handleSave} disabled={!canSave} style={{ background: "#0F2744", border: "none" }}>Save</Button>
        </Group>
      </Modal>
    </Box>
  );
}
