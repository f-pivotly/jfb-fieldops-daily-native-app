import { useState } from "react";
import { Box, Text, Group, Button, Modal, TextInput, NumberInput, Textarea, Checkbox } from "@mantine/core";
import { IconPlus, IconTrash, IconFolder } from "@tabler/icons-react";
import { SAMPLE_AREAS } from "../../../data/adminProjectDetailSampleData";

const EMPTY_FORM = { name: "", volume_goal_cy: "", volume_goal_sf: "", notes: "", sort_order: 0 };

export default function AreasTab({ project }) {
  const [areas, setAreas] = useState(SAMPLE_AREAS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [parentContext, setParentContext] = useState({ parentId: null, level: 1 });
  const [form, setForm] = useState(EMPTY_FORM);

  const l1Label = project?.area_lvl1_label || "Area";
  const l2Label = project?.area_lvl2_label || "";
  const l3Label = project?.area_lvl3_label || "";

  function levelLabel(level) {
    return level === 1 ? l1Label : level === 2 ? l2Label || "Zone" : l3Label || "Cell";
  }

  function openAdd(parentId, level) {
    setEditRow(null);
    setParentContext({ parentId, level });
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setParentContext({ parentId: row.parent_id, level: row.level });
    setForm({
      name: row.name,
      volume_goal_cy: row.volume_goal_cy ?? "",
      volume_goal_sf: row.volume_goal_sf ?? "",
      notes: row.notes ?? "",
      sort_order: row.sort_order ?? 0,
    });
    setModalOpen(true);
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSave() {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      volume_goal_cy: form.volume_goal_cy === "" ? null : Number(form.volume_goal_cy),
      volume_goal_sf: form.volume_goal_sf === "" ? null : Number(form.volume_goal_sf),
      notes: form.notes.trim() || null,
      sort_order: Number(form.sort_order) || 0,
    };
    if (editRow) {
      setAreas((prev) => prev.map((a) => (a.id === editRow.id ? { ...a, ...payload } : a)));
    } else {
      setAreas((prev) => [
        ...prev,
        { id: `area-${Date.now()}`, level: parentContext.level, parent_id: parentContext.parentId, active: true, ...payload },
      ]);
    }
    setModalOpen(false);
  }

  function toggleActive(row) {
    setAreas((prev) => prev.map((a) => (a.id === row.id ? { ...a, active: !a.active } : a)));
  }

  function removeArea(row) {
    if (!confirm(`Delete "${row.name}"? This also removes its children.`)) return;
    setAreas((prev) => {
      const idsToRemove = new Set([row.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const a of prev) {
          if (a.parent_id && idsToRemove.has(a.parent_id) && !idsToRemove.has(a.id)) {
            idsToRemove.add(a.id);
            changed = true;
          }
        }
      }
      return prev.filter((a) => !idsToRemove.has(a.id));
    });
  }

  const level1Areas = areas.filter((a) => a.level === 1).sort((a, b) => a.sort_order - b.sort_order);
  const anyGoalSet = areas.some((a) => a.volume_goal_cy || a.volume_goal_sf);
  const sumCy = areas.reduce((sum, a) => sum + (a.volume_goal_cy || 0), 0);
  const projectGoal = project?.volume_goal ? Number(project.volume_goal) : null;
  const reconciles = projectGoal != null && Math.abs(projectGoal - sumCy) <= 100;

  return (
    <Box>
      <Group justify="space-between" mb={12}>
        <Text fw={700} size="sm">
          {l1Label}s
        </Text>
        <Button size="xs" leftSection={<IconPlus size={12} />} onClick={() => openAdd(null, 1)} style={{ background: "#0F2744", border: "none" }}>
          Add {l1Label}
        </Button>
      </Group>

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
                {reconciles ? "✓ Reconciles" : "⚠ Differs by more than 100 CY"}
              </Text>
            )}
          </Group>
        </Box>
      )}

      <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, padding: 12 }}>
        {level1Areas.length === 0 && (
          <Text size="xs" c="dimmed" ta="center" py={16}>No {l1Label.toLowerCase()}s yet</Text>
        )}
        {level1Areas.map((a1) => (
          <AreaNode
            key={a1.id}
            area={a1}
            areas={areas}
            l2Label={l2Label}
            l3Label={l3Label}
            onAdd={openAdd}
            onEdit={openEdit}
            onToggle={toggleActive}
            onRemove={removeArea}
            depth={0}
          />
        ))}
      </Box>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit" : "Add"} {levelLabel(parentContext.level)}</Text>} size="sm">
        <TextInput label="Name" required value={form.name} onChange={(e) => setField("name", e.currentTarget.value)} mb={10} autoFocus />
        <Group grow mb={10}>
          <NumberInput label="Volume Goal (CY)" hideControls value={form.volume_goal_cy} onChange={(v) => setField("volume_goal_cy", v)} />
          <NumberInput label="Area Goal (SF)" hideControls value={form.volume_goal_sf} onChange={(v) => setField("volume_goal_sf", v)} />
        </Group>
        <Textarea label="Notes" value={form.notes} onChange={(e) => setField("notes", e.currentTarget.value)} mb={10} minRows={2} />
        <NumberInput label="Sort Order" hideControls value={form.sort_order} onChange={(v) => setField("sort_order", v)} mb={16} />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" onClick={handleSave} disabled={!form.name.trim()} style={{ background: "#0F2744", border: "none" }}>Save</Button>
        </Group>
      </Modal>
    </Box>
  );
}

