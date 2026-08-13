import { useState } from "react";
import { Box, Text, Group, Button, Table, Tabs, Modal, TextInput, Select, NumberInput } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import {
  SAMPLE_AREAS,
  SAMPLE_LAYER_TYPE_REF,
  SAMPLE_MATERIAL_TYPE_REF,
  SAMPLE_COMPONENT_TYPE_REF,
  SAMPLE_PROJECT_LAYERS,
  SAMPLE_PROJECT_MATERIALS,
  SAMPLE_PROJECT_COMPONENTS,
  SAMPLE_AREA_LAYER_MAP,
  SAMPLE_LAYER_MATERIAL_MAP,
  SAMPLE_MATERIAL_COMPONENT_MAP,
} from "../../../data/adminProjectDetailSampleData";

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

export default function CappingSetupTab() {
  const [layers, setLayers] = useState(SAMPLE_PROJECT_LAYERS);
  const [materials, setMaterials] = useState(SAMPLE_PROJECT_MATERIALS);
  const [components, setComponents] = useState(SAMPLE_PROJECT_COMPONENTS);
  const [areaLayerMap, setAreaLayerMap] = useState(SAMPLE_AREA_LAYER_MAP);
  const [layerMaterialMap, setLayerMaterialMap] = useState(SAMPLE_LAYER_MATERIAL_MAP);
  const [materialComponentMap, setMaterialComponentMap] = useState(SAMPLE_MATERIAL_COMPONENT_MAP);

  return (
    <Box>
      <Text fw={700} size="sm" mb={12}>Capping Setup</Text>
      <Tabs defaultValue="layers">
        <Tabs.List mb={12}>
          <Tabs.Tab value="layers">Layers</Tabs.Tab>
          <Tabs.Tab value="materials">Materials</Tabs.Tab>
          <Tabs.Tab value="components">Components</Tabs.Tab>
          <Tabs.Tab value="mappings">Mappings &amp; Goals</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="layers">
          <NamedTypeTable
            rows={layers}
            setRows={setLayers}
            typeRef={SAMPLE_LAYER_TYPE_REF}
            nameField="layer_name"
            typeField="layer_type_id"
            reportNameField="layer_report_name"
            entityLabel="Layer"
          />
        </Tabs.Panel>
        <Tabs.Panel value="materials">
          <NamedTypeTable
            rows={materials}
            setRows={setMaterials}
            typeRef={SAMPLE_MATERIAL_TYPE_REF}
            nameField="material_name"
            typeField="material_type_id"
            reportNameField="material_report_name"
            entityLabel="Material"
          />
        </Tabs.Panel>
        <Tabs.Panel value="components">
          <ComponentsTable rows={components} setRows={setComponents} typeRef={SAMPLE_COMPONENT_TYPE_REF} />
        </Tabs.Panel>
        <Tabs.Panel value="mappings">
          <Tabs defaultValue="area-layer">
            <Tabs.List mb={12}>
              <Tabs.Tab value="area-layer">Areas → Layers</Tabs.Tab>
              <Tabs.Tab value="layer-material">Layers → Materials</Tabs.Tab>
              <Tabs.Tab value="material-component">Materials → Components</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="area-layer">
              <AreaLayerMappings map={areaLayerMap} setMap={setAreaLayerMap} layers={layers} />
            </Tabs.Panel>
            <Tabs.Panel value="layer-material">
              <LayerMaterialMappings map={layerMaterialMap} setMap={setLayerMaterialMap} layers={layers} materials={materials} />
            </Tabs.Panel>
            <Tabs.Panel value="material-component">
              <MaterialComponentMappings map={materialComponentMap} setMap={setMaterialComponentMap} materials={materials} components={components} />
            </Tabs.Panel>
          </Tabs>
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}

function NamedTypeTable({ rows, setRows, typeRef, nameField, typeField, reportNameField, entityLabel }) {
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

  function handleSave() {
    if (!form.name.trim()) return;
    const payload = { [nameField]: form.name.trim(), [typeField]: form.type, [reportNameField]: form.reportName.trim() || null, sort_order: Number(form.sortOrder) || 0 };
    if (editRow) {
      setRows((prev) => prev.map((r) => (r.id === editRow.id ? { ...r, ...payload } : r)));
    } else {
      setRows((prev) => [...prev, { id: `${entityLabel.toLowerCase()}-${Date.now()}`, active: true, ...payload }]);
    }
    setModalOpen(false);
  }

  function remove(row) {
    if (!confirm(`Delete "${row[nameField]}"? Any mappings that use it will also be removed.`)) return;
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  }

  const typeName = (id) => typeRef.find((t) => t.id === id)?.name ?? "—";

  return (
    <Box>
      <Group justify="flex-end" mb={10}>
        <Button size="xs" leftSection={<IconPlus size={12} />} onClick={openAdd} style={{ background: "#0F2744", border: "none" }}>Add {entityLabel}</Button>
      </Group>
      <Table withTableBorder verticalSpacing="xs" fz="sm">
        <Table.Thead>
          <Table.Tr><Table.Th>Name</Table.Th><Table.Th>Type</Table.Th><Table.Th ta="right">Sort</Table.Th><Table.Th>Report Name</Table.Th><Table.Th style={{ width: 150 }} /></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
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
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit" : "Add"} {entityLabel}</Text>} size="sm">
        <TextInput label={`${entityLabel} Name`} required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))} mb={10} autoFocus />
        <Select label={`${entityLabel} Type`} data={typeRef.map((t) => ({ value: t.id, label: t.name }))} value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} mb={10} />
        <NumberInput label="Sort Order" hideControls value={form.sortOrder} onChange={(v) => setForm((f) => ({ ...f, sortOrder: v }))} mb={10} />
        <TextInput label="Report Name (optional)" placeholder="Defaults to name above" value={form.reportName} onChange={(e) => setForm((f) => ({ ...f, reportName: e.currentTarget.value }))} mb={16} />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" onClick={handleSave} disabled={!form.name.trim()} style={{ background: "#0F2744", border: "none" }}>Save</Button>
        </Group>
      </Modal>
    </Box>
  );
}

