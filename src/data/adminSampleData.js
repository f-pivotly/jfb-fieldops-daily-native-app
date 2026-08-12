
export const SAMPLE_ADMIN_KPIS = {
  operators: 14,
  equipment: 9,
  eventsToday: 37,
};

export const USER_ROLE_COLOR = {
  admin: "red",
  director: "violet",
  pm: "blue",
  cqc: "green",
  operator: "gray",
};

export const USER_ROLES = ["operator", "cqc", "pm", "director", "admin"];

export const SAMPLE_ADMIN_USERS = [
  { id: "usr-1", full_name: "Sample Admin", email: "admin@example.com", role: "admin", project_name: "All Projects", active: true },
  { id: "usr-2", full_name: "Sample Director", email: "director@example.com", role: "director", project_name: "All Projects", active: true },
  { id: "usr-3", full_name: "Sample PM One", email: "pm1@example.com", role: "pm", project_name: "Sandy Point Harbor Dredging", active: true },
  { id: "usr-4", full_name: "Sample PM Two", email: "pm2@example.com", role: "pm", project_name: "Clearwater Cove Capping", active: true },
  { id: "usr-5", full_name: "Sample CQC", email: "cqc@example.com", role: "cqc", project_name: "Sandy Point Harbor Dredging", active: false },
];

export const NON_OPERATIONAL_CATEGORIES = [
  "STARTUP/SHUTDOWN",
  "WASH PIPELINE",
  "ADD / REMOVE PIPELINE",
  "MOVE PIPELINE",
  "CHANGE / REPAIR CUTTERHEAD",
  "CLEAN CUTTERHEAD",
  "CLEAN / REPAIR MAIN PUMP",
  "ENGINE ROOM / HYDRAULICS",
  "MOB TO NEW AREA",
  "MOVE DREDGE",
];

export const SAMPLE_LIVE_PROJECTS = ["Sandy Point Harbor Dredging", "Clearwater Cove Capping"];

export const SAMPLE_LIVE_EVENTS = [
  { id: "ev-1", report_date: "2026-08-12", project: "Sandy Point Harbor Dredging", equipment: "Dredge 1", operator_name: "Adam Trofka", time_from: "07:00", time_to: "07:30", duration_hours: 0.5, category: "STARTUP/SHUTDOWN", area_l1: "North Basin", area_l2: null, area_l3: null, status: "submitted" },
  { id: "ev-2", report_date: "2026-08-12", project: "Sandy Point Harbor Dredging", equipment: "Dredge 1", operator_name: "Adam Trofka", time_from: "07:30", time_to: "11:45", duration_hours: 4.25, category: "PRODUCTION", area_l1: "North Basin", area_l2: "NB-1", area_l3: null, status: "submitted" },
  { id: "ev-3", report_date: "2026-08-12", project: "Sandy Point Harbor Dredging", equipment: "Booster Pump 1", operator_name: "Ean Marker", time_from: "11:45", time_to: "12:30", duration_hours: 0.75, category: "CLEAN / REPAIR MAIN PUMP", area_l1: "North Basin", area_l2: "NB-1", area_l3: null, status: "draft" },
  { id: "ev-4", report_date: "2026-08-12", project: "Clearwater Cove Capping", equipment: "Placement Barge", operator_name: "Sample Operator 3", time_from: "08:00", time_to: "15:00", duration_hours: 7, category: "PRODUCTION", area_l1: "South Basin", area_l2: null, area_l3: null, status: "pm_review" },
  { id: "ev-5", report_date: "2026-08-11", project: "Clearwater Cove Capping", equipment: "Placement Barge", operator_name: "Sample Operator 3", time_from: "13:10", time_to: "14:00", duration_hours: 0.83, category: "MOVE DREDGE", area_l1: "South Basin", area_l2: null, area_l3: null, status: "released" },
];