function AreaNode({ area, areas, l2Label, l3Label, onAdd, onEdit, onToggle, onRemove, depth }) {
  const canHaveChildren = (area.level === 1 && l2Label) || (area.level === 2 && l3Label);
  const children = areas.filter((a) => a.parent_id === area.id).sort((a, b) => a.sort_order - b.sort_order);
  const goalTag = area.volume_goal_cy || area.volume_goal_sf
    ? [area.volume_goal_cy ? `${Number(area.volume_goal_cy).toLocaleString()} CY` : null, area.volume_goal_sf ? `${Number(area.volume_goal_sf).toLocaleString()} SF` : null].filter(Boolean).join(" · ")
    : null;

  return (
    <Box mb={6} ml={depth * 20}>
      <Group justify="space-between" p={8} style={{ background: depth === 0 ? "#f5f6f8" : "#fff", border: "1px solid #ebebeb", borderRadius: 6, opacity: area.active ? 1 : 0.5 }}>
        <Group gap={8}>
          {depth > 0 && <Text c="dimmed" size="xs">└</Text>}
          {depth === 0 && <IconFolder size={14} color="#0F2744" />}
          <Text size="xs" fw={depth === 0 ? 700 : 500}>{area.name}</Text>
          {goalTag && <Text size="10px" c="dimmed" style={{ background: "#eef2f8", padding: "1px 6px", borderRadius: 3 }}>{goalTag}</Text>}
        </Group>
        <Group gap={10}>
          {canHaveChildren && (
            <Box onClick={() => onAdd(area.id, area.level + 1)} style={{ cursor: "pointer", fontSize: 11, color: "#0F2744", fontWeight: 600 }}>
              + {area.level === 1 ? l2Label : l3Label}
            </Box>
          )}
          <Checkbox size="xs" checked={area.active} onChange={() => onToggle(area)} title="Active" />
          <Button size="xs" variant="subtle" onClick={() => onEdit(area)}>Edit</Button>
          <Box onClick={() => onRemove(area)} style={{ cursor: "pointer", color: "#ef4444", display: "flex" }}><IconTrash size={12} /></Box>
        </Group>
      </Group>
      {children.map((child) => (
        <AreaNode key={child.id} area={child} areas={areas} l2Label={l2Label} l3Label={l3Label} onAdd={onAdd} onEdit={onEdit} onToggle={onToggle} onRemove={onRemove} depth={depth + 1} />
      ))}
    </Box>
  );
}
