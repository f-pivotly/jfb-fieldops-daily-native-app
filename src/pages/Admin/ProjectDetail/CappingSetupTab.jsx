import { useState } from "react";
import { Box, Text, Group, Button, Modal, TextInput, Select, NumberInput, Switch, Stack, UnstyledButton } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useCrudModal } from "../../../hooks/ui/useCrudModal";
import { useDomainData } from "../../../hooks/core/useDomainData";
import { useProjectAreas } from "../../../hooks/project/useProjectAreas";
import { useAreaLevels } from "../../../hooks/project/useAreaLevels";
import { useProjectLayers } from "../../../hooks/capping/useProjectLayers";
import { useProjectMaterials } from "../../../hooks/capping/useProjectMaterials";
import { useProjectComponents } from "../../../hooks/capping/useProjectComponents";
import { useProjectAreaLayers } from "../../../hooks/project/useProjectAreaLayers";
import { useProjectLayerMaterials } from "../../../hooks/capping/useProjectLayerMaterials";
import { useProjectMaterialComponents } from "../../../hooks/capping/useProjectMaterialComponents";
import LoadingSpinner from "../../../components/LoadingSpinner";
import SafeError from "../../../components/SafeError";

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

function areaPath(areaId, areas) {
  const byId = Object.fromEntries(areas.map((a) => [a.id, a]));
  const parts = [];
  let current = byId[areaId];
  while (current) {
    parts.unshift(current.name);
    current = current.parent_id ? byId[current.parent_id] : null;
  }
  return parts.join(" → ");
}

const bySortOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);

