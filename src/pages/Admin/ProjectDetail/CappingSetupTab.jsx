import { useState } from "react";
import { Box, Text, Group, Button, Table, Tabs, Modal, TextInput, Select, NumberInput, Switch } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useConfirmDialog } from "../../../hooks/useConfirmDialog";
import { useDomainData } from "../../../hooks/useDomainData";
import { useProjectAreas } from "../../../hooks/useProjectAreas";
import { useProjectLayers } from "../../../hooks/useProjectLayers";
import { useProjectMaterials } from "../../../hooks/useProjectMaterials";
import { useProjectComponents } from "../../../hooks/useProjectComponents";
import { useProjectAreaLayers } from "../../../hooks/useProjectAreaLayers";
import { useProjectLayerMaterials } from "../../../hooks/useProjectLayerMaterials";
import { useProjectMaterialComponents } from "../../../hooks/useProjectMaterialComponents";
import LoadingSpinner from "../../../components/LoadingSpinner";
import SafeError from "../../../components/SafeError";

const UOM_OPTIONS = ["", "Tons", "CY", "Qty"];

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

  const loading = layerTypesLoading || materialTypesLoading || componentTypesLoading || areasLoading ||
    layersLoading || materialsLoading || componentsLoading ||
    areaLayersLoading || layerMaterialsLoading || materialComponentsLoading;
  const error = layerTypesError || materialTypesError || componentTypesError || areasError ||
    layersError || materialsError || componentsError ||
    areaLayersError || layerMaterialsError || materialComponentsError;

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
      <Text fw={700} size="sm" mb={12}>Capping Setup</Text>

      {loading && <LoadingSpinner py={16} />}
      {!loading && <SafeError message={error} />}
      {!loading && !error && !hasProject && (
        <Text size="xs" c="dimmed" ta="center" py={16}>Select a project to manage its capping setup.</Text>
      )}

      {!loading && !error && hasProject && (
        <Tabs value={tab} onChange={setTab}>
          <Tabs.List mb={12}>
            <Tabs.Tab value="layers">Layers</Tabs.Tab>
            <Tabs.Tab value="materials">Materials</Tabs.Tab>
            <Tabs.Tab value="components">Components</Tabs.Tab>
            <Tabs.Tab value="mappings">Mappings &amp; Goals</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="layers">
            <NamedTypeTable
              rows={layers}
              typeRef={layerTypeRef}
              nameField="layer_name"
              typeField="layer_type_id"
              reportNameField="layer_report_name"
              entityLabel="Layer"
              saving={creatingLayer || updatingLayer}
              onCreate={(payload) => createLayer({ project_id: project.id, ...payload })}
              onUpdate={updateLayer}
              onDelete={deleteLayerCascade}
            />
          </Tabs.Panel>
          <Tabs.Panel value="materials">
            <NamedTypeTable
              rows={materials}
              typeRef={materialTypeRef}
              nameField="material_name"
              typeField="material_type_id"
              reportNameField="material_report_name"
              entityLabel="Material"
              saving={creatingMaterial || updatingMaterial}
              onCreate={(payload) => createMaterial({ project_id: project.id, ...payload })}
              onUpdate={updateMaterial}
              onDelete={deleteMaterialCascade}
            />
          </Tabs.Panel>
          <Tabs.Panel value="components">
            <ComponentsTable
              rows={components}
              typeRef={componentTypeRef}
              saving={creatingComponent || updatingComponent}
              onCreate={(payload) => createComponent({ project_id: project.id, ...payload })}
              onUpdate={updateComponent}
              onDelete={deleteComponentCascade}
            />
          </Tabs.Panel>
          <Tabs.Panel value="mappings">
            <Tabs value={mappingsTab} onChange={setMappingsTab}>
              <Tabs.List mb={12}>
                <Tabs.Tab value="area-layer">Areas → Layers</Tabs.Tab>
                <Tabs.Tab value="layer-material">Layers → Materials</Tabs.Tab>
                <Tabs.Tab value="material-component">Materials → Components</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="area-layer">
                <AreaLayerMappings
                  areas={areas}
                  layers={layers}
                  map={areaLayers}
                  saving={creatingAreaLayer || updatingAreaLayer}
                  onCreate={(payload) => createAreaLayer({ project_id: project.id, ...payload })}
                  onUpdate={updateAreaLayer}
                  onDelete={removeAreaLayer}
                />
              </Tabs.Panel>
              <Tabs.Panel value="layer-material">
                <LayerMaterialMappings
                  layers={layers}
                  materials={materials}
                  map={layerMaterials}
                  saving={creatingLayerMaterial || updatingLayerMaterial}
                  onCreate={(payload) => createLayerMaterial({ project_id: project.id, ...payload })}
                  onUpdate={updateLayerMaterial}
                  onDelete={removeLayerMaterial}
                />
              </Tabs.Panel>
              <Tabs.Panel value="material-component">
                <MaterialComponentMappings
                  materials={materials}
                  components={components}
                  map={materialComponents}
                  saving={creatingMaterialComponent || updatingMaterialComponent}
                  onCreate={(payload) => createMaterialComponent({ project_id: project.id, ...payload })}
                  onUpdate={updateMaterialComponent}
                  onDelete={removeMaterialComponent}
                />
              </Tabs.Panel>
            </Tabs>
          </Tabs.Panel>
        </Tabs>
      )}
    </Box>
  );
}

