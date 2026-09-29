
import json

try:
    import requests
    REQUESTS_AVAILABLE = True
except ModuleNotFoundError:
    requests = None
    REQUESTS_AVAILABLE = False

try:
    from pivotly import (
        BOOLEAN,
        TEXT,
        PivotlyAPI,
        declare_param,
        get_privileged_secret,
    )
    PIVOTLY_AVAILABLE = True
except ModuleNotFoundError:
    BOOLEAN = "BOOLEAN"
    TEXT = "TEXT"
    PivotlyAPI = None
    PIVOTLY_AVAILABLE = False

    def declare_param(*args, **kwargs):
        if "default" in kwargs:
            return kwargs["default"]
        if len(args) > 2:
            return args[2]
        return None

    def get_privileged_secret(*args, **kwargs):
        raise RuntimeError("Pivotly runner secret helper is unavailable outside Pivotly.")


SCRIPT_VERSION = "v1-jfb-dataview-sync-24-r4"

PARAM_CONTRACT_VERSION = "jfb_dataview_params_v1"

DATA_VIEW_ITEM_TYPE = "data_view"
LEGACY_ITEM_TYPE = "dataview"
ORPHAN_SLUG_PREFIX = "zz-orphan-"
MAX_SLUG_LENGTH = 128
MAX_DESCRIPTION_LENGTH = 1000

STABLE_PARAM_CONTRACT = [
    {"name": "mode", "type": "TEXT", "default": "self_check"},
    {"name": "param_contract_version", "type": "TEXT", "default": PARAM_CONTRACT_VERSION},
    {"name": "dry_run", "type": "BOOLEAN", "default": True},
    {"name": "publish_config", "type": "BOOLEAN", "default": False},
    {"name": "item_scope", "type": "TEXT", "default": "all"},
    {"name": "output_shape", "type": "TEXT", "default": "summary"},
]

PUBLIC_RUNNER_PARAMS = [item["name"] for item in STABLE_PARAM_CONTRACT]

VALID_MODES = [
    "self_check",
    "detect_orphans",
    "bootstrap_only",
    "publish_only",
    "release_orphan_slugs",
]

PARAM_DEBUG = {}

TOKEN_ENDPOINT = "https://login.microsoftonline.com/39f6cf5e-725d-4087-a1e3-e7b4442c867e/oauth2/v2.0/token"
API_SCOPE = "https://pivotlyidentityplatformdev.onmicrosoft.com/api/.default"
CLIENT_ID_SECRET = "jfb-pivotly-api-client-id"
CLIENT_SECRET_SECRET = "jfb-pivotly-api-client-secret"

PIVOTLY_API_DIAGNOSTIC = {}

SECRET_ERROR_REMEDIATION = {
    "secret_not_allowed": (
        "No approved Allowed Secrets grant for this script. "
        "Admin -> Variables -> Allowed Secrets: Consumer Type=script, "
        "Consumer Slug=<this script's slug>, Variable Slug=<secret slug>, Status=approved."
    ),
    "secret_not_found": (
        "The Secret Variable slug does not exist in this environment. "
        "Check spelling against Admin -> Variables, or point the constant at the right slug."
    ),
    "runner_signed_token_rejected": (
        "The runner signed-token was rejected for this job. Re-run from the Portal "
        "rather than replaying an old job, and confirm the script record is enabled."
    ),
    "secret_accessor_missing": "Unexpected Secret wrapper shape; report the runner version.",
    "secret_read_exception": "Inspect error_detail in secret_reads for the raw runner message.",
}

COLUMN_TYPE_ENUM = [
    "text", "integer", "bigint", "uuid", "boolean", "numeric", "date", "timestamptz", "jsonb",
]
PARAMETER_TYPE_ENUM = [
    "text", "integer", "uuid", "boolean", "numeric", "date", "timestamptz",
]
AUTHORING_MODE_ENUM = ["builder", "direct_sql"]
IMPLEMENTATION_ENUM = ["function", "view"]
CFG_DATA_KEYS = [
    "slug", "description", "authoring_mode", "implementation", "direct_sql",
    "builder", "parameters", "area", "columns", "_runtime",
]
COLUMN_KEYS = ["name", "type", "description", "source_attr", "alias"]
PARAMETER_KEYS = ["name", "type", "required", "default", "description"]


def parse_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ["1", "true", "yes", "y", "on"]


def debuggable(value):
    if value is None or isinstance(value, (bool, int, float)):
        return value
    text = str(value)
    return text if len(text) <= 120 else text[:120] + "...truncated"


def safe_text(value, max_length=400):
    text = str(value or "")
    for marker in ["Authorization:", "authorization:", "Bearer ", "bearer "]:
        if marker in text:
            head, _sep, _tail = text.partition(marker)
            text = head + marker + "[REDACTED]"
            break
    if len(text) > max_length:
        return text[:max_length] + "...truncated"
    return text


def param_value(name, data_type, default):
    try:
        value = declare_param(name, data_type)
        error = ""
    except Exception as exc:
        PARAM_DEBUG[name] = {
            "declared_type": str(data_type),
            "raw_value": None,
            "returned_default": True,
            "default": debuggable(default),
            "error": safe_text(exc),
        }
        return default

    present = value is not None and not (isinstance(value, str) and value.strip() == "")

    PARAM_DEBUG[name] = {
        "declared_type": str(data_type),
        "raw_value": debuggable(value),
        "returned_default": not present,
        "default": debuggable(default),
        "error": error,
    }

    return value if present else default


def load_config():
    PARAM_DEBUG.clear()

    mode = str(param_value("mode", TEXT, "self_check"))
    if mode not in VALID_MODES:
        mode = "self_check"

    return {
        "mode": mode,
        "param_contract_version": str(param_value("param_contract_version", TEXT, PARAM_CONTRACT_VERSION)),
        "dry_run": parse_bool(param_value("dry_run", BOOLEAN, True), True),
        "publish_config": parse_bool(param_value("publish_config", BOOLEAN, False), False),
        "item_scope": str(param_value("item_scope", TEXT, "all")),
        "output_shape": str(param_value("output_shape", TEXT, "summary")),
    }


