import { useState } from "react";
import { Box, Text, Group, Button, Modal, TextInput, Select, Switch } from "@mantine/core";
import { IconPlus, IconList, IconRefresh } from "@tabler/icons-react";
import { useDomainData } from "../../../hooks/useDomainData";
import { useConfirmDialog } from "../../../hooks/useConfirmDialog";
import { useDelayCodes } from "../../../hooks/useDelayCodes";
import { useProjectDelayCodes } from "../../../hooks/useProjectDelayCodes";
import { useAppConfig } from "../../../contexts/appConfigContext";
import { useDomainAccess } from "../../../contexts/adminAccessContext";
import { createDomainRecord } from "../../../data";
import LoadingSpinner from "../../../components/LoadingSpinner";
import SafeError from "../../../components/SafeError";
import { nextReservedCodeNum } from "../../../constants/delayCodeReservedSlots";

const CATEGORY_ORDER = [
  "General",
  "Mechanical",
  "Movement",
  "Survey/Sample",
  "Booster/Land Plant",
  "Land Plant/Processing",
  "Barge/Material Transport",
  "Project Specific",
  "Operational Change",
  "Misc",
];

function groupByCategory(list) {
  const groups = new Map();
  for (const item of list) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  const known = CATEGORY_ORDER.filter((c) => groups.has(c));
  const unknown = [...groups.keys()].filter((c) => !CATEGORY_ORDER.includes(c)).sort();
  return [...known, ...unknown].map((c) => [c, groups.get(c)]);
}