// Bid tonnage for a placement project paid by the ton. Summed across the
// project's active materials, these give the Realized To-Date report its goal
// and blended bid rate, and switch that report from CY to TON.
const MATERIAL_TONNAGE_FIELDS = [
  { column: "tons_goal", label: "Tons Goal", description: "Contract tons of this material. Leave blank on projects not paid by the ton." },
  { column: "tons_per_hour_goal", label: "Bid Rate (tons/GOH)", description: "Bid placement rate for this material." },
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

  const { areas, loading: areasLoading, error: areasError } = useProjectAreas(project?.id);
  const { areaLevels, loading: areaLevelsLoading, error: areaLevelsError } = useAreaLevels(project?.id);

  const {
    layers, loading: layersLoading, error: layersError,
    creating: creatingLayer, updating: updatingLayer,
    create: createLayer, update: updateLayer, remove: removeLayer,
  } = useProjectLayers(project?.id);

  const {
    materials, loading: materialsLoading, error: materialsError,
    creating: creatingMaterial, updating: updatingMaterial,
    create: createMaterial, update: updateMaterial, remove: removeMaterial,
  } = useProjectMaterials(project?.id);

  const {
    components, loading: componentsLoading, error: componentsError,
    creating: creatingComponent, updating: updatingComponent,
    create: createComponent, update: updateComponent, remove: removeComponent,
  } = useProjectComponents(project?.id);

  const {
    areaLayers, loading: areaLayersLoading, error: areaLayersError,
    creating: creatingAreaLayer, updating: updatingAreaLayer,
    create: createAreaLayer, update: updateAreaLayer, remove: removeAreaLayer,
  } = useProjectAreaLayers(project?.id);

  const {
    layerMaterials, loading: layerMaterialsLoading, error: layerMaterialsError,
    creating: creatingLayerMaterial, updating: updatingLayerMaterial,
    create: createLayerMaterial, update: updateLayerMaterial, remove: removeLayerMaterial,
  } = useProjectLayerMaterials(project?.id);

  const {
    materialComponents, loading: materialComponentsLoading, error: materialComponentsError,
    creating: creatingMaterialComponent, updating: updatingMaterialComponent,
    create: createMaterialComponent, update: updateMaterialComponent, remove: removeMaterialComponent,
  } = useProjectMaterialComponents(project?.id);

  const loading = layerTypesLoading || materialTypesLoading || componentTypesLoading || areasLoading || areaLevelsLoading ||
    layersLoading || materialsLoading || componentsLoading ||
    areaLayersLoading || layerMaterialsLoading || materialComponentsLoading;
  const error = layerTypesError || materialTypesError || componentTypesError || areasError || areaLevelsError ||
    layersError || materialsError || componentsError ||
    areaLayersError || layerMaterialsError || materialComponentsError;

  const sortedLayers = layers.slice().sort(bySortOrder);
  const sortedMaterials = materials.slice().sort(bySortOrder);
  const sortedComponents = components.slice().sort(bySortOrder);
  const depthByLevelId = Object.fromEntries(areaLevels.map((l) => [l.id, l.depth]));
  const sortedAreas = areas
    .slice()
    .sort((a, b) => (depthByLevelId[a.area_level_id] ?? 0) - (depthByLevelId[b.area_level_id] ?? 0) || bySortOrder(a, b));

  async function deleteLayerCascade(id) {
    await Promise.all([
      ...areaLayers.filter((r) => r.layer_id === id).map((r) => removeAreaLayer(r.id)),
      ...layerMaterials.filter((r) => r.layer_id === id).map((r) => removeLayerMaterial(r.id)),
    ]);
    await removeLayer(id);
  }

  async function deleteMaterialCascade(id) {
    await Promise.all([
      ...layerMaterials.filter((r) => r.material_id === id).map((r) => removeLayerMaterial(r.id)),
      ...materialComponents.filter((r) => r.material_id === id).map((r) => removeMaterialComponent(r.id)),
    ]);
    await removeMaterial(id);
  }

  async function deleteComponentCascade(id) {
    await Promise.all(
      materialComponents.filter((r) => r.component_id === id).map((r) => removeMaterialComponent(r.id))
    );
    await removeComponent(id);
  }

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
              rows={sortedLayers}
              typeRef={layerTypeRef}
              nameField="layer_name"
              typeField="layer_type_id"
              reportNameField="layer_report_name"
              entityLabel="Layer"
              title="Layers"
              subtitle="The cap layers / lifts placed on this project (e.g. Lift 1–6, Armor)."
              icon="🧱"
              emptyText="No layers yet. Add the cap lifts/layers for this project."
              saving={creatingLayer || updatingLayer}
              onCreate={(payload) => createLayer({ project_id: project.id, ...payload })}
              onUpdate={updateLayer}
              onDelete={deleteLayerCascade}
            />
          )}
          {tab === "materials" && (
            <NamedTypeList
              rows={sortedMaterials}
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
              saving={creatingMaterial || updatingMaterial}
              onCreate={(payload) => createMaterial({ project_id: project.id, ...payload })}
              onUpdate={updateMaterial}
              onDelete={deleteMaterialCascade}
            />
          )}
          {tab === "components" && (
            <ComponentsList
              rows={sortedComponents}
              typeRef={componentTypeRef}
              saving={creatingComponent || updatingComponent}
              onCreate={(payload) => createComponent({ project_id: project.id, ...payload })}
              onUpdate={updateComponent}
              onDelete={deleteComponentCascade}
            />
          )}
          {tab === "mappings" && (
            <Box>
              <SectionHeader
                title="Mappings & Goals"
                subtitle="Connect Areas → Layers (with goals + thickness), Layers → Materials, and Materials → Components. These drive the filtered dropdowns in the daily report."
              />
              <PillTabs tabs={MAPPING_TABS} value={mappingsTab} onChange={setMappingsTab} mt={4} />
              {mappingsTab === "area-layer" && (
                <AreaLayerMappings
                  areas={sortedAreas}
                  layers={sortedLayers}
                  map={areaLayers}
                  saving={creatingAreaLayer || updatingAreaLayer}
                  onCreate={(payload) => createAreaLayer({ project_id: project.id, ...payload })}
                  onUpdate={updateAreaLayer}
                  onDelete={removeAreaLayer}
                />
              )}
              {mappingsTab === "layer-material" && (
                <LayerMaterialMappings
                  layers={sortedLayers}
                  materials={sortedMaterials}
                  map={layerMaterials}
                  saving={creatingLayerMaterial || updatingLayerMaterial}
                  onCreate={(payload) => createLayerMaterial({ project_id: project.id, ...payload })}
                  onUpdate={updateLayerMaterial}
                  onDelete={removeLayerMaterial}
                />
              )}
              {mappingsTab === "material-component" && (
                <MaterialComponentMappings
                  materials={sortedMaterials}
                  components={sortedComponents}
                  map={materialComponents}
                  saving={creatingMaterialComponent || updatingMaterialComponent}
                  onCreate={(payload) => createMaterialComponent({ project_id: project.id, ...payload })}
                  onUpdate={updateMaterialComponent}
                  onDelete={removeMaterialComponent}
                />
              )}
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

function NamedTypeList({ rows, typeRef, nameField, typeField, reportNameField, entityLabel, title, subtitle, icon, emptyText, extraFields = [], saving, onCreate, onUpdate, onDelete }) {
  const { modalOpen, setModalOpen, editRow, form, setFormField, openAdd, openEdit, save, remove, confirmModal } = useCrudModal({
    emptyForm: () => ({ name: "", type: typeRef[0]?.id ?? "", reportName: "", sortOrder: rows.length + 1,
                        ...Object.fromEntries(extraFields.map((f) => [f.column, ""])) }),
    toForm: (row) => ({ name: row[nameField], type: row[typeField], reportName: row[reportNameField] ?? "", sortOrder: row.sort_order,
                        ...Object.fromEntries(extraFields.map((f) => [f.column, row[f.column] ?? ""])) }),
    toPayload: (f, { editRow: er }) => {
      if (!f.name.trim()) return null;
      const payload = { [nameField]: f.name.trim(), [typeField]: f.type || null, [reportNameField]: f.reportName.trim() || null, sort_order: Number(f.sortOrder) || 0 };
      for (const extra of extraFields) payload[extra.column] = f[extra.column] === "" ? null : Number(f[extra.column]);
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

      {rows.length === 0 ? (
        <EmptyState icon={icon} text={emptyText} />
      ) : (
        <Stack gap={8}>
          {rows.map((r) => (
            <ListItem
              key={r.id}
              icon={icon}
              name={r[nameField]}
              chip={r[typeField] ? typeName(r[typeField]) : null}
              note={[
                r[reportNameField] ? `“${r[reportNameField]}”` : null,
                ...extraFields.map((f) => (r[f.column] != null ? `${f.label} ${Number(r[f.column]).toLocaleString()}` : null)),
              ].filter(Boolean).join(" · ") || null}
              active={r.active}
              onToggle={() => onUpdate(r.id, { active: !r.active })}
              onEdit={() => openEdit(r)}
              onDelete={() => remove(r)}
            />
          ))}
        </Stack>
      )}

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit" : "Add"} {entityLabel}</Text>} size="sm">
        <TextInput label={`${entityLabel} Name`} required value={form.name} onChange={(e) => setFormField("name", e.currentTarget.value)} mb={10} autoFocus />
        <Select label={`${entityLabel} Type`} data={typeRef.map((t) => ({ value: t.id, label: t.name }))} value={form.type} onChange={(v) => setFormField("type", v)} mb={10} />
        <NumberInput label="Sort Order" hideControls value={form.sortOrder} onChange={(v) => setFormField("sortOrder", v)} mb={10} />
        <TextInput label="Report Name (optional)" placeholder="Defaults to name above" value={form.reportName} onChange={(e) => setFormField("reportName", e.currentTarget.value)} mb={extraFields.length ? 10 : 16} />
        {extraFields.length > 0 && (
          <Group grow mb={16} align="flex-start">
            {extraFields.map((f) => (
              <NumberInput
                key={f.column}
                label={f.label}
                description={f.description}
                hideControls
                value={form[f.column]}
                onChange={(v) => setFormField(f.column, v)}
              />
            ))}
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

function ComponentsList({ rows, typeRef, saving, onCreate, onUpdate, onDelete }) {
  const { modalOpen, setModalOpen, editRow, form, setFormField, openAdd, openEdit, save, remove, confirmModal } = useCrudModal({
    emptyForm: () => ({ name: "", type: typeRef[0]?.id ?? "", reportName: "", reportUom: "", invUom: "", sortOrder: rows.length + 1 }),
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

      {rows.length === 0 ? (
        <EmptyState icon="🧪" text="No components yet. Only needed when a material is a blend (e.g. amended sand)." />
      ) : (
        <Stack gap={8}>
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
      )}

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

function AreaLayerMappings({ areas, layers, map, saving, onCreate, onUpdate, onDelete }) {
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

  const layerById = Object.fromEntries(layers.map((l) => [l.id, l]));

  const availableLayers = (id, excludeRowId) => layers.filter((l) => !map.some((m) => m.area_id === id && m.layer_id === l.id && m.id !== excludeRowId));

  if (areas.length === 0) return <EmptyState icon="📍" text="No areas yet — add areas on the Areas tab first." />;
  if (layers.length === 0) return <EmptyState icon="🧱" text="No layers yet — add layers first." />;

  return (
    <Box>
      {areas.map((area) => {
        const rows = map.filter((m) => m.area_id === area.id);
        return (
          <MapGroup key={area.id} icon="📍" title={areaPath(area.id, areas)} addLabel="Add Layer" onAdd={() => openAdd(area.id)}>
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
                  onEdit={() => openEdit(m)}
                  onRemove={() => remove(m)}
                />
              );
            })}
          </MapGroup>
        );
      })}

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit Area Layer" : "Add Layer to Area"}</Text>} size="sm">
        <Select label="Layer" required data={availableLayers(areaId, editRow?.id).map((l) => ({ value: l.id, label: l.layer_name }))} value={form.layerId} onChange={(v) => setFormField("layerId", v ?? "")} mb={10} />
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

function LayerMaterialMappings({ layers, materials, map, saving, onCreate, onUpdate, onDelete }) {
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
  const materialById = Object.fromEntries(materials.map((m) => [m.id, m]));

  const availableMaterials = (id, excludeRowId) => materials.filter((m) => !map.some((x) => x.layer_id === id && x.material_id === m.id && x.id !== excludeRowId));

  if (layers.length === 0) return <EmptyState icon="🧱" text="No layers yet." />;
  if (materials.length === 0) return <EmptyState icon="⛏️" text="No materials yet." />;

  return (
    <Box>
      {layers.map((layer) => {
        const rows = map.filter((m) => m.layer_id === layer.id);
        return (
          <MapGroup key={layer.id} icon="🧱" title={layer.layer_name} addLabel="Add Material" onAdd={() => openAdd(layer.id)}>
            {rows.length === 0 && <MapEmptyRow text="No materials mapped to this layer yet." />}
            {rows.map((m, i) => (
              <MapRow
                key={m.id}
                icon="⛏️"
                name={materialById[m.material_id]?.material_name ?? "?"}
                chip={m.loading_rate ? `${m.loading_rate} t/hr` : null}
                note={m.layer_material_report_name ? `“${m.layer_material_report_name}”` : null}
                isLast={i === rows.length - 1}
                onEdit={() => openEdit(m)}
                onRemove={() => remove(m)}
              />
            ))}
          </MapGroup>
        );
      })}

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit Layer Material" : "Add Material to Layer"}</Text>} size="sm">
        <Select label="Material" required data={availableMaterials(layerId, editRow?.id).map((m) => ({ value: m.id, label: m.material_name }))} value={form.materialId} onChange={(v) => setFormField("materialId", v ?? "")} mb={10} />
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

function MaterialComponentMappings({ materials, components, map, saving, onCreate, onUpdate, onDelete }) {
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
  const componentById = Object.fromEntries(components.map((c) => [c.id, c]));

  const availableComponents = (id, excludeRowId) => components.filter((c) => !map.some((x) => x.material_id === id && x.component_id === c.id && x.id !== excludeRowId));

  if (materials.length === 0) return <EmptyState icon="⛏️" text="No materials yet." />;
  if (components.length === 0) return <EmptyState icon="🧪" text="No components yet. Add components first (only needed for blended materials)." />;

  return (
    <Box>
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
            onAdd={() => openAdd(material.id)}
          >
            {rows.length === 0 && <MapEmptyRow text="No components — this material is placed as-is." />}
            {rows.map((m, i) => (
              <MapRow
                key={m.id}
                icon="🧪"
                name={componentById[m.component_id]?.component_name ?? "?"}
                chip={m.component_percent_of_material != null ? `${m.component_percent_of_material}%` : null}
                isLast={i === rows.length - 1}
                onEdit={() => openEdit(m)}
                onRemove={() => remove(m)}
              />
            ))}
          </MapGroup>
        );
      })}

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit Material Component" : "Add Component to Material"}</Text>} size="sm">
        <Select label="Component" required data={availableComponents(materialId, editRow?.id).map((c) => ({ value: c.id, label: c.component_name }))} value={form.componentId} onChange={(v) => setFormField("componentId", v ?? "")} mb={10} />
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