_RAW_DATA_VIEWS_JSON = r'''
{
  "dvw-jfb-activity-area-labels-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "jfb_daily_activities.id.",
          "name": "activity_id",
          "type": "uuid"
        },
        {
          "description": "jfb_daily_activities.equipment_id.",
          "name": "equipment_id",
          "type": "uuid"
        },
        {
          "description": "jfb_daily_activities.start_date_time.",
          "name": "start_date_time",
          "type": "timestamptz"
        },
        {
          "description": "jfb_project_areas.name for area->>'area_id'; null when the activity has no area set.",
          "name": "area_l1",
          "type": "text"
        },
        {
          "description": "jfb_project_areas.name for area->>'sub_area_id'; null when not set.",
          "name": "area_l2",
          "type": "text"
        },
        {
          "description": "jfb_project_areas.name for area->>'sub_sub_area_id'; null when not set.",
          "name": "area_l3",
          "type": "text"
        }
      ],
      "description": "Resolves jfb_daily_activities.area (a jsonb {area_id, sub_area_id, sub_sub_area_id}) to its three jfb_project_areas.name labels, for every activity in a project+date range. Replaces the client-side resolveArea()/areaNameById Map join in reportPdfData.js's buildDailyActivityByEquipmentParam -- same three-level lookup, done server-side. Also the id-to-label piece DREDGE_FEATURE_GAPS.md's Problem 2 flags as a real blocker for the eventual Production Stats combo computation (pass_number is the other one, not addressed here).",
      "direct_sql": "SELECT da.id AS activity_id, da.equipment_id, da.start_date_time, l1.name AS area_l1, l2.name AS area_l2, l3.name AS area_l3 FROM usdf.jfb_daily_activities da LEFT JOIN usdf.jfb_project_areas l1 ON l1.id = (da.area->>'area_id')::uuid LEFT JOIN usdf.jfb_project_areas l2 ON l2.id = (da.area->>'sub_area_id')::uuid LEFT JOIN usdf.jfb_project_areas l3 ON l3.id = (da.area->>'sub_sub_area_id')::uuid WHERE da.project_id = p_project_id AND da.start_date_time::date BETWEEN p_start_date AND p_end_date AND da.is_deleted IS NOT TRUE ORDER BY da.start_date_time",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project to scope the activities to.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "Inclusive start of the activity date range (compared against start_date_time::date).",
          "name": "p_start_date",
          "required": true,
          "type": "date"
        },
        {
          "description": "Inclusive end of the activity date range.",
          "name": "p_end_date",
          "required": true,
          "type": "date"
        }
      ],
      "slug": "dvw-jfb-activity-area-labels-v2"
    },
    "name": "JFB Activity Area Labels"
  },
  "dvw-jfb-air-quality-slots-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "Start of the time slot, floored to p_interval_min. Aligns with the slots buildAirDay generates between startUtc and endUtc.",
          "name": "slot_at",
          "type": "timestamptz"
        },
        {
          "description": "Station this average belongs to, matching a key in jfb_air_monitoring_config.stations.",
          "name": "station_key",
          "type": "text"
        },
        {
          "description": "Mean reading across the slot, in the stored unit. The Air tab divides by 1000 to get mg/m3.",
          "name": "avg_value",
          "type": "numeric"
        },
        {
          "description": "How many raw readings the average came from. A slot with no readings is simply absent, which the caller renders as an em dash.",
          "name": "reading_count",
          "type": "integer"
        }
      ],
      "description": "Pre-buckets jfb_air_quality_readings into the fixed time slots the Air Quality tab and the daily PDF render, so the client never pulls raw readings. Returns one row per (slot, station) with the mean reading in the slot. Replaces a client-side loop that paged raw readings 1,000 at a time and bucketed them in JS -- Torch alone logs ~6,500 readings a day, which was 7 round-trips to produce 49 display rows, and the request count grew with the data. Here the response size is a function of the WINDOW, not the reading volume: same 237 rows whether the table holds six thousand readings or six million. Value is the raw stored unit; the caller still divides by 1000 for mg/m3, matching buildAirDay.",
      "direct_sql": "SELECT to_timestamp(floor(extract(epoch from r.reading_at) / (p_interval_min * 60)) * (p_interval_min * 60)) AS slot_at, r.station_key AS station_key, avg(r.value) AS avg_value, count(*) AS reading_count FROM usdf.jfb_air_quality_readings r WHERE r.project_id = p_project_id AND r.reading_at >= p_start AND r.reading_at < p_end GROUP BY 1, 2 ORDER BY 1, 2",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project whose air monitoring stations to read.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "Inclusive UTC start of the monitoring window, from airWindowUtc(config, dateISO).",
          "name": "p_start",
          "required": true,
          "type": "timestamptz"
        },
        {
          "description": "Exclusive UTC end of the monitoring window. The caller passes endUtc + 1ms so the final slot is included, matching the old raw-reading filter.",
          "name": "p_end",
          "required": true,
          "type": "timestamptz"
        },
        {
          "description": "Slot width in minutes, from jfb_air_monitoring_config.interval_minutes (15 today). Bucketing here rather than in the browser is the whole point of this view.",
          "name": "p_interval_min",
          "required": true,
          "type": "integer"
        }
      ],
      "slug": "dvw-jfb-air-quality-slots-v2"
    },
    "name": "JFB Air Quality Slots"
  },
  "dvw-jfb-crew-hours-total-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "Sum of hours across every crew row for every report this project has ever had; 0 when none exist.",
          "name": "total_hours",
          "type": "numeric"
        }
      ],
      "description": "Sums jfb_report_crew_summary_v2.hours across every report a project has ever had, no date filter -- matches the reference app's fetchProjectCrewHistory, which also pulls every report_crew_summary row for the project with no date bound. Backs the PDF Safety page's project-lifetime crew-hours totals (Work Hours On-Site This Day / Cumulative Hours from Previous Day / Total Work Hours from Project Start); today's-hours and previous-day figures are then derived client-side from this one total plus the current report's own crew rows (previousProjectHours = max(0, total - today)), same as the reference app.",
      "direct_sql": "SELECT COALESCE(SUM(cs.hours), 0) AS total_hours FROM usdf.jfb_report_crew_summary_v2 cs JOIN usdf.jfb_reports r ON r.id = cs.report_id WHERE r.project_id = p_project_id",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project to scope the sum to.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        }
      ],
      "slug": "dvw-jfb-crew-hours-total-v2"
    },
    "name": "JFB Crew Hours Total"
  },
  "dvw-jfb-distinct-event-dates-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "A distinct calendar date, in the activity's own timezone, that has at least one jfb_daily_activities row for this project.",
          "name": "event_date",
          "type": "date"
        }
      ],
      "description": "Every distinct calendar date a project has jfb_daily_activities on, timezone-aware per activity. Backs ReportListPage.jsx's 'pending' rows and the Start-a-report date picker's has-events warning -- the non-native app's equivalent (fetchDistinctEventDates) is a plain column select against daily_events.report_date, but jfb_daily_activities only has start_date_time + timezone, so the calendar-day extraction has to happen here rather than client-side. Deliberately unbounded (no date-range parameter) to match the non-native app's own unbounded 'ever' scope -- the result is one row per distinct day, inherently small even over a project's full history, not one row per activity, so it doesn't re-introduce the unscoped-row-count problem a bounded activity fetch would.",
      "direct_sql": "SELECT DISTINCT (da.start_date_time AT TIME ZONE COALESCE(da.timezone, 'UTC'))::date AS event_date FROM usdf.jfb_daily_activities da WHERE da.project_id = p_project_id AND da.is_deleted IS NOT TRUE ORDER BY event_date DESC",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project to scope the activities to.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        }
      ],
      "slug": "dvw-jfb-distinct-event-dates-v2"
    },
    "name": "JFB Distinct Event Dates"
  },
  "dvw-jfb-goh-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "Gross Operating Hours -- summed duration of every matching activity; 0 when none match.",
          "name": "goh_hours",
          "type": "numeric"
        }
      ],
      "description": "Gross Operating Hours: sums jfb_daily_activities duration for a project+date range, optionally filtered down to one equipment unit / area / pass / tsca / attachment combo. Every activity counts, regardless of delay_code_id. Companion to dvw-jfb-noh-v2 (same filters, only delay_code_id IS NULL activities). Split into two single-purpose views, same convention as dvw-jfb-metric-cy-v2 / dvw-jfb-metric-sf-v2, instead of one view returning both columns.",
      "direct_sql": "SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (da.end_date_time - da.start_date_time)) / 3600.0), 0) AS goh_hours FROM usdf.jfb_daily_activities da WHERE da.project_id = p_project_id AND da.start_date_time::date BETWEEN p_start_date AND p_end_date AND (p_equipment_id IS NULL OR da.equipment_id = p_equipment_id) AND (da.area->>'area_id')::uuid IS NOT DISTINCT FROM p_area_id AND da.pass_type IS NOT DISTINCT FROM p_pass_type AND da.tsca IS NOT DISTINCT FROM p_tsca AND da.attachment_id IS NOT DISTINCT FROM p_attachment_id AND da.is_deleted IS NOT TRUE",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project to scope the sum to.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "Inclusive start of the activity date range (compared against start_date_time::date).",
          "name": "p_start_date",
          "required": true,
          "type": "date"
        },
        {
          "description": "Inclusive end of the activity date range.",
          "name": "p_end_date",
          "required": true,
          "type": "date"
        },
        {
          "default": null,
          "description": "Equipment scope filter. Null includes all equipment (a broader-scope choice, not a combo dimension).",
          "name": "p_equipment_id",
          "required": false,
          "type": "uuid"
        },
        {
          "default": null,
          "description": "Combo identity dimension, matched exactly (IS NOT DISTINCT FROM against jfb_daily_activities.area->>'area_id') -- pass the row's own area_id, or null to match only activities with no area set (the 'Unassigned' bucket). Null here does NOT mean 'all areas'.",
          "name": "p_area_id",
          "required": false,
          "type": "uuid"
        },
        {
          "default": null,
          "description": "Combo identity dimension, matched exactly including null -- pass the row's own pass_type, or null to match only activities with no pass_type set.",
          "name": "p_pass_type",
          "required": false,
          "type": "text"
        },
        {
          "default": null,
          "description": "Combo identity dimension, matched exactly including null -- pass the row's own tsca, or null to match only activities with tsca unset.",
          "name": "p_tsca",
          "required": false,
          "type": "boolean"
        },
        {
          "default": null,
          "description": "Combo identity dimension, matched exactly including null -- pass the row's own attachment_id, or null to match only activities with no attachment set.",
          "name": "p_attachment_id",
          "required": false,
          "type": "uuid"
        }
      ],
      "slug": "dvw-jfb-goh-v2"
    },
    "name": "JFB GOH (Gross Operating Hours)"
  },
  "dvw-jfb-metric-cy-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "Summed volume (CY) across matched production_stats rows; 0 when none match.",
          "name": "total_volume",
          "type": "numeric"
        }
      ],
      "description": "Sums jfb_production_stats.volume (CY) for a project across an inclusive report_date range, optionally scoped to one equipment unit. Backs the 'Total Volume Removed' auto metric on the cover-page Metrics tab. Auto metrics are never persisted (see METRICS_MIGRATION_PLAN.md §1) -- app code calls this once per Day/Week/Total column with a different date range rather than storing a result. Changed 2026-09-24: the sum is no longer COALESCEd to 0. SUM over zero rows returns NULL, which is what the cover's em dash means -- 'this metric has no data in this window' -- while a window that really does total zero still returns 0. Torch Lake 152601's Stability Backfill Placed is scoped to the placement machine and printed '0.0 CY' on dredging days, asserting that nothing was placed when in fact nothing was tracked; the reference app prints an em dash (CoverPageGrid.tsx: value === null -> '—').",
      "direct_sql": "SELECT SUM(ps.volume) AS total_volume FROM usdf.jfb_production_stats ps JOIN usdf.jfb_reports r ON r.id = ps.report_id WHERE r.project_id = p_project_id AND r.report_date BETWEEN p_start_date AND p_end_date AND (p_equipment_id IS NULL OR ps.equipment_id = p_equipment_id)",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project to scope the sum to.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "Inclusive start of the report_date range -- today's date for Day, the week's start for Week, the project's start date (or a very early date) for Total.",
          "name": "p_start_date",
          "required": true,
          "type": "date"
        },
        {
          "description": "Inclusive end of the report_date range -- typically the report date being viewed.",
          "name": "p_end_date",
          "required": true,
          "type": "date"
        },
        {
          "default": null,
          "description": "Optional equipment filter, matching the old app's equipment_filter column. Null (the default) includes all equipment.",
          "name": "p_equipment_id",
          "required": false,
          "type": "uuid"
        }
      ],
      "slug": "dvw-jfb-metric-cy-v2"
    },
    "name": "JFB Metric CY"
  },
  "dvw-jfb-metric-efficiency-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "Operating / (operating + delay) * 100; null when the range has zero matching activities.",
          "name": "efficiency_pct",
          "type": "numeric"
        }
      ],
      "description": "Efficiency %: operating hours divided by (operating + delay) hours, times 100, using the same classification as dvw-jfb-metric-hours-op-v2/-delay. Null when the range has no matching activities at all (zero denominator) rather than 0 or an error. Backs the 'Efficiency' auto metric on the cover-page Metrics tab. Uses one consistent formula for the Day, Week, and Total columns -- the non-native app's eventTotals.ts/autoMetricHistory.ts use two different formulas (shiftHours-based for Day, op/(op+delay)-based for Week/Total) that disagree with each other on unbalanced days; this app deliberately does not port that inconsistency.",
      "direct_sql": "SELECT CASE WHEN (op.hours + dl.hours) > 0 THEN (op.hours / (op.hours + dl.hours)) * 100 ELSE NULL END AS efficiency_pct FROM (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (da.end_date_time - da.start_date_time)) / 3600.0), 0) AS hours FROM usdf.jfb_daily_activities da WHERE da.project_id = p_project_id AND da.start_date_time::date BETWEEN p_start_date AND p_end_date AND (p_equipment_id IS NULL OR da.equipment_id = p_equipment_id) AND da.is_deleted IS NOT TRUE AND (da.category IN ('ACTIVE DREDGING', 'ACTIVE PLACEMENT') OR (da.category IS NULL AND da.delay_code_id IS NULL))) op, (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (da.end_date_time - da.start_date_time)) / 3600.0), 0) AS hours FROM usdf.jfb_daily_activities da WHERE da.project_id = p_project_id AND da.start_date_time::date BETWEEN p_start_date AND p_end_date AND (p_equipment_id IS NULL OR da.equipment_id = p_equipment_id) AND da.is_deleted IS NOT TRUE AND NOT (da.category IN ('ACTIVE DREDGING', 'ACTIVE PLACEMENT') OR (da.category IS NULL AND da.delay_code_id IS NULL))) dl",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project to scope the sum to.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "Inclusive start of the report_date range -- today's date for Day, the week's start for Week, the project's start date for Total.",
          "name": "p_start_date",
          "required": true,
          "type": "date"
        },
        {
          "description": "Inclusive end of the report_date range -- typically the report date being viewed.",
          "name": "p_end_date",
          "required": true,
          "type": "date"
        },
        {
          "default": null,
          "description": "Optional equipment filter. Null (the default) includes all equipment.",
          "name": "p_equipment_id",
          "required": false,
          "type": "uuid"
        }
      ],
      "slug": "dvw-jfb-metric-efficiency-v2"
    },
    "name": "JFB Metric Efficiency"
  },
  "dvw-jfb-metric-hours-delay-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "Summed duration (hours) of matched activities classified as delay; 0 when none match.",
          "name": "delay_hours",
          "type": "numeric"
        }
      ],
      "description": "Delay Hours: same filters and duration calc as dvw-jfb-metric-hours-op-v2, but sums the complementary set -- activities whose category is a delay-code label (anything other than 'ACTIVE DREDGING'/'ACTIVE PLACEMENT'), or legacy rows with no category and a delay_code_id set. Backs the 'Delay Hours' auto metric on the cover-page Metrics tab. Companion to dvw-jfb-metric-hours-op-v2; every matched activity falls into exactly one of the two views.",
      "direct_sql": "SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (da.end_date_time - da.start_date_time)) / 3600.0), 0) AS delay_hours FROM usdf.jfb_daily_activities da WHERE da.project_id = p_project_id AND da.start_date_time::date BETWEEN p_start_date AND p_end_date AND (p_equipment_id IS NULL OR da.equipment_id = p_equipment_id) AND da.is_deleted IS NOT TRUE AND NOT (da.category IN ('ACTIVE DREDGING', 'ACTIVE PLACEMENT') OR (da.category IS NULL AND da.delay_code_id IS NULL))",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project to scope the sum to.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "Inclusive start of the report_date range -- today's date for Day, the week's start for Week, the project's start date for Total.",
          "name": "p_start_date",
          "required": true,
          "type": "date"
        },
        {
          "description": "Inclusive end of the report_date range -- typically the report date being viewed.",
          "name": "p_end_date",
          "required": true,
          "type": "date"
        },
        {
          "default": null,
          "description": "Optional equipment filter. Null (the default) includes all equipment.",
          "name": "p_equipment_id",
          "required": false,
          "type": "uuid"
        }
      ],
      "slug": "dvw-jfb-metric-hours-delay-v2"
    },
    "name": "JFB Metric Hours Delay"
  },
  "dvw-jfb-metric-hours-op-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "Summed duration (hours) of matched activities classified as operating; 0 when none match.",
          "name": "op_hours",
          "type": "numeric"
        }
      ],
      "description": "Operating Hours: sums jfb_daily_activities duration for a project across an inclusive report-date range, optionally scoped to one equipment unit. An activity counts as operating when its category is a productive label ('ACTIVE DREDGING' or 'ACTIVE PLACEMENT', the two values workType.js writes) or, for legacy rows saved before the category column existed, when category is null and delay_code_id is also null. Backs the 'Operating Hours' auto metric on the cover-page Metrics tab, matching the non-native app's category-based classification in eventTotals.ts.",
      "direct_sql": "SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (da.end_date_time - da.start_date_time)) / 3600.0), 0) AS op_hours FROM usdf.jfb_daily_activities da WHERE da.project_id = p_project_id AND da.start_date_time::date BETWEEN p_start_date AND p_end_date AND (p_equipment_id IS NULL OR da.equipment_id = p_equipment_id) AND da.is_deleted IS NOT TRUE AND (da.category IN ('ACTIVE DREDGING', 'ACTIVE PLACEMENT') OR (da.category IS NULL AND da.delay_code_id IS NULL))",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project to scope the sum to.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "Inclusive start of the report_date range -- today's date for Day, the week's start for Week, the project's start date for Total.",
          "name": "p_start_date",
          "required": true,
          "type": "date"
        },
        {
          "description": "Inclusive end of the report_date range -- typically the report date being viewed.",
          "name": "p_end_date",
          "required": true,
          "type": "date"
        },
        {
          "default": null,
          "description": "Optional equipment filter. Null (the default) includes all equipment.",
          "name": "p_equipment_id",
          "required": false,
          "type": "uuid"
        }
      ],
      "slug": "dvw-jfb-metric-hours-op-v2"
    },
    "name": "JFB Metric Hours Op"
  },
  "dvw-jfb-metric-manual-totals-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "The jfb_metrics.metric_key this total belongs to, e.g. class_e_riprap_tons.",
          "name": "metric_key",
          "type": "text"
        },
        {
          "description": "Sum of the PE-entered values across the window. A metric with no entries in the window is simply absent, which the caller renders as zero.",
          "name": "total",
          "type": "numeric"
        },
        {
          "description": "Average of the window's NON-ZERO, non-null values; NULL when the window has none. Used instead of total for metrics whose jfb_metrics.rollup_type is 'avg' (turbidity, flow rate), so a day with no reading does not pull the average down.",
          "name": "avg_nonzero",
          "type": "numeric"
        }
      ],
      "description": "Sums the PE-entered values of every MANUAL cover metric for a project over a date range, one row per metric_key. The daily report's cover Project Production Table needs Day, Week and Project Total for each configured metric; the auto ones already have a dvw-jfb-metric-* view each, and this is the manual counterpart. A view rather than a client-side read because jfb_report_metric_value carries only report_id -- no project_id -- so scoping it in the browser would mean fetching every metric value in the tenant and filtering locally, which is unbounded by construction. Returns nothing for a project whose metrics are all auto. Each row carries both roll-ups: total (sum) and avg_nonzero (average of non-zero readings); the caller picks one per metric from jfb_metrics.rollup_type.",
      "direct_sql": "SELECT v.metric_key AS metric_key, COALESCE(SUM(v.value), 0) AS total, AVG(v.value) FILTER (WHERE v.value IS NOT NULL AND v.value <> 0) AS avg_nonzero FROM usdf.jfb_report_metric_value v JOIN usdf.jfb_reports r ON r.id = v.report_id WHERE r.project_id = p_project_id AND r.report_date BETWEEN p_start_date AND p_end_date GROUP BY v.metric_key",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project whose manual metric values to sum.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "Inclusive start of the window. The cover calls this three times -- the report date alone for Day, the week-to-date span for Week, and the project start for Project Total.",
          "name": "p_start_date",
          "required": true,
          "type": "date"
        },
        {
          "description": "Inclusive end of the window, always the report date being printed.",
          "name": "p_end_date",
          "required": true,
          "type": "date"
        }
      ],
      "slug": "dvw-jfb-metric-manual-totals-v2"
    },
    "name": "JFB Metric Manual Totals"
  },
  "dvw-jfb-metric-sf-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "Summed area (SF) across matched production_stats rows; 0 when none match.",
          "name": "total_area",
          "type": "numeric"
        }
      ],
      "description": "Sums jfb_production_stats.area (SF) for a project across an inclusive report_date range, optionally scoped to one equipment unit. Backs the 'Total Area Covered' auto metric on the cover-page Metrics tab. Auto metrics are never persisted (see METRICS_MIGRATION_PLAN.md §1) -- app code calls this once per Day/Week/Total column with a different date range rather than storing a result. Changed 2026-09-24: the sum is no longer COALESCEd to 0. SUM over zero rows returns NULL, which is what the cover's em dash means -- 'this metric has no data in this window' -- while a window that really does total zero still returns 0. Torch Lake 152601's Stability Backfill Placed is scoped to the placement machine and printed '0.0 CY' on dredging days, asserting that nothing was placed when in fact nothing was tracked; the reference app prints an em dash (CoverPageGrid.tsx: value === null -> '—').",
      "direct_sql": "SELECT SUM(ps.area) AS total_area FROM usdf.jfb_production_stats ps JOIN usdf.jfb_reports r ON r.id = ps.report_id WHERE r.project_id = p_project_id AND r.report_date BETWEEN p_start_date AND p_end_date AND (p_equipment_id IS NULL OR ps.equipment_id = p_equipment_id)",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project to scope the sum to.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "Inclusive start of the report_date range -- today's date for Day, the week's start for Week, the project's start date (or a very early date) for Total.",
          "name": "p_start_date",
          "required": true,
          "type": "date"
        },
        {
          "description": "Inclusive end of the report_date range -- typically the report date being viewed.",
          "name": "p_end_date",
          "required": true,
          "type": "date"
        },
        {
          "default": null,
          "description": "Optional equipment filter, matching the old app's equipment_filter column. Null (the default) includes all equipment.",
          "name": "p_equipment_id",
          "required": false,
          "type": "uuid"
        }
      ],
      "slug": "dvw-jfb-metric-sf-v2"
    },
    "name": "JFB Metric SF"
  },
  "dvw-jfb-metric-tons-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "Summed tons across matched production_stats rows; 0 when none match.",
          "name": "total_tons",
          "type": "numeric"
        }
      ],
      "description": "Sums jfb_production_stats.tons for a project across an inclusive report_date range, optionally scoped to one equipment unit. Backs the 'Total Tons Placed' auto metric on the cover-page Metrics tab for capping/placement projects, where tons off the scale are the primary quantity and CY is derived from tons / conversion_factor. Matches the non-native app's auto_tons source (sum of production_stats.tons, filtered by equipment when set). Auto metrics are never persisted -- app code calls this once per Day/Week/Total column with a different date range rather than storing a result.",
      "direct_sql": "SELECT COALESCE(SUM(ps.tons), 0) AS total_tons FROM usdf.jfb_production_stats ps JOIN usdf.jfb_reports r ON r.id = ps.report_id WHERE r.project_id = p_project_id AND r.report_date BETWEEN p_start_date AND p_end_date AND (p_equipment_id IS NULL OR ps.equipment_id = p_equipment_id)",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project to scope the sum to.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "Inclusive start of the report_date range -- today's date for Day, the week's start for Week, the project's start date (or a very early date) for Total.",
          "name": "p_start_date",
          "required": true,
          "type": "date"
        },
        {
          "description": "Inclusive end of the report_date range -- typically the report date being viewed.",
          "name": "p_end_date",
          "required": true,
          "type": "date"
        },
        {
          "default": null,
          "description": "Optional equipment filter, matching the old app's equipment_filter column. Null (the default) includes all equipment.",
          "name": "p_equipment_id",
          "required": false,
          "type": "uuid"
        }
      ],
      "slug": "dvw-jfb-metric-tons-v2"
    },
    "name": "JFB Metric Tons"
  },
  "dvw-jfb-narrative-context-events-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "jfb_daily_activities.id",
          "name": "event_id",
          "type": "uuid"
        },
        {
          "description": "jfb_equipments.id",
          "name": "equipment_id",
          "type": "uuid"
        },
        {
          "description": "Equipment name.",
          "name": "equipment_name",
          "type": "text"
        },
        {
          "description": "Event start.",
          "name": "start_date_time",
          "type": "timestamptz"
        },
        {
          "description": "Event end.",
          "name": "end_date_time",
          "type": "timestamptz"
        },
        {
          "description": "Event duration in hours, unrounded. The caller rounds for display but sums the full-precision values, so its Op/Delay totals match the non-native app, which sums daily_events.duration_hours the same way; rounding each event first shifted 0.01 h between the two totals.",
          "name": "duration_hours",
          "type": "numeric"
        },
        {
          "description": "True when delay_code_id is null (productive time).",
          "name": "is_operational",
          "type": "boolean"
        },
        {
          "description": "Delay code label -- master jfb_delay_codes.code if linked, else the project-custom jfb_project_delay_codes.code. Null when is_operational is true.",
          "name": "delay_label",
          "type": "text"
        },
        {
          "description": "Raw pkl-jfb-pass-type value (e.g. startup, active_dredging) -- caller resolves the label client-side. Null for delay events.",
          "name": "pass_type",
          "type": "text"
        },
        {
          "description": "Raw jfb_daily_activities.category (e.g. ACTIVE PLACEMENT, a delay-code label, or STARTUP/SHUTDOWN). The panel greys out STARTUP/SHUTDOWN rows as auto-filled gap events, matching the non-native app's eventSource() rule.",
          "name": "category",
          "type": "text"
        },
        {
          "description": "Resolved area path (Area › Sub-area › Sub-sub-area), null segments omitted, matching the non-native app's ' › ' separator. Null when no area is set.",
          "name": "area_label",
          "type": "text"
        }
      ],
      "description": "Per-equipment daily event detail for the Narratives tab context panel: one row per non-deleted jfb_daily_activities event on the given project+date, with equipment name, duration, operational/delay classification, resolved delay label (2-tier: master code else project-custom code), raw pass_type, and resolved area path. Callers group by equipment_id client-side to compute Op/Delay hour totals and render the event list -- production stats (CY/SF) are fetched separately via the existing jfb_production_stats domain read, not part of this view.",
      "direct_sql": "SELECT da.id AS event_id, da.equipment_id, eq.name AS equipment_name, da.start_date_time, da.end_date_time, EXTRACT(EPOCH FROM (da.end_date_time - da.start_date_time)) / 3600.0 AS duration_hours, (da.delay_code_id IS NULL) AS is_operational, COALESCE(dc_master.code, pdc.code) AS delay_label, da.pass_type, da.category, NULLIF(concat_ws(' › ', a1.name, a2.name, a3.name), '') AS area_label FROM usdf.jfb_daily_activities da JOIN usdf.jfb_equipments eq ON eq.id = da.equipment_id AND eq.is_deleted IS NOT TRUE LEFT JOIN usdf.jfb_project_delay_codes pdc ON pdc.id = da.delay_code_id AND pdc.is_deleted IS NOT TRUE LEFT JOIN usdf.jfb_delay_codes dc_master ON dc_master.id = pdc.delay_code_id AND dc_master.is_deleted IS NOT TRUE LEFT JOIN usdf.jfb_project_areas a1 ON a1.id = (da.area->>'area_id')::uuid LEFT JOIN usdf.jfb_project_areas a2 ON a2.id = (da.area->>'sub_area_id')::uuid LEFT JOIN usdf.jfb_project_areas a3 ON a3.id = (da.area->>'sub_sub_area_id')::uuid WHERE da.is_deleted IS NOT TRUE AND da.project_id = p_project_id AND da.start_date_time::date = p_report_date ORDER BY da.equipment_id, da.start_date_time",
      "implementation": "function",
      "parameters": [
        {
          "default": null,
          "description": "Project to fetch context for.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "default": null,
          "description": "Report date (YYYY-MM-DD) to fetch events for.",
          "name": "p_report_date",
          "required": true,
          "type": "date"
        }
      ],
      "slug": "dvw-jfb-narrative-context-events-v2"
    },
    "name": "JFB Narrative Context Events"
  },
  "dvw-jfb-noh-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "Net Operating Hours -- summed duration of only matching activities with no delay_code_id; 0 when none match.",
          "name": "noh_hours",
          "type": "numeric"
        }
      ],
      "description": "Net Operating Hours: same filters as dvw-jfb-goh-v2, but only sums jfb_daily_activities whose category is one of ACTIVE DREDGING / DREDGING / PRODUCTION / ACTIVE CAPPING / CAPPING / ACTIVE PLACEMENT / PLACEMENT. Companion to dvw-jfb-goh-v2. That allow-list is the non-native app's isOperationalCategory() in src/lib/eventTotals.ts and this app's own src/lib/operationalCategory.js, kept verbatim -- change one and you must change the other. It replaced a delay_code_id IS NULL test on 2026-09-23: 'no delay code' is NOT the productive signal. Weigand 422509 has 85 uncoded STARTUP/SHUTDOWN activities in Supabase itself, and 14 Startup activities whose code 9000 never migrated, so the old rule read 103.47 NOH against the reference app's 98.59. TRANSITION falls out of the allow-list on its own.",
      "direct_sql": "SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (da.end_date_time - da.start_date_time)) / 3600.0), 0) AS noh_hours FROM usdf.jfb_daily_activities da WHERE da.project_id = p_project_id AND da.start_date_time::date BETWEEN p_start_date AND p_end_date AND (p_equipment_id IS NULL OR da.equipment_id = p_equipment_id) AND (da.area->>'area_id')::uuid IS NOT DISTINCT FROM p_area_id AND da.pass_type IS NOT DISTINCT FROM p_pass_type AND da.tsca IS NOT DISTINCT FROM p_tsca AND da.attachment_id IS NOT DISTINCT FROM p_attachment_id AND upper(btrim(da.category)) IN ('ACTIVE DREDGING', 'DREDGING', 'PRODUCTION', 'ACTIVE CAPPING', 'CAPPING', 'ACTIVE PLACEMENT', 'PLACEMENT') AND da.is_deleted IS NOT TRUE",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project to scope the sum to.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "Inclusive start of the activity date range (compared against start_date_time::date).",
          "name": "p_start_date",
          "required": true,
          "type": "date"
        },
        {
          "description": "Inclusive end of the activity date range.",
          "name": "p_end_date",
          "required": true,
          "type": "date"
        },
        {
          "default": null,
          "description": "Equipment scope filter. Null includes all equipment (a broader-scope choice, not a combo dimension).",
          "name": "p_equipment_id",
          "required": false,
          "type": "uuid"
        },
        {
          "default": null,
          "description": "Combo identity dimension, matched exactly (IS NOT DISTINCT FROM against jfb_daily_activities.area->>'area_id') -- pass the row's own area_id, or null to match only activities with no area set (the 'Unassigned' bucket). Null here does NOT mean 'all areas'.",
          "name": "p_area_id",
          "required": false,
          "type": "uuid"
        },
        {
          "default": null,
          "description": "Combo identity dimension, matched exactly including null -- pass the row's own pass_type, or null to match only activities with no pass_type set.",
          "name": "p_pass_type",
          "required": false,
          "type": "text"
        },
        {
          "default": null,
          "description": "Combo identity dimension, matched exactly including null -- pass the row's own tsca, or null to match only activities with tsca unset.",
          "name": "p_tsca",
          "required": false,
          "type": "boolean"
        },
        {
          "default": null,
          "description": "Combo identity dimension, matched exactly including null -- pass the row's own attachment_id, or null to match only activities with no attachment set.",
          "name": "p_attachment_id",
          "required": false,
          "type": "uuid"
        }
      ],
      "slug": "dvw-jfb-noh-v2"
    },
    "name": "JFB NOH (Net Operating Hours)"
  },
  "dvw-jfb-operator-hours-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "jfb_operators.id -- the person.",
          "name": "operator_id",
          "type": "uuid"
        },
        {
          "description": "Operator's name.",
          "name": "full_name",
          "type": "text"
        },
        {
          "description": "Summed duration (hours) of activities with no delay_code_id -- productive time.",
          "name": "operating_hours",
          "type": "numeric"
        },
        {
          "description": "Summed duration (hours) of activities with a delay_code_id set.",
          "name": "delay_hours",
          "type": "numeric"
        },
        {
          "description": "Distinct projects this operator has logged activity on.",
          "name": "project_count",
          "type": "bigint"
        },
        {
          "description": "Total activity rows logged by this operator.",
          "name": "event_count",
          "type": "bigint"
        }
      ],
      "description": "Cross-project per-operator hours rollup: sums jfb_daily_activities duration per operator, split into operating hours (delay_code_id IS NULL) and delay hours (delay_code_id IS NOT NULL), plus how many distinct projects and how many activity rows each operator has. Optionally scoped to one project via p_project_id. CY moved is deliberately NOT included -- jfb_production_stats has no operator_id column, so a per-operator CY figure can only ever be an estimate (proportional split of each equipment/day's volume by operator hours share); that is a separate follow-up, not part of this view.",
      "direct_sql": "SELECT o.id AS operator_id, o.name AS full_name, round(coalesce(sum(EXTRACT(EPOCH FROM (da.end_date_time - da.start_date_time)) / 3600.0) FILTER (WHERE da.delay_code_id IS NULL), 0), 2) AS operating_hours, round(coalesce(sum(EXTRACT(EPOCH FROM (da.end_date_time - da.start_date_time)) / 3600.0) FILTER (WHERE da.delay_code_id IS NOT NULL), 0), 2) AS delay_hours, count(DISTINCT da.project_id) AS project_count, count(da.id) AS event_count FROM usdf.jfb_daily_activities da JOIN usdf.jfb_operators o ON o.id = da.operator_id AND o.is_deleted IS NOT TRUE WHERE da.is_deleted IS NOT TRUE AND (p_project_id IS NULL OR da.project_id = p_project_id) GROUP BY o.id, o.name ORDER BY operating_hours DESC",
      "implementation": "function",
      "parameters": [
        {
          "default": null,
          "description": "Optional project filter. Null (the default) includes every project -- the cross-project rollup.",
          "name": "p_project_id",
          "required": false,
          "type": "uuid"
        }
      ],
      "slug": "dvw-jfb-operator-hours-v2"
    },
    "name": "JFB Operator Hours"
  },
  "dvw-jfb-precip-sums-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "Sum of precip_today_in (where > 0) across this project's reports dated on/after p_month_start and on/before p_end_date.",
          "name": "mtd_in",
          "type": "numeric"
        },
        {
          "description": "Sum of precip_today_in (where > 0) across every one of this project's reports dated on/before p_end_date.",
          "name": "ptd_in",
          "type": "numeric"
        }
      ],
      "description": "Sums jfb_report_safety_v2.precip_today_in for a project across every report up to and including an end date, split into month-to-date (reports on/after a caller-supplied month start) and project-to-date (every report up to end date). Only rows with precip_today_in > 0 count, matching the non-native app's fetchPrecipSums. Backs the Safety tab's read-only Precip MTD / Precip Project Total fields -- these are never stored, always derived live.",
      "direct_sql": "SELECT COALESCE(SUM(rs.precip_today_in) FILTER (WHERE r.report_date >= p_month_start), 0) AS mtd_in, COALESCE(SUM(rs.precip_today_in), 0) AS ptd_in FROM usdf.jfb_report_safety_v2 rs JOIN usdf.jfb_reports r ON r.id = rs.report_id WHERE r.project_id = p_project_id AND r.report_date <= p_end_date AND rs.precip_today_in > 0",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project to scope the sum to.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "First day of the calendar month containing the report date being viewed (caller computes this, e.g. dateISO.slice(0,7)+'-01') -- reports on/after this date count toward mtd_in.",
          "name": "p_month_start",
          "required": true,
          "type": "date"
        },
        {
          "description": "Inclusive end of the range -- the report date being viewed. Every report on/before this date (project-lifetime) counts toward ptd_in.",
          "name": "p_end_date",
          "required": true,
          "type": "date"
        }
      ],
      "slug": "dvw-jfb-precip-sums-v2"
    },
    "name": "JFB Precip Sums"
  },
  "dvw-jfb-realized-daily-totals-scoped-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "The released report's date.",
          "name": "report_date",
          "type": "date"
        },
        {
          "description": "Summed production_stats.volume for that report; 0 when the report has no production rows.",
          "name": "cy",
          "type": "numeric"
        },
        {
          "description": "Summed production_stats.area for that report; 0 when the report has no production rows.",
          "name": "sf",
          "type": "numeric"
        },
        {
          "description": "Summed jfb_production_stats.tons for that report; 0 when the report has no production rows. Feeds the Realized To-Date report on tonnage-paid placement projects, which measure in TON instead of CY.",
          "name": "tons",
          "type": "numeric"
        },
        {
          "description": "Summed daily_activities duration (hours) for that project+date, every activity regardless of delay_code_id; 0 when no activities were logged that date.",
          "name": "goh",
          "type": "numeric"
        },
        {
          "description": "Summed daily_activities duration (hours) for that project+date, only activities whose category is one of ACTIVE DREDGING / DREDGING / PRODUCTION / ACTIVE CAPPING / CAPPING / ACTIVE PLACEMENT / PLACEMENT (productive time); 0 when none.",
          "name": "noh",
          "type": "numeric"
        }
      ],
      "description": "Per-day released-report totals for ONE Realized To-Date scope: the same figures as dvw-jfb-realized-daily-totals-v2, bounded by the scope's date window and area filter. Exists because a project can run two contracts on different ground, or two phases over the SAME ground at different times -- Torch Lake dredged through 2026-09-09 and began placing 9/11 in the same DMUs, so without the end date its dredging scope sums 17,619 CY against a 14,250 CY dredging goal and reports over 100% complete; scoped to 2026-09-09 it reads 17,032. Area matching uses the LEVEL-1 area id and tolerates area_level_combinations being a jsonb array, a bare string or null, all three of which occur in this table. A project with no scope rows keeps using the unscoped view, so nothing changes for it. NOH counts productive categories only -- same allow-list as dvw-jfb-noh-v2, which documents why 'no delay code' is not the productive signal.",
      "direct_sql": "SELECT r.report_date AS report_date, COALESCE(ps_sum.total_volume, 0) AS cy, COALESCE(ps_sum.total_area, 0) AS sf, COALESCE(ps_sum.total_tons, 0) AS tons, COALESCE(goh_sum.total_hours, 0) AS goh, COALESCE(noh_sum.total_hours, 0) AS noh FROM usdf.jfb_reports r LEFT JOIN (SELECT ps.report_id, SUM(ps.volume) AS total_volume, SUM(ps.area) AS total_area, SUM(ps.tons) AS total_tons FROM usdf.jfb_production_stats ps WHERE (p_include_ids = '' OR COALESCE(CASE WHEN jsonb_typeof(ps.area_level_combinations) = 'array' THEN ps.area_level_combinations->0->>'area_id' END, '') = ANY (string_to_array(p_include_ids, ','))) AND (p_exclude_ids = '' OR COALESCE(CASE WHEN jsonb_typeof(ps.area_level_combinations) = 'array' THEN ps.area_level_combinations->0->>'area_id' END, '') <> ALL (string_to_array(p_exclude_ids, ','))) GROUP BY ps.report_id) ps_sum ON ps_sum.report_id = r.id LEFT JOIN (SELECT da.project_id, da.report_date AS activity_date, SUM(EXTRACT(EPOCH FROM (da.end_date_time - da.start_date_time)) / 3600.0) AS total_hours FROM usdf.jfb_daily_activities da WHERE da.is_deleted IS NOT TRUE AND (p_include_ids = '' OR COALESCE(da.area->>'area_id', '') = ANY (string_to_array(p_include_ids, ','))) AND (p_exclude_ids = '' OR COALESCE(da.area->>'area_id', '') <> ALL (string_to_array(p_exclude_ids, ','))) GROUP BY da.project_id, da.report_date) goh_sum ON goh_sum.project_id = r.project_id AND goh_sum.activity_date = r.report_date LEFT JOIN (SELECT da.project_id, da.report_date AS activity_date, SUM(EXTRACT(EPOCH FROM (da.end_date_time - da.start_date_time)) / 3600.0) AS total_hours FROM usdf.jfb_daily_activities da WHERE da.is_deleted IS NOT TRUE AND upper(btrim(da.category)) IN ('ACTIVE DREDGING', 'DREDGING', 'PRODUCTION', 'ACTIVE CAPPING', 'CAPPING', 'ACTIVE PLACEMENT', 'PLACEMENT') AND (p_include_ids = '' OR COALESCE(da.area->>'area_id', '') = ANY (string_to_array(p_include_ids, ','))) AND (p_exclude_ids = '' OR COALESCE(da.area->>'area_id', '') <> ALL (string_to_array(p_exclude_ids, ','))) GROUP BY da.project_id, da.report_date) noh_sum ON noh_sum.project_id = r.project_id AND noh_sum.activity_date = r.report_date WHERE r.project_id = p_project_id AND r.status = 'released' AND r.report_date >= p_start_date AND r.report_date <= p_end_date ORDER BY r.report_date",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project to report on.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "First date the scope counts, from jfb_realized_scopes.start_date. Production before it belongs in the scope's opening balance, not the series.",
          "name": "p_start_date",
          "required": true,
          "type": "date"
        },
        {
          "description": "Last date the scope counts, inclusive, from jfb_realized_scopes.end_date. An OPEN scope passes a far-future date (9999-12-31) rather than null, because the platform has no nullable-date parameter. This is what stops a finished phase absorbing later work in the same areas.",
          "name": "p_end_date",
          "required": true,
          "type": "date"
        },
        {
          "description": "Comma-separated jfb_project_areas ids to count, or '' for every area. Delimited text rather than an array because published data views only accept scalar parameter types. Matched against the LEVEL-1 area, the same level the reference app filters on.",
          "name": "p_include_ids",
          "required": true,
          "type": "text"
        },
        {
          "description": "Comma-separated jfb_project_areas ids to leave out, or '' for none. Applied after p_include_ids.",
          "name": "p_exclude_ids",
          "required": true,
          "type": "text"
        }
      ],
      "slug": "dvw-jfb-realized-daily-totals-scoped-v2"
    },
    "name": "JFB Realized Daily Totals (Scoped)"
  },
  "dvw-jfb-realized-daily-totals-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "The released report's date.",
          "name": "report_date",
          "type": "date"
        },
        {
          "description": "Summed production_stats.volume for that report; 0 when the report has no production rows.",
          "name": "cy",
          "type": "numeric"
        },
        {
          "description": "Summed production_stats.area for that report; 0 when the report has no production rows.",
          "name": "sf",
          "type": "numeric"
        },
        {
          "description": "Summed jfb_production_stats.tons for that report; 0 when the report has no production rows. Feeds the Realized To-Date report on tonnage-paid placement projects, which measure in TON instead of CY.",
          "name": "tons",
          "type": "numeric"
        },
        {
          "description": "Summed daily_activities duration (hours) for that project+date, every activity regardless of delay_code_id; 0 when no activities were logged that date.",
          "name": "goh",
          "type": "numeric"
        },
        {
          "description": "Summed daily_activities duration (hours) for that project+date, only activities whose category is one of ACTIVE DREDGING / DREDGING / PRODUCTION / ACTIVE CAPPING / CAPPING / ACTIVE PLACEMENT / PLACEMENT (productive time); 0 when none.",
          "name": "noh",
          "type": "numeric"
        }
      ],
      "description": "One row per released report_date on or after p_start_date: that day's summed jfb_production_stats.volume (CY), area (SF) and tons, summed jfb_daily_activities duration in hours (GOH -- every activity counts, delay or not, same convention as dvw-jfb-goh-v2), and NOH (productive categories only -- same allow-list as dvw-jfb-noh-v2, which documents why 'no delay code' is not the productive signal). Backs the Realized To-Date report's weekly log and every downstream rate/projection/cumulative-chart calculation, done client-side over these pre-aggregated per-day rows -- replaces the non-native app's fetchReleasedReportSeries, which pages every raw production_stats/daily_events row into the browser (1000-row pages, chunked event_deletions lookups) to sum client-side. Also backs the Weekly Summary report (week + project-to-date CY/SF/GOH/NOH). Draft reports are excluded (status='released' only).",
      "direct_sql": "SELECT r.report_date, COALESCE(ps_sum.total_volume, 0) AS cy, COALESCE(ps_sum.total_area, 0) AS sf, COALESCE(ps_sum.total_tons, 0) AS tons, COALESCE(goh_sum.total_hours, 0) AS goh, COALESCE(noh_sum.total_hours, 0) AS noh FROM usdf.jfb_reports r LEFT JOIN (SELECT ps.report_id, SUM(ps.volume) AS total_volume, SUM(ps.area) AS total_area, SUM(ps.tons) AS total_tons FROM usdf.jfb_production_stats ps GROUP BY ps.report_id) ps_sum ON ps_sum.report_id = r.id LEFT JOIN (SELECT da.project_id, da.start_date_time::date AS activity_date, SUM(EXTRACT(EPOCH FROM (da.end_date_time - da.start_date_time)) / 3600.0) AS total_hours FROM usdf.jfb_daily_activities da WHERE da.is_deleted IS NOT TRUE GROUP BY da.project_id, da.start_date_time::date) goh_sum ON goh_sum.project_id = r.project_id AND goh_sum.activity_date = r.report_date LEFT JOIN (SELECT da.project_id, da.start_date_time::date AS activity_date, SUM(EXTRACT(EPOCH FROM (da.end_date_time - da.start_date_time)) / 3600.0) AS total_hours FROM usdf.jfb_daily_activities da WHERE da.is_deleted IS NOT TRUE AND upper(btrim(da.category)) IN ('ACTIVE DREDGING', 'DREDGING', 'PRODUCTION', 'ACTIVE CAPPING', 'CAPPING', 'ACTIVE PLACEMENT', 'PLACEMENT') GROUP BY da.project_id, da.start_date_time::date) noh_sum ON noh_sum.project_id = r.project_id AND noh_sum.activity_date = r.report_date WHERE r.project_id = p_project_id AND r.status = 'released' AND r.report_date >= p_start_date ORDER BY r.report_date",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project to scope the series to.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "Inclusive floor on report_date -- pass the project's production_start_date (or a very early date to mean 'no floor', same convention as dvw-jfb-metric-cy-v2's Total column) to get the full history.",
          "name": "p_start_date",
          "required": true,
          "type": "date"
        }
      ],
      "slug": "dvw-jfb-realized-daily-totals-v2"
    },
    "name": "JFB Realized Daily Totals"
  },
  "dvw-jfb-realized-delay-summary-scoped-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "The activity's own category text, e.g. 'Survey' or 'STARTUP/SHUTDOWN' -- one row per distinct category. This is the label the reference app prints; it is NOT the delay code's name, and two categories that map to the same code stay separate, exactly as the reference shows them.",
          "name": "description",
          "type": "text"
        },
        {
          "description": "Summed activity duration in hours for that category over the date range.",
          "name": "hours",
          "type": "numeric"
        }
      ],
      "description": "Delay hours by category for ONE Realized To-Date scope: the same rollup as dvw-jfb-realized-delay-summary-v2 plus the scope's area filter, so a project running two contracts on different ground does not show one contract's delays against the other's hours. Area matching uses the LEVEL-1 area id, as the reference app does. p_include_ids / p_exclude_ids are comma-delimited text because published data views only accept scalar parameters; empty strings mean every area, which reproduces the unscoped view exactly. Rewritten 2026-09-24 alongside the unscoped view: category-based, no delay-code join, zero-length activities excluded.",
      "direct_sql": "SELECT btrim(da.category) AS description, SUM(EXTRACT(EPOCH FROM (da.end_date_time - da.start_date_time)) / 3600.0) AS hours FROM usdf.jfb_daily_activities da WHERE da.project_id = p_project_id AND da.report_date BETWEEN p_start_date AND p_end_date AND da.is_deleted IS NOT TRUE AND da.end_date_time > da.start_date_time AND upper(btrim(da.category)) NOT IN ('ACTIVE DREDGING', 'DREDGING', 'PRODUCTION', 'ACTIVE CAPPING', 'CAPPING', 'ACTIVE PLACEMENT', 'PLACEMENT', 'TRANSITION') AND (p_include_ids = '' OR COALESCE(da.area->>'area_id', '') = ANY (string_to_array(p_include_ids, ','))) AND (p_exclude_ids = '' OR COALESCE(da.area->>'area_id', '') <> ALL (string_to_array(p_exclude_ids, ','))) GROUP BY btrim(da.category) ORDER BY hours DESC",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project to scope the sum to.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "Inclusive start of the date range -- typically the captured week's Monday.",
          "name": "p_start_date",
          "required": true,
          "type": "date"
        },
        {
          "description": "Inclusive end of the date range -- typically the captured week's Sunday.",
          "name": "p_end_date",
          "required": true,
          "type": "date"
        },
        {
          "description": "Comma-separated jfb_project_areas ids to count, or '' for every area.",
          "name": "p_include_ids",
          "required": true,
          "type": "text"
        },
        {
          "description": "Comma-separated jfb_project_areas ids to leave out, or '' for none. Applied after p_include_ids.",
          "name": "p_exclude_ids",
          "required": true,
          "type": "text"
        }
      ],
      "slug": "dvw-jfb-realized-delay-summary-scoped-v2"
    },
    "name": "JFB Realized Delay Summary (Scoped)"
  },
  "dvw-jfb-realized-delay-summary-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "The activity's own category text, e.g. 'Survey' or 'STARTUP/SHUTDOWN' -- one row per distinct category. This is the label the reference app prints; it is NOT the delay code's name, and two categories that map to the same code stay separate, exactly as the reference shows them.",
          "name": "description",
          "type": "text"
        },
        {
          "description": "Summed activity duration in hours for that category over the date range.",
          "name": "hours",
          "type": "numeric"
        }
      ],
      "description": "Delay hours by category for a project+date range, backing the Realized To-Date report's captured-week delay summary. One row per trimmed jfb_daily_activities.category, ordered by hours. A row is a delay when its category is not one of the productive ones -- the same allow-list as dvw-jfb-realized-daily-totals-v2's NOH and src/lib/operationalCategory.js. The delay code is ignored, matching the reference app (weeklySummary.ts / realizedToDate.ts via isOperationalCategory). Zero-length and deleted activities are excluded. Rewritten 2026-09-24: the old INNER JOIN to jfb_project_delay_codes dropped every activity with no delay_code_id (Torch Lake 152601, week of 2026-09-07: 10.15 h vs the reference's 19.87 h).",
      "direct_sql": "SELECT btrim(da.category) AS description, SUM(EXTRACT(EPOCH FROM (da.end_date_time - da.start_date_time)) / 3600.0) AS hours FROM usdf.jfb_daily_activities da WHERE da.project_id = p_project_id AND da.report_date BETWEEN p_start_date AND p_end_date AND da.is_deleted IS NOT TRUE AND da.end_date_time > da.start_date_time AND upper(btrim(da.category)) NOT IN ('ACTIVE DREDGING', 'DREDGING', 'PRODUCTION', 'ACTIVE CAPPING', 'CAPPING', 'ACTIVE PLACEMENT', 'PLACEMENT', 'TRANSITION') GROUP BY btrim(da.category) ORDER BY hours DESC",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project to scope the sum to.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "Inclusive start of the date range -- typically the captured week's Monday.",
          "name": "p_start_date",
          "required": true,
          "type": "date"
        },
        {
          "description": "Inclusive end of the date range -- typically the captured week's Sunday.",
          "name": "p_end_date",
          "required": true,
          "type": "date"
        }
      ],
      "slug": "dvw-jfb-realized-delay-summary-v2"
    },
    "name": "JFB Realized Delay Summary"
  },
  "dvw-jfb-report-list-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "The day this row is for. Reports use jfb_reports.report_date; pending days use the activity's own calendar date in its own timezone, matching dvw-jfb-distinct-event-dates-v2.",
          "name": "row_date",
          "type": "date"
        },
        {
          "description": "The jfb_reports row id, or NULL when this is a pending day the operator logged events on but nobody has opened a report for.",
          "name": "report_id",
          "type": "uuid"
        },
        {
          "description": "draft or released, or NULL on a pending day.",
          "name": "status",
          "type": "text"
        }
      ],
      "description": "One ordered, paged stream of the rows the Report List screen draws: every jfb_reports row for a project, plus the 'pending' days that have jfb_daily_activities but no report yet, interleaved newest-first. Replaces a client-side merge of an unbounded useReports fetch (capped at 500, silently) and dvw-jfb-distinct-event-dates-v2 (deliberately unbounded, one row per day of project history). Merging server-side is what makes paging possible at all: page either source alone and a pending day can belong to a window the other has not fetched, so it lands in the wrong place. Response size is fixed by p_limit, never by how long the project has run. report_id NULL marks a pending day; the caller renders those as a Start-a-report link rather than a report link. Deliberately returns no total count -- a count(*) over a project's whole history on every open is exactly the unbounded read this view exists to remove, so the caller loads until a page comes back short.",
      "direct_sql": "SELECT q.row_date AS row_date, q.report_id AS report_id, q.status AS status FROM (SELECT r.report_date AS row_date, r.id AS report_id, r.status AS status FROM usdf.jfb_reports r WHERE r.project_id = p_project_id UNION ALL SELECT DISTINCT (a.start_date_time AT TIME ZONE COALESCE(a.timezone, 'UTC'))::date, NULL::uuid, NULL::text FROM usdf.jfb_daily_activities a WHERE a.project_id = p_project_id AND a.is_deleted IS NOT TRUE AND NOT EXISTS (SELECT 1 FROM usdf.jfb_reports r2 WHERE r2.project_id = a.project_id AND r2.report_date = (a.start_date_time AT TIME ZONE COALESCE(a.timezone, 'UTC'))::date)) q ORDER BY q.row_date DESC LIMIT p_limit OFFSET p_offset",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project whose report list to read.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "How many rows this page returns. The caller asks for one more than it intends to show, so a short page tells it there is nothing left without a separate count query.",
          "name": "p_limit",
          "required": true,
          "type": "integer"
        },
        {
          "description": "How many rows to skip. Each Load more click advances by the number already shown. Safe against a stable ORDER BY row_date DESC.",
          "name": "p_offset",
          "required": true,
          "type": "integer"
        }
      ],
      "slug": "dvw-jfb-report-list-v2"
    },
    "name": "JFB Report List"
  },
  "dvw-jfb-visible-projects-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "jfb_projects.id.",
          "name": "id",
          "type": "uuid"
        },
        {
          "description": "Project name.",
          "name": "name",
          "type": "text"
        },
        {
          "description": "Project number shown on the dashboard card (e.g. #182601).",
          "name": "project_code",
          "type": "text"
        },
        {
          "description": "Owner/client name.",
          "name": "client_name",
          "type": "text"
        },
        {
          "description": "Work type label, e.g. 'Hydraulic Dredging'.",
          "name": "work_type",
          "type": "text"
        },
        {
          "description": "Whether the project itself is active.",
          "name": "is_active",
          "type": "boolean"
        },
        {
          "description": "Project start date.",
          "name": "start_date",
          "type": "date"
        },
        {
          "description": "Project end date.",
          "name": "end_date",
          "type": "date"
        },
        {
          "description": "Volume goal for the project.",
          "name": "volume_goal",
          "type": "numeric"
        },
        {
          "description": "Primary measure used for progress tracking.",
          "name": "primary_measure",
          "type": "text"
        },
        {
          "description": "Site city.",
          "name": "site_city",
          "type": "text"
        },
        {
          "description": "Site state.",
          "name": "site_state",
          "type": "text"
        },
        {
          "description": "Whether TSCA zone tracking is enabled for this project.",
          "name": "is_tsca_zone_tracking",
          "type": "boolean"
        },
        {
          "description": "Whether soil type tracking is enabled for this project.",
          "name": "is_soil_type",
          "type": "boolean"
        },
        {
          "description": "Whether pipe tracking is enabled for this project.",
          "name": "is_pipe_tracking",
          "type": "boolean"
        }
      ],
      "description": "Projects a pe/pm is scoped to, resolved server-side instead of the client fetching every jfb_project_members row and filtering in JS. Joins jfb_projects to jfb_project_members and returns the projects where an active membership row's user resolves (via core.iam_entities_b) to p_email (case/whitespace-insensitive). Cross-project roles (director/admin) don't use this view -- they still read jfb_projects directly for the full list.",
      "direct_sql": "SELECT DISTINCT p.id, p.name, p.project_code, p.client_name, p.work_type, p.is_active, p.start_date, p.end_date, p.volume_goal, p.primary_measure, p.site_city, p.site_state, p.is_tsca_zone_tracking, p.is_soil_type, p.is_pipe_tracking FROM usdf.jfb_projects p JOIN usdf.jfb_project_members m ON m.project_id = p.id JOIN core.iam_entities_b u ON u.id = m.user_id AND u.entity_type = 'user' WHERE m.is_active IS NOT FALSE AND lower(trim(u.email)) = lower(trim(p_email)) ORDER BY p.name",
      "implementation": "function",
      "parameters": [
        {
          "description": "The logged-in pe/pm's token email, matched (case/whitespace-insensitive) against core.iam_entities_b.email for the IAM user referenced by jfb_project_members.user_id.",
          "name": "p_email",
          "required": true,
          "type": "text"
        }
      ],
      "slug": "dvw-jfb-visible-projects-v2"
    },
    "name": "JFB Visible Projects"
  },
  "dvw-jfb-water-quality-slots-v2": {
    "cfg_data": {
      "authoring_mode": "direct_sql",
      "columns": [
        {
          "description": "Start of the time slot, floored to p_interval_min. Aligns with the slots buildTurbidityDay generates.",
          "name": "slot_at",
          "type": "timestamptz"
        },
        {
          "description": "Monitor role for this average: background, early_warning or compliance.",
          "name": "role",
          "type": "text"
        },
        {
          "description": "Mean NTU across the slot.",
          "name": "avg_value",
          "type": "numeric"
        },
        {
          "description": "How many raw readings the average came from. An absent slot renders as an em dash.",
          "name": "reading_count",
          "type": "integer"
        }
      ],
      "description": "Pre-buckets jfb_water_quality_readings into the fixed time slots the Water Quality tab and the daily PDF render, so the client never pulls raw readings. Returns one row per (slot, role) with the mean reading in the slot. Same purpose and shape as dvw-jfb-air-quality-slots-v2: the response size follows the WINDOW, not the reading volume, so it holds whether the table has thousands of readings or millions. Roles are the fixed background / early_warning / compliance triple the compliance-mode layout reads.",
      "direct_sql": "SELECT to_timestamp(floor(extract(epoch from r.reading_at) / (p_interval_min * 60)) * (p_interval_min * 60)) AS slot_at, r.role AS role, avg(r.value) AS avg_value, count(*) AS reading_count FROM usdf.jfb_water_quality_readings r WHERE r.project_id = p_project_id AND r.reading_at >= p_start AND r.reading_at < p_end GROUP BY 1, 2 ORDER BY 1, 2",
      "implementation": "function",
      "parameters": [
        {
          "description": "Project whose water monitoring locations to read.",
          "name": "p_project_id",
          "required": true,
          "type": "uuid"
        },
        {
          "description": "Inclusive UTC start of the monitoring window, from reportWindowUtc(config, dateISO).",
          "name": "p_start",
          "required": true,
          "type": "timestamptz"
        },
        {
          "description": "Exclusive UTC end of the monitoring window. The caller passes endUtc + 1ms so the final slot is included.",
          "name": "p_end",
          "required": true,
          "type": "timestamptz"
        },
        {
          "description": "Slot width in minutes, from jfb_water_monitoring_config.interval_minutes (15 today).",
          "name": "p_interval_min",
          "required": true,
          "type": "integer"
        }
      ],
      "slug": "dvw-jfb-water-quality-slots-v2"
    },
    "name": "JFB Water Quality Slots"
  }
}
'''

