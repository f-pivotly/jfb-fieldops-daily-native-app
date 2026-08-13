import { useState } from "react";
import { Box, Text, Group, Button, Modal, TextInput, Select, Switch } from "@mantine/core";
import { IconPlus, IconList } from "@tabler/icons-react";
import {
  SAMPLE_PROJECT_DELAY_CODES,
  SAMPLE_DELAY_CODE_MASTER,
  DELAY_CODE_WORK_TYPES,
  DELAY_CODE_CATEGORY_ORDER,
} from "../../../data/adminProjectDetailSampleData";

function groupByCategory(list) {
  const groups = new Map();
  for (const item of list) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  const known = DELAY_CODE_CATEGORY_ORDER.filter((c) => groups.has(c));
  const unknown = [...groups.keys()].filter((c) => !DELAY_CODE_CATEGORY_ORDER.includes(c)).sort();
  return [...known, ...unknown].map((c) => [c, groups.get(c)]);
}

let syntheticCodeNum = 9900;
function nextCodeNum() {
  syntheticCodeNum += 1;
  return syntheticCodeNum;
}

export default function DelayCodesTab({ project }) {
  const [codes, setCodes] = useState(SAMPLE_PROJECT_DELAY_CODES);
  const [masterCodes, setMasterCodes] = useState(SAMPLE_DELAY_CODE_MASTER);
  const [phaseFilter, setPhaseFilter] = useState(null);
  const [masterOpen, setMasterOpen] = useState(false);
  const [masterFilter, setMasterFilter] = useState("all");
  const [customOpen, setCustomOpen] = useState(false);
  const [customTarget, setCustomTarget] = useState("project");
  const [customForm, setCustomForm] = useState({ category: "", newCategory: "", code: "", work_type: DELAY_CODE_WORK_TYPES[0] });

  const distinctWorkTypes = [...new Set(codes.map((c) => c.work_type).filter(Boolean))];
  const showPhaseBar = distinctWorkTypes.length > 1;
  const currentPhase = project?.work_type;

  const visibleCodes = phaseFilter
    ? codes.filter((c) => c.work_type === phaseFilter || c.work_type == null)
    : codes;

  const activeCount = visibleCodes.filter((c) => c.active).length;

  function bulkToggle(nextActive) {
    const ids = new Set(visibleCodes.map((c) => c.id));
    setCodes((prev) => prev.map((c) => (ids.has(c.id) ? { ...c, active: nextActive } : c)));
  }

  function toggleOne(row) {
    setCodes((prev) => prev.map((c) => (c.id === row.id ? { ...c, active: !c.active } : c)));
  }

  function openCustom(target) {
    setCustomTarget(target);
    setCustomForm({
      category: "",
      newCategory: "",
      code: "",
      work_type: (target === "master" && masterFilter !== "all" ? masterFilter : DELAY_CODE_WORK_TYPES[0]),
    });
    setCustomOpen(true);
  }

  function saveCustom() {
    const category = customForm.newCategory.trim() || customForm.category;
    if (!category || !customForm.code.trim()) return;
    if (customTarget === "project") {
      setCodes((prev) => [...prev, { id: `p-${Date.now()}`, work_type: null, category, code: customForm.code.trim(), code_num: nextCodeNum(), active: true }]);
    } else {
      setMasterCodes((prev) => [...prev, { id: `m-${Date.now()}`, work_type: customForm.work_type, category, code: customForm.code.trim(), code_num: nextCodeNum() }]);
    }
    setCustomOpen(false);
  }

  function deleteMasterCode(row) {
    if (!confirm(`Remove "${row.code}" from the master list? This will not affect existing project codes.`)) return;
    setMasterCodes((prev) => prev.filter((m) => m.id !== row.id));
  }

  const projectCategories = [...new Set(codes.map((c) => c.category))];
  const masterCategoriesForWorkType = [...new Set(masterCodes.filter((m) => m.work_type === customForm.work_type).map((m) => m.category))];
  const categoryOptions = customTarget === "project" ? projectCategories : masterCategoriesForWorkType;

  const masterFiltered = masterFilter === "all" ? masterCodes : masterCodes.filter((m) => m.work_type === masterFilter);
  const masterByWorkType = DELAY_CODE_WORK_TYPES
    .map((wt) => [wt, masterFiltered.filter((m) => m.work_type === wt)])
    .filter(([, items]) => items.length > 0);

  return (
    <Box>
      <Group justify="space-between" mb={12}>
        <Text fw={700} size="sm">Delay Codes</Text>
        <Group gap={8}>
          <Button size="xs" variant="default" leftSection={<IconList size={12} />} onClick={() => setMasterOpen(true)}>View Master List</Button>
          <Button size="xs" leftSection={<IconPlus size={12} />} onClick={() => openCustom("project")} style={{ background: "#0F2744", border: "none" }}>Add Custom Code</Button>
        </Group>
      </Group>

      {codes.length === 0 && (
        <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, padding: 20, textAlign: "center" }}>
          <Text size="xs" c="dimmed" mb={10}>No delay codes yet</Text>
          <Button size="xs" onClick={() => setCodes(SAMPLE_DELAY_CODE_MASTER.map((m) => ({ ...m, id: `p-${m.id}`, active: true })))} style={{ background: "#0F2744", border: "none" }}>
            Load Codes from Master List
          </Button>
        </Box>
      )}

      {codes.length > 0 && (
        <>
          {showPhaseBar && (
            <Group gap={6} mb={10}>
              <PhasePill label={`All ${codes.length}`} active={phaseFilter === null} onClick={() => setPhaseFilter(null)} />
              {distinctWorkTypes.map((wt) => (
                <PhasePill
                  key={wt}
                  label={`${wt} ${codes.filter((c) => c.work_type === wt).length}`}
                  active={phaseFilter === wt}
                  current={wt === currentPhase}
                  onClick={() => setPhaseFilter(wt)}
                />
              ))}
            </Group>
          )}

          <Group justify="space-between" mb={10}>
            <Text size="xs" c="dimmed">
              <strong>{activeCount}</strong> of {visibleCodes.length} codes active{phaseFilter ? ` for ${phaseFilter}` : ""}
            </Text>
            <Group gap={8}>
              <Button size="xs" variant="default" onClick={() => bulkToggle(true)}>Activate {phaseFilter ? "Shown" : "All"}</Button>
              <Button size="xs" variant="default" onClick={() => bulkToggle(false)}>Deactivate {phaseFilter ? "Shown" : "All"}</Button>
            </Group>
          </Group>

          {groupByCategory(visibleCodes).map(([category, items]) => (
            <Box key={category} mb={14}>
              <Text size="10px" fw={700} c="dimmed" mb={6} style={{ textTransform: "uppercase", letterSpacing: ".5px" }}>
                {category} — {items.filter((i) => i.active).length}/{items.length} active
              </Text>
              <Box style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                {items.map((c) => (
                  <Group key={c.id} justify="space-between" p={8} style={{ background: c.active ? "#e6f4ec" : "#f5f6f8", border: `1px solid ${c.active ? "#b7ddc4" : "#e7ecf5"}`, borderRadius: 6 }}>
                    <Text size="xs" fw={500}>{c.code} <Text component="span" c="dimmed" size="10px">#{c.code_num}</Text></Text>
                    <Switch size="xs" checked={c.active} onChange={() => toggleOne(c)} />
                  </Group>
                ))}
              </Box>
            </Box>
          ))}
        </>
      )}

      <Modal opened={masterOpen} onClose={() => setMasterOpen(false)} title={<Text fw={700} size="sm">Delay Code Master List</Text>} size="lg">
        <Group justify="space-between" mb={12}>
          <Select
            label="Filter by Work Type"
            data={[{ value: "all", label: "All" }, ...DELAY_CODE_WORK_TYPES.map((wt) => ({ value: wt, label: wt }))]}
            value={masterFilter}
            onChange={(v) => setMasterFilter(v ?? "all")}
            w={240}
          />
          <Button size="xs" mt={20} leftSection={<IconPlus size={12} />} onClick={() => openCustom("master")} style={{ background: "#0F2744", border: "none" }}>
            Add to Master List
          </Button>
        </Group>
        {masterByWorkType.map(([wt, items]) => (
          <Box key={wt} mb={14}>
            <Text size="xs" fw={700} mb={6}>{wt}</Text>
            {groupByCategory(items).map(([category, catItems]) => (
              <Box key={category} mb={8}>
                <Text size="10px" c="dimmed" mb={4} style={{ textTransform: "uppercase" }}>{category}</Text>
                <Group gap={6}>
                  {catItems.map((m) => (
                    <Group key={m.id} gap={6} p={6} style={{ background: "#f5f6f8", border: "1px solid #e7ecf5", borderRadius: 6 }}>
                      <Text size="xs">{m.code} <Text component="span" c="dimmed" size="10px">#{m.code_num}</Text></Text>
                      <Text size="10px" fw={700} c="#ef4444" onClick={() => deleteMasterCode(m)} style={{ cursor: "pointer" }}>Delete</Text>
                    </Group>
                  ))}
                </Group>
              </Box>
            ))}
          </Box>
        ))}
      </Modal>

      <Modal opened={customOpen} onClose={() => setCustomOpen(false)} title={<Text fw={700} size="sm">Add {customTarget === "master" ? "Master" : "Custom"} Code</Text>} size="sm">
        <Select
          label="Category"
          placeholder="Choose existing category"
          data={categoryOptions}
          value={customForm.category}
          onChange={(v) => setCustomForm((f) => ({ ...f, category: v ?? "", newCategory: "" }))}
          mb={8}
          clearable
        />
        <TextInput
          label="Or new category"
          value={customForm.newCategory}
          onChange={(e) => setCustomForm((f) => ({ ...f, newCategory: e.currentTarget.value, category: "" }))}
          mb={10}
        />
        <TextInput
          label="Code Name"
          required
          placeholder="e.g. Regulatory Hold, Ice Conditions"
          value={customForm.code}
          onChange={(e) => setCustomForm((f) => ({ ...f, code: e.currentTarget.value }))}
          mb={10}
        />
        {customTarget === "master" && (
          <Select
            label="Work Type"
            required
            data={DELAY_CODE_WORK_TYPES}
            value={customForm.work_type}
            onChange={(v) => setCustomForm((f) => ({ ...f, work_type: v ?? DELAY_CODE_WORK_TYPES[0] }))}
            mb={10}
          />
        )}
        <Group justify="flex-end" mt={10}>
          <Button variant="default" size="xs" onClick={() => setCustomOpen(false)}>Cancel</Button>
          <Button
            size="xs"
            onClick={saveCustom}
            disabled={!(customForm.category || customForm.newCategory.trim()) || !customForm.code.trim()}
            style={{ background: "#0F2744", border: "none" }}
          >
            Save
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}

function PhasePill({ label, active, current, onClick }) {
  return (
    <Box
      onClick={onClick}
      title={current ? "This project's current phase" : undefined}
      style={{
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 600,
        padding: "5px 10px",
        borderRadius: 20,
        background: active ? "#0F2744" : "#f5f6f8",
        color: active ? "#fff" : "#111827",
        border: `1px solid ${active ? "#0F2744" : "#e7ecf5"}`,
      }}
    >
      {current && "● "}{label}
    </Box>
  );
}
