// Sample data for RealizedToDatePage (apg-jfbo-realized-to-date). Field
// shapes mirror jfb-fieldops-daily/src/pages/RealizedToDatePage.tsx's
// SummaryCard / ProjectionsCard / DelaySummaryCard / WeeklyLog.

export const SAMPLE_REALIZED_SUMMARY = {
  projectName: 'Fountain Lake Phase 3',
  unit: 'CY',
  goal: 220000,
  toDate: 48210,
  plannedToDate: 45000,
  cyAheadOfPace: 3210,
  remaining: 171790,
  pctComplete: 0.219,
  bidRate: 128.4,
  currentRate: 134.1,
  anticipatedDailyProduction: 1284,
  daysAheadBehind: 2.5,
};

export const SAMPLE_PROJECTIONS = [
  { key: 'bid', label: 'At bid rate', rate: 128.4, daysLeft: 84, estFinish: '2026-11-03' },
  { key: 'current', label: 'At current rate', rate: 134.1, daysLeft: 80, estFinish: '2026-10-30' },
  { key: 'trailing30', label: 'Trailing 30-day rate', rate: 131.0, daysLeft: 82, estFinish: '2026-11-01' },
];

export const SAMPLE_DELAY_SUMMARY = [
  { description: 'Waiting on Material', hours: 6.5, pct: 0.42 },
  { description: 'Weather', hours: 4.0, pct: 0.26 },
  { description: 'Mechanical Repair', hours: 3.0, pct: 0.19 },
  { description: 'Survey', hours: 2.0, pct: 0.13 },
];

export const SAMPLE_WEEKLY_LOG = [
  {
    projectWeek: 12,
    rows: [
      { date: '2026-08-11', cy: 1240, goh: 9.75, cyPerGoh: 127.2, runningCy: 48210, excluded: false },
      { date: '2026-08-10', cy: 1310, goh: 10.0, cyPerGoh: 131.0, runningCy: 46970, excluded: false },
    ],
    subtotalCy: 2550,
    subtotalGoh: 19.75,
  },
  {
    projectWeek: 11,
    rows: [
      { date: '2026-08-08', cy: 1180, goh: 9.5, cyPerGoh: 124.2, runningCy: 45660, excluded: false },
      { date: '2026-08-07', cy: 0, goh: 0, cyPerGoh: 0, runningCy: 44480, excluded: true, reason: 'Permit hold' },
      { date: '2026-08-06', cy: 1260, goh: 9.75, cyPerGoh: 129.2, runningCy: 44480, excluded: false },
    ],
    subtotalCy: 2440,
    subtotalGoh: 19.25,
  },
];

export const SAMPLE_SHUTDOWN_PERIODS = [
  { id: 'sd-1', start: '2026-08-07', end: '2026-08-07', reason: 'Permit hold' },
];

export const SAMPLE_SCHEDULED_OFF_DAYS = [
  { date: '2026-08-16', reason: 'Client holiday' },
];
