import { useEffect, useState } from "react";
import { Box, Text, Group, Button, Modal, TextInput, NumberInput, Textarea, Checkbox, Stack } from "@mantine/core";
import { IconPlus, IconFolder, IconRefresh } from "@tabler/icons-react";
import { useConfirmDialog } from "../../../hooks/ui/useConfirmDialog";
import { useAreaLevels } from "../../../hooks/project/useAreaLevels";
import { useDomainData } from "../../../hooks/core/useDomainData";
import { useAppConfig } from "../../../contexts/appConfigContext";
import { deleteDomainRecord, fetchRecordsByField, iterateDomainRecords } from "../../../data";
import LoadingSpinner from "../../../components/LoadingSpinner";
import SafeError from "../../../components/SafeError";
import PaginationBar from "../../../components/PaginationBar";

const DOMAIN = "jfb_project_areas";
const EMPTY_FORM = { name: "", volume_goal_cy: "", area_goal_sf: "", notes: "", sort_order: 0 };

async function loadDescendants(appSlug, rootIds, maxLevels) {
  const all = [];
  let parentIds = rootIds;
  for (let level = 0; level < maxLevels && parentIds.length; level++) {
    const rows = await fetchRecordsByField({ domain: DOMAIN, appSlug, field: "parent_id", values: parentIds });
    all.push(...rows);
    parentIds = rows.map((r) => r.id);
  }
  return all;
}

async function loadGoalTotals(appSlug, projectId) {
  let anyGoalSet = false;
  let sumCy = 0;
  for await (const rows of iterateDomainRecords({
    domain: DOMAIN, system: "core", appSlug, filters: { project_id: projectId },
    selectCols: ["volume_goal_cy", "area_goal_sf"], pageSize: 1000,
  })) {
    for (const a of rows) {
      if (a.volume_goal_cy || a.area_goal_sf) anyGoalSet = true;
      sumCy += Number(a.volume_goal_cy) || 0;
    }
  }
  return { anyGoalSet, sumCy };
}