function NamedTypeTable({ rows, typeRef, nameField, typeField, reportNameField, entityLabel, saving, onCreate, onUpdate, onDelete }) {
  const { confirm, modal: confirmModal } = useConfirmDialog();
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState({ name: "", type: typeRef[0]?.id ?? "", reportName: "", sortOrder: rows.length + 1 });

  function openAdd() {
    setEditRow(null);
    setForm({ name: "", type: typeRef[0]?.id ?? "", reportName: "", sortOrder: rows.length + 1 });
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setForm({ name: row[nameField], type: row[typeField], reportName: row[reportNameField] ?? "", sortOrder: row.sort_order });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    const payload = { [nameField]: form.name.trim(), [typeField]: form.type || null, [reportNameField]: form.reportName.trim() || null, sort_order: Number(form.sortOrder) || 0 };
    if (editRow) {
      await onUpdate(editRow.id, payload);
    } else {
      await onCreate({ ...payload, active: true });
    }
    setModalOpen(false);
  }

  async function remove(row) {
    if (!(await confirm(`Delete "${row[nameField]}"? Any mappings that use it will also be removed.`))) return;
    await onDelete(row.id);
  }

  async function toggleActive(row) {
    await onUpdate(row.id, { active: !row.active });
  }

  const typeName = (id) => typeRef.find((t) => t.id === id)?.name ?? "—";

  return (
    <Box>
      <Group justify="flex-end" mb={10}>
        <Button size="xs" leftSection={<IconPlus size={12} />} onClick={openAdd} style={{ background: "#0F2744", border: "none" }}>Add {entityLabel}</Button>
      </Group>
      <Table withTableBorder verticalSpacing="xs" fz="sm">
        <Table.Thead>
          <Table.Tr><Table.Th>Name</Table.Th><Table.Th>Type</Table.Th><Table.Th ta="right">Sort</Table.Th><Table.Th>Report Name</Table.Th><Table.Th style={{ width: 150 }} /><Table.Th style={{ width: 50 }} /></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 && (
            <Table.Tr><Table.Td colSpan={6}><Text size="xs" c="dimmed" ta="center" py={12}>No {entityLabel.toLowerCase()}s yet</Text></Table.Td></Table.Tr>
          )}
          {rows.map((r) => (
            <Table.Tr key={r.id}>
              <Table.Td>{r[nameField]}</Table.Td>
              <Table.Td>{typeName(r[typeField])}</Table.Td>
              <Table.Td ta="right">{r.sort_order}</Table.Td>
              <Table.Td>{r[reportNameField] ?? "—"}</Table.Td>
              <Table.Td>
                <Group gap={8} wrap="nowrap">
                  <Button size="xs" variant="subtle" onClick={() => openEdit(r)}>Edit</Button>
                  <Button size="xs" variant="subtle" color="red" onClick={() => remove(r)}>Delete</Button>
                </Group>
              </Table.Td>
              <Table.Td><Switch size="xs" checked={!!r.active} onChange={() => toggleActive(r)} /></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit" : "Add"} {entityLabel}</Text>} size="sm">
        <TextInput label={`${entityLabel} Name`} required value={form.name} onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, name: v })) }} mb={10} autoFocus />
        <Select label={`${entityLabel} Type`} data={typeRef.map((t) => ({ value: t.id, label: t.name }))} value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} mb={10} />
        <NumberInput label="Sort Order" hideControls value={form.sortOrder} onChange={(v) => setForm((f) => ({ ...f, sortOrder: v }))} mb={10} />
        <TextInput label="Report Name (optional)" placeholder="Defaults to name above" value={form.reportName} onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, reportName: v })) }} mb={16} />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" loading={saving} onClick={handleSave} disabled={!form.name.trim()} style={{ background: "#0F2744", border: "none" }}>Save</Button>
        </Group>
      </Modal>

      {confirmModal}
    </Box>
  );
}

