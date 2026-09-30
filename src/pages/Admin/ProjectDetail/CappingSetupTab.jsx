import { useEffect, useState } from "react";
import { Box, Text, Group, Button, Modal, TextInput, Select, NumberInput, Switch, Stack, UnstyledButton } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useCrudModal } from "../../../hooks/ui/useCrudModal";
import { useDomainData } from "../../../hooks/core/useDomainData";
import { useAppConfig } from "../../../contexts/appConfigContext";
import {
  createDomainRecord, deleteDomainRecord, fetchFirstRecord, fetchRecordPage, fetchRecordsByField, likeFilter, updateDomainRecord,
} from "../../../data";
import LoadingSpinner from "../../../components/LoadingSpinner";
import SafeError from "../../../components/SafeError";
import PaginationBar from "../../../components/PaginationBar";
import ServerPagedSelect from "../../../components/ServerPagedSelect";

const UOM_OPTIONS = ["", "Tons", "CY", "Qty"];

const NAVY = "#0F2744";
const BORDER = "#D1DCE8";
const MUTED = "#5A7088";

const CAP_TABS = [
  { value: "layers", label: "Layers" },
  { value: "materials", label: "Materials" },
  { value: "components", label: "Components" },
  { value: "mappings", label: "Mappings & Goals" },
];

const MAPPING_TABS = [
  { value: "area-layer", label: "Areas → Layers" },
  { value: "layer-material", label: "Layers → Materials" },
  { value: "material-component", label: "Materials → Components" },
];

async function deleteWhere(appSlug, cascades, id) {
  for (const { domain, field } of cascades) {
    const rows = await fetchRecordsByField({ domain, appSlug, field, values: [id] });
    await Promise.all(rows.map((r) => deleteDomainRecord({ domain, system: "core", appSlug, recordId: r.id })));
  }
}

async function loadAreaPaths(appSlug, areas) {
  const byId = Object.fromEntries(areas.map((a) => [a.id, a]));
  let missing = areas.map((a) => a.parent_id).filter((id) => id && !byId[id]);
  while (missing.length) {
    const rows = await fetchRecordsByField({ domain: "jfb_project_areas", appSlug, values: missing });
    for (const r of rows) byId[r.id] = r;
    missing = [...new Set(rows.map((r) => r.parent_id).filter((id) => id && !byId[id]))];
  }
  return Object.fromEntries(areas.map((a) => {
    const parts = [];
    let current = a;
    while (current) {
      parts.unshift(current.name);
      current = current.parent_id ? byId[current.parent_id] : null;
    }
    return [a.id, parts.join(" → ")];
  }));
}

function childOptionsFetcher({ appSlug, projectId, childDomain, nameField, mapDomain, parentField, childField, parentId, currentChildId }) {
  return async ({ search, page, pageSize }) => {
    const nameFilter = likeFilter(search);
    const { rows, hasNext } = await fetchRecordPage({
      domain: childDomain, appSlug, page, pageSize, sortCol: "sort_order", sortDir: "asc",
      filters: { project_id: projectId, ...(nameFilter ? { [nameField]: nameFilter } : {}) },
    });
    const existing = parentId
      ? await fetchRecordsByField({ domain: mapDomain, appSlug, field: childField, values: rows.map((r) => r.id), filters: { [parentField]: parentId } })
      : [];
    const taken = new Set(existing.map((m) => m[childField]));
    return {
      items: rows.map((r) => {
        const isTaken = taken.has(r.id) && r.id !== currentChildId;
        return { value: r.id, label: r[nameField], disabled: isTaken, note: isTaken ? "already mapped" : null };
      }),
      hasNext,
    };
  };
}

function useMappingGroups({ project, parentDomain, mapDomain, parentField, childDomain, childField }) {
  const { config } = useAppConfig();
  const appSlug = config.appSlug;
  const parents = useDomainData({ domain: parentDomain, system: "core", projectId: project.id, paginate: true, sortCol: "sort_order", sortDir: "asc" });
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const parentIdsKey = parents.records.map((p) => p.id).join(",");
  const key = `${parentIdsKey}|${version}`;
  const [state, setState] = useState({ key: null, maps: [], children: [], error: null });
  const childKey = `${project.id}|${version}`;
  const [childExists, setChildExists] = useState({ key: null, exists: true });

  useEffect(() => {
    if (!parentIdsKey || !appSlug) return;
    let cancelled = false;
    (async () => {
      const maps = await fetchRecordsByField({ domain: mapDomain, appSlug, field: parentField, values: parentIdsKey.split(",") });
      const children = await fetchRecordsByField({ domain: childDomain, appSlug, values: maps.map((m) => m[childField]) });
      return { maps, children };
    })()
      .then(({ maps, children }) => { if (!cancelled) setState({ key, maps, children, error: null }); })
      .catch((err) => { if (!cancelled) setState({ key, maps: [], children: [], error: err.message }); });
    return () => { cancelled = true; };
  }, [appSlug, parentIdsKey, key, mapDomain, parentField, childDomain, childField]);

  useEffect(() => {
    if (!appSlug) return;
    let cancelled = false;
    fetchFirstRecord({ domain: childDomain, appSlug, filters: { project_id: project.id } })
      .then((row) => { if (!cancelled) setChildExists({ key: childKey, exists: !!row }); })
      .catch(() => { if (!cancelled) setChildExists({ key: childKey, exists: true }); });
    return () => { cancelled = true; };
  }, [appSlug, childDomain, project.id, childKey]);

  async function mutate(fn) {
    setSaving(true);
    try {
      await fn();
      setVersion((v) => v + 1);
    } finally {
      setSaving(false);
    }
  }

  return {
    appSlug,
    parents,
    maps: state.maps,
    childById: Object.fromEntries(state.children.map((c) => [c.id, c])),
    refreshing: !!parentIdsKey && state.key !== key,
    loading: parents.loading || (!!parentIdsKey && state.key === null),
    error: parents.error || state.error,
    hasParents: parents.records.length > 0 || parents.page > 1,
    hasChildren: childExists.exists,
    saving,
    onCreate: (payload) => mutate(() => createDomainRecord({ domain: mapDomain, system: "core", appSlug, recordData: { project_id: project.id, ...payload } })),
    onUpdate: (recordId, recordData) => mutate(() => updateDomainRecord({ domain: mapDomain, system: "core", appSlug, recordId, recordData })),
    onDelete: (recordId) => mutate(() => deleteDomainRecord({ domain: mapDomain, system: "core", appSlug, recordId })),
  };
}