export default function AreasTab({ project }) {
  const hasProject = !!project?.id;
  const { config } = useAppConfig();
  const { confirm, modal: confirmModal } = useConfirmDialog();
  const { areaLevels, loading: levelsLoading, error: levelsError } = useAreaLevels(project?.id);

  const levelByDepth = new Map(areaLevels.map((l) => [l.depth, l]));
  const depthByLevelId = new Map(areaLevels.map((l) => [l.id, l.depth]));
  const maxDepth = areaLevels.reduce((m, l) => Math.max(m, l.depth), 0);
  const l1 = levelByDepth.get(1);

  const {
    records: level1Records, loading: level1Loading, error: level1Error,
    creating, updating, reload: reloadLevel1, create, update,
    page, setPage, total, hasNext, pageLoading, pageSize,
  } = useDomainData({
    domain: l1 ? DOMAIN : null,
    system: "core",
    projectId: project?.id,
    filters: { area_level_id: l1?.id ?? null },
    paginate: true,
    sortCol: "sort_order",
    sortDir: "asc",
  });

  const [version, setVersion] = useState(0);
  const level1Ids = level1Records.map((a) => a.id).join(",");
  const treeKey = `${level1Ids}|${maxDepth}|${version}`;
  const [tree, setTree] = useState({ key: null, rows: [], error: null });
  const totalsKey = `${project?.id ?? ""}|${version}`;
  const [totals, setTotals] = useState({ key: null, anyGoalSet: false, sumCy: 0 });

  useEffect(() => {
    if (!level1Ids || !config.appSlug) return;
    let cancelled = false;
    loadDescendants(config.appSlug, level1Ids.split(","), Math.max(0, maxDepth - 1))
      .then((rows) => { if (!cancelled) setTree({ key: treeKey, rows, error: null }); })
      .catch((err) => { if (!cancelled) setTree({ key: treeKey, rows: [], error: err.message }); });
    return () => { cancelled = true; };
  }, [config.appSlug, level1Ids, maxDepth, treeKey]);

  useEffect(() => {
    if (!project?.id || !config.appSlug) return;
    let cancelled = false;
    loadGoalTotals(config.appSlug, project.id)
      .then((t) => { if (!cancelled) setTotals({ key: totalsKey, ...t }); })
      .catch(() => { if (!cancelled) setTotals({ key: totalsKey, anyGoalSet: false, sumCy: 0 }); });
    return () => { cancelled = true; };
  }, [config.appSlug, project?.id, totalsKey]);

  const descendants = level1Ids && tree.key === treeKey ? tree.rows : [];
  const areasWithDepth = [...level1Records, ...descendants].map((a) => ({ ...a, depth: depthByLevelId.get(a.area_level_id) ?? null }));

  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [parentContext, setParentContext] = useState({ parentId: null, depth: 1 });
  const [form, setForm] = useState(EMPTY_FORM);

  function labelFor(depth) {
    return levelByDepth.get(depth)?.label || `Level ${depth}`;
  }

  function reload() {
    reloadLevel1();
    setVersion((v) => v + 1);
  }

  function openAdd(parentId, depth) {
    setEditRow(null);
    setParentContext({ parentId, depth });
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setParentContext({ parentId: row.parent_id, depth: row.depth });
    setForm({
      name: row.name,
      volume_goal_cy: row.volume_goal_cy ?? "",
      area_goal_sf: row.area_goal_sf ?? "",
      notes: row.notes ?? "",
      sort_order: row.sort_order ?? 0,
    });
    setModalOpen(true);
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      volume_goal_cy: form.volume_goal_cy === "" ? null : Number(form.volume_goal_cy),
      area_goal_sf: form.area_goal_sf === "" ? null : Number(form.area_goal_sf),
      notes: form.notes.trim() || null,
      sort_order: Number(form.sort_order) || 0,
    };
    if (editRow) {
      await update(editRow.id, payload);
    } else {
      const level = levelByDepth.get(parentContext.depth);
      if (!level || !hasProject) return;
      await create({
        ...payload,
        project_id: project.id,
        parent_id: parentContext.parentId,
        area_level_id: level.id,
        is_active: true,
      });
    }
    setVersion((v) => v + 1);
    setModalOpen(false);
  }

  async function toggleActive(row) {
    await update(row.id, { is_active: !row.is_active });
    setVersion((v) => v + 1);
  }

  async function removeArea(row) {
    if (!(await confirm(`Delete "${row.name}"? This also removes its children.`))) return;
    const descendantRows = await loadDescendants(config.appSlug, [row.id], Math.max(1, maxDepth));
    for (const child of descendantRows.reverse()) {
      await deleteDomainRecord({ domain: DOMAIN, system: "core", appSlug: config.appSlug, recordId: child.id });
    }
    await deleteDomainRecord({ domain: DOMAIN, system: "core", appSlug: config.appSlug, recordId: row.id });
    reload();
  }

  const anyGoalSet = totals.key === totalsKey && totals.anyGoalSet;
  const sumCy = totals.key === totalsKey ? totals.sumCy : 0;
  const projectGoal = project?.volume_goal ? Number(project.volume_goal) : null;
  const reconciles = projectGoal != null && Math.abs(projectGoal - sumCy) <= 100;

  const loading = levelsLoading || (!!l1 && level1Loading);
  const error = levelsError || (l1 ? level1Error : null) || tree.error;

  return (
    <Box>
      <Group justify="space-between" mb={12}>
        <Text fw={700} size="sm">{l1 ? `${l1.label}s` : "Areas"}</Text>
        <Group gap={8}>
          <Box onClick={reload} style={{ cursor: "pointer", color: "#aaa", display: "flex", alignItems: "center" }} title="Refresh">
            <IconRefresh size={14} />
          </Box>
          <Button
            size="xs"
            leftSection={<IconPlus size={12} />}
            onClick={() => openAdd(null, 1)}
            disabled={!hasProject || !l1}
            title={!hasProject ? "Select a project" : !l1 ? "No area levels configured for this project yet" : undefined}
            style={{ background: "#0F2744", border: "none" }}
          >
            Add {l1 ? l1.label : "Area"}
          </Button>
        </Group>
      </Group>

      {loading && <LoadingSpinner py={16} />}
      {!loading && <SafeError message={error} />}

      {!loading && !error && !hasProject && (
        <Text size="xs" c="dimmed" ta="center" py={16}>Select a project to manage its areas.</Text>
      )}

      {!loading && !error && hasProject && !l1 && (
        <Text size="xs" c="dimmed" ta="center" py={16}>No area levels configured for this project yet.</Text>
      )}

      {!loading && !error && hasProject && l1 && (
        <>
          {anyGoalSet && (
            <Box mb={12} p={10} style={{ background: projectGoal == null ? "#f5f6f8" : reconciles ? "#e6f4ec" : "#fbe6e7", border: `1px solid ${projectGoal == null ? "#e7ecf5" : reconciles ? "#b7ddc4" : "#edb8bb"}`, borderRadius: 6 }}>
              <Group gap={20}>
                <Box>
                  <Text size="10px" c="dimmed" style={{ textTransform: "uppercase" }}>Project Goal</Text>
                  <Text size="sm" fw={700}>{projectGoal != null ? `${projectGoal.toLocaleString()} CY` : "—"}</Text>
                </Box>
                <Box>
                  <Text size="10px" c="dimmed" style={{ textTransform: "uppercase" }}>Sum of Area Goals</Text>
                  <Text size="sm" fw={700}>{sumCy.toLocaleString()} CY</Text>
                </Box>
                {projectGoal != null && (
                  <Text size="xs" fw={600} c={reconciles ? "#1e7a3d" : "#d32129"}>
                    {reconciles
                      ? "✓ Area goals match project goal"
                      : `⚠ Area goals don't sum to project goal (${Math.abs(projectGoal - sumCy).toLocaleString()} CY difference)`}
                  </Text>
                )}
              </Group>
            </Box>
          )}

          <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, padding: 12, overflow: "hidden" }}>
            {level1Records.length === 0 && page === 1 && (
              <Text size="xs" c="dimmed" ta="center" py={16}>No {l1.label.toLowerCase()}s yet</Text>
            )}
            <Stack gap={8} style={{ opacity: pageLoading ? 0.5 : 1 }}>
              {areasWithDepth.filter((a) => a.depth === 1).map((a1) => (
                <AreaNode
                  key={a1.id}
                  area={a1}
                  areas={areasWithDepth}
                  maxDepth={maxDepth}
                  labelFor={labelFor}
                  onAdd={openAdd}
                  onEdit={openEdit}
                  onToggle={toggleActive}
                  onRemove={removeArea}
                  renderDepth={0}
                />
              ))}
            </Stack>
            <PaginationBar page={page} pageSize={pageSize} count={level1Records.length} total={total} hasNext={hasNext} onChange={setPage} disabled={pageLoading} noun={l1.label.toLowerCase()} />
          </Box>
        </>
      )}

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit" : "Add"} {labelFor(parentContext.depth)}</Text>} size="sm">
        <TextInput label="Name" required value={form.name} onChange={(e) => setField("name", e.currentTarget.value)} mb={10} autoFocus />
        <Group grow mb={10}>
          <NumberInput label="Volume Goal (CY)" hideControls value={form.volume_goal_cy} onChange={(v) => setField("volume_goal_cy", v)} />
          <NumberInput label="Area Goal (SF)" hideControls value={form.area_goal_sf} onChange={(v) => setField("area_goal_sf", v)} />
        </Group>
        <Textarea label="Notes" value={form.notes} onChange={(e) => setField("notes", e.currentTarget.value)} mb={10} minRows={2} />
        <NumberInput label="Sort Order" hideControls value={form.sort_order} onChange={(v) => setField("sort_order", v)} mb={16} />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" loading={editRow ? updating : creating} onClick={handleSave} disabled={!form.name.trim()} style={{ background: "#0F2744", border: "none" }}>Save</Button>
        </Group>
      </Modal>

      {confirmModal}
    </Box>
  );
}

