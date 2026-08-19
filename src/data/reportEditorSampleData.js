
export const SAMPLE_EQUIPMENT = [
  { id: 'eq-1', name: 'Dredge 1 — Illinois' },
  { id: 'eq-2', name: 'Dredge 2 — Beltrami' },
  { id: 'eq-3', name: 'Booster Pump 1' },
];

export const SAMPLE_CHECKLIST = {
  event_log_reviewed: true,
  transitions_added: true,
  production_stats_entered: true,
  photos_complete: false,
  narratives_complete: true,
  metrics_entered: false,
};

export const SAMPLE_EVENTS = [
  { id: 'ev-1', from: '06:00', to: '06:15', category: 'STARTUP/SHUTDOWN', area: 'Bancroft Bay', pass: '1st Pass', tsca: 'No', operator: 'A. Trofka', notes: 'Startup checks', source: 'operator' },
  { id: 'ev-2', from: '06:15', to: '11:30', category: 'ACTIVE DREDGING', area: 'Bancroft Bay › Cell 4', pass: '1st Pass', tsca: 'No', operator: 'A. Trofka', notes: '', source: 'operator' },
  { id: 'ev-3', from: '11:30', to: '11:50', category: 'Lunch', area: '—', pass: '—', tsca: '—', operator: 'A. Trofka', notes: '', source: 'operator' },
  // Deliberate 10-minute gap (11:50–12:00) so the Unaccounted Hours callout has something to show.
  { id: 'ev-4', from: '12:00', to: '13:20', category: 'Waiting on Material', area: '—', pass: '—', tsca: '—', operator: 'A. Trofka', notes: 'Barge swap delay', source: 'pe' },
  { id: 'ev-5', from: '13:20', to: '18:00', category: 'ACTIVE DREDGING', area: 'Bancroft Bay › Cell 4', pass: '1st Pass', tsca: 'No', operator: 'A. Trofka', notes: '', source: 'operator' },
];

export const SAMPLE_TRANSITION_AREAS = ['Bancroft Bay', 'Bancroft Bay › Cell 4', 'Bancroft Bay › Cell 5'];
export const SAMPLE_PASS_OPTIONS = ['1st Pass', '2nd Pass', '3rd Pass'];
export const SAMPLE_EVENT_CATEGORIES = [
  'ACTIVE DREDGING',
  'STARTUP/SHUTDOWN',
  'Lunch',
  'Waiting on Material',
  'Weather Delay',
  'Pump Repair',
  'Move Dredge',
  'Survey',
];

export const SAMPLE_EVENT_TOTALS = {
  shiftStart: '06:00',
  shiftEnd: '18:00',
  operationalHours: 9.75,
  delayHours: 2.25,
  shiftHours: 12,
  balanced: true,
};

export const SAMPLE_PRODUCTION_ROWS = [
  { key: 'p1', area: 'Bancroft Bay', pass: '1st Pass', goh: 9.75, noh: 9.75, cy: 1240, sf: 18500, avgFace: 1.81, notes: '' },
  { key: 'p2', area: 'Bancroft Bay › Cell 5', pass: '1st Pass', goh: 2.25, noh: 0, cy: null, sf: null, avgFace: null, notes: 'Not started' },
];

export const SAMPLE_PRODUCTION_TOTALS = { goh: 12.0, noh: 9.75, cy: 1240, sf: 18500, avgFace: 1.81 };

export const SAMPLE_CAPPING_ROWS = [
  { key: 'c1', area: 'North Basin', layer: 'Lift 1', tonsPlaced: 340, dryTons: 312, acres: 1.4, material: 'Sand' },
  { key: 'c2', area: 'North Basin', layer: 'Armor', tonsPlaced: 180, dryTons: 178, acres: 0.6, material: 'Armor Rock' },
];
export const SAMPLE_CAPPING_TOTALS = { tonsPlaced: 520, dryTons: 490, acres: 2.0 };

export const SAMPLE_FLOW_STATS = { pipeDiameterIn: 12, avgVelocityFps: 14.2, avgFlowRateGpm: 4180, noh: 9.75 };
export const SAMPLE_PIPE_LENGTHS = [
  { id: 'pl-1', name: 'Booster 1 → Cell 4', lengthFt: 1800 },
  { id: 'pl-2', name: 'Cell 4 discharge', lengthFt: 420 },
];

export const SAMPLE_PHOTOS = [
  { slot: 1, label: 'Cutterhead — Cell 4', uploaded: true, rejected: false },
  { slot: 2, label: '', uploaded: false, rejected: false },
];

