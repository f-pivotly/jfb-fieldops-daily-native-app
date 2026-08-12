// Static sample data shared by DashboardPage + ReportListPage while
// apg-jfbo-dashboard / apg-jfbo-report-list and the `project` / `report_day`
// domains don't exist yet. Field names match jfb-fieldops-daily's
// src/pages/ProjectDashboard.tsx + src/pages/ReportList.tsx, so swapping this
// for a real domain read later is a data-source change, not a UI rewrite.
//
// project_code / name / work_type are the real active projects (per
// jfb-fieldops-daily/README.md and its sql/ seed files). `client` is a
// placeholder — the real client names aren't in this sample, only in
// production data.
export const SAMPLE_PROJECTS = [
  {
    id: 'sample-172603',
    project_code: '172603',
    name: 'Fountain Lake Phase 3',
    client: 'Sample Client — TBD',
    work_type: 'Dredging',
    equipment_count: 3,
    last_report_date: '2026-08-10',
    today_status: 'released',
  },
  {
    id: 'sample-422509',
    project_code: '422509',
    name: 'Weigand Marina Expansion',
    client: 'Sample Client — TBD',
    work_type: 'Dredging',
    equipment_count: 2,
    last_report_date: '2026-08-10',
    today_status: 'cqc_review',
  },
  {
    id: 'sample-172507',
    project_code: '172507',
    name: 'Cocoa Beach Capping',
    client: 'Sample Client — TBD',
    work_type: 'Capping',
    equipment_count: 1,
    last_report_date: '2026-08-09',
    today_status: 'draft',
  },
  {
    id: 'sample-152601',
    project_code: '152601',
    name: 'Torch Lake LLRA',
    client: 'Sample Client — TBD',
    work_type: 'Dredging',
    equipment_count: 4,
    last_report_date: '2026-08-11',
    today_status: 'approved',
  },
  {
    id: 'sample-152407',
    project_code: '152407',
    name: 'Kalamazoo Area 4',
    client: 'Sample Client — TBD',
    work_type: 'Dredging',
    equipment_count: 2,
    last_report_date: null,
    today_status: 'no_report',
  },
];

export function findProject(id) {
  return SAMPLE_PROJECTS.find((p) => p.id === id) ?? null;
}

// Mirrors jfb-fieldops-daily/src/types/db.ts REPORT_STATUS_LABEL.
export const REPORT_STATUS_LABEL = {
  no_report: 'No Report',
  draft: 'Draft',
  cqc_review: 'PM Review',
  approved: 'Approved',
  released: 'Released',
};

// Mantine's own named colors — no new palette introduced.
export const REPORT_STATUS_COLOR = {
  no_report: 'gray',
  draft: 'gray',
  cqc_review: 'yellow',
  approved: 'green',
  released: 'teal',
};

// Report rows per project, grouped by cal week — mirrors ReportList.tsx's
// WeekGroup shape. One project (Fountain Lake) gets a fuller history so the
// week-grouping UI has something to show; the rest get a lighter set.
export const SAMPLE_REPORTS_BY_PROJECT = {
  'sample-172603': [
    { date: '2026-08-11', day: 'Tue', status: 'draft', calWeek: 33, projectWeek: 12 },
    { date: '2026-08-10', day: 'Mon', status: 'released', calWeek: 33, projectWeek: 12 },
    { date: '2026-08-08', day: 'Sat', status: 'released', calWeek: 32, projectWeek: 11 },
    { date: '2026-08-07', day: 'Fri', status: 'released', calWeek: 32, projectWeek: 11 },
    { date: '2026-08-06', day: 'Thu', status: 'released', calWeek: 32, projectWeek: 11 },
  ],
  'sample-422509': [
    { date: '2026-08-10', day: 'Mon', status: 'cqc_review', calWeek: 33, projectWeek: 6 },
    { date: '2026-08-08', day: 'Sat', status: 'released', calWeek: 32, projectWeek: 5 },
    { date: '2026-08-07', day: 'Fri', status: 'released', calWeek: 32, projectWeek: 5 },
  ],
  'sample-172507': [
    { date: '2026-08-09', day: 'Sun', status: 'draft', calWeek: 32, projectWeek: 2 },
  ],
  'sample-152601': [
    { date: '2026-08-11', day: 'Tue', status: 'approved', calWeek: 33, projectWeek: 20 },
    { date: '2026-08-10', day: 'Mon', status: 'released', calWeek: 33, projectWeek: 20 },
  ],
  'sample-152407': [],
};