function ComponentsTable({ rows, typeRef, saving, onCreate, onUpdate, onDelete }) {
  const { confirm, modal: confirmModal } = useConfirmDialog();
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState({ name: "", type: typeRef[0]?.id ?? "", reportName: "", reportUom: "", invUom: "", sortOrder: rows.length + 1 });

  function openAdd() {
    setEditRow(null);
    setForm({ name: "", type: typeRef[0]?.id ?? "", reportName: "", reportUom: "", invUom: "", sortOrder: rows.length + 1 });
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setForm({
      name: row.component_name,
      type: row.component_type_id,
      reportName: row.component_report_name ?? "",
      reportUom: row.component_report_uom ?? "",
      invUom: row.component_inventory_uom ?? "",
      sortOrder: row.sort_order,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    const payload = {
      component_name: form.name.trim(),
      component_type_id: form.type || null,
      component_report_name: form.reportName.trim() || null,
      component_report_uom: form.reportUom || null,
      component_inventory_uom: form.invUom || null,
      sort_order: Number(form.sortOrder) || 0,
    };
    if (editRow) {
      await onUpdate(editRow.id, payload);
    } else {
      await onCreate({ ...payload, active: true });
    }
    setModalOpen(false);
  }

  async function remove(row) {
    if (!(await confirm(`Delete "${row.component_name}"? Any mappings that use it will also be removed.`))) return;
    await onDelete(row.id);
  }

  async function toggleActive(row) {
    await onUpdate(row.id, { active: !row.active });
  }

  const typeName = (id) => typeRef.find((t) => t.id === id)?.name ?? "—";

  return (
    <Box>
      <Text size="xs" c="dimmed" mb={10}>Only needed when a material is a blend (e.g. amended sand).</Text>
      <Group justify="flex-end" mb={10}>
        <Button size="xs" leftSection={<IconPlus size={12} />} onClick={openAdd} style={{ background: "#0F2744", border: "none" }}>Add Component</Button>
      </Group>
      <Table withTableBorder verticalSpacing="xs" fz="sm">
        <Table.Thead>
          <Table.Tr><Table.Th>Name</Table.Th><Table.Th>Type</Table.Th><Table.Th>Report UOM</Table.Th><Table.Th>Inventory UOM</Table.Th><Table.Th style={{ width: 150 }} /><Table.Th style={{ width: 50 }} /></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 && (
            <Table.Tr><Table.Td colSpan={6}><Text size="xs" c="dimmed" ta="center" py={12}>No components yet</Text></Table.Td></Table.Tr>
          )}
          {rows.map((r) => (
            <Table.Tr key={r.id}>
              <Table.Td>{r.component_name}</Table.Td>
              <Table.Td>{typeName(r.component_type_id)}</Table.Td>
              <Table.Td>{r.component_report_uom || "—"}</Table.Td>
              <Table.Td>{r.component_inventory_uom || "—"}</Table.Td>
              <Table.Td>
                <Group gap={8} wrap="nowrap">
                  <Button size="xs" variant="subtle" onClick={() => openEdit(r)}>Edit</Button>
                  <Button size="xs" variant="subtle" color="red" onClick={() => remove(r)}>Delete</Button>
                </Group>
              </Table.Td>
              <Table.Td><Switch size="xs" checked={!!r.active} onChange={() => toggleActive(r)} /></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit" : "Add"} Component</Text>} size="sm">
        <TextInput label="Component Name" required value={form.name} onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, name: v })) }} mb={10} autoFocus />
        <Select label="Component Type" data={typeRef.map((t) => ({ value: t.id, label: t.name }))} value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} mb={10} />
        <Group grow mb={10}>
          <Select label="Report UOM" data={UOM_OPTIONS} value={form.reportUom} onChange={(v) => setForm((f) => ({ ...f, reportUom: v ?? "" }))} />
          <Select label="Inventory UOM" data={UOM_OPTIONS} value={form.invUom} onChange={(v) => setForm((f) => ({ ...f, invUom: v ?? "" }))} />
        </Group>
        <NumberInput label="Sort Order" hideControls value={form.sortOrder} onChange={(v) => setForm((f) => ({ ...f, sortOrder: v }))} mb={10} />
        <TextInput label="Report Name (optional)" value={form.reportName} onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, reportName: v })) }} mb={16} />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" loading={saving} onClick={handleSave} disabled={!form.name.trim()} style={{ background: "#0F2744", border: "none" }}>Save</Button>
        </Group>
      </Modal>

      {confirmModal}
    </Box>
  );
}

