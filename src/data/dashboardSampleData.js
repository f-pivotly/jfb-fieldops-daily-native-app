// Static sample data for DashboardPage while apg-jfbo-dashboard / the `project`
// domain don't exist yet. Field names match the `project` table as read by
// jfb-fieldops-daily/src/pages/ProjectDashboard.tsx, so swapping this for a real
// domain read later is a data-source change, not a UI rewrite.
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
