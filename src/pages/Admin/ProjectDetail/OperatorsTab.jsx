import { useEffect, useState } from "react";
import { Box, Text, Group, Button, Modal, TextInput, Checkbox, Avatar, SegmentedControl } from "@mantine/core";
import { IconPlus, IconRefresh } from "@tabler/icons-react";
import { useDomainData } from "../../../hooks/core/useDomainData";
import { useConfirmDialog } from "../../../hooks/ui/useConfirmDialog";
import { useDomainAccess } from "../../../contexts/adminAccessContext";
import { useAppConfig } from "../../../contexts/appConfigContext";
import { createDomainRecord, fetchRecordPage, fetchRecordsByField, likeFilter, readWrittenRecordId } from "../../../data";
import PaginationBar from "../../../components/PaginationBar";
import ServerPagedSelect from "../../../components/ServerPagedSelect";

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

  const { config } = useAppConfig();
  const [creatingOperator, setCreatingOperator] = useState(false);

  const {
    records: links,
    loading: linksLoading,
    error: linksError,
    creating: linking,
    updating,
    reload,
    create: createLink,
    update: updateLink,
    remove: removeLink,
    page, setPage, total, hasNext, pageLoading, pageSize,
  } = useDomainData({ domain: "jfb_project_operators", system: "core", projectId: project?.id, paginate: true });

  const operatorIdsKey = links.map((l) => l.operator_id).join(",");
  const [operatorsState, setOperatorsState] = useState({ key: null, rows: [], error: null });

  useEffect(() => {
    if (!operatorIdsKey || !config.appSlug) return;
    let cancelled = false;
    fetchRecordsByField({ domain: "jfb_operators", appSlug: config.appSlug, values: operatorIdsKey.split(",") })
      .then((rows) => { if (!cancelled) setOperatorsState({ key: operatorIdsKey, rows, error: null }); })
      .catch((err) => { if (!cancelled) setOperatorsState({ key: operatorIdsKey, rows: [], error: err.message }); });
    return () => { cancelled = true; };
  }, [config.appSlug, operatorIdsKey]);

  const operatorsReady = !operatorIdsKey || operatorsState.key === operatorIdsKey;
  const operatorsById = new Map((operatorsReady ? operatorsState.rows : []).map((o) => [o.id, o]));
  const visibleRows = hasProject
    ? links.map((link) => ({ link, operator: operatorsById.get(link.operator_id) })).filter((r) => r.operator)
    : [];
  const loading = linksLoading || !operatorsReady;
  const error = linksError || (operatorIdsKey ? operatorsState.error : null);

  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState("existing");
  const [newOperator, setNewOperator] = useState(EMPTY_NEW_OPERATOR);
  const [existingOperatorId, setExistingOperatorId] = useState(null);
  const [existingOperatorLabel, setExistingOperatorLabel] = useState(null);

  function openModal() {
    setMode("existing");
    setNewOperator(EMPTY_NEW_OPERATOR);
    setExistingOperatorId(null);
    setExistingOperatorLabel(null);
    setModalOpen(true);
  }

  async function fetchOperatorOptions({ search, page: optionPage, pageSize: optionPageSize }) {
    const nameFilter = likeFilter(search);
    const { rows, hasNext: optionsHasNext } = await fetchRecordPage({
      domain: "jfb_operators", appSlug: config.appSlug, page: optionPage, pageSize: optionPageSize,
      filters: nameFilter ? { name: nameFilter } : undefined, sortCol: "name", sortDir: "asc",
    });
    const existingLinks = await fetchRecordsByField({
      domain: "jfb_project_operators", appSlug: config.appSlug, field: "operator_id",
      values: rows.map((o) => o.id), filters: { project_id: project.id },
    });
    const linkedIds = new Set(existingLinks.filter((l) => l.is_active !== false).map((l) => l.operator_id));
    return {
      items: rows.map((o) => ({ value: o.id, label: o.name, disabled: linkedIds.has(o.id), note: linkedIds.has(o.id) ? "already on project" : null })),
      hasNext: optionsHasNext,
    };
  }

  async function handleAddExisting() {
    if (!existingOperatorId || !hasProject) return;
    await createLink({ project_id: project.id, operator_id: existingOperatorId, is_active: true });
    setModalOpen(false);
  }

  async function handleAddNew() {
    if (!newOperator.name.trim() || !hasProject) return;
    setCreatingOperator(true);
    let res;
    try {
      res = await createDomainRecord({ domain: "jfb_operators", system: "core", appSlug: config.appSlug, recordData: { name: newOperator.name.trim(), email: newOperator.email.trim() || null } });
    } finally {
      setCreatingOperator(false);
    }
    const operatorId = readWrittenRecordId(res);
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
        {!loading && !error && hasProject && links.length === 0 && page === 1 && (
          <Text size="xs" c="dimmed" ta="center" py={16}>No operators assigned yet</Text>
        )}
        {!loading && !error && visibleRows.map(({ link, operator }) => (
          <Group key={link.id} justify="space-between" p={8} mb={6} style={{ background: "#f5f6f8", border: "1px solid #ebebeb", borderRadius: 6, opacity: link.is_active === false || pageLoading ? 0.5 : 1 }}>
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
        {!loading && !error && <PaginationBar page={page} pageSize={pageSize} count={links.length} total={total} hasNext={hasNext} onChange={setPage} disabled={pageLoading} noun="operator" />}
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
            <ServerPagedSelect
              label="Operator"
              placeholder="Search or choose an operator"
              fetchPage={fetchOperatorOptions}
              reloadKey={project?.id ?? ""}
              value={existingOperatorId}
              selectedLabel={existingOperatorLabel}
              onChange={(v, item) => {
                setExistingOperatorId(v);
                setExistingOperatorLabel(item?.label ?? null);
              }}
              nothingFoundMessage="No matching operators"
              noun="operator"
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