function AreaLayerMappings({ areas, layers, map, saving, onCreate, onUpdate, onDelete }) {
  const { confirm, modal: confirmModal } = useConfirmDialog();
  const [modalOpen, setModalOpen] = useState(false);
  const [areaId, setAreaId] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState({ layerId: "", minThickness: "", targetThickness: "", overplacement: "", cyGoal: "", tonsGoal: "", sfGoal: "" });

  const areaIdsWithMappings = [...new Set(map.map((m) => m.area_id))];
  const layerById = Object.fromEntries(layers.map((l) => [l.id, l]));

  function openAdd(id) {
    setEditRow(null);
    setAreaId(id);
    setForm({ layerId: "", minThickness: "", targetThickness: "", overplacement: "", cyGoal: "", tonsGoal: "", sfGoal: "" });
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setAreaId(row.area_id);
    setForm({
      layerId: row.layer_id,
      minThickness: row.min_design_thickness ?? "",
      targetThickness: row.target_thickness ?? "",
      overplacement: row.overplacement_tolerance ?? "",
      cyGoal: row.cy_goal ?? "",
      tonsGoal: row.tons_goal ?? "",
      sfGoal: row.sf_goal ?? "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.layerId) return;
    const num = (v) => (v === "" ? null : Number(v));
    const payload = {
      layer_id: form.layerId,
      min_design_thickness: num(form.minThickness),
      target_thickness: num(form.targetThickness),
      overplacement_tolerance: num(form.overplacement),
      cy_goal: num(form.cyGoal),
      tons_goal: num(form.tonsGoal),
      sf_goal: num(form.sfGoal),
    };
    if (editRow) {
      await onUpdate(editRow.id, payload);
    } else {
      await onCreate({ area_id: areaId, ...payload });
    }
    setModalOpen(false);
  }

  async function remove(row) {
    if (!(await confirm("Remove this layer from the area?"))) return;
    await onDelete(row.id);
  }

  const availableLayers = (id, excludeRowId) => layers.filter((l) => !map.some((m) => m.area_id === id && m.layer_id === l.id && m.id !== excludeRowId));

  return (
    <Box>
      {areaIdsWithMappings.length === 0 && <Text size="xs" c="dimmed" ta="center" py={16}>No area/layer mappings yet</Text>}
      {areaIdsWithMappings.map((id) => {
        const rows = map.filter((m) => m.area_id === id);
        return (
          <Box key={id} mb={14}>
            <Group justify="space-between" mb={6}>
              <Text size="xs" fw={700}>{areaPath(id, areas)}</Text>
              <Button size="xs" variant="subtle" leftSection={<IconPlus size={11} />} onClick={() => openAdd(id)}>Add Layer</Button>
            </Group>
            {rows.map((m) => {
              const goal = [m.cy_goal ? `${m.cy_goal.toLocaleString()} CY` : null, m.tons_goal ? `${m.tons_goal.toLocaleString()} Tons` : null, m.sf_goal ? `${m.sf_goal.toLocaleString()} SF` : null].filter(Boolean).join(" · ");
              const thickness = [m.target_thickness ? `Tgt ${m.target_thickness}"` : null, m.min_design_thickness ? `Min ${m.min_design_thickness}"` : null, m.overplacement_tolerance ? `Over ${m.overplacement_tolerance}"` : null].filter(Boolean).join(" · ");
              return (
                <Group key={m.id} justify="space-between" p={8} mb={4} style={{ background: "#f5f6f8", border: "1px solid #ebebeb", borderRadius: 6 }}>
                  <Text size="xs" fw={600}>{layerById[m.layer_id]?.layer_name ?? "—"}</Text>
                  <Group gap={8} wrap="nowrap">
                    {goal && <Text size="10px" style={{ background: "#eef2f8", padding: "2px 6px", borderRadius: 3 }}>{goal}</Text>}
                    {thickness && <Text size="10px" c="dimmed">{thickness}</Text>}
                    <Button size="xs" variant="subtle" onClick={() => openEdit(m)}>Edit</Button>
                    <Button size="xs" variant="subtle" color="red" onClick={() => remove(m)}>Remove</Button>
                  </Group>
                </Group>
              );
            })}
          </Box>
        );
      })}
      <Box mt={10}>
        {areas.filter((a) => !areaIdsWithMappings.includes(a.id)).map((a) => (
          <Button key={a.id} size="xs" variant="subtle" leftSection={<IconPlus size={11} />} onClick={() => openAdd(a.id)} mr={8} mb={6}>
            Map {a.name}
          </Button>
        ))}
      </Box>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit" : "Add"} Layer Mapping</Text>} size="sm">
        <Select label="Layer" required data={availableLayers(areaId, editRow?.id).map((l) => ({ value: l.id, label: l.layer_name }))} value={form.layerId} onChange={(v) => setForm((f) => ({ ...f, layerId: v ?? "" }))} mb={10} />
        <Group grow mb={10}>
          <NumberInput label='Min Thickness (in)' hideControls value={form.minThickness} onChange={(v) => setForm((f) => ({ ...f, minThickness: v }))} />
          <NumberInput label='Target Thickness (in)' hideControls value={form.targetThickness} onChange={(v) => setForm((f) => ({ ...f, targetThickness: v }))} />
          <NumberInput label='Overplacement (in)' hideControls value={form.overplacement} onChange={(v) => setForm((f) => ({ ...f, overplacement: v }))} />
        </Group>
        <Group grow mb={16}>
          <NumberInput label="CY Goal" hideControls value={form.cyGoal} onChange={(v) => setForm((f) => ({ ...f, cyGoal: v }))} />
          <NumberInput label="Tons Goal" hideControls value={form.tonsGoal} onChange={(v) => setForm((f) => ({ ...f, tonsGoal: v }))} />
          <NumberInput label="SF Goal" hideControls value={form.sfGoal} onChange={(v) => setForm((f) => ({ ...f, sfGoal: v }))} />
        </Group>
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" loading={saving} onClick={handleSave} disabled={!form.layerId} style={{ background: "#0F2744", border: "none" }}>Save</Button>
        </Group>
      </Modal>

      {confirmModal}
    </Box>
  );
}

function LayerMaterialMappings({ layers, materials, map, saving, onCreate, onUpdate, onDelete }) {
  const { confirm, modal: confirmModal } = useConfirmDialog();
  const [modalOpen, setModalOpen] = useState(false);
  const [layerId, setLayerId] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState({ materialId: "", loadingRate: "", reportName: "" });
  const materialById = Object.fromEntries(materials.map((m) => [m.id, m]));

  function openAdd(id) {
    setEditRow(null);
    setLayerId(id);
    setForm({ materialId: "", loadingRate: "", reportName: "" });
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setLayerId(row.layer_id);
    setForm({
      materialId: row.material_id,
      loadingRate: row.loading_rate ?? "",
      reportName: row.layer_material_report_name ?? "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.materialId) return;
    const payload = {
      material_id: form.materialId,
      loading_rate: form.loadingRate === "" ? null : Number(form.loadingRate),
      layer_material_report_name: form.reportName.trim() || null,
    };
    if (editRow) {
      await onUpdate(editRow.id, payload);
    } else {
      await onCreate({ layer_id: layerId, ...payload });
    }
    setModalOpen(false);
  }

  async function remove(row) {
    if (!(await confirm("Remove this material from the layer?"))) return;
    await onDelete(row.id);
  }

  const availableMaterials = (id, excludeRowId) => materials.filter((m) => !map.some((x) => x.layer_id === id && x.material_id === m.id && x.id !== excludeRowId));

  return (
    <Box>
      {layers.map((layer) => {
        const rows = map.filter((m) => m.layer_id === layer.id);
        return (
          <Box key={layer.id} mb={14}>
            <Group justify="space-between" mb={6}>
              <Text size="xs" fw={700}>{layer.layer_name}</Text>
              <Button size="xs" variant="subtle" leftSection={<IconPlus size={11} />} onClick={() => openAdd(layer.id)}>Add Material</Button>
            </Group>
            {rows.length === 0 && <Text size="10px" c="dimmed">No materials mapped</Text>}
            {rows.map((m) => (
              <Group key={m.id} justify="space-between" p={8} mb={4} style={{ background: "#f5f6f8", border: "1px solid #ebebeb", borderRadius: 6 }}>
                <Text size="xs" fw={600}>{materialById[m.material_id]?.material_name ?? "—"}{m.layer_material_report_name ? ` (${m.layer_material_report_name})` : ""}</Text>
                <Group gap={8} wrap="nowrap">
                  {m.loading_rate != null && <Text size="10px" c="dimmed">{m.loading_rate} tons/hr</Text>}
                  <Button size="xs" variant="subtle" onClick={() => openEdit(m)}>Edit</Button>
                  <Button size="xs" variant="subtle" color="red" onClick={() => remove(m)}>Remove</Button>
                </Group>
              </Group>
            ))}
          </Box>
        );
      })}

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit" : "Add"} Material Mapping</Text>} size="sm">
        <Select label="Material" required data={availableMaterials(layerId, editRow?.id).map((m) => ({ value: m.id, label: m.material_name }))} value={form.materialId} onChange={(v) => setForm((f) => ({ ...f, materialId: v ?? "" }))} mb={10} />
        <NumberInput label="Loading Rate (tons/hr, optional)" hideControls value={form.loadingRate} onChange={(v) => setForm((f) => ({ ...f, loadingRate: v }))} mb={10} />
        <TextInput label="Report Name Override (optional)" value={form.reportName} onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, reportName: v })) }} mb={16} />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" loading={saving} onClick={handleSave} disabled={!form.materialId} style={{ background: "#0F2744", border: "none" }}>Save</Button>
        </Group>
      </Modal>

      {confirmModal}
    </Box>
  );
}