function ComponentsTable({ rows, setRows, typeRef }) {
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

  function handleSave() {
    if (!form.name.trim()) return;
    const payload = {
      component_name: form.name.trim(),
      component_type_id: form.type,
      component_report_name: form.reportName.trim() || null,
      component_report_uom: form.reportUom || null,
      component_inventory_uom: form.invUom || null,
      sort_order: Number(form.sortOrder) || 0,
    };
    if (editRow) {
      setRows((prev) => prev.map((r) => (r.id === editRow.id ? { ...r, ...payload } : r)));
    } else {
      setRows((prev) => [...prev, { id: `component-${Date.now()}`, active: true, ...payload }]);
    }
    setModalOpen(false);
  }

  function remove(row) {
    if (!confirm(`Delete "${row.component_name}"? Any mappings that use it will also be removed.`)) return;
    setRows((prev) => prev.filter((r) => r.id !== row.id));
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
          <Table.Tr><Table.Th>Name</Table.Th><Table.Th>Type</Table.Th><Table.Th>Report UOM</Table.Th><Table.Th>Inventory UOM</Table.Th><Table.Th style={{ width: 150 }} /></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
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
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">{editRow ? "Edit" : "Add"} Component</Text>} size="sm">
        <TextInput label="Component Name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))} mb={10} autoFocus />
        <Select label="Component Type" data={typeRef.map((t) => ({ value: t.id, label: t.name }))} value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} mb={10} />
        <Group grow mb={10}>
          <Select label="Report UOM" data={UOM_OPTIONS} value={form.reportUom} onChange={(v) => setForm((f) => ({ ...f, reportUom: v ?? "" }))} />
          <Select label="Inventory UOM" data={UOM_OPTIONS} value={form.invUom} onChange={(v) => setForm((f) => ({ ...f, invUom: v ?? "" }))} />
        </Group>
        <NumberInput label="Sort Order" hideControls value={form.sortOrder} onChange={(v) => setForm((f) => ({ ...f, sortOrder: v }))} mb={10} />
        <TextInput label="Report Name (optional)" value={form.reportName} onChange={(e) => setForm((f) => ({ ...f, reportName: e.currentTarget.value }))} mb={16} />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" onClick={handleSave} disabled={!form.name.trim()} style={{ background: "#0F2744", border: "none" }}>Save</Button>
        </Group>
      </Modal>
    </Box>
  );
}

