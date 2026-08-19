
export const SAMPLE_PRODUCTION_PLAN = {
  expectedGohPerDay: 10,
  productionDaysPerWeek: 6,
  productionStartDate: '2026-05-19',
  bidGoalRate: 128.4,
  primaryMeasure: 'CY',
};

export const SAMPLE_SCHEDULED_OFF_DAYS = [
  { date: '2026-08-16', reason: 'Client holiday' },
  { date: '2026-09-07', reason: 'Labor Day' },
];

export const SAMPLE_METRICS_CONFIG = [
  { key: 'cy', label: 'CY Dredged', source: 'Auto', unit: 'CY', sortOrder: 1 },
  { key: 'sf', label: 'SF Covered', source: 'Auto', unit: 'SF', sortOrder: 2 },
  { key: 'efficiency', label: 'Efficiency', source: 'Auto', unit: '%', sortOrder: 3 },
  { key: 'samples', label: 'Samples Collected', source: 'Manual', unit: 'ea', sortOrder: 4 },
];

export const SAMPLE_SITE_EQUIPMENT = [
  { id: 'eq-1', name: 'Dredge 1 — Illinois', mobilized: '2026-05-19', demobilized: null },
  { id: 'eq-2', name: 'Dredge 2 — Beltrami', mobilized: '2026-06-02', demobilized: null },
  { id: 'eq-3', name: 'Booster Pump 1', mobilized: '2026-05-19', demobilized: null },
];

export const SAMPLE_ATTACHMENTS = [
  { id: 'att-1', name: 'Contract Specifications.pdf', uploadedAt: '2026-05-15' },
  { id: 'att-2', name: 'Permit — USACE 2026-0451.pdf', uploadedAt: '2026-05-15' },
];

export const SAMPLE_DREDGE_CHART_CONFIG = {
  configured: true,
  cellGrid: 'CSC numbered cell grid (Kalamazoo style)',
  lastHypackUpload: '2026-08-05',
  chartStyle: 'csc',
  overlapToleranceFt: 5,
  gapWidth: 12,
};

export const SAMPLE_DREDGE_EXCLUSION_AREAS = [
  { id: 'excl-1', name: 'Dock pilings — NE corner' },
  { id: 'excl-2', name: 'Buried cable crossing' },
];

export const SAMPLE_HYPACK_UPLOADS = [
  { id: 'up-1', name: '20260805_FL.RAW', uploadedAt: '2026-08-05 06:42' },
  { id: 'up-2', name: '20260804_FL.RAW', uploadedAt: '2026-08-04 06:38' },
];
