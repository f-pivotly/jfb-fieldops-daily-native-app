
export const SAMPLE_AREAS = [
  { id: "area-1", name: "North Basin", level: 1, parent_id: null, sort_order: 1, volume_goal_cy: 20000, area_goal_sf: null, active: true },
  { id: "area-1-1", name: "NB-1", level: 2, parent_id: "area-1", sort_order: 1, volume_goal_cy: null, area_goal_sf: 5000, active: true },
  { id: "area-1-1-a", name: "NB-1-A", level: 3, parent_id: "area-1-1", sort_order: 1, volume_goal_cy: null, area_goal_sf: 2500, active: true },
  { id: "area-1-1-b", name: "NB-1-B", level: 3, parent_id: "area-1-1", sort_order: 2, volume_goal_cy: null, area_goal_sf: 2500, active: true },
  { id: "area-1-2", name: "NB-2", level: 2, parent_id: "area-1", sort_order: 2, volume_goal_cy: null, area_goal_sf: 4000, active: true },
  { id: "area-2", name: "South Basin", level: 1, parent_id: null, sort_order: 2, volume_goal_cy: 15000, area_goal_sf: null, active: true },
];

export const DELAY_CODE_WORK_TYPES = [
  "Hydraulic Dredging",
  "Hydraulic Capping",
  "Mechanical Dredging",
  "Mechanical Capping",
  "Sediment Processing",
  "Water Treatment",
];

export const DELAY_CODE_CATEGORY_ORDER = [
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

export const SAMPLE_DELAY_CODE_MASTER = [
  { id: "m-1", work_type: "Hydraulic Dredging", category: "General", code: "Weather Delay", code_num: 100 },
  { id: "m-2", work_type: "Hydraulic Dredging", category: "General", code: "Safety Meeting", code_num: 101 },
  { id: "m-3", work_type: "Hydraulic Dredging", category: "Mechanical", code: "Pump Repair", code_num: 200 },
  { id: "m-4", work_type: "Hydraulic Dredging", category: "Mechanical", code: "Cutterhead Change", code_num: 201 },
  { id: "m-5", work_type: "Hydraulic Dredging", category: "Movement", code: "Move Dredge", code_num: 300 },
  { id: "m-6", work_type: "Hydraulic Dredging", category: "Survey/Sample", code: "Bathymetric Survey", code_num: 400 },
  { id: "m-7", work_type: "Hydraulic Dredging", category: "Booster/Land Plant", code: "Booster Pump Maintenance", code_num: 500 },
  { id: "m-8", work_type: "Hydraulic Dredging", category: "Operational Change", code: "Change Discharge Area", code_num: 600 },
  { id: "m-9", work_type: "Hydraulic Capping", category: "General", code: "Weather Delay", code_num: 100 },
  { id: "m-10", work_type: "Hydraulic Capping", category: "General", code: "Safety Meeting", code_num: 101 },
  { id: "m-11", work_type: "Hydraulic Capping", category: "Mechanical", code: "Placement Barge Repair", code_num: 210 },
  { id: "m-12", work_type: "Hydraulic Capping", category: "Movement", code: "Move Placement Barge", code_num: 310 },
  { id: "m-13", work_type: "Hydraulic Capping", category: "Project Specific", code: "Cap Material Delay", code_num: 700 },
];

export const SAMPLE_PROJECT_DELAY_CODES = [
  { id: "p-1", work_type: "Hydraulic Dredging", category: "General", code: "Weather Delay", code_num: 100, active: true },
  { id: "p-2", work_type: "Hydraulic Dredging", category: "General", code: "Safety Meeting", code_num: 101, active: true },
  { id: "p-3", work_type: "Hydraulic Dredging", category: "Mechanical", code: "Pump Repair", code_num: 200, active: false },
  { id: "p-4", work_type: "Hydraulic Dredging", category: "Mechanical", code: "Cutterhead Change", code_num: 201, active: true },
  { id: "p-5", work_type: "Hydraulic Dredging", category: "Movement", code: "Move Dredge", code_num: 300, active: true },
  { id: "p-6", work_type: "Hydraulic Capping", category: "General", code: "Weather Delay", code_num: 100, active: true },
  { id: "p-7", work_type: "Hydraulic Capping", category: "Mechanical", code: "Placement Barge Repair", code_num: 210, active: true },
  { id: "p-8", work_type: "Hydraulic Capping", category: "Movement", code: "Move Placement Barge", code_num: 310, active: true },
  { id: "p-9", work_type: "Hydraulic Capping", category: "Project Specific", code: "Cap Material Delay", code_num: 700, active: false },
  { id: "p-10", work_type: null, category: "Project Specific", code: "Client Site Walk", code_num: 9901, active: true },
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