function MappingPager({ parents, noun }) {
  return (
    <PaginationBar page={parents.page} pageSize={parents.pageSize} count={parents.records.length} total={parents.total} hasNext={parents.hasNext} onChange={parents.setPage} disabled={parents.pageLoading} noun={noun} />
  );
}

// Bid tonnage for a placement project paid by the ton. Summed across the
// project's active materials, these give the Realized To-Date report its goal
// and blended bid rate, and switch that report from CY to TON.
const MATERIAL_TONNAGE_FIELDS = [
  { column: "tons_goal", kind: "number", label: "Tons Goal", description: "Contract tons of this material. Leave blank on projects not paid by the ton." },
  { column: "tons_per_hour_goal", kind: "number", label: "Bid Rate (tons/GOH)", description: "Bid placement rate for this material." },
];

// Several layers can be paid as ONE line item on the capping production sheet.
// The layers stay separate everywhere else -- coverage, the .bkt split,
// per-layer hours and the placement chart -- because only the PAY figure is
// combined. A project opts in purely by giving a layer a Pay Group, so leaving
// these blank keeps the existing fixed row list.
const PAY_UNIT_OPTIONS = ["CY", "SY", "SF", "TON"];

const LAYER_PAY_FIELDS = [
  { column: "pay_group", kind: "text", label: "Pay Group", description: "Layers sharing this name are summed into one paid row. Blank = reported on its own." },
  { column: "pay_unit", kind: "select", options: PAY_UNIT_OPTIONS, label: "Pay Unit", description: "Unit that paid row is measured in. Required for the Pay Group to print." },
];

