
export const SAMPLE_AREAS = [
  { id: "area-1", name: "North Basin", level: 1, parent_id: null, sort_order: 1, volume_goal_cy: 20000, area_goal_sf: null, active: true },
  { id: "area-1-1", name: "NB-1", level: 2, parent_id: "area-1", sort_order: 1, volume_goal_cy: null, area_goal_sf: 5000, active: true },
  { id: "area-1-1-a", name: "NB-1-A", level: 3, parent_id: "area-1-1", sort_order: 1, volume_goal_cy: null, area_goal_sf: 2500, active: true },
  { id: "area-1-1-b", name: "NB-1-B", level: 3, parent_id: "area-1-1", sort_order: 2, volume_goal_cy: null, area_goal_sf: 2500, active: true },
  { id: "area-1-2", name: "NB-2", level: 2, parent_id: "area-1", sort_order: 2, volume_goal_cy: null, area_goal_sf: 4000, active: true },
  { id: "area-2", name: "South Basin", level: 1, parent_id: null, sort_order: 2, volume_goal_cy: 15000, area_goal_sf: null, active: true },
];

export const SAMPLE_LAYER_TYPE_REF = [
  { id: "lt-1", name: "Sand Cap" },
  { id: "lt-2", name: "Armor Stone" },
  { id: "lt-3", name: "Geotextile" },
];
export const SAMPLE_MATERIAL_TYPE_REF = [
  { id: "mt-1", name: "Clean Sand" },
  { id: "mt-2", name: "Amended Sand" },
  { id: "mt-3", name: "Riprap" },
];
export const SAMPLE_COMPONENT_TYPE_REF = [
  { id: "ct-1", name: "Activated Carbon" },
  { id: "ct-2", name: "Organoclay" },
];

export const SAMPLE_PROJECT_LAYERS = [
  { id: "layer-1", layer_name: "Lift 1", layer_type_id: "lt-1", layer_report_name: null, sort_order: 1, active: true },
  { id: "layer-2", layer_name: "Lift 2", layer_type_id: "lt-1", layer_report_name: "Sand Cap — Final Lift", sort_order: 2, active: true },
  { id: "layer-3", layer_name: "Armor", layer_type_id: "lt-2", layer_report_name: null, sort_order: 3, active: true },
];

export const SAMPLE_PROJECT_MATERIALS = [
  { id: "material-1", material_name: "Sand A", material_type_id: "mt-1", material_report_name: null, sort_order: 1, active: true },
  { id: "material-2", material_name: "Amended Sand Blend", material_type_id: "mt-2", material_report_name: "Amended Sand (5% AC)", sort_order: 2, active: true },
  { id: "material-3", material_name: "Riprap 6-12in", material_type_id: "mt-3", material_report_name: null, sort_order: 3, active: true },
];

export const SAMPLE_PROJECT_COMPONENTS = [
  { id: "component-1", component_name: "Activated Carbon", component_type_id: "ct-1", component_report_name: null, component_report_uom: "Tons", component_inventory_uom: "Tons", sort_order: 1, active: true },
];

export const SAMPLE_AREA_LAYER_MAP = [
  { id: "al-1", area_id: "area-1", layer_id: "layer-1", min_design_thickness: 6, target_thickness: 9, overplacement_tolerance: 2, cy_goal: 8000, tons_goal: null, sf_goal: null },
  { id: "al-2", area_id: "area-1", layer_id: "layer-3", min_design_thickness: 12, target_thickness: 12, overplacement_tolerance: 1, cy_goal: null, tons_goal: 4500, sf_goal: null },
  { id: "al-3", area_id: "area-2", layer_id: "layer-2", min_design_thickness: 8, target_thickness: 10, overplacement_tolerance: 2, cy_goal: 6000, tons_goal: null, sf_goal: null },
];

export const SAMPLE_LAYER_MATERIAL_MAP = [
  { id: "lm-1", layer_id: "layer-1", material_id: "material-1", loading_rate: null, layer_material_report_name: null },
  { id: "lm-2", layer_id: "layer-2", material_id: "material-2", loading_rate: 45, layer_material_report_name: "Amended Sand — Lift 2" },
  { id: "lm-3", layer_id: "layer-3", material_id: "material-3", loading_rate: null, layer_material_report_name: null },
];

export const SAMPLE_MATERIAL_COMPONENT_MAP = [
  { id: "mc-1", material_id: "material-2", component_id: "component-1", component_percent_of_material: 5 },
];