export default function DelayCodesTab({ project }) {
  const hasProject = !!project?.id;
  const { config } = useAppConfig();
  const { confirm, modal: confirmModal } = useConfirmDialog();
  const { canCreate: canCreateMasterCode, canDelete: canDeleteMasterCode } = useDomainAccess("jfb_delay_codes");

  const { records: workTypeRecords } = useDomainData({ domain: "jfb_work_types", system: "core" });
  const {
    delayCodes: masterCodes,
    create: createMasterCode,
    remove: removeMasterCode,
  } = useDelayCodes();
  const {
    projectDelayCodes: projectCodeRecords,
    loading,
    error,
    creating,
    updating,
    reload,
    create,
    update,
  } = useProjectDelayCodes(project?.id);

  const [phaseFilter, setPhaseFilter] = useState(null);
  const [masterOpen, setMasterOpen] = useState(false);
  const [masterFilter, setMasterFilter] = useState("all");
  const [customOpen, setCustomOpen] = useState(false);
  const [customTarget, setCustomTarget] = useState("project");
  const [customForm, setCustomForm] = useState({ category: "", newCategory: "", code: "", work_type: "" });
  const [loadingMaster, setLoadingMaster] = useState(false);
  const [customError, setCustomError] = useState(null);

  const workTypeNameById = Object.fromEntries(workTypeRecords.map((w) => [w.id, w.name]));
  const workTypeIdByName = Object.fromEntries(workTypeRecords.map((w) => [w.name, w.id]));
  const workTypeNames = workTypeRecords.map((w) => w.name);
  const masterById = Object.fromEntries(masterCodes.map((m) => [m.id, m]));

  const codes = hasProject
    ? projectCodeRecords.map((row) => {
        const master = row.delay_code_id ? masterById[row.delay_code_id] : null;
        const workTypeId = master ? master.work_type_id : row.work_type_id;
        return {
          id: row.id,
          delay_code_id: row.delay_code_id,
          work_type: workTypeId ? workTypeNameById[workTypeId] ?? null : null,
          category: master ? master.category : row.category,
          code: master ? master.code : row.code,
          code_num: master ? master.code_num : row.code_num,
          active: !!row.active,
        };
      })
    : [];

  const distinctWorkTypes = [...new Set(codes.map((c) => c.work_type).filter(Boolean))];
  const showPhaseBar = distinctWorkTypes.length > 1;
  const currentPhase = project?.work_type;

  const visibleCodes = phaseFilter
    ? codes.filter((c) => c.work_type === phaseFilter || c.work_type == null)
    : codes;

  const activeCount = visibleCodes.filter((c) => c.active).length;

  async function bulkToggle(nextActive) {
    await Promise.all(visibleCodes.map((c) => update(c.id, { active: nextActive })));
  }

  async function toggleOne(row) {
    await update(row.id, { active: !row.active });
  }

  function openCustom(target) {
    setCustomTarget(target);
    setCustomForm({
      category: "",
      newCategory: "",
      code: "",
      work_type: target === "master" && masterFilter !== "all" ? masterFilter : workTypeNames[0] ?? "",
    });
    setCustomError(null);
    setCustomOpen(true);
  }

  async function saveCustom() {
    const category = effectiveCategory;
    if (!category || !customForm.code.trim()) return;
    setCustomError(null);
    if (customTarget === "project") {
      if (!hasProject) return;
      const workType = currentPhase;
      const usedCodeNums = new Set([
        ...masterCodes.filter((m) => workTypeNameById[m.work_type_id] === workType).map((m) => m.code_num),
        ...codes.filter((c) => c.work_type === workType).map((c) => c.code_num),
      ]);
      const codeNum = nextReservedCodeNum(workType, usedCodeNums);
      if (codeNum == null) {
        setCustomError(`No reserved code numbers left for "${workType}". Contact an admin to expand the range.`);
        return;
      }
      await create({
        project_id: project.id,
        delay_code_id: null,
        work_type_id: workTypeIdByName[workType] ?? null,
        category,
        code: customForm.code.trim(),
        code_num: codeNum,
        active: true,
      });
    } else {
      const usedCodeNums = new Set(
        masterCodes
          .filter((m) => workTypeNameById[m.work_type_id] === customForm.work_type)
          .map((m) => m.code_num)
      );
      const codeNum = nextReservedCodeNum(customForm.work_type, usedCodeNums);
      if (codeNum == null) {
        setCustomError(`No reserved code numbers left for "${customForm.work_type}". Contact an admin to expand the range.`);
        return;
      }
      await createMasterCode({
        work_type_id: workTypeIdByName[customForm.work_type] ?? null,
        category,
        code: customForm.code.trim(),
        code_num: codeNum,
        active: true,
      });
    }
    setCustomOpen(false);
  }

  async function deleteMasterCode(row) {
    if (!(await confirm(`Remove "${row.code}" from the master list? This will not affect existing project codes.`))) return;
    await removeMasterCode(row.id);
  }

  async function loadFromMaster() {
    if (!hasProject || !currentPhase) return;
    setLoadingMaster(true);
    try {
      const toLoad = masterCodes.filter(
        (m) => workTypeNameById[m.work_type_id] === currentPhase && m.active !== false
      );
      for (const m of toLoad) {
        await createDomainRecord({
          domain: "jfb_project_delay_codes",
          system: "core",
          appSlug: config.appSlug,
          recordData: { project_id: project.id, delay_code_id: m.id, active: true, sort_order: m.sort_order },
        });
      }
      await reload();
    } finally {
      setLoadingMaster(false);
    }
  }

  const projectCategories = [...new Set(codes.map((c) => c.category))];
  const masterCategoriesForWorkType = [
    ...new Set(
      masterCodes
        .filter((m) => workTypeNameById[m.work_type_id] === customForm.work_type)
        .map((m) => m.category)
    ),
  ];
  const categoryOptions = customTarget === "project" ? projectCategories : masterCategoriesForWorkType;
  const effectiveCategory = customForm.newCategory.trim() || customForm.category;

  const masterFiltered =
    masterFilter === "all" ? masterCodes : masterCodes.filter((m) => workTypeNameById[m.work_type_id] === masterFilter);
  const masterByWorkType = workTypeNames
    .map((wt) => [wt, masterFiltered.filter((m) => workTypeNameById[m.work_type_id] === wt)])
    .filter(([, items]) => items.length > 0);

  return (
    <Box>
      <Group justify="space-between" mb={12}>
        <Text fw={700} size="sm">Delay Codes</Text>
        <Group gap={8}>
          <Box onClick={reload} style={{ cursor: "pointer", color: "#aaa", display: "flex", alignItems: "center" }} title="Refresh">
            <IconRefresh size={14} />
          </Box>
          <Button size="xs" variant="default" leftSection={<IconList size={12} />} onClick={() => setMasterOpen(true)}>View Master List</Button>
          <Button
            size="xs"
            leftSection={<IconPlus size={12} />}
            onClick={() => openCustom("project")}
            disabled={!hasProject}
            title={hasProject ? undefined : "Select a project to manage its delay codes"}
            style={{ background: "#0F2744", border: "none" }}
          >
            Add Custom Code
          </Button>
        </Group>
      </Group>

      {loading && <LoadingSpinner py={24} />}
      {!loading && <SafeError message={error} />}

      {!loading && !error && !hasProject && (
        <Text size="xs" c="dimmed" ta="center" py={24}>
          Select a project to manage its delay codes.
        </Text>
      )}

      {!loading && !error && hasProject && codes.length === 0 && (
        <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, padding: 20, textAlign: "center" }}>
          <Text size="xs" c="dimmed" mb={10}>No delay codes yet</Text>
          <Button
            size="xs"
            loading={loadingMaster}
            disabled={!currentPhase}
            onClick={loadFromMaster}
            style={{ background: "#0F2744", border: "none" }}
          >
            Load {currentPhase ?? ""} Codes from Master List
          </Button>
        </Box>
      )}

      {!loading && !error && hasProject && codes.length > 0 && (
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
              <Button size="xs" variant="default" loading={updating} onClick={() => bulkToggle(true)}>Activate {phaseFilter ? "Shown" : "All"}</Button>
              <Button size="xs" variant="default" loading={updating} onClick={() => bulkToggle(false)}>Deactivate {phaseFilter ? "Shown" : "All"}</Button>
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
            data={[{ value: "all", label: "All" }, ...workTypeNames.map((wt) => ({ value: wt, label: wt }))]}
            value={masterFilter}
            onChange={(v) => setMasterFilter(v ?? "all")}
            w={240}
          />
          {canCreateMasterCode && (
            <Button size="xs" mt={20} leftSection={<IconPlus size={12} />} onClick={() => openCustom("master")} style={{ background: "#0F2744", border: "none" }}>
              Add to Master List
            </Button>
          )}
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
                      {canDeleteMasterCode && (
                        <Text size="10px" fw={700} c="#ef4444" onClick={() => deleteMasterCode(m)} style={{ cursor: "pointer" }}>Delete</Text>
                      )}
                    </Group>
                  ))}
                </Group>
              </Box>
            ))}
          </Box>
        ))}
      </Modal>

      <Modal opened={customOpen} onClose={() => setCustomOpen(false)} title={<Text fw={700} size="sm">Add {customTarget === "master" ? "Master" : "Custom"} Code</Text>} size="sm">
        <SafeError message={customError} mb={8} />
        <Select
          label="Category"
          placeholder="Choose existing category"
          data={categoryOptions}
          value={customForm.category}
          onChange={(v) => setCustomForm((f) => ({ ...f, category: v ?? "" }))}
          mb={8}
          clearable
        />
        <TextInput
          label="Or new category"
          value={customForm.newCategory}
          onChange={(e) => { const value = e.currentTarget.value; setCustomForm((f) => ({ ...f, newCategory: value })) }}
          mb={10}
        />
        <TextInput
          label="Code Name"
          required
          placeholder="e.g. Regulatory Hold, Ice Conditions"
          value={customForm.code}
          onChange={(e) => { const value = e.currentTarget.value; setCustomForm((f) => ({ ...f, code: value })) }}
          mb={10}
        />
        {customTarget === "master" && (
          <Select
            label="Work Type"
            required
            data={workTypeNames}
            value={customForm.work_type}
            onChange={(v) => setCustomForm((f) => ({ ...f, work_type: v ?? workTypeNames[0] ?? "" }))}
            mb={10}
          />
        )}
        <Group justify="flex-end" mt={10}>
          <Button variant="default" size="xs" onClick={() => setCustomOpen(false)}>Cancel</Button>
          <Button
            size="xs"
            loading={customTarget === "project" ? creating : false}
            onClick={saveCustom}
            disabled={!effectiveCategory || !customForm.code.trim()}
            style={{ background: "#0F2744", border: "none" }}
          >
            Save
          </Button>
        </Group>
      </Modal>

      {confirmModal}
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
