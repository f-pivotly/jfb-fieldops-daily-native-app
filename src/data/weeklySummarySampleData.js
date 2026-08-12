// Sample data for WeeklySummaryPage (apg-jfbo-weekly-summary). Mirrors
// jfb-fieldops-daily/src/pages/WeeklySummaryPage.tsx's section shapes.

export const SAMPLE_WEEK_RANGE = { start: '2026-08-09', end: '2026-08-15', reportedCount: 3 };

export const SAMPLE_WEEKLY_NARRATIVE_SECTIONS = [
  {
    key: 'production',
    label: 'Production Summary',
    entries: [
      { date: '2026-08-11', text: 'Dredge 1 worked Cell 4 all shift after a barge-swap delay midday.' },
      { date: '2026-08-10', text: 'Full shift on Cell 4, no delays.' },
      { date: '2026-08-08', text: 'Started Cell 4, survey crew on site AM.' },
    ],
    draft: 'Crews completed Cell 4 this week, moving 3,730 CY across 3 production days with one barge-swap delay.',
  },
  {
    key: 'delays',
    label: 'Delays / Issues',
    entries: [{ date: '2026-08-11', text: 'Waiting on Material (barge swap) — 1h 20m.' }],
    draft: 'One barge-swap delay (1h 20m) on 8/11; otherwise no lost time this week.',
  },
];

export const SAMPLE_WEEKLY_PHOTOS = [
  { slot: 1, label: 'Cell 4 aerial', uploaded: true },
  { slot: 2, label: '', uploaded: false },
];

export const SAMPLE_WEEKLY_PRODUCTION = {
  unit: 'CY',
  plannedCy: 3600,
  actualCy: 3730,
  goh: 29.0,
};

export const SAMPLE_WEEKLY_DELAYS = [
  { description: 'Waiting on Material', hours: 1.33, pct: 1.0 },
];

export const SAMPLE_DREDGE_CHART_STATUS = { dredgesWithCoverage: 1 };