function AreaNode({ area, areas, maxDepth, labelFor, onAdd, onEdit, onToggle, onRemove, renderDepth }) {
  const canHaveChildren = area.depth != null && area.depth < maxDepth;
  const children = areas.filter((a) => a.parent_id === area.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const goalTag = area.volume_goal_cy || area.area_goal_sf
    ? [area.volume_goal_cy ? `${Number(area.volume_goal_cy).toLocaleString()} CY` : null, area.area_goal_sf ? `${Number(area.area_goal_sf).toLocaleString()} SF` : null].filter(Boolean).join(" · ")
    : null;

  return (
    <Box ml={renderDepth * 20}>
      <Group justify="space-between" p={8} style={{ background: renderDepth === 0 ? "#f5f6f8" : "#fff", border: "1px solid #ebebeb", borderRadius: 6, opacity: area.is_active ? 1 : 0.5 }}>
        <Group gap={8}>
          {renderDepth > 0 && <Text c="dimmed" size="xs">└</Text>}
          {renderDepth === 0 && <IconFolder size={14} color="#0F2744" />}
          <Text size="xs" fw={renderDepth === 0 ? 700 : 500}>{area.name}</Text>
          {goalTag && <Text size="10px" c="dimmed" style={{ background: "#eef2f8", padding: "1px 6px", borderRadius: 3 }}>{goalTag}</Text>}
        </Group>
        <Group gap={10} wrap="nowrap">
          {canHaveChildren && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={10} />}
              onClick={() => onAdd(area.id, area.depth + 1)}
            >
              {labelFor(area.depth + 1)}
            </Button>
          )}
          <Checkbox size="xs" label="Active" checked={!!area.is_active} onChange={() => onToggle(area)} />
          <Button size="xs" variant="subtle" onClick={() => onEdit(area)}>Edit</Button>
          <Button size="xs" variant="subtle" color="red" onClick={() => onRemove(area)}>Delete</Button>
        </Group>
      </Group>
      {children.length > 0 && (
        <Stack gap={8} mt={8}>
          {children.map((child) => (
            <AreaNode key={child.id} area={child} areas={areas} maxDepth={maxDepth} labelFor={labelFor} onAdd={onAdd} onEdit={onEdit} onToggle={onToggle} onRemove={onRemove} renderDepth={renderDepth + 1} />
          ))}
        </Stack>
      )}
    </Box>
  );
}