function AreaLayerMappings({ map, setMap, layers }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [areaId, setAreaId] = useState(null);
  const [form, setForm] = useState({ layerId: "", minThickness: "", targetThickness: "", overplacement: "", cyGoal: "", tonsGoal: "", sfGoal: "" });

  const areaIdsWithMappings = [...new Set(map.map((m) => m.area_id))];
  const layerById = Object.fromEntries(layers.map((l) => [l.id, l]));

  function openAdd(id) {
    setAreaId(id);
    setForm({ layerId: "", minThickness: "", targetThickness: "", overplacement: "", cyGoal: "", tonsGoal: "", sfGoal: "" });
    setModalOpen(true);
  }

  function handleSave() {
    if (!form.layerId) return;
    setMap((prev) => [
      ...prev,
      {
        id: `al-${Date.now()}`,
        area_id: areaId,
        layer_id: form.layerId,
        min_design_thickness: form.minThickness === "" ? null : Number(form.minThickness),
        target_thickness: form.targetThickness === "" ? null : Number(form.targetThickness),
        overplacement_tolerance: form.overplacement === "" ? null : Number(form.overplacement),
        cy_goal: form.cyGoal === "" ? null : Number(form.cyGoal),
        tons_goal: form.tonsGoal === "" ? null : Number(form.tonsGoal),
        sf_goal: form.sfGoal === "" ? null : Number(form.sfGoal),
      },
    ]);
    setModalOpen(false);
  }

  const availableLayers = (id) => layers.filter((l) => !map.some((m) => m.area_id === id && m.layer_id === l.id));

  return (
    <Box>
      {areaIdsWithMappings.length === 0 && <Text size="xs" c="dimmed" ta="center" py={16}>No area/layer mappings yet</Text>}
      {areaIdsWithMappings.map((id) => {
        const rows = map.filter((m) => m.area_id === id);
        return (
          <Box key={id} mb={14}>
            <Group justify="space-between" mb={6}>
              <Text size="xs" fw={700}>{areaPath(id, SAMPLE_AREAS)}</Text>
              <Button size="xs" variant="subtle" leftSection={<IconPlus size={11} />} onClick={() => openAdd(id)}>Add Layer</Button>
            </Group>
            {rows.map((m) => {
              const goal = [m.cy_goal ? `${m.cy_goal.toLocaleString()} CY` : null, m.tons_goal ? `${m.tons_goal.toLocaleString()} Tons` : null, m.sf_goal ? `${m.sf_goal.toLocaleString()} SF` : null].filter(Boolean).join(" · ");
              return (
                <Group key={m.id} justify="space-between" p={8} mb={4} style={{ background: "#f5f6f8", border: "1px solid #ebebeb", borderRadius: 6 }}>
                  <Box>
                    <Text size="xs" fw={600}>{layerById[m.layer_id]?.layer_name ?? "—"}</Text>
                    <Text size="10px" c="dimmed">
                      Tgt {m.target_thickness ?? "—"}" · Min {m.min_design_thickness ?? "—"}" · Over {m.overplacement_tolerance ?? "—"}"
                    </Text>
                  </Box>
                  {goal && <Text size="10px" style={{ background: "#eef2f8", padding: "2px 6px", borderRadius: 3 }}>{goal}</Text>}
                </Group>
              );
            })}
          </Box>
        );
      })}
      <Box mt={10}>
        {SAMPLE_AREAS.filter((a) => !areaIdsWithMappings.includes(a.id)).map((a) => (
          <Button key={a.id} size="xs" variant="subtle" leftSection={<IconPlus size={11} />} onClick={() => openAdd(a.id)} mr={8} mb={6}>
            Map {a.name}
          </Button>
        ))}
      </Box>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">Add Layer Mapping</Text>} size="sm">
        <Select label="Layer" required data={availableLayers(areaId).map((l) => ({ value: l.id, label: l.layer_name }))} value={form.layerId} onChange={(v) => setForm((f) => ({ ...f, layerId: v ?? "" }))} mb={10} />
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
          <Button size="xs" onClick={handleSave} disabled={!form.layerId} style={{ background: "#0F2744", border: "none" }}>Save</Button>
        </Group>
      </Modal>
    </Box>
  );
}