function MaterialComponentMappings({ materials, components, map, saving, onCreate, onUpdate, onDelete }) {
  const { confirm, modal: confirmModal } = useConfirmDialog();
  const [modalOpen, setModalOpen] = useState(false);
  const [materialId, setMaterialId] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState({ componentId: "", percent: "" });
  const componentById = Object.fromEntries(components.map((c) => [c.id, c]));

  function openAdd(id) {
    setEditRow(null);
    setMaterialId(id);
    setForm({ componentId: "", percent: "" });
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setMaterialId(row.material_id);
    setForm({
      componentId: row.component_id,
      percent: row.component_percent_of_material ?? "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.componentId) return;
    const payload = {
      component_id: form.componentId,
      component_percent_of_material: form.percent === "" ? null : Number(form.percent),
    };
    if (editRow) {
      await onUpdate(editRow.id, payload);
    } else {
      await onCreate({ material_id: materialId, ...payload });
    }
    setModalOpen(false);
  }

  async function remove(row) {
    if (!(await confirm("Remove this component from the material?"))) return;
    await onDelete(row.id);
  }

  const availableComponents = (id, excludeRowId) => components.filter((c) => !map.some((x) => x.material_id === id && x.component_id === c.id && x.id !== excludeRowId));

  return (
    <Box>
      {materials.map((material) => {
        const rows = map.filter((m) => m.material_id === material.id);
        const sumPct = rows.reduce((sum, r) => sum + (r.component_percent_of_material || 0), 0);
        return (
          <Box key={material.id} mb={14}>
            <Group justify="space-between" mb={6}>
              <Group gap={8}>
                <Text size="xs" fw={700}>{material.material_name}</Text>
                {rows.length > 0 && <Text size="10px" c={sumPct === 100 ? "#1e7a3d" : "dimmed"}>Σ {sumPct}%</Text>}
              </Group>
              <Button size="xs" variant="subtle" leftSection={<IconPlus size={11} />} onClick={() => openAdd(material.id)}>Add Component</Button>
            </Group>
            {rows.length === 0 && <Text size="10px" c="dimmed">No components — this material is placed as-is.</Text>}
            {rows.map((m) => (
              <Group key={m.id} justify="space-between" p={8} mb={4} style={{ background: "#f5f6f8", border: "1px solid #ebebeb", borderRadius: 6 }}>
                <Text size="xs" fw={600}>{componentById[m.component_id]?.component_name ?? "—"}</Text>
                <Group gap={8} wrap="nowrap">
                  {m.component_percent_of_material != null && <Text size="10px" c="dimmed">{m.component_percent_of_material}%</Text>}
                  <Button size="xs" variant="subtle" onClick={() => openEdit(m)}>Edit</Button>
                  <Button size="xs" variant="subtle" color="red" onClick={() => remove(m)}>Remove</Button>
                </Group>
              </Group>
            ))}
          </Box>
        );
      })}

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit" : "Add"} Component Mapping</Text>} size="sm">
        <Select label="Component" required data={availableComponents(materialId, editRow?.id).map((c) => ({ value: c.id, label: c.component_name }))} value={form.componentId} onChange={(v) => setForm((f) => ({ ...f, componentId: v ?? "" }))} mb={10} />
        <NumberInput label="% of Material (optional)" hideControls min={0} max={100} value={form.percent} onChange={(v) => setForm((f) => ({ ...f, percent: v }))} mb={16} />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" loading={saving} onClick={handleSave} disabled={!form.componentId} style={{ background: "#0F2744", border: "none" }}>Save</Button>
        </Group>
      </Modal>

      {confirmModal}
    </Box>
  );
}