DATA_VIEW_ITEMS = json.loads(_RAW_DATA_VIEWS_JSON)

ALL_ITEM_SLUGS = list(DATA_VIEW_ITEMS.keys())


def resolve_item_scope(item_scope):
    raw = str(item_scope or "all").strip()
    if raw == "" or raw.lower() == "all":
        return list(ALL_ITEM_SLUGS), []

    requested = [item.strip() for item in raw.split(",") if item.strip()]
    known = [slug for slug in requested if slug in DATA_VIEW_ITEMS]
    unknown = [slug for slug in requested if slug not in DATA_VIEW_ITEMS]
    return known, unknown


def item_configs(item_scope="all"):
    slugs, unknown = resolve_item_scope(item_scope)
    items = []
    for slug in slugs:
        entry = DATA_VIEW_ITEMS[slug]
        items.append({
            "slug": slug,
            "name": entry["name"],
            "cfg_data": entry["cfg_data"],
        })
    return items, unknown


def valid_slug(slug):
    if not slug or len(slug) > MAX_SLUG_LENGTH:
        return False
    if not ("a" <= slug[0] <= "z"):
        return False
    for ch in slug:
        if not ("a" <= ch <= "z" or "0" <= ch <= "9" or ch in "_-"):
            return False
    return True


def valid_parameter_name(name):
    if not name or not name.startswith("p_") or len(name) < 3:
        return False
    body = name[2:]
    if not ("a" <= body[0] <= "z"):
        return False
    for ch in body:
        if not ("a" <= ch <= "z" or "0" <= ch <= "9" or ch == "_"):
            return False
    return True