export default function CappingSetupTab({ project }) {
  const hasProject = !!project?.id;

  const [tab, setTab] = useState("layers");
  const [mappingsTab, setMappingsTab] = useState("area-layer");

  const { records: layerTypeRef, loading: layerTypesLoading, error: layerTypesError } =
    useDomainData({ domain: "jfb_layer_types", system: "core" });
  const { records: materialTypeRef, loading: materialTypesLoading, error: materialTypesError } =
    useDomainData({ domain: "jfb_material_types", system: "core" });
  const { records: componentTypeRef, loading: componentTypesLoading, error: componentTypesError } =
    useDomainData({ domain: "jfb_component_types", system: "core" });

  const loading = layerTypesLoading || materialTypesLoading || componentTypesLoading;
  const error = layerTypesError || materialTypesError || componentTypesError;

  return (
    <Box>
      {loading && <LoadingSpinner py={16} />}
      {!loading && <SafeError message={error} />}
      {!loading && !error && !hasProject && (
        <Text size="xs" c="dimmed" ta="center" py={16}>Select a project to manage its capping setup.</Text>
      )}

      {!loading && !error && hasProject && (
        <>
          <PillTabs tabs={CAP_TABS} value={tab} onChange={setTab} />

          {tab === "layers" && (
            <NamedTypeList
              key={`layers|${project.id}`}
              project={project}
              domain="jfb_project_layers"
              cascades={[{ domain: "jfb_project_area_layers", field: "layer_id" }, { domain: "jfb_project_layer_materials", field: "layer_id" }]}
              typeRef={layerTypeRef}
              nameField="layer_name"
              typeField="layer_type_id"
              reportNameField="layer_report_name"
              entityLabel="Layer"
              title="Layers"
              subtitle="The cap layers / lifts placed on this project (e.g. Lift 1–6, Armor)."
              icon="🧱"
              emptyText="No layers yet. Add the cap lifts/layers for this project."
              extraFields={LAYER_PAY_FIELDS}
            />
          )}
          {tab === "materials" && (
            <NamedTypeList
              key={`materials|${project.id}`}
              project={project}
              domain="jfb_project_materials"
              cascades={[{ domain: "jfb_project_layer_materials", field: "material_id" }, { domain: "jfb_project_material_components", field: "material_id" }]}
              typeRef={materialTypeRef}
              nameField="material_name"
              typeField="material_type_id"
              reportNameField="material_report_name"
              entityLabel="Material"
              title="Materials"
              subtitle="The materials placed (e.g. Sand, Gravel, Armor Rock, Amended Sand)."
              icon="⛏️"
              emptyText="No materials yet."
              extraFields={MATERIAL_TONNAGE_FIELDS}
            />
          )}
          {tab === "components" && (
            <ComponentsList key={`components|${project.id}`} project={project} typeRef={componentTypeRef} />
          )}
          {tab === "mappings" && (
            <Box>
              <SectionHeader
                title="Mappings & Goals"
                subtitle="Connect Areas → Layers (with goals + thickness), Layers → Materials, and Materials → Components. These drive the filtered dropdowns in the daily report."
              />
              <PillTabs tabs={MAPPING_TABS} value={mappingsTab} onChange={setMappingsTab} mt={4} />
              {mappingsTab === "area-layer" && <AreaLayerMappings key={project.id} project={project} />}
              {mappingsTab === "layer-material" && <LayerMaterialMappings key={project.id} project={project} />}
              {mappingsTab === "material-component" && <MaterialComponentMappings key={project.id} project={project} />}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

function PillTabs({ tabs, value, onChange, mt = 0 }) {
  return (
    <Group gap={6} mt={mt} mb={16}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <UnstyledButton
            key={t.value}
            onClick={() => onChange(t.value)}
            style={{
              padding: "7px 14px",
              background: active ? NAVY : "#fff",
              border: `1px solid ${active ? NAVY : BORDER}`,
              borderRadius: 7,
              fontSize: 12,
              fontWeight: active ? 700 : 600,
              color: active ? "#fff" : MUTED,
            }}
          >
            {t.label}
          </UnstyledButton>
        );
      })}
    </Group>
  );
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <Group justify="space-between" align="center" wrap="nowrap" mb={16}>
      <Box>
        <Text size="14px" fw={700} c={NAVY}>{title}</Text>
        <Text size="12px" c={MUTED} mt={2}>{subtitle}</Text>
      </Box>
      {action}
    </Group>
  );
}

function AddButton({ label, onClick }) {
  return (
    <Button size="xs" leftSection={<IconPlus size={12} />} onClick={onClick} style={{ background: NAVY, border: "none", flexShrink: 0 }}>
      {label}
    </Button>
  );
}

function EmptyState({ icon, text }) {
  return (
    <Box ta="center" py={40} px={20}>
      <Text size="32px" mb={10}>{icon}</Text>
      <Text size="13px" c={MUTED}>{text}</Text>
    </Box>
  );
}

function Chip({ children }) {
  return (
    <Text span size="10px" style={{ background: "#DBEAFE", color: "#1E40AF", padding: "2px 7px", borderRadius: 10, whiteSpace: "nowrap" }}>
      {children}
    </Text>
  );
}

function ListItem({ icon, name, chip, note, active, onToggle, onEdit, onDelete }) {
  return (
    <Group gap={8} wrap="nowrap" px={10} py={7} style={{ border: `1px solid ${BORDER}`, background: "#F8FAFC", borderRadius: 6 }}>
      <Text span size="12px">{icon}</Text>
      <Text span size="12px" fw={700}>{name}</Text>
      {chip && <Chip>{chip}</Chip>}
      {note && <Text span size="10px" c={MUTED}>{note}</Text>}
      <Box style={{ flex: 1 }} />
      <Button size="xs" variant="default" onClick={onEdit}>Edit</Button>
      <Button size="xs" variant="default" onClick={onDelete}>Delete</Button>
      <Switch size="md" color="#1B6B3A" checked={!!active} onChange={onToggle} />
    </Group>
  );
}

function MapGroup({ icon, title, extra, addLabel, onAdd, children }) {
  return (
    <Box mb={10} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
      <Group gap={8} wrap="nowrap" px={12} py={9} style={{ background: "#F0F4F8", borderBottom: `1px solid ${BORDER}` }}>
        <Text size="12px" fw={700} c={NAVY} style={{ flex: 1 }}>{icon} {title}</Text>
        {extra}
        <AddButton label={addLabel} onClick={onAdd} />
      </Group>
      {children}
    </Box>
  );
}

function MapRow({ icon, name, chip, note, isLast, onEdit, onRemove }) {
  return (
    <Group gap={8} wrap="nowrap" py={7} pr={12} pl={24} style={{ borderBottom: isLast ? "none" : "1px solid #EBF0F7" }}>
      <Text size="12px" fw={600} style={{ flex: 1 }}>{icon} {name}</Text>
      {chip && <Chip>{chip}</Chip>}
      {note && <Text span size="10px" c={MUTED}>{note}</Text>}
      <Button size="xs" variant="default" onClick={onEdit}>Edit</Button>
      <Button size="xs" variant="default" onClick={onRemove}>Remove</Button>
    </Group>
  );
}

function MapEmptyRow({ text }) {
  return (
    <Box py={7} pr={12} pl={24}>
      <Text size="12px" c={MUTED}>{text}</Text>
    </Box>
  );
}

function useProjectEntityList(project, domain, cascades) {
  const { config } = useAppConfig();
  const list = useDomainData({ domain, system: "core", projectId: project.id, paginate: true, sortCol: "sort_order", sortDir: "asc" });
  const knownCount = list.total ?? (list.page - 1) * list.pageSize + list.records.length;
  async function onDelete(id) {
    await deleteWhere(config.appSlug, cascades, id);
    await list.remove(id);
  }
  return {
    ...list,
    knownCount,
    saving: list.creating || list.updating,
    onCreate: (payload) => list.create({ project_id: project.id, ...payload }),
    onUpdate: list.update,
    onDelete,
  };
}

function EntityListStatus({ list }) {
  if (list.loading) return <LoadingSpinner py={16} />;
  return <SafeError message={list.error} />;
}

function NamedTypeList({ project, domain, cascades, typeRef, nameField, typeField, reportNameField, entityLabel, title, subtitle, icon, emptyText, extraFields = [] }) {
  const list = useProjectEntityList(project, domain, cascades);
  const { records: rows, saving, onCreate, onUpdate, onDelete } = list;
  const { modalOpen, setModalOpen, editRow, form, setFormField, openAdd, openEdit, save, remove, confirmModal } = useCrudModal({
    emptyForm: () => ({ name: "", type: typeRef[0]?.id ?? "", reportName: "", sortOrder: list.knownCount + 1,
                        ...Object.fromEntries(extraFields.map((f) => [f.column, ""])) }),
    toForm: (row) => ({ name: row[nameField], type: row[typeField], reportName: row[reportNameField] ?? "", sortOrder: row.sort_order,
                        ...Object.fromEntries(extraFields.map((f) => [f.column, row[f.column] ?? ""])) }),
    toPayload: (f, { editRow: er }) => {
      if (!f.name.trim()) return null;
      const payload = { [nameField]: f.name.trim(), [typeField]: f.type || null, [reportNameField]: f.reportName.trim() || null, sort_order: Number(f.sortOrder) || 0 };
      for (const extra of extraFields) {
        const raw = f[extra.column];
        if (raw === "" || raw == null) payload[extra.column] = null;
        else if (extra.kind === "number") payload[extra.column] = Number(raw);
        else payload[extra.column] = String(raw).trim() || null;
      }
      return er ? payload : { ...payload, active: true };
    },
    onCreate,
    onUpdate,
    onDelete,
    confirmMessage: (row) => `Delete "${row[nameField]}"? Any mappings that use it will also be removed.`,
  });

  const typeName = (id) => typeRef.find((t) => t.id === id)?.name ?? null;

  return (
    <Box>
      <SectionHeader title={title} subtitle={subtitle} action={<AddButton label={`Add ${entityLabel}`} onClick={() => openAdd()} />} />

      <EntityListStatus list={list} />
      {!list.loading && !list.error && (rows.length === 0 && list.page === 1 ? (
        <EmptyState icon={icon} text={emptyText} />
      ) : (
        <Stack gap={8} style={{ opacity: list.pageLoading ? 0.5 : 1 }}>
          {rows.map((r) => (
            <ListItem
              key={r.id}
              icon={icon}
              name={r[nameField]}
              chip={r[typeField] ? typeName(r[typeField]) : null}
              note={[
                r[reportNameField] ? `“${r[reportNameField]}”` : null,
                ...extraFields.map((f) => {
                  const v = r[f.column];
                  if (v == null || v === "") return null;
                  return f.kind === "number" ? `${f.label} ${Number(v).toLocaleString()}` : `${f.label} ${v}`;
                }),
              ].filter(Boolean).join(" · ") || null}
              active={r.active}
              onToggle={() => onUpdate(r.id, { active: !r.active })}
              onEdit={() => openEdit(r)}
              onDelete={() => remove(r)}
            />
          ))}
        </Stack>
      ))}
      {!list.loading && !list.error && <PaginationBar page={list.page} pageSize={list.pageSize} count={rows.length} total={list.total} hasNext={list.hasNext} onChange={list.setPage} disabled={list.pageLoading} noun={entityLabel.toLowerCase()} />}

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit" : "Add"} {entityLabel}</Text>} size="sm">
        <TextInput label={`${entityLabel} Name`} required value={form.name} onChange={(e) => setFormField("name", e.currentTarget.value)} mb={10} autoFocus />
        <Select label={`${entityLabel} Type`} data={typeRef.map((t) => ({ value: t.id, label: t.name }))} value={form.type} onChange={(v) => setFormField("type", v)} mb={10} />
        <NumberInput label="Sort Order" hideControls value={form.sortOrder} onChange={(v) => setFormField("sortOrder", v)} mb={10} />
        <TextInput label="Report Name (optional)" placeholder="Defaults to name above" value={form.reportName} onChange={(e) => setFormField("reportName", e.currentTarget.value)} mb={extraFields.length ? 10 : 16} />
        {extraFields.length > 0 && (
          <Group grow mb={16} align="flex-start">
            {extraFields.map((f) => {
              if (f.kind === "select") {
                return (
                  <Select
                    key={f.column}
                    label={f.label}
                    description={f.description}
                    data={f.options.map((o) => ({ value: o, label: o }))}
                    value={form[f.column] || null}
                    onChange={(v) => setFormField(f.column, v ?? "")}
                    clearable
                  />
                );
              }
              if (f.kind === "text") {
                return (
                  <TextInput
                    key={f.column}
                    label={f.label}
                    description={f.description}
                    value={form[f.column]}
                    onChange={(e) => setFormField(f.column, e.currentTarget.value)}
                  />
                );
              }
              return (
                <NumberInput
                  key={f.column}
                  label={f.label}
                  description={f.description}
                  hideControls
                  value={form[f.column]}
                  onChange={(v) => setFormField(f.column, v)}
                />
              );
            })}
          </Group>
        )}
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" loading={saving} onClick={save} disabled={!form.name.trim()} style={{ background: NAVY, border: "none" }}>Save</Button>
        </Group>
      </Modal>

      {confirmModal}
    </Box>
  );
}

function ComponentsList({ project, typeRef }) {
  const list = useProjectEntityList(project, "jfb_project_components", [{ domain: "jfb_project_material_components", field: "component_id" }]);
  const { records: rows, saving, onCreate, onUpdate, onDelete } = list;
  const { modalOpen, setModalOpen, editRow, form, setFormField, openAdd, openEdit, save, remove, confirmModal } = useCrudModal({
    emptyForm: () => ({ name: "", type: typeRef[0]?.id ?? "", reportName: "", reportUom: "", invUom: "", sortOrder: list.knownCount + 1 }),
    toForm: (row) => ({
      name: row.component_name,
      type: row.component_type_id,
      reportName: row.component_report_name ?? "",
      reportUom: row.component_report_uom ?? "",
      invUom: row.component_inventory_uom ?? "",
      sortOrder: row.sort_order,
    }),
    toPayload: (f, { editRow: er }) => {
      if (!f.name.trim()) return null;
      const payload = {
        component_name: f.name.trim(),
        component_type_id: f.type || null,
        component_report_name: f.reportName.trim() || null,
        component_report_uom: f.reportUom || null,
        component_inventory_uom: f.invUom || null,
        sort_order: Number(f.sortOrder) || 0,
      };
      return er ? payload : { ...payload, active: true };
    },
    onCreate,
    onUpdate,
    onDelete,
    confirmMessage: (row) => `Delete "${row.component_name}"? Any mappings that use it will also be removed.`,
  });

  const typeName = (id) => typeRef.find((t) => t.id === id)?.name ?? null;

  return (
    <Box>
      <SectionHeader
        title="Components"
        subtitle="Sub-materials tracked for inventory (e.g. Sand, Amendment). Used when a material is a blend."
        action={<AddButton label="Add Component" onClick={() => openAdd()} />}
      />

      <EntityListStatus list={list} />
      {!list.loading && !list.error && (rows.length === 0 && list.page === 1 ? (
        <EmptyState icon="🧪" text="No components yet. Only needed when a material is a blend (e.g. amended sand)." />
      ) : (
        <Stack gap={8} style={{ opacity: list.pageLoading ? 0.5 : 1 }}>
          {rows.map((r) => (
            <ListItem
              key={r.id}
              icon="🧪"
              name={r.component_name}
              chip={r.component_type_id ? typeName(r.component_type_id) : null}
              note={r.component_report_uom || null}
              active={r.active}
              onToggle={() => onUpdate(r.id, { active: !r.active })}
              onEdit={() => openEdit(r)}
              onDelete={() => remove(r)}
            />
          ))}
        </Stack>
      ))}
      {!list.loading && !list.error && <PaginationBar page={list.page} pageSize={list.pageSize} count={rows.length} total={list.total} hasNext={list.hasNext} onChange={list.setPage} disabled={list.pageLoading} noun="component" />}

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit" : "Add"} Component</Text>} size="sm">
        <TextInput label="Component Name" required value={form.name} onChange={(e) => setFormField("name", e.currentTarget.value)} mb={10} autoFocus />
        <Select label="Component Type" data={typeRef.map((t) => ({ value: t.id, label: t.name }))} value={form.type} onChange={(v) => setFormField("type", v)} mb={10} />
        <Group grow mb={10}>
          <Select label="Report UOM" data={UOM_OPTIONS} value={form.reportUom} onChange={(v) => setFormField("reportUom", v ?? "")} />
          <Select label="Inventory UOM" data={UOM_OPTIONS} value={form.invUom} onChange={(v) => setFormField("invUom", v ?? "")} />
        </Group>
        <NumberInput label="Sort Order" hideControls value={form.sortOrder} onChange={(v) => setFormField("sortOrder", v)} mb={10} />
        <TextInput label="Report Name (optional)" value={form.reportName} onChange={(e) => setFormField("reportName", e.currentTarget.value)} mb={16} />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" loading={saving} onClick={save} disabled={!form.name.trim()} style={{ background: NAVY, border: "none" }}>Save</Button>
        </Group>
      </Modal>

      {confirmModal}
    </Box>
  );
}

function AreaLayerMappings({ project }) {
  const groups = useMappingGroups({
    project, parentDomain: "jfb_project_areas", mapDomain: "jfb_project_area_layers", parentField: "area_id", childDomain: "jfb_project_layers", childField: "layer_id",
  });
  const { parents, maps: map, childById: layerById, saving, onCreate, onUpdate, onDelete } = groups;
  const areas = parents.records;
  const {
    modalOpen, setModalOpen, editRow, form, setFormField, context: areaId, openAdd, openEdit, save, remove, confirmModal,
  } = useCrudModal({
    emptyForm: () => ({ layerId: "", minThickness: "", targetThickness: "", overplacement: "", cyGoal: "", tonsGoal: "", sfGoal: "" }),
    toForm: (row) => ({
      layerId: row.layer_id,
      minThickness: row.min_design_thickness ?? "",
      targetThickness: row.target_thickness ?? "",
      overplacement: row.overplacement_tolerance ?? "",
      cyGoal: row.cy_goal ?? "",
      tonsGoal: row.tons_goal ?? "",
      sfGoal: row.sf_goal ?? "",
    }),
    contextFromRow: (row) => row.area_id,
    toPayload: (f, { editRow: er, context }) => {
      if (!f.layerId) return null;
      const num = (v) => (v === "" ? null : Number(v));
      const payload = {
        layer_id: f.layerId,
        min_design_thickness: num(f.minThickness),
        target_thickness: num(f.targetThickness),
        overplacement_tolerance: num(f.overplacement),
        cy_goal: num(f.cyGoal),
        tons_goal: num(f.tonsGoal),
        sf_goal: num(f.sfGoal),
      };
      return er ? payload : { area_id: context, ...payload };
    },
    onCreate,
    onUpdate,
    onDelete,
    confirmMessage: () => "Remove this layer from the area?",
  });
  const [pickedLabel, setPickedLabel] = useState(null);

  const areaIdsKey = JSON.stringify(areas.map((a) => ({ id: a.id, parent_id: a.parent_id ?? null, name: a.name })));
  const [paths, setPaths] = useState({ key: null, byId: {} });
  useEffect(() => {
    const pageAreas = JSON.parse(areaIdsKey);
    if (!pageAreas.length || !groups.appSlug) return;
    let cancelled = false;
    loadAreaPaths(groups.appSlug, pageAreas)
      .then((byId) => { if (!cancelled) setPaths({ key: areaIdsKey, byId }); })
      .catch(() => { if (!cancelled) setPaths({ key: areaIdsKey, byId: {} }); });
    return () => { cancelled = true; };
  }, [groups.appSlug, areaIdsKey]);
  const pathFor = (area) => (paths.key === areaIdsKey ? paths.byId[area.id] : null) ?? area.name;

  const fetchLayerOptions = childOptionsFetcher({
    appSlug: groups.appSlug, projectId: project.id, childDomain: "jfb_project_layers", nameField: "layer_name",
    mapDomain: "jfb_project_area_layers", parentField: "area_id", childField: "layer_id", parentId: areaId, currentChildId: editRow?.layer_id,
  });

  if (groups.loading) return <LoadingSpinner py={16} />;
  if (groups.error) return <SafeError message={groups.error} />;
  if (!groups.hasParents) return <EmptyState icon="📍" text="No areas yet — add areas on the Areas tab first." />;
  if (!groups.hasChildren) return <EmptyState icon="🧱" text="No layers yet — add layers first." />;

  return (
    <Box style={{ opacity: groups.refreshing || parents.pageLoading ? 0.5 : 1 }}>
      {areas.map((area) => {
        const rows = map.filter((m) => m.area_id === area.id);
        return (
          <MapGroup key={area.id} icon="📍" title={pathFor(area)} addLabel="Add Layer" onAdd={() => { setPickedLabel(null); openAdd(area.id); }}>
            {rows.length === 0 && <MapEmptyRow text="No layers mapped to this area yet." />}
            {rows.map((m, i) => {
              const goal = [
                m.cy_goal ? `${Number(m.cy_goal).toLocaleString()} CY` : null,
                m.tons_goal ? `${Number(m.tons_goal).toLocaleString()} Tons` : null,
                m.sf_goal ? `${Number(m.sf_goal).toLocaleString()} SF` : null,
              ].filter(Boolean).join(" · ");
              const thickness = [
                m.target_thickness ? `Tgt ${m.target_thickness}"` : null,
                m.min_design_thickness ? `Min ${m.min_design_thickness}"` : null,
                m.overplacement_tolerance ? `Over ${m.overplacement_tolerance}"` : null,
              ].filter(Boolean).join(" · ");
              return (
                <MapRow
                  key={m.id}
                  icon="🧱"
                  name={layerById[m.layer_id]?.layer_name ?? "?"}
                  chip={goal || null}
                  note={thickness || null}
                  isLast={i === rows.length - 1}
                  onEdit={() => { setPickedLabel(null); openEdit(m); }}
                  onRemove={() => remove(m)}
                />
              );
            })}
          </MapGroup>
        );
      })}
      <MappingPager parents={parents} noun="area" />

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit Area Layer" : "Add Layer to Area"}</Text>} size="sm">
        <ServerPagedSelect
          label="Layer"
          required
          noun="layer"
          nothingFoundMessage="No matching layers"
          fetchPage={fetchLayerOptions}
          reloadKey={`${areaId ?? ""}|${editRow?.id ?? ""}`}
          value={form.layerId || null}
          selectedLabel={pickedLabel ?? layerById[form.layerId]?.layer_name ?? null}
          onChange={(v, item) => { setFormField("layerId", v ?? ""); setPickedLabel(item?.label ?? null); }}
          mb={10}
        />
        <Group grow mb={10}>
          <NumberInput label='Min Thickness (in)' hideControls value={form.minThickness} onChange={(v) => setFormField("minThickness", v)} />
          <NumberInput label='Target Thickness (in)' hideControls value={form.targetThickness} onChange={(v) => setFormField("targetThickness", v)} />
          <NumberInput label='Overplacement (in)' hideControls value={form.overplacement} onChange={(v) => setFormField("overplacement", v)} />
        </Group>
        <Group grow mb={16}>
          <NumberInput label="CY Goal" hideControls value={form.cyGoal} onChange={(v) => setFormField("cyGoal", v)} />
          <NumberInput label="Tons Goal" hideControls value={form.tonsGoal} onChange={(v) => setFormField("tonsGoal", v)} />
          <NumberInput label="SF Goal" hideControls value={form.sfGoal} onChange={(v) => setFormField("sfGoal", v)} />
        </Group>
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" loading={saving} onClick={save} disabled={!form.layerId} style={{ background: NAVY, border: "none" }}>Save</Button>
        </Group>
      </Modal>

      {confirmModal}
    </Box>
  );
}

function LayerMaterialMappings({ project }) {
  const groups = useMappingGroups({
    project, parentDomain: "jfb_project_layers", mapDomain: "jfb_project_layer_materials", parentField: "layer_id", childDomain: "jfb_project_materials", childField: "material_id",
  });
  const { parents, maps: map, childById: materialById, saving, onCreate, onUpdate, onDelete } = groups;
  const layers = parents.records;
  const {
    modalOpen, setModalOpen, editRow, form, setFormField, context: layerId, openAdd, openEdit, save, remove, confirmModal,
  } = useCrudModal({
    emptyForm: () => ({ materialId: "", loadingRate: "", reportName: "" }),
    toForm: (row) => ({
      materialId: row.material_id,
      loadingRate: row.loading_rate ?? "",
      reportName: row.layer_material_report_name ?? "",
    }),
    contextFromRow: (row) => row.layer_id,
    toPayload: (f, { editRow: er, context }) => {
      if (!f.materialId) return null;
      const payload = {
        material_id: f.materialId,
        loading_rate: f.loadingRate === "" ? null : Number(f.loadingRate),
        layer_material_report_name: f.reportName.trim() || null,
      };
      return er ? payload : { layer_id: context, ...payload };
    },
    onCreate,
    onUpdate,
    onDelete,
    confirmMessage: () => "Remove this material from the layer?",
  });
  const [pickedLabel, setPickedLabel] = useState(null);

  const fetchMaterialOptions = childOptionsFetcher({
    appSlug: groups.appSlug, projectId: project.id, childDomain: "jfb_project_materials", nameField: "material_name",
    mapDomain: "jfb_project_layer_materials", parentField: "layer_id", childField: "material_id", parentId: layerId, currentChildId: editRow?.material_id,
  });

  if (groups.loading) return <LoadingSpinner py={16} />;
  if (groups.error) return <SafeError message={groups.error} />;
  if (!groups.hasParents) return <EmptyState icon="🧱" text="No layers yet." />;
  if (!groups.hasChildren) return <EmptyState icon="⛏️" text="No materials yet." />;

  return (
    <Box style={{ opacity: groups.refreshing || parents.pageLoading ? 0.5 : 1 }}>
      {layers.map((layer) => {
        const rows = map.filter((m) => m.layer_id === layer.id);
        return (
          <MapGroup key={layer.id} icon="🧱" title={layer.layer_name} addLabel="Add Material" onAdd={() => { setPickedLabel(null); openAdd(layer.id); }}>
            {rows.length === 0 && <MapEmptyRow text="No materials mapped to this layer yet." />}
            {rows.map((m, i) => (
              <MapRow
                key={m.id}
                icon="⛏️"
                name={materialById[m.material_id]?.material_name ?? "?"}
                chip={m.loading_rate ? `${m.loading_rate} t/hr` : null}
                note={m.layer_material_report_name ? `“${m.layer_material_report_name}”` : null}
                isLast={i === rows.length - 1}
                onEdit={() => { setPickedLabel(null); openEdit(m); }}
                onRemove={() => remove(m)}
              />
            ))}
          </MapGroup>
        );
      })}
      <MappingPager parents={parents} noun="layer" />

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit Layer Material" : "Add Material to Layer"}</Text>} size="sm">
        <ServerPagedSelect
          label="Material"
          required
          noun="material"
          nothingFoundMessage="No matching materials"
          fetchPage={fetchMaterialOptions}
          reloadKey={`${layerId ?? ""}|${editRow?.id ?? ""}`}
          value={form.materialId || null}
          selectedLabel={pickedLabel ?? materialById[form.materialId]?.material_name ?? null}
          onChange={(v, item) => { setFormField("materialId", v ?? ""); setPickedLabel(item?.label ?? null); }}
          mb={10}
        />
        <NumberInput label="Loading Rate (tons/hr, optional)" hideControls value={form.loadingRate} onChange={(v) => setFormField("loadingRate", v)} mb={10} />
        <TextInput label="Report Name Override (optional)" value={form.reportName} onChange={(e) => setFormField("reportName", e.currentTarget.value)} mb={16} />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" loading={saving} onClick={save} disabled={!form.materialId} style={{ background: NAVY, border: "none" }}>Save</Button>
        </Group>
      </Modal>

      {confirmModal}
    </Box>
  );
}

function MaterialComponentMappings({ project }) {
  const groups = useMappingGroups({
    project, parentDomain: "jfb_project_materials", mapDomain: "jfb_project_material_components", parentField: "material_id", childDomain: "jfb_project_components", childField: "component_id",
  });
  const { parents, maps: map, childById: componentById, saving, onCreate, onUpdate, onDelete } = groups;
  const materials = parents.records;
  const {
    modalOpen, setModalOpen, editRow, form, setFormField, context: materialId, openAdd, openEdit, save, remove, confirmModal,
  } = useCrudModal({
    emptyForm: () => ({ componentId: "", percent: "" }),
    toForm: (row) => ({
      componentId: row.component_id,
      percent: row.component_percent_of_material ?? "",
    }),
    contextFromRow: (row) => row.material_id,
    toPayload: (f, { editRow: er, context }) => {
      if (!f.componentId) return null;
      const payload = {
        component_id: f.componentId,
        component_percent_of_material: f.percent === "" ? null : Number(f.percent),
      };
      return er ? payload : { material_id: context, ...payload };
    },
    onCreate,
    onUpdate,
    onDelete,
    confirmMessage: () => "Remove this component from the material?",
  });
  const [pickedLabel, setPickedLabel] = useState(null);

  const fetchComponentOptions = childOptionsFetcher({
    appSlug: groups.appSlug, projectId: project.id, childDomain: "jfb_project_components", nameField: "component_name",
    mapDomain: "jfb_project_material_components", parentField: "material_id", childField: "component_id", parentId: materialId, currentChildId: editRow?.component_id,
  });

  if (groups.loading) return <LoadingSpinner py={16} />;
  if (groups.error) return <SafeError message={groups.error} />;
  if (!groups.hasParents) return <EmptyState icon="⛏️" text="No materials yet." />;
  if (!groups.hasChildren) return <EmptyState icon="🧪" text="No components yet. Add components first (only needed for blended materials)." />;

  return (
    <Box style={{ opacity: groups.refreshing || parents.pageLoading ? 0.5 : 1 }}>
      {materials.map((material) => {
        const rows = map.filter((m) => m.material_id === material.id);
        const sumPct = rows.reduce((sum, r) => sum + (Number(r.component_percent_of_material) || 0), 0);
        return (
          <MapGroup
            key={material.id}
            icon="⛏️"
            title={material.material_name}
            extra={rows.length > 0 && <Text span size="10px" c={Math.abs(sumPct - 100) < 0.01 ? "#1B6B3A" : MUTED}>Σ {sumPct}%</Text>}
            addLabel="Add Component"
            onAdd={() => { setPickedLabel(null); openAdd(material.id); }}
          >
            {rows.length === 0 && <MapEmptyRow text="No components — this material is placed as-is." />}
            {rows.map((m, i) => (
              <MapRow
                key={m.id}
                icon="🧪"
                name={componentById[m.component_id]?.component_name ?? "?"}
                chip={m.component_percent_of_material != null ? `${m.component_percent_of_material}%` : null}
                isLast={i === rows.length - 1}
                onEdit={() => { setPickedLabel(null); openEdit(m); }}
                onRemove={() => remove(m)}
              />
            ))}
          </MapGroup>
        );
      })}
      <MappingPager parents={parents} noun="material" />

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit Material Component" : "Add Component to Material"}</Text>} size="sm">
        <ServerPagedSelect
          label="Component"
          required
          noun="component"
          nothingFoundMessage="No matching components"
          fetchPage={fetchComponentOptions}
          reloadKey={`${materialId ?? ""}|${editRow?.id ?? ""}`}
          value={form.componentId || null}
          selectedLabel={pickedLabel ?? componentById[form.componentId]?.component_name ?? null}
          onChange={(v, item) => { setFormField("componentId", v ?? ""); setPickedLabel(item?.label ?? null); }}
          mb={10}
        />
        <NumberInput label="% of Material (optional)" hideControls min={0} max={100} value={form.percent} onChange={(v) => setFormField("percent", v)} mb={16} />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" loading={saving} onClick={save} disabled={!form.componentId} style={{ background: NAVY, border: "none" }}>Save</Button>
        </Group>
      </Modal>

      {confirmModal}
    </Box>
  );
}
