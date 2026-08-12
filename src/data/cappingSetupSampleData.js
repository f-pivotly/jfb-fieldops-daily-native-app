// Sample data for CappingSetupPage (apg-jfbo-capping-setup) — the bespoke
// wizard called out in JFB_FIELDOPS_DAILY_SCREENS_AND_PAGE_SLUGS.md §3.
// Field names mirror the admin console's Layers/Materials/Components/
// Mappings sub-tabs (jfb-fieldops-daily/admin/index.html).

export const SAMPLE_LAYERS = [
  { id: 'lyr-1', name: 'Lift 1', type: 'Sand Cap', sortOrder: 1, reportName: 'Lift 1' },
  { id: 'lyr-2', name: 'Lift 2', type: 'Sand Cap', sortOrder: 2, reportName: 'Lift 2' },
  { id: 'lyr-3', name: 'Armor', type: 'Armor Stone', sortOrder: 3, reportName: 'Armor Layer' },
];

export const SAMPLE_MATERIALS = [
  { id: 'mat-1', name: 'Sand', type: 'Fill', sortOrder: 1, reportName: 'Sand' },
  { id: 'mat-2', name: 'Amended Sand', type: 'Fill', sortOrder: 2, reportName: 'Amended Sand' },
  { id: 'mat-3', name: 'Armor Rock', type: 'Stone', sortOrder: 3, reportName: 'Armor Rock' },
];

export const SAMPLE_COMPONENTS = [
  { id: 'cmp-1', name: 'Sand', type: 'Base', sortOrder: 1, reportUom: 'Tons', invUom: 'Tons' },
  { id: 'cmp-2', name: 'Reactive Amendment', type: 'Additive', sortOrder: 2, reportUom: 'Tons', invUom: 'CY' },
];

export const SAMPLE_LAYER_MATERIAL_MAP = [
  { layer: 'Lift 1', material: 'Sand' },
  { layer: 'Lift 2', material: 'Amended Sand' },
  { layer: 'Armor', material: 'Armor Rock' },
];

export const SAMPLE_MATERIAL_COMPONENT_MAP = [
  { material: 'Amended Sand', component: 'Sand', pctOrRatio: '95%' },
  { material: 'Amended Sand', component: 'Reactive Amendment', pctOrRatio: '5%' },
];