def check_data_view(slug, cfg_data):
    failures = []
    warnings = []

    if not valid_slug(slug):
        failures.append("slug_fails_platform_regex")
    if not slug.startswith("dvw-"):
        warnings.append("slug_missing_dvw_prefix")

    cfg_slug = cfg_data.get("slug") or ""
    if cfg_slug and cfg_slug != slug:
        failures.append("cfg_slug_mismatch:" + cfg_slug)

    for key in cfg_data:
        if key not in CFG_DATA_KEYS:
            failures.append("cfg_data_key_not_in_contract:" + key)

    authoring_mode = cfg_data.get("authoring_mode")
    if not authoring_mode:
        failures.append("missing_authoring_mode")
    elif authoring_mode not in AUTHORING_MODE_ENUM:
        failures.append("authoring_mode_not_in_enum:" + str(authoring_mode))

    implementation = cfg_data.get("implementation")
    if implementation is not None and implementation not in IMPLEMENTATION_ENUM:
        failures.append("implementation_not_in_enum:" + str(implementation))

    direct_sql = str(cfg_data.get("direct_sql") or "").strip()
    if authoring_mode == "direct_sql":
        if not direct_sql:
            failures.append("direct_sql_authoring_mode_missing_sql")
        else:
            lowered = direct_sql.lower()
            for leak in ["_b ", "_b\n", "_c ", "_c\n"]:
                if "usdf." in lowered and leak in lowered:
                    warnings.append("direct_sql_may_reference_base_table_check_tenancy")
                    break
    elif authoring_mode == "builder":
        builder = cfg_data.get("builder")
        if not isinstance(builder, dict) or not builder.get("sources"):
            failures.append("builder_authoring_mode_missing_sources")

    parameters = cfg_data.get("parameters")
    if parameters is None:
        parameters = []
    if not isinstance(parameters, list):
        failures.append("parameters_not_a_list")
        parameters = []

    seen_params = []
    for param in parameters:
        if not isinstance(param, dict):
            failures.append("parameter_not_an_object")
            continue
        name = str(param.get("name") or "")
        if not valid_parameter_name(name):
            failures.append("parameter_name_fails_regex:" + name)
        if name in seen_params:
            failures.append("duplicate_parameter_name:" + name)
        seen_params.append(name)
        if param.get("type") not in PARAMETER_TYPE_ENUM:
            failures.append("parameter_type_not_in_enum:" + name + ":" + str(param.get("type")))
        for key in param:
            if key not in PARAMETER_KEYS:
                failures.append("parameter_key_not_in_contract:" + name + ":" + key)

    columns = cfg_data.get("columns")
    if columns is None:
        columns = []
    if not isinstance(columns, list):
        failures.append("columns_not_a_list")
        columns = []

    seen_columns = []
    for column in columns:
        if not isinstance(column, dict):
            failures.append("column_not_an_object")
            continue
        name = str(column.get("name") or "")
        if not name:
            failures.append("column_missing_name")
        if name in seen_columns:
            failures.append("duplicate_column_name:" + name)
        seen_columns.append(name)
        col_type = column.get("type")
        if col_type is not None and col_type not in COLUMN_TYPE_ENUM:
            failures.append("column_type_not_in_enum:" + name + ":" + str(col_type))
        for key in column:
            if key not in COLUMN_KEYS:
                failures.append("column_key_not_in_contract:" + name + ":" + key)

    if len(str(cfg_data.get("description") or "")) > MAX_DESCRIPTION_LENGTH:
        warnings.append("description_longer_than_row_limit_will_be_truncated_on_save")

    return failures, warnings, {
        "slug": slug,
        "authoring_mode": authoring_mode,
        "parameter_count": len(parameters),
        "column_count": len(columns),
    }


