
export const REPORT_STATUS_LABEL = {
  no_report: 'No Report',
  draft: 'Draft',
  cqc_review: 'PM Review',
  approved: 'Approved',
  released: 'Released',
};

export const REPORT_STATUS_COLOR = {
  no_report: 'gray',
  draft: 'gray',
  cqc_review: 'yellow',
  approved: 'green',
  released: 'teal',
};

export const SAMPLE_REPORTS_BY_PROJECT = {
  172603: [
    { date: '2026-08-11', day: 'Tue', status: 'draft', calWeek: 33, projectWeek: 12 },
    { date: '2026-08-10', day: 'Mon', status: 'released', calWeek: 33, projectWeek: 12 },
    { date: '2026-08-08', day: 'Sat', status: 'released', calWeek: 32, projectWeek: 11 },
    { date: '2026-08-07', day: 'Fri', status: 'released', calWeek: 32, projectWeek: 11 },
    { date: '2026-08-06', day: 'Thu', status: 'released', calWeek: 32, projectWeek: 11 },
  ],
  422509: [
    { date: '2026-08-10', day: 'Mon', status: 'cqc_review', calWeek: 33, projectWeek: 6 },
    { date: '2026-08-08', day: 'Sat', status: 'released', calWeek: 32, projectWeek: 5 },
    { date: '2026-08-07', day: 'Fri', status: 'released', calWeek: 32, projectWeek: 5 },
  ],
  172507: [
    { date: '2026-08-09', day: 'Sun', status: 'draft', calWeek: 32, projectWeek: 2 },
  ],
  152601: [
    { date: '2026-08-11', day: 'Tue', status: 'approved', calWeek: 33, projectWeek: 20 },
    { date: '2026-08-10', day: 'Mon', status: 'released', calWeek: 33, projectWeek: 20 },
  ],
  152407: [],
};