export const SAMPLE_METRICS = [
  { key: 'cy', label: 'CY Dredged', source: 'Auto', autoKind: 'volume_cy', unit: 'CY', day: 1240, week: 6820, total: 48210, hidden: false },
  { key: 'sf', label: 'SF Covered', source: 'Auto', autoKind: 'area_sf', unit: 'SF', day: 18500, week: 102300, total: 712400, hidden: false },
  { key: 'efficiency', label: 'Efficiency', source: 'Auto', autoKind: 'efficiency_pct', unit: '%', day: 81.3, week: 78.9, total: 76.2, hidden: false },
  { key: 'samples', label: 'Samples Collected', source: 'Manual', autoKind: null, unit: 'ea', day: 2, week: 9, total: 61, hidden: false },
];

export const AUTO_METRIC_SOURCES = [
  { value: 'volume_cy', label: 'Volume (CY)' },
  { value: 'area_sf', label: 'Area (SF)' },
  { value: 'goh', label: 'Gross Operating Hours' },
  { value: 'noh', label: 'Net Operating Hours' },
  { value: 'delay_hours', label: 'Delay Hours' },
  { value: 'efficiency_pct', label: 'Efficiency %' },
];

export const SAMPLE_SAFETY_TENETS = [
  { label: 'PPE compliant', status: 'pass' },
  { label: 'Housekeeping', status: 'pass' },
  { label: 'Barricades / signage', status: 'pass' },
  { label: 'Fall protection', status: 'na' },
  { label: 'Lockout / Tagout', status: 'na' },
  { label: 'Hot work permit', status: 'na' },
  { label: 'Culture tenant of the day', status: 'pass', detail: 'Speak Up' },
];

export const SAMPLE_CREW = [
  { id: 'crew-1', category: 'Operators', count: 2, hours: 24 },
  { id: 'crew-2', category: 'Deckhands', count: 1, hours: 12 },
  { id: 'crew-3', category: 'Surveyors', count: 1, hours: 8 },
];

export const SAMPLE_PRIOR_DAY_CREW = [
  { id: 'prior-1', category: 'Operators', count: 2, hours: 22 },
  { id: 'prior-2', category: 'Deckhands', count: 1, hours: 11 },
  { id: 'prior-3', category: 'Surveyors', count: 1, hours: 8 },
  { id: 'prior-4', category: 'Sheet Pile Crew', count: 3, hours: 30 },
];

export const SAMPLE_CLIMATE = {
  tempHighF: 86,
  tempLowF: 71,
  precipTodayIn: 0.0,
  precipMtdIn: 2.4,
  precipPtdIn: 11.1,
  wind: '8 mph SE',
  sky: 'Partly cloudy',
};

export const SAMPLE_SIGNATURES = {
  preparer: { name: 'J. Ramirez', signedAt: '2026-08-11 18:42' },
  sssho: { name: 'M. Sunday', signedAt: null },
};

export const SAMPLE_DREDGE_PROGRESS = {
  totalCoveragePct: 62,
  cellsComplete: 14,
  cellsTotal: 22,
  lastSurveyDate: '2026-08-10',
};

export const SAMPLE_PM_REVIEW_CHECKS = [
  { key: 'event_log', label: 'Event log present', status: 'pass' },
  { key: 'shift_balance', label: 'Shift balance per equipment', status: 'pass' },
  { key: 'production', label: 'Production stats entered', status: 'pass' },
  { key: 'narratives', label: 'Narratives complete', status: 'fail', detail: 'Delays / Issues section is empty' },
  { key: 'photos', label: 'Photos uploaded, labeled, not rejected', status: 'pass' },
];

export const SAMPLE_PLACEMENT_PROGRESS = {
  layer: 'Lift 2 — Sand Cap',
  tonsPlacedToday: 340,
  tonsPlacedTotal: 4820,
  coveragePct: 44,
};

export const SAMPLE_BUCKET_ATTRIBUTION = [
  { id: 'ba-1', layer: 'Lift 1', material: 'Sand', avgSfPerBucket: 42, buckets: 18 },
  { id: 'ba-2', layer: 'Lift 2', material: 'Amended Sand', avgSfPerBucket: 38, buckets: 12 },
  { id: 'ba-3', layer: 'Armor', material: 'Armor Rock', avgSfPerBucket: 25, buckets: 6 },
];

export const SAMPLE_WATER_QUALITY = [
  { time: '06:00', backgroundNtu: 3.1, complianceNtu: 4.0, alert: false },
  { time: '09:00', backgroundNtu: 3.4, complianceNtu: 6.2, alert: false },
  { time: '12:00', backgroundNtu: 3.0, complianceNtu: 12.8, alert: true },
  { time: '15:00', backgroundNtu: 3.3, complianceNtu: 5.1, alert: false },
];

export const SAMPLE_AIR_QUALITY = [
  { time: '06:00', pm10: 22, alert: false },
  { time: '09:00', pm10: 38, alert: false },
  { time: '12:00', pm10: 61, alert: false },
  { time: '15:00', pm10: 44, alert: false },
];