def classify_secret_error(exc):
    text = str(exc or "").lower()
    if "not allowed" in text or "not permitted" in text or "forbidden" in text or "403" in text:
        return "secret_not_allowed"
    if "not found" in text or "404" in text or "does not exist" in text:
        return "secret_not_found"
    if "token" in text and ("signed" in text or "purpose" in text or "job" in text):
        return "runner_signed_token_rejected"
    return "secret_read_exception"


def privileged_secret_raw(secret_key):
    try:
        secret = get_privileged_secret(secret_key)
    except Exception as exc:
        return "", classify_secret_error(exc), safe_text(exc)

    try:
        if hasattr(secret, "get_raw"):
            raw = secret.get_raw()
        elif hasattr(secret, "_get_raw"):
            raw = secret._get_raw()
        else:
            return "", "secret_accessor_missing", "Secret wrapper exposes neither get_raw nor _get_raw."
    except Exception as exc:
        return "", classify_secret_error(exc), safe_text(exc)

    return str(raw or "").strip(), "", ""


def get_pivotly_api_safe():
    global PIVOTLY_API_DIAGNOSTIC
    PIVOTLY_API_DIAGNOSTIC = {
        "stage": "start",
        "token_status": "",
        "token_error": "",
        "token_error_description": "",
        "secret_reads": {},
        "token_endpoint": TOKEN_ENDPOINT,
        "api_scope": API_SCOPE,
    }

    if not PIVOTLY_AVAILABLE or PivotlyAPI is None:
        PIVOTLY_API_DIAGNOSTIC["stage"] = "import"
        PIVOTLY_API_DIAGNOSTIC["token_error"] = "pivotly_helper_unavailable"
        return None

    if not REQUESTS_AVAILABLE:
        PIVOTLY_API_DIAGNOSTIC["stage"] = "import"
        PIVOTLY_API_DIAGNOSTIC["token_error"] = "requests_unavailable"
        return None

    try:
        PIVOTLY_API_DIAGNOSTIC["stage"] = "secret_read"

        client_id, id_error, id_detail = privileged_secret_raw(CLIENT_ID_SECRET)
        client_secret, secret_error, secret_detail = privileged_secret_raw(CLIENT_SECRET_SECRET)

        PIVOTLY_API_DIAGNOSTIC["secret_reads"] = {
            CLIENT_ID_SECRET: {
                "value": "present" if client_id else "missing",
                "error_code": id_error,
                "error_detail": id_detail,
            },
            CLIENT_SECRET_SECRET: {
                "value": "present" if client_secret else "missing",
                "error_code": secret_error,
                "error_detail": secret_detail,
            },
        }

        first_error = id_error or secret_error
        if first_error:
            PIVOTLY_API_DIAGNOSTIC["token_error"] = first_error
            PIVOTLY_API_DIAGNOSTIC["token_error_description"] = id_detail or secret_detail
            PIVOTLY_API_DIAGNOSTIC["remediation"] = SECRET_ERROR_REMEDIATION.get(
                first_error, "Inspect secret_reads for the failing secret slug."
            )
            return None

        if not client_id or not client_secret:
            PIVOTLY_API_DIAGNOSTIC["token_error"] = "missing_client_credential_value"
            PIVOTLY_API_DIAGNOSTIC["remediation"] = (
                "No credential resolved. Check the jfb-pivotly-api-client-id / "
                "jfb-pivotly-api-client-secret Secret Variables and their Allowed "
                "Secrets rows for this script."
            )
            return None

        PIVOTLY_API_DIAGNOSTIC["stage"] = "token_post"
        response = requests.post(
            TOKEN_ENDPOINT,
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": API_SCOPE,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )
        PIVOTLY_API_DIAGNOSTIC["token_status"] = str(response.status_code)

        try:
            body = response.json()
        except Exception:
            body = {}

        if response.status_code >= 400 or not body.get("access_token"):
            PIVOTLY_API_DIAGNOSTIC["token_error"] = str(body.get("error", "token_http_error"))
            PIVOTLY_API_DIAGNOSTIC["token_error_description"] = safe_text(body.get("error_description", ""))
            PIVOTLY_API_DIAGNOSTIC["remediation"] = (
                "Secrets resolved but the token endpoint rejected them. Check the client id/secret "
                "values, TOKEN_ENDPOINT tenant, and API_SCOPE audience for this environment."
            )
            return None

        api = PivotlyAPI(
            client_id=client_id,
            client_secret=client_secret,
            token_endpoint=TOKEN_ENDPOINT,
            api_scope=API_SCOPE,
        )
        api._access_token = body.get("access_token")
        return api
    except Exception as exc:
        PIVOTLY_API_DIAGNOSTIC["token_error"] = "exception:" + type(exc).__name__
        PIVOTLY_API_DIAGNOSTIC["token_error_description"] = safe_text(exc)
        return None


def lookup_config_item_by_slug(api, item_type, slug):
    endpoint = "/api/v3/config-items/" + item_type + "/by-slug/" + slug
    try:
        response = api._request("GET", endpoint)
        if isinstance(response, dict) and isinstance(response.get("data"), dict):
            return response["data"]
        return {}
    except Exception as exc:
        text = str(exc).lower()
        if "404" in text or "not found" in text:
            return {}
        raise


def row_description(cfg_data, slug):
    text = str(cfg_data.get("description") or ("JFB managed data view: " + slug))
    if len(text) > MAX_DESCRIPTION_LENGTH:
        return text[:MAX_DESCRIPTION_LENGTH - 3] + "..."
    return text


def create_data_view(api, slug, name, cfg_data):
    payload = {
        "parameters": {},
        "data": {
            "slug": slug,
            "item_type": DATA_VIEW_ITEM_TYPE,
            "name": name,
            "description": row_description(cfg_data, slug),
            "enabled": True,
            "cfg_data": cfg_data,
        },
    }
    endpoint = "/api/v3/config-items/" + DATA_VIEW_ITEM_TYPE
    response = api._request("POST", endpoint, data=payload)
    return {
        "action": "created_via_post",
        "slug": slug,
        "data": response.get("data") if isinstance(response, dict) else response,
    }


def update_data_view(api, item_id, slug, name, cfg_data, version):
    payload = {
        "parameters": {"id": item_id},
        "data": {
            "id": item_id,
            "slug": slug,
            "item_type": DATA_VIEW_ITEM_TYPE,
            "name": name,
            "description": row_description(cfg_data, slug),
            "enabled": True,
            "version": version,
            "cfg_data": cfg_data,
        },
    }
    endpoint = "/api/v3/config-items/" + DATA_VIEW_ITEM_TYPE + "/" + item_id
    response = api._request("PATCH", endpoint, data=payload)
    return {
        "action": "updated_via_patch",
        "id": item_id,
        "slug": slug,
        "data": response.get("data") if isinstance(response, dict) else response,
    }


def save_data_view(api, slug, name, cfg_data):
    existing = lookup_config_item_by_slug(api, DATA_VIEW_ITEM_TYPE, slug)
    existing_id = str(existing.get("id") or "").strip()

    if existing_id:
        version = existing.get("version")
        version = int(version) if isinstance(version, int) or str(version or "").isdigit() else 1
        return update_data_view(api, existing_id, slug, name, cfg_data, version)

    orphan = lookup_config_item_by_slug(api, LEGACY_ITEM_TYPE, slug)
    orphan_id = str(orphan.get("id") or "").strip()
    if orphan_id:
        raise RuntimeError(
            "slug_blocked_by_legacy_item: slug '" + slug + "' is held by a cfg_items_b row with "
            "item_type='" + LEGACY_ITEM_TYPE + "' (id " + orphan_id + "), written by the domain "
            "bootstrap. uq_cfg_items_b_slug is global, so creating the real data_view would fail "
            "with a unique violation. Run mode=release_orphan_slugs first."
        )

    return create_data_view(api, slug, name, cfg_data)


def publish_data_view(api, slug):
    endpoint = "/api/v3/data-views/" + slug + "/publish"
    return api._request("POST", endpoint, data={})


def parked_slug(slug):
    return (ORPHAN_SLUG_PREFIX + slug)[:MAX_SLUG_LENGTH]


def release_orphan_slug(api, slug):
    orphan = lookup_config_item_by_slug(api, LEGACY_ITEM_TYPE, slug)
    orphan_id = str(orphan.get("id") or "").strip()
    if not orphan_id:
        return {"slug": slug, "action": "no_legacy_row_found"}

    new_slug = parked_slug(slug)
    payload = {
        "parameters": {"id": orphan_id},
        "data": {
            "id": orphan_id,
            "slug": new_slug,
            "item_type": LEGACY_ITEM_TYPE,
            "name": str(orphan.get("name") or new_slug),
            "description": "Parked by jfb_dataview_bootstrap: legacy item_type row, slug released.",
            "enabled": False,
            "cfg_data": orphan.get("cfg_data") if isinstance(orphan.get("cfg_data"), dict) else {},
        },
    }
    endpoint = "/api/v3/config-items/" + LEGACY_ITEM_TYPE + "/" + orphan_id
    api._request("PATCH", endpoint, data=payload)
    return {"slug": slug, "action": "slug_released", "id": orphan_id, "new_slug": new_slug}


def result(name, ok, message, count=0, details=None):
    return {
        "name": name,
        "ok": bool(ok),
        "message": message,
        "count": int(count),
        "details": details or {},
    }


def self_check(config):
    items, unknown_slugs = item_configs(config["item_scope"])

    api = get_pivotly_api_safe()
    token_ready = api is not None

    all_failures = []
    all_warnings = []
    per_item = {}

    if unknown_slugs:
        all_failures.append("unknown_item_scope_slugs:" + ",".join(unknown_slugs))

    for item in items:
        failures, warnings, info = check_data_view(item["slug"], item["cfg_data"])
        per_item[item["slug"]] = {"failures": failures, "warnings": warnings, "info": info}
        if failures:
            all_failures.extend([item["slug"] + ":" + f for f in failures])
        if warnings:
            all_warnings.extend([item["slug"] + ":" + w for w in warnings])

    if not token_ready:
        if PIVOTLY_AVAILABLE:
            all_failures.append("core_api_token_unavailable:" + str(PIVOTLY_API_DIAGNOSTIC.get("token_error") or "unknown"))
        else:
            all_warnings.append("pivotly_api_unavailable_outside_runner")

    return result(
        "self_check",
        len(all_failures) == 0,
        "Self-check passed." if not all_failures else "Self-check found contract problems.",
        len(items),
        {
            "item_scope": config["item_scope"],
            "item_count_in_scope": len(items),
            "unknown_item_scope_slugs": unknown_slugs,
            "all_item_slugs": list(ALL_ITEM_SLUGS),
            "per_item": per_item,
            "valid_modes": VALID_MODES,
            "item_type_used": DATA_VIEW_ITEM_TYPE,
            "param_contract_version": config["param_contract_version"],
            "param_contract_version_ok": config["param_contract_version"] == PARAM_CONTRACT_VERSION,
            "accepted_param_names": list(PUBLIC_RUNNER_PARAMS),
            "token_ready": token_ready,
            "write_ready": token_ready and not all_failures,
            "pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC),
            "diagnostics": {"failures": all_failures, "warnings": all_warnings},
        },
    )


def detect_orphans(config):
    items, unknown_slugs = item_configs(config["item_scope"])

    if unknown_slugs:
        return result(
            "detect_orphans",
            False,
            "item_scope named slugs this script doesn't know about.",
            0,
            {"unknown_item_scope_slugs": unknown_slugs, "all_item_slugs": list(ALL_ITEM_SLUGS)},
        )

    api = get_pivotly_api_safe()
    if api is None:
        return result(
            "detect_orphans",
            False,
            "Pivotly API helper is not configured in this runner context.",
            0,
            {"pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC)},
        )

    errors = []
    real = []
    orphan_blocking = []
    both_present = []
    missing = []
    per_item = {}

    for item in items:
        slug = item["slug"]
        try:
            current = lookup_config_item_by_slug(api, DATA_VIEW_ITEM_TYPE, slug)
            legacy = lookup_config_item_by_slug(api, LEGACY_ITEM_TYPE, slug)
        except Exception as exc:
            errors.append(slug + "/lookup: " + safe_text(exc, 600))
            continue

        current_id = str(current.get("id") or "").strip()
        legacy_id = str(legacy.get("id") or "").strip()

        if current_id and legacy_id:
            state = "both_present"
            both_present.append(slug)
        elif current_id:
            state = "data_view_exists"
            real.append(slug)
        elif legacy_id:
            state = "orphan_blocking"
            orphan_blocking.append(slug)
        else:
            state = "missing_everywhere"
            missing.append(slug)

        per_item[slug] = {
            "state": state,
            "data_view_id": current_id,
            "data_view_version": current.get("version"),
            "legacy_dataview_id": legacy_id,
        }

    if orphan_blocking or both_present:
        message = (
            str(len(orphan_blocking) + len(both_present)) + " slug(s) are held by legacy "
            "item_type='" + LEGACY_ITEM_TYPE + "' rows and will block a create. Run "
            "mode=release_orphan_slugs (dry_run=false) before bootstrap_only."
        )
    else:
        message = (
            str(len(real)) + " data view(s) already exist, " + str(len(missing))
            + " missing and ready to create. No legacy rows blocking any slug."
        )

    return result(
        "detect_orphans",
        len(errors) == 0,
        message,
        len(per_item),
        {
            "item_scope": config["item_scope"],
            "data_view_exists": real,
            "orphan_blocking": orphan_blocking,
            "both_present": both_present,
            "missing_everywhere": missing,
            "per_item": per_item,
            "errors": errors,
            "read_only": True,
        },
    )


def release_orphan_slugs(config):
    items, unknown_slugs = item_configs(config["item_scope"])

    if unknown_slugs:
        return result(
            "release_orphan_slugs",
            False,
            "item_scope named slugs this script doesn't know about.",
            0,
            {"unknown_item_scope_slugs": unknown_slugs, "all_item_slugs": list(ALL_ITEM_SLUGS)},
        )

    api = get_pivotly_api_safe()
    if api is None:
        return result(
            "release_orphan_slugs",
            False,
            "Pivotly API helper is not configured in this runner context.",
            0,
            {"pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC)},
        )

    errors = []
    planned = []
    released = []
    skipped = []

    for item in items:
        slug = item["slug"]
        try:
            legacy = lookup_config_item_by_slug(api, LEGACY_ITEM_TYPE, slug)
        except Exception as exc:
            errors.append(slug + "/lookup: " + safe_text(exc, 600))
            continue

        legacy_id = str(legacy.get("id") or "").strip()
        if not legacy_id:
            skipped.append(slug)
            continue

        if config["dry_run"]:
            planned.append({"slug": slug, "id": legacy_id, "new_slug": parked_slug(slug)})
            continue

        try:
            released.append(release_orphan_slug(api, slug))
        except Exception as exc:
            errors.append(slug + "/release: " + safe_text(exc, 1200))

    if config["dry_run"]:
        message = (
            "Dry run: " + str(len(planned)) + " legacy row(s) would have their slug parked; "
            + str(len(skipped)) + " slug(s) have no legacy row. Re-run with dry_run=false to apply."
        )
    elif errors:
        message = (
            str(len(released)) + " slug(s) released; " + str(len(errors)) + " error(s). If the stored "
            "procedure refuses a slug change, the legacy rows must be cleared DB-side -- the DELETE "
            "route is a soft delete and uq_cfg_items_b_slug covers deleted rows."
        )
    else:
        message = str(len(released)) + " slug(s) released. Run mode=bootstrap_only next."

    return result(
        "release_orphan_slugs",
        len(errors) == 0,
        message,
        len(released) if not config["dry_run"] else len(planned),
        {
            "item_scope": config["item_scope"],
            "planned": planned,
            "released": released,
            "no_legacy_row": skipped,
            "errors": errors,
            "dry_run": config["dry_run"],
        },
    )


def bootstrap_only(config):
    items, unknown_slugs = item_configs(config["item_scope"])

    if unknown_slugs:
        return result(
            "bootstrap_only",
            False,
            "item_scope named slugs this script doesn't know about.",
            0,
            {"unknown_item_scope_slugs": unknown_slugs, "all_item_slugs": list(ALL_ITEM_SLUGS)},
        )

    contract_failures = {}
    writable = []
    for item in items:
        failures, _warnings, _info = check_data_view(item["slug"], item["cfg_data"])
        if failures:
            contract_failures[item["slug"]] = failures
        else:
            writable.append(item)

    if config["dry_run"]:
        return result(
            "bootstrap_only",
            not contract_failures,
            "Dry run: " + str(len(writable)) + " data view(s) would be written, "
            + str(len(contract_failures)) + " skipped for failing the platform contract. Nothing written.",
            len(writable),
            {
                "item_scope": config["item_scope"],
                "items": [{"slug": it["slug"], "name": it["name"]} for it in writable],
                "contract_failures": contract_failures,
                "publish_config": config["publish_config"],
                "item_type_used": DATA_VIEW_ITEM_TYPE,
            },
        )

    api = get_pivotly_api_safe()
    if api is None:
        return result(
            "bootstrap_only",
            False,
            "Pivotly API helper is not configured in this runner context.",
            0,
            {"pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC)},
        )

    errors = []
    warnings = []
    saved = {}
    published = []
    blocked = []

    if config["param_contract_version"] != PARAM_CONTRACT_VERSION:
        warnings.append(
            "param_contract_version_mismatch:expected=" + PARAM_CONTRACT_VERSION
            + ",received=" + str(config["param_contract_version"])
        )

    for item in writable:
        slug = item["slug"]
        try:
            saved[slug] = save_data_view(api, slug, item["name"], item["cfg_data"])
        except Exception as exc:
            text = safe_text(exc, 1200)
            if "slug_blocked_by_legacy_item" in text:
                blocked.append(slug)
            errors.append(slug + ": " + text)

    if config["publish_config"]:
        for item in writable:
            slug = item["slug"]
            if slug not in saved:
                continue
            try:
                publish_data_view(api, slug)
                published.append(slug)
            except Exception as exc:
                errors.append(slug + "/publish: " + safe_text(exc, 1200))

    if contract_failures:
        warnings.append("skipped_for_contract_failures:" + ",".join(sorted(contract_failures)))

    if blocked:
        message = (
            str(len(saved)) + " data view(s) saved; " + str(len(blocked)) + " blocked by a legacy "
            "item_type='" + LEGACY_ITEM_TYPE + "' row holding the slug. Run "
            "mode=release_orphan_slugs (dry_run=false), then re-run this mode."
        )
    elif errors:
        message = str(len(saved)) + " data view(s) saved, " + str(len(errors)) + " error(s) -- see errors."
    elif published:
        message = str(len(saved)) + " data view(s) saved and " + str(len(published)) + " published to usdf."
    elif config["publish_config"]:
        message = str(len(saved)) + " data view(s) saved; nothing published."
    else:
        message = (
            str(len(saved)) + " data view(s) saved but NOT published (publish_config=false). A data "
            "view is only callable once published -- re-run with publish_config=true, or use "
            "mode=publish_only."
        )

    return result(
        "bootstrap_only",
        len(errors) == 0,
        message,
        len(saved),
        {
            "item_scope": config["item_scope"],
            "items_attempted": [it["slug"] for it in writable],
            "items_saved": list(saved.keys()),
            "items_blocked_by_legacy_slug": blocked,
            "contract_failures": contract_failures,
            "save_results": saved,
            "published": published,
            "publish_config": config["publish_config"],
            "errors": errors,
            "warnings": warnings,
        },
    )


def publish_only(config):
    items, unknown_slugs = item_configs(config["item_scope"])

    if unknown_slugs:
        return result(
            "publish_only",
            False,
            "item_scope named slugs this script doesn't know about.",
            0,
            {"unknown_item_scope_slugs": unknown_slugs, "all_item_slugs": list(ALL_ITEM_SLUGS)},
        )

    if config["dry_run"]:
        return result(
            "publish_only",
            True,
            "Dry run: would publish " + str(len(items)) + " data view(s). Re-run with dry_run=false.",
            0,
            {
                "item_scope": config["item_scope"],
                "items": [it["slug"] for it in items],
                "dry_run": True,
            },
        )

    api = get_pivotly_api_safe()
    if api is None:
        return result(
            "publish_only",
            False,
            "Pivotly API helper is not configured in this runner context.",
            0,
            {"pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC)},
        )

    errors = []
    not_found = []
    published = []

    for item in items:
        slug = item["slug"]
        try:
            existing = lookup_config_item_by_slug(api, DATA_VIEW_ITEM_TYPE, slug)
        except Exception as exc:
            errors.append(slug + "/lookup: " + safe_text(exc, 1200))
            continue

        if not existing.get("id"):
            not_found.append(slug)
            continue

        try:
            publish_data_view(api, slug)
            published.append(slug)
        except Exception as exc:
            errors.append(slug + "/publish: " + safe_text(exc, 1200))

    if not_found and not published and not errors:
        message = (
            "No saved data view found for any slug in scope. Run mode=bootstrap_only with "
            "dry_run=false first."
        )
    elif errors:
        message = "Publish completed with errors."
    else:
        message = (
            str(len(published)) + " data view(s) published; usdf.dvw_<slug> function(s) generated."
        )

    return result(
        "publish_only",
        len(errors) == 0 and not not_found,
        message,
        len(published),
        {
            "item_scope": config["item_scope"],
            "items_attempted": [it["slug"] for it in items],
            "config_item_not_found": not_found,
            "published": published,
            "errors": errors,
        },
    )


def run(config):
    if config["mode"] == "bootstrap_only":
        output = bootstrap_only(config)
    elif config["mode"] == "publish_only":
        output = publish_only(config)
    elif config["mode"] == "detect_orphans":
        output = detect_orphans(config)
    elif config["mode"] == "release_orphan_slugs":
        output = release_orphan_slugs(config)
    else:
        output = self_check(config)

    output["script_version"] = SCRIPT_VERSION
    output["mode"] = config["mode"]
    output["dry_run"] = config["dry_run"]
    output["param_contract_version"] = config["param_contract_version"]
    output["accepted_param_count"] = len(PUBLIC_RUNNER_PARAMS)

    output["param_resolution"] = dict(PARAM_DEBUG)
    output["params_using_default"] = sorted(
        name for name, info in PARAM_DEBUG.items() if info.get("returned_default")
    )
    output["param_errors"] = {
        name: info.get("error") for name, info in PARAM_DEBUG.items() if info.get("error")
    }

    if config.get("output_shape") == "summary":
        output["details"].pop("items", None)
        output["details"].pop("save_results", None)
        output["details"].pop("per_item", None)

    return output


def main():
    print(json.dumps(run(load_config()), sort_keys=True))
    return 0


raise SystemExit(main())