function LayerMaterialMappings({ map, setMap, layers, materials }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [layerId, setLayerId] = useState(null);
  const [form, setForm] = useState({ materialId: "", loadingRate: "", reportName: "" });
  const materialById = Object.fromEntries(materials.map((m) => [m.id, m]));

  function openAdd(id) {
    setLayerId(id);
    setForm({ materialId: "", loadingRate: "", reportName: "" });
    setModalOpen(true);
  }

  function handleSave() {
    if (!form.materialId) return;
    setMap((prev) => [...prev, { id: `lm-${Date.now()}`, layer_id: layerId, material_id: form.materialId, loading_rate: form.loadingRate === "" ? null : Number(form.loadingRate), layer_material_report_name: form.reportName.trim() || null }]);
    setModalOpen(false);
  }

  const availableMaterials = (id) => materials.filter((m) => !map.some((x) => x.layer_id === id && x.material_id === m.id));

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
                {m.loading_rate != null && <Text size="10px" c="dimmed">{m.loading_rate} tons/hr</Text>}
              </Group>
            ))}
          </Box>
        );
      })}

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">Add Material Mapping</Text>} size="sm">
        <Select label="Material" required data={availableMaterials(layerId).map((m) => ({ value: m.id, label: m.material_name }))} value={form.materialId} onChange={(v) => setForm((f) => ({ ...f, materialId: v ?? "" }))} mb={10} />
        <NumberInput label="Loading Rate (tons/hr, optional)" hideControls value={form.loadingRate} onChange={(v) => setForm((f) => ({ ...f, loadingRate: v }))} mb={10} />
        <TextInput label="Report Name Override (optional)" value={form.reportName} onChange={(e) => setForm((f) => ({ ...f, reportName: e.currentTarget.value }))} mb={16} />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" onClick={handleSave} disabled={!form.materialId} style={{ background: "#0F2744", border: "none" }}>Save</Button>
        </Group>
      </Modal>
    </Box>
  );
}

function MaterialComponentMappings({ map, setMap, materials, components }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [materialId, setMaterialId] = useState(null);
  const [form, setForm] = useState({ componentId: "", percent: "" });
  const componentById = Object.fromEntries(components.map((c) => [c.id, c]));

  function openAdd(id) {
    setMaterialId(id);
    setForm({ componentId: "", percent: "" });
    setModalOpen(true);
  }

  function handleSave() {
    if (!form.componentId) return;
    setMap((prev) => [...prev, { id: `mc-${Date.now()}`, material_id: materialId, component_id: form.componentId, component_percent_of_material: form.percent === "" ? null : Number(form.percent) }]);
    setModalOpen(false);
  }

  const availableComponents = (id) => components.filter((c) => !map.some((x) => x.material_id === id && x.component_id === c.id));

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
                {m.component_percent_of_material != null && <Text size="10px" c="dimmed">{m.component_percent_of_material}%</Text>}
              </Group>
            ))}
          </Box>
        );
      })}

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={<Text fw={700} size="sm">Add Component Mapping</Text>} size="sm">
        <Select label="Component" required data={availableComponents(materialId).map((c) => ({ value: c.id, label: c.component_name }))} value={form.componentId} onChange={(v) => setForm((f) => ({ ...f, componentId: v ?? "" }))} mb={10} />
        <NumberInput label="% of Material (optional)" hideControls min={0} max={100} value={form.percent} onChange={(v) => setForm((f) => ({ ...f, percent: v }))} mb={16} />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="xs" onClick={handleSave} disabled={!form.componentId} style={{ background: "#0F2744", border: "none" }}>Save</Button>
        </Group>
      </Modal>
    </Box>
  );
}
