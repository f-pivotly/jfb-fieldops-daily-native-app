
import json
import uuid

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


SCRIPT_VERSION = "v4-jfb-domain-sync-58-r7"

SCRIPT_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "pivotly:jfb:config-bootstrap:v2")

PARAM_CONTRACT_VERSION = "jfb_config_params_v2"

DOMAIN_ITEM_TYPE = "domain"

STABLE_PARAM_CONTRACT = [
    {"name": "mode", "type": "TEXT", "default": "self_check"},
    {"name": "param_contract_version", "type": "TEXT", "default": PARAM_CONTRACT_VERSION},
    {"name": "dry_run", "type": "BOOLEAN", "default": True},
    {"name": "publish_config", "type": "BOOLEAN", "default": False},
    {"name": "item_scope", "type": "TEXT", "default": "all"},
    {"name": "output_shape", "type": "TEXT", "default": "summary"},
]

PUBLIC_RUNNER_PARAMS = [item["name"] for item in STABLE_PARAM_CONTRACT]

VALID_MODES = ["self_check", "migrate_additive", "bootstrap_only", "publish_only"]

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

RESERVED_ATTRIBUTE_NAMES = {
    "id", "version", "subversion", "domain", "superseded_by_id", "is_deleted",
    "deleted_at", "version_token", "last_tx_id", "created_at", "modified_at",
    "created_by", "modified_by", "created_by_system", "modified_by_system",
    "tenant_id", "core_record_id", "core", "source_record_ref", "source_record_ct",
    "has_attachment", "updated_at", "modified_by_source_record_ref",
}


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


_RAW_DOMAINS_JSON = r'''
{
  "jfb_air_monitoring_config": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_air_monitoring_config",
      "domain_table_name": "jfb_air_monitoring_config",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "One row per project. The project this air monitoring configuration belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "provider",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Defaults to 'ecomzen' (SGS Galson SmartSense).",
          "indexed": false,
          "label": "Provider",
          "masking": {
            "masked": false
          },
          "name": "provider",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "provider",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "base_url",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Base URL of the provider's API. Defaults to 'https://sgsusa-ws.i-comesure.com'.",
          "indexed": false,
          "label": "Base URL",
          "masking": {
            "masked": false
          },
          "name": "base_url",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "base_url",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "timezone",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "IANA timezone the reporting window is expressed in. Defaults to 'America/New_York'.",
          "indexed": false,
          "label": "Timezone",
          "masking": {
            "masked": false
          },
          "name": "timezone",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "timezone",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "window_start",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Local time-of-day (HH:MM:SS) the daily reporting window opens. Defaults to '06:00:00'.",
          "indexed": false,
          "label": "Window Start",
          "masking": {
            "masked": false
          },
          "name": "window_start",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "window_start",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "window_end",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Local time-of-day (HH:MM:SS) the daily reporting window closes. Defaults to '18:00:00'.",
          "indexed": false,
          "label": "Window End",
          "masking": {
            "masked": false
          },
          "name": "window_end",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "window_end",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "interval_minutes",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Expected spacing between readings, in minutes. Defaults to 15.",
          "indexed": false,
          "label": "Interval (minutes)",
          "masking": {
            "masked": false
          },
          "name": "interval_minutes",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "interval_minutes",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "stations",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Array of monitoring stations: {key, label, sensor_id, chart, role?}. chart is 'llra' (beaches chart) or 'mbp' (the other capping-boundary chart) -- selects which report chart the station's series belongs to. role='background' marks the upwind reference station.",
          "indexed": false,
          "label": "Stations",
          "masking": {
            "masked": false
          },
          "name": "stations",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "stations",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "thresholds",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "{alert_offset_mgm3?, action_offset_mgm3?, early_warning_mgm3?, not_to_exceed_mgm3?}. alert/action offsets are added to each time slot's minimum llra-station value to produce the Alert Level / Action Level series; early_warning/not_to_exceed are flat lines on the mbp chart.",
          "indexed": false,
          "label": "Thresholds",
          "masking": {
            "masked": false
          },
          "name": "thresholds",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "thresholds",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "equipment_text",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Printed boilerplate describing the monitoring equipment used.",
          "indexed": false,
          "label": "Equipment Text",
          "masking": {
            "masked": false
          },
          "name": "equipment_text",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "equipment_text",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "calibration_text",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Printed boilerplate describing the calibration procedure/schedule.",
          "indexed": false,
          "label": "Calibration Text",
          "masking": {
            "masked": false
          },
          "name": "calibration_text",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "calibration_text",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "notes_text",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Printed boilerplate notes shown on the page.",
          "indexed": false,
          "label": "Notes Text",
          "masking": {
            "masked": false
          },
          "name": "notes_text",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "notes_text",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "aerial_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Annotated aerial showing stations and the barge lane. Null = no aerial block.",
          "indexed": false,
          "label": "Aerial Image Path",
          "masking": {
            "masked": false
          },
          "name": "aerial_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "aerial_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "slug": "jfb_air_monitoring_config",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Air Monitoring Config"
  },
  "jfb_air_monitoring_daily": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_air_monitoring_daily",
      "domain_table_name": "jfb_air_monitoring_daily",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this row belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "report_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "One row per report. The daily report this activity/notes text belongs to. Unique per report -- enforced at the domain level as defense-in-depth against a client-side race (e.g. switching report dates without leaving the Air Quality tab) issuing a duplicate create instead of an update.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_reports"
          },
          "indexed": true,
          "label": "Report Id",
          "masking": {
            "masked": false
          },
          "name": "report_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "report_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": true
        },
        {
          "column_name": "activity",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "PE-entered \"Project activity today\" free text, printed on the Air Quality page.",
          "indexed": false,
          "label": "Activity",
          "masking": {
            "masked": false
          },
          "name": "activity",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "activity",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "notes",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "PE-entered narrative notes for the Air Quality page.",
          "indexed": false,
          "label": "Notes",
          "masking": {
            "masked": false
          },
          "name": "notes",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "notes",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "slug": "jfb_air_monitoring_daily",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Air Monitoring Daily"
  },
  "jfb_air_quality_readings": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_air_quality_reading",
      "domain_table_name": "jfb_air_quality_readings",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this reading belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "sensor_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Provider's numeric sensor id, stringified.",
          "indexed": true,
          "label": "Sensor Id",
          "masking": {
            "masked": false
          },
          "name": "sensor_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "sensor_id",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "station_key",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Matches a stations[].key inside this project's jfb_air_monitoring_config row. Not a domain FK, same pattern as jfb_water_quality_readings.location_id.",
          "indexed": false,
          "label": "Station Key",
          "masking": {
            "masked": false
          },
          "name": "station_key",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "station_key",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "parameter",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The measured parameter. Defaults to 'pm10'.",
          "indexed": false,
          "label": "Parameter",
          "masking": {
            "masked": false
          },
          "name": "parameter",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "parameter",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "unit",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Unit of value. Defaults to 'ug/m3'.",
          "indexed": false,
          "label": "Unit",
          "masking": {
            "masked": false
          },
          "name": "unit",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "unit",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "value",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "The measured value.",
          "indexed": false,
          "label": "Value",
          "masking": {
            "masked": false
          },
          "name": "value",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "value",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "reading_at",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "timestamp with time zone",
          "description": "Timestamp the reading was taken (device/provider time, in UTC). Combined with project_id, sensor_id, and parameter, should be unique -- one reading per sensor per parameter per timestamp.",
          "indexed": true,
          "label": "Reading At",
          "masking": {
            "masked": false
          },
          "name": "reading_at",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "reading_at",
          "triggers_version_change": true,
          "type": "timestamp with time zone",
          "unique": false
        },
        {
          "column_name": "source",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Which provider produced this reading. Defaults to 'ecomzen'.",
          "indexed": false,
          "label": "Source",
          "masking": {
            "masked": false
          },
          "name": "source",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "source",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "fetched_at",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "timestamp with time zone",
          "description": "When this app pulled/ingested the reading -- may lag reading_at.",
          "indexed": false,
          "label": "Fetched At",
          "masking": {
            "masked": false
          },
          "name": "fetched_at",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "fetched_at",
          "triggers_version_change": true,
          "type": "timestamp with time zone",
          "unique": false
        }
      ],
      "slug": "jfb_air_quality_readings",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Air Quality Readings"
  },
  "jfb_component_types": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_component_type",
      "domain_table_name": "jfb_component_types",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The component-type category label, e.g. \"Sand\", \"Gravel\", \"Amendment\", \"Open\". Globally unique -- shared across every project, not project-scoped.",
          "indexed": true,
          "label": "Name",
          "masking": {
            "masked": false
          },
          "name": "name",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "name",
          "triggers_version_change": true,
          "type": "text",
          "unique": true
        },
        {
          "column_name": "description",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Optional longer explanation of what this component type means.",
          "indexed": false,
          "label": "Description",
          "masking": {
            "masked": false
          },
          "name": "description",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "description",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Display order in the Component Type dropdown.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this component type is currently offered in the dropdown. False retires it without deleting history.",
          "indexed": false,
          "label": "Active",
          "masking": {
            "masked": false
          },
          "name": "active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        }
      ],
      "slug": "jfb_component_types",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Component Types"
  },
  "jfb_culture_tenants": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_culture_tenant",
      "domain_table_name": "jfb_culture_tenants",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Culture tenant name (e.g. \"PROFESSIONALISM\", \"TEAMWORK\"). Company-wide, not project-scoped. Matches the non-native app's culture_tenants.name.",
          "indexed": false,
          "label": "Name",
          "masking": {
            "masked": false
          },
          "name": "name",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "description",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "One or two sentences explaining the tenant, shown under the picker and printed on the Safety page.",
          "indexed": false,
          "label": "Description",
          "masking": {
            "masked": false
          },
          "name": "description",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "description",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Display order in the picker, lowest first.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this tenant is currently offered in the picker.",
          "indexed": false,
          "label": "Active",
          "masking": {
            "masked": false
          },
          "name": "active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        }
      ],
      "slug": "jfb_culture_tenants",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Culture Tenants"
  },
  "jfb_daily_activities": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "enabled": true,
        "max_record_versions": 25,
        "retention_days": 0
      },
      "contact": {
        "owner": null,
        "steward": null,
        "support": null
      },
      "default_conflict_resolution": {
        "code": "lww"
      },
      "domain_name_singular": "Daily Activitie",
      "domain_table_name": "jfb_daily_activities",
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": false,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "equipment_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_equipments"
          },
          "indexed": false,
          "label": "Equipment Id",
          "masking": {
            "masked": false
          },
          "name": "equipment_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "equipment_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "operator_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_operators"
          },
          "indexed": false,
          "label": "Operator Id",
          "masking": {
            "masked": false
          },
          "name": "operator_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "operator_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "start_date_time",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "timestamp with time zone",
          "description": "",
          "indexed": false,
          "label": "Start Date Time",
          "masking": {
            "masked": false
          },
          "name": "start_date_time",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "start_date_time",
          "triggers_version_change": true,
          "type": "timestamp with time zone",
          "unique": false
        },
        {
          "column_name": "report_date",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "Which daily report this event belongs to, stamped when the event is created rather than derived from start_date_time. A night shift keeps one report date even as it crosses midnight, and trimming an event's start time later never moves it to another day. Matches the non-native app's daily_events.report_date, which the operator app sets from the session start and the daily app sets from the report being edited.",
          "indexed": true,
          "label": "Report Date",
          "masking": {
            "masked": false
          },
          "name": "report_date",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "report_date",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "end_date_time",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "timestamp with time zone",
          "description": "",
          "indexed": false,
          "label": "End Date Time",
          "masking": {
            "masked": false
          },
          "name": "end_date_time",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "end_date_time",
          "triggers_version_change": true,
          "type": "timestamp with time zone",
          "unique": false
        },
        {
          "column_name": "timezone",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Timezone",
          "masking": {
            "masked": false
          },
          "name": "timezone",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "timezone",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "session_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Session Id",
          "masking": {
            "masked": false
          },
          "name": "session_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "session_id",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "pass_type",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Which pass or lift this activity was working, as selected in the field app (jfb-dot-to-dot). A picklist value, not a domain FK, and it can come from either of two lists depending on the machine's discipline: pkl-jfb-pass-type on dredging work, pkl-jfb-lift on capping and placement work, where the operator picks a lift rather than a pass. The two lists are kept separate so a dredging project is never offered lifts and vice versa, and their values never collide (1st_pass, lift_1, ...). Anything resolving a label for display must therefore look in BOTH lists -- reading needs the union, only the write-side dropdown needs the discipline-scoped subset. Null on multi-layer capping projects, where layer_id carries the same meaning instead.",
          "indexed": false,
          "label": "Pass Type",
          "masking": {
            "masked": false
          },
          "name": "pass_type",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "pass_type",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "attachment_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The equipment attachment (e.g. \"3ft Cutterhead\", \"Env Bucket\") active for this activity.",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_project_attachments"
          },
          "indexed": false,
          "label": "Attachment Id",
          "masking": {
            "masked": false
          },
          "name": "attachment_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "attachment_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "area",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "The area/subarea/sub-subarea selected for this activity via the field app's area cascade. Stored as jsonb rather than a single FK because a project's area hierarchy (jfb_project_area_levels) can be 1-3 levels deep -- e.g. {\"area_id\": \"...\", \"sub_area_id\": \"...\", \"sub_sub_area_id\": \"...\"}, omitting keys the project doesn't use.",
          "indexed": false,
          "label": "Area",
          "masking": {
            "masked": false
          },
          "name": "area",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "area",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "area_source",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Where this activity's `area` came from, which is what the Event Log's Area/Pass fill-down reads. 'operator' = the area arrived WITH the activity (picked in the field app, or created carrying one) -- never overwritten, and reaching one STOPS a fill, because it marks a real known state and everything below it belongs to that state. 'pe' = written by the PE's edit dialog, directly or by a fill -- re-fillable, so a later fill from an earlier activity may overwrite it. NULL (no area, or unknown provenance on a legacy row) is treated as operator-grade: the fill stops rather than guessing. A grade, not an identity -- who tagged it is already on operator_id. Invisible in every report; the only thing the PE sees is the resulting \"apply to the N activities below\" count.",
          "indexed": false,
          "label": "Area Source",
          "masking": {
            "masked": false
          },
          "name": "area_source",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "area_source",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "notes",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Notes",
          "masking": {
            "masked": false
          },
          "name": "notes",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "notes",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "tsca",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "The TSCA (\u226550 ppm PCB) contamination flag for this activity's area, matching the non-native app's daily_events.tsca. Set by the PE when inserting or editing an event in the field ops report app.",
          "indexed": false,
          "label": "Tsca",
          "masking": {
            "masked": false
          },
          "name": "tsca",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "tsca",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "delay_code_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project delay code tapped for this activity in the field app. References the project's own activated jfb_project_delay_codes row, which may in turn point at the master jfb_delay_codes library or be a project-specific custom code with no master match.",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_project_delay_codes"
          },
          "indexed": false,
          "label": "Delay Code Id",
          "masking": {
            "masked": false
          },
          "name": "delay_code_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "delay_code_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "category",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Human-readable label for what kind of time this activity represents -- the productive-tile label (e.g. \"ACTIVE DREDGING\") when delay_code_id is null, or the delay code's own text when set. Matches the non-native app's daily_events.category free-text field; written by the app at save time, not derived by a stored computation.",
          "indexed": false,
          "label": "Category",
          "masking": {
            "masked": false
          },
          "name": "category",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "category",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "layer_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Which capping layer was being placed during this activity. Null on dredging projects and on single-layer capping projects (the layer is implicit there). Matches the non-native app's daily_events.layer_id.",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_project_layers"
          },
          "indexed": false,
          "label": "Layer Id",
          "masking": {
            "masked": false
          },
          "name": "layer_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "layer_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "lane",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Which numbered lane a hydraulic capping spreader barge was working during this activity. Free text, captured per activity in the field app and matching the non-native app's daily_events.lane. Set only on Hydraulic Capping work -- a spreader lays cap material along numbered lanes in numbered steps. Null on dredging, and null on Mechanical Capping, where an excavator places by the named layer instead and lane has no meaning.",
          "indexed": false,
          "label": "Lane",
          "masking": {
            "masked": false
          },
          "name": "lane",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "lane",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "step",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Which step along the lane the spreader was working during this activity. Free text rather than an integer, matching the non-native app's daily_events.step, because the field app accepts whatever the operator types. Companion to lane and set under the same conditions: Hydraulic Capping only, null everywhere else.",
          "indexed": false,
          "label": "Step",
          "masking": {
            "masked": false
          },
          "name": "step",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "step",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "local_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The field app's own UUID for this activity, generated on the device before the write is attempted. Matches the non-native app's daily_events.local_id and does the same two jobs. First, it makes a retry idempotent: the operator app queues writes offline and re-sends them, so a write that succeeded but whose response was lost would otherwise land twice -- keying on local_id lets the second attempt be recognised as the same row. Second, its presence is the source marker: a row with local_id set came from an operator's tablet, a row with it null was entered by a PM in the report app, which is exactly how the non-native stack's eventSource() tells them apart. Null on every PM-entered row, by design.",
          "indexed": true,
          "label": "Local Id",
          "masking": {
            "masked": false
          },
          "name": "local_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "local_id",
          "triggers_version_change": true,
          "type": "text",
          "unique": true
        },
        {
          "column_name": "device_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Which tablet wrote this activity, stable per install. Matches the non-native app's daily_events.device_id, where it is the companion to local_id. Useful for tracing a bad run back to one iPad -- a unit whose clock is wrong, or one stuck offline -- without which a sync problem can only be seen per project. Null on PM-entered rows, like local_id.",
          "indexed": false,
          "label": "Device Id",
          "masking": {
            "masked": false
          },
          "name": "device_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "device_id",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "deletion_reason",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Why a PE/PM deleted this activity from the Event Log. Written just before the soft delete; the platform's own deleted_at and modified_by record when and who. Matches the non-native app's event_deletions.reason. Null on live rows.",
          "indexed": false,
          "label": "Deletion Reason",
          "masking": {
            "masked": false
          },
          "name": "deletion_reason",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "deletion_reason",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "track_versions": true,
      "xref_enabled": false
    },
    "name": "JFB Daily Activities"
  },
  "jfb_delay_codes": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_delay_code",
      "domain_table_name": "jfb_delay_codes",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "work_type_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Which of the four work-type groups this code belongs to: Hydraulic Dredging, Hydraulic Capping, Mechanical Dredging, or Mechanical Capping.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_work_types"
          },
          "indexed": true,
          "label": "Work Type Id",
          "masking": {
            "masked": false
          },
          "name": "work_type_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "work_type_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "category",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Category within the work-type group, e.g. General, Mechanical, Movement, Survey/Sample, Booster/Land Plant, Barge/Material Transport, Misc, Operational Change, Project Specific.",
          "indexed": true,
          "label": "Category",
          "masking": {
            "masked": false
          },
          "name": "category",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "category",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "category_num",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "The category's block number in the numbering scheme (e.g. 1, 20, 30, 40, 50, 90). Null for Operational Change and Project Specific rows, which don't carry a category-level number.",
          "indexed": false,
          "label": "Category Num",
          "masking": {
            "masked": false
          },
          "name": "category_num",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "category_num",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "code",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The delay code's display name, e.g. \"ShutDown\" or \"Wash Pipeline\".",
          "indexed": true,
          "label": "Code",
          "masking": {
            "masked": false
          },
          "name": "code",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "code",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "code_num",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "The number the field app matches on. Globally unique across all four work-type groups -- never reused between groups.",
          "indexed": true,
          "label": "Code Num",
          "masking": {
            "masked": false
          },
          "name": "code_num",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "code_num",
          "triggers_version_change": true,
          "type": "integer",
          "unique": true
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Display order within the work-type group.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this code is currently part of the live company library. False retires a code without deleting its history.",
          "indexed": false,
          "label": "Active",
          "masking": {
            "masked": false
          },
          "name": "active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "notes",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Free-text annotation, e.g. flagging a proposed or adjusted code_num that needs PM confirmation.",
          "indexed": false,
          "label": "Notes",
          "masking": {
            "masked": false
          },
          "name": "notes",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "notes",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "slug": "jfb_delay_codes",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Delay Codes"
  },
  "jfb_dredge_cell_status": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_dredge_cell_statu",
      "domain_table_name": "jfb_dredge_cell_status",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Owning project.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "cell_label",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The named cell/area (unique per project in the source table).",
          "indexed": true,
          "label": "Cell Label",
          "masking": {
            "masked": false
          },
          "name": "cell_label",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "cell_label",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "completed_on",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "The date this cell was marked fully complete.",
          "indexed": false,
          "label": "Completed On",
          "masking": {
            "masked": false
          },
          "name": "completed_on",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "completed_on",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "generated_by_user_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Who marked it complete.",
          "indexed": false,
          "label": "Generated By (User Id)",
          "masking": {
            "masked": false
          },
          "name": "generated_by_user_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "generated_by_user_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        }
      ],
      "slug": "jfb_dredge_cell_status",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Dredge Cell Status"
  },
  "jfb_dredge_config": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_dredge_config",
      "domain_table_name": "jfb_dredge_config",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "One row per project. The project this dredge chart config belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "bg_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Isopach/background image shown under the chart.",
          "indexed": false,
          "label": "Background Image Path",
          "masking": {
            "masked": false
          },
          "name": "bg_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "bg_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "colorbar_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Legend/color-scale image overlaid on the chart.",
          "indexed": false,
          "label": "Colorbar Path",
          "masking": {
            "masked": false
          },
          "name": "colorbar_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "colorbar_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "georef",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "{wL, wR, wT, wB} real-world coordinates the background image is pinned to.",
          "indexed": false,
          "label": "Georeference",
          "masking": {
            "masked": false
          },
          "name": "georef",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "georef",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "default_area_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Identifies the default project area displayed on the dredge chart.",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_project_areas"
          },
          "indexed": false,
          "label": "Default Area",
          "masking": {
            "masked": false
          },
          "name": "default_area_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "default_area_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "default_material_note",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Supplies the default material-encountered description for new charts.",
          "indexed": false,
          "label": "Default Material Note",
          "masking": {
            "masked": false
          },
          "name": "default_material_note",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "default_material_note",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "chart_title_override",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Optional chart title used instead of the project name.",
          "indexed": false,
          "label": "Chart Title Override",
          "masking": {
            "masked": false
          },
          "name": "chart_title_override",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "chart_title_override",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "cells_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Path to the grid-cells definition file (Kalamazoo-style CSC projects).",
          "indexed": false,
          "label": "Cell Grid Path",
          "masking": {
            "masked": false
          },
          "name": "cells_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "cells_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "aerial_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Optional aerial photo, used as an alternate background layer.",
          "indexed": false,
          "label": "Aerial Image Path",
          "masking": {
            "masked": false
          },
          "name": "aerial_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "aerial_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "aerial_georef",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "{wL, wR, wT, wB} real-world coordinates the aerial photo is pinned to.",
          "indexed": false,
          "label": "Aerial Georeference",
          "masking": {
            "masked": false
          },
          "name": "aerial_georef",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "aerial_georef",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "crs_definition",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Stores the project coordinate system as WKID, EPSG, or WKT.",
          "indexed": false,
          "label": "CRS Definition",
          "masking": {
            "masked": false
          },
          "name": "crs_definition",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "crs_definition",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "aerial_tiles",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Array of {path, georef} for tiled aerial imagery.",
          "indexed": false,
          "label": "Aerial Tiles",
          "masking": {
            "masked": false
          },
          "name": "aerial_tiles",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "aerial_tiles",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "data_source",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Which upload format this project uses: 'hypack' (hydraulic) or 'earthworks' (mechanical). Defaults to 'hypack'.",
          "indexed": false,
          "label": "Data Source",
          "masking": {
            "masked": false
          },
          "name": "data_source",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "data_source",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "water_elev_ft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Stores the water elevation used to filter Earthworks observations.",
          "indexed": false,
          "label": "Water Elevation (ft)",
          "masking": {
            "masked": false
          },
          "name": "water_elev_ft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "water_elev_ft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "earthworks_design_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Stores the file path of the Earthworks design surface.",
          "indexed": false,
          "label": "Earthworks Design Surface Path",
          "masking": {
            "masked": false
          },
          "name": "earthworks_design_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "earthworks_design_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "require_stations",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this project requires station/chainage entry before generating the daily chart (river/channel-style projects). Defaults to false.",
          "indexed": false,
          "label": "Require Stations",
          "masking": {
            "masked": false
          },
          "name": "require_stations",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "require_stations",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "reference_lines_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Mile markers / stationing DXF -- open line segments and text labels drawn as a thin reference overlay (e.g. tenth-mile lines with river-mile numbers). Purely visual; not used in any calculation. Referenced in the web app's code but not present on the live dredge_config table there (schema drift) -- added here for forward parity.",
          "indexed": false,
          "label": "Mile Markers / Stationing DXF Path",
          "masking": {
            "masked": false
          },
          "name": "reference_lines_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "reference_lines_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "alignment_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Hard-structure alignment DXF (sheet-pile wall / bulkhead), for earthworks/mechanical projects -- coverage that stops just short of it gets carried to it, within the wall-snap distance. Same schema-drift note as reference_lines_path.",
          "indexed": false,
          "label": "Hard-Structure Alignment DXF Path",
          "masking": {
            "masked": false
          },
          "name": "alignment_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "alignment_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "boundary_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Attachment fileId of a DXF holding closed polylines that fence the REPORTABLE coverage area. When set, TODAY's coverage mask is clipped to inside these rings, so a stray track outside the channel is never reported as area -- the rule Fountain Lake's PE asked for on 2026-09-16 after blue-line coverage overshot the Bancroft B border. Prior coverage is deliberately NOT clipped: it is historical, and a boundary covering one work area would otherwise erase every earlier phase from the progress-to-date fill. NULL leaves the feature off and coverage unclipped, which is the behaviour every project has today. Parsed the same way as cells_path, but flat -- no cell numbering or per-cell breakdown.",
          "indexed": false,
          "label": "Coverage Boundary DXF Path",
          "masking": {
            "masked": false
          },
          "name": "boundary_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "boundary_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "reference_surface_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Latest QA pay survey (gridded 1x1 .xyz), used for hydraulic design-grade volume estimation. Same schema-drift note as reference_lines_path.",
          "indexed": false,
          "label": "Reference Survey Surface Path",
          "masking": {
            "masked": false
          },
          "name": "reference_surface_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "reference_surface_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "split_gap_ft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Gap (ft) between coverage footprints above which the daily offers to split the chart into zoomed per-area pages. Null = app default (400).",
          "indexed": false,
          "label": "Split Gap (ft)",
          "masking": {
            "masked": false
          },
          "name": "split_gap_ft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "split_gap_ft",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "isopach_tiles",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Array of {path, georef:{wL,wR,wT,wB}} for tiled isopach/difference imagery, when one image cannot cover the whole project.",
          "indexed": false,
          "label": "Isopach Tiles",
          "masking": {
            "masked": false
          },
          "name": "isopach_tiles",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "isopach_tiles",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "cells_reference_only",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "When true, the cells DXF is drawn as outlines + numbers only (a reference layer), with no coverage grid, clipping, or per-cell breakdown.",
          "indexed": false,
          "label": "Cells Reference Only",
          "masking": {
            "masked": false
          },
          "name": "cells_reference_only",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "cells_reference_only",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "bucket_width_ft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "PM-confirmed mechanical dredging bucket width (stamp diameter), used by the machine-track engine.",
          "indexed": false,
          "label": "Bucket Width (ft)",
          "masking": {
            "masked": false
          },
          "name": "bucket_width_ft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "bucket_width_ft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "track_bed_tolerance_ft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "How close the machine-track teeth must be to the local bed to count as an active digging point.",
          "indexed": false,
          "label": "Track Bed Tolerance (ft)",
          "masking": {
            "masked": false
          },
          "name": "track_bed_tolerance_ft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "track_bed_tolerance_ft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "alignment_snap_ft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Max gap (ft) the hard-structure alignment snap will close -- only gaps this narrow, and only where the bucket already worked.",
          "indexed": false,
          "label": "Alignment Snap (ft)",
          "masking": {
            "masked": false
          },
          "name": "alignment_snap_ft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "alignment_snap_ft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "volume_mode",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "How the daily CY is measured. Null = off (no volume). 'surface_diff' = prior-vs-today surface drop (mechanical). 'design_grade' = remaining prism above design_elev_ft over first-touch coverage (hypack).",
          "indexed": false,
          "label": "Volume Mode",
          "masking": {
            "masked": false
          },
          "name": "volume_mode",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "volume_mode",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "design_elev_ft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Design grade elevation in project datum ft, used by design_grade volume mode.",
          "indexed": false,
          "label": "Design Grade Elevation (ft)",
          "masking": {
            "masked": false
          },
          "name": "design_elev_ft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "design_elev_ft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "reference_surface_date",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "Date of the QA pay survey stored in reference_surface_path, shown to the PE so a stale reference is visible.",
          "indexed": false,
          "label": "Reference Surface Date",
          "masking": {
            "masked": false
          },
          "name": "reference_surface_date",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "reference_surface_date",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "reference_cell_ft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Cell size (ft) the reference survey was downsampled to. Null = app default (2 ft).",
          "indexed": false,
          "label": "Reference Cell Size (ft)",
          "masking": {
            "masked": false
          },
          "name": "reference_cell_ft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "reference_cell_ft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "volume_recovery_factor",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Factor applied to gross calculated/measured volume to get the reportable volume (the bucket/cut always exceeds what reaches the barge).",
          "indexed": false,
          "label": "Volume Recovery Factor",
          "masking": {
            "masked": false
          },
          "name": "volume_recovery_factor",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "volume_recovery_factor",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "bg_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Original filename of the uploaded isopach/background image, as picked by the user (the bg_path field stores the crd_files_b file id, not a human-readable name).",
          "indexed": false,
          "label": "Background Image Original Filename",
          "masking": {
            "masked": false
          },
          "name": "bg_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "bg_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "bg_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Physical storage path/key of the uploaded isopach/background image file, as returned by the file-storage backend.",
          "indexed": false,
          "label": "Background Image Storage Path",
          "masking": {
            "masked": false
          },
          "name": "bg_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "bg_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "colorbar_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Original filename of the uploaded colorbar/legend image, as picked by the user (the colorbar_path field stores the crd_files_b file id, not a human-readable name).",
          "indexed": false,
          "label": "Colorbar Original Filename",
          "masking": {
            "masked": false
          },
          "name": "colorbar_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "colorbar_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "colorbar_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Physical storage path/key of the uploaded colorbar/legend image file, as returned by the file-storage backend.",
          "indexed": false,
          "label": "Colorbar Storage Path",
          "masking": {
            "masked": false
          },
          "name": "colorbar_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "colorbar_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "cells_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Original filename of the uploaded cell-grid definition DXF, as picked by the user (the cells_path field stores the crd_files_b file id, not a human-readable name).",
          "indexed": false,
          "label": "Cell Grid Original Filename",
          "masking": {
            "masked": false
          },
          "name": "cells_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "cells_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "cells_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Physical storage path/key of the uploaded cell-grid definition DXF file, as returned by the file-storage backend.",
          "indexed": false,
          "label": "Cell Grid Storage Path",
          "masking": {
            "masked": false
          },
          "name": "cells_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "cells_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "aerial_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Original filename of the uploaded aerial base-layer image, as picked by the user (the aerial_path field stores the crd_files_b file id, not a human-readable name).",
          "indexed": false,
          "label": "Aerial Image Original Filename",
          "masking": {
            "masked": false
          },
          "name": "aerial_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "aerial_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "aerial_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Physical storage path/key of the uploaded aerial base-layer image file, as returned by the file-storage backend.",
          "indexed": false,
          "label": "Aerial Image Storage Path",
          "masking": {
            "masked": false
          },
          "name": "aerial_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "aerial_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "earthworks_design_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Original filename of the uploaded Earthworks design-grade surface CSV, as picked by the user (the earthworks_design_path field stores the crd_files_b file id, not a human-readable name).",
          "indexed": false,
          "label": "Earthworks Design Surface Original Filename",
          "masking": {
            "masked": false
          },
          "name": "earthworks_design_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "earthworks_design_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "earthworks_design_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Physical storage path/key of the uploaded Earthworks design-grade surface CSV file, as returned by the file-storage backend.",
          "indexed": false,
          "label": "Earthworks Design Surface Storage Path",
          "masking": {
            "masked": false
          },
          "name": "earthworks_design_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "earthworks_design_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "reference_lines_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Original filename of the uploaded mile-marker/stationing DXF, as picked by the user (the reference_lines_path field stores the crd_files_b file id, not a human-readable name).",
          "indexed": false,
          "label": "Mile Markers / Stationing Original Filename",
          "masking": {
            "masked": false
          },
          "name": "reference_lines_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "reference_lines_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "reference_lines_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Physical storage path/key of the uploaded mile-marker/stationing DXF file, as returned by the file-storage backend.",
          "indexed": false,
          "label": "Mile Markers / Stationing Storage Path",
          "masking": {
            "masked": false
          },
          "name": "reference_lines_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "reference_lines_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "alignment_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Original filename of the uploaded hard-structure alignment DXF, as picked by the user (the alignment_path field stores the crd_files_b file id, not a human-readable name).",
          "indexed": false,
          "label": "Hard-Structure Alignment Original Filename",
          "masking": {
            "masked": false
          },
          "name": "alignment_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "alignment_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "alignment_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Physical storage path/key of the uploaded hard-structure alignment DXF file, as returned by the file-storage backend.",
          "indexed": false,
          "label": "Hard-Structure Alignment Storage Path",
          "masking": {
            "masked": false
          },
          "name": "alignment_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "alignment_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "boundary_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Filename the PM picked for the coverage-boundary DXF. The upload endpoint suffixes a random id for uniqueness, so this keeps the name they recognize.",
          "indexed": false,
          "label": "Coverage Boundary Original Filename",
          "masking": {
            "masked": false
          },
          "name": "boundary_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "boundary_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "boundary_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Server-assigned storage path for the coverage-boundary DXF, read back after upload. Metadata only -- the file is always fetched by the id in boundary_path.",
          "indexed": false,
          "label": "Coverage Boundary Storage Path",
          "masking": {
            "masked": false
          },
          "name": "boundary_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "boundary_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "reference_surface_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Original filename of the uploaded QA pay survey .xyz file, as picked by the user (the reference_surface_path field stores the crd_files_b file id, not a human-readable name).",
          "indexed": false,
          "label": "Reference Survey Surface Original Filename",
          "masking": {
            "masked": false
          },
          "name": "reference_surface_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "reference_surface_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "reference_surface_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Physical storage path/key of the uploaded QA pay survey .xyz file file, as returned by the file-storage backend.",
          "indexed": false,
          "label": "Reference Survey Surface Storage Path",
          "masking": {
            "masked": false
          },
          "name": "reference_surface_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "reference_surface_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "slug": "jfb_dredge_config",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Dredge Config"
  },
  "jfb_dredge_equipment_config": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_dredge_equipment_config",
      "domain_table_name": "jfb_dredge_equipment_config",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "equipment_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "One row per piece of equipment. The dredge/excavator this shape belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_equipments"
          },
          "indexed": true,
          "label": "Equipment Id",
          "masking": {
            "masked": false
          },
          "name": "equipment_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "equipment_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Owning project. Denormalized so all equipment configs for a project load in one query.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "shape_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The equipment's CAD outline (DXF) drawn on the chart to show its position.",
          "indexed": false,
          "label": "Shape Path",
          "masking": {
            "masked": false
          },
          "name": "shape_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "shape_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "shape_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Original filename of the uploaded dredge-shape DXF, as picked by the user (shape_path stores the Pivotly file id, and the upload endpoint suffixes a random id for uniqueness, so this keeps the name the PM recognizes).",
          "indexed": false,
          "label": "Shape Original Filename",
          "masking": {
            "masked": false
          },
          "name": "shape_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "shape_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "shape_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Server-assigned storage path of the uploaded dredge-shape DXF, read back after upload. Metadata only -- the file is always fetched by the id in shape_path.",
          "indexed": false,
          "label": "Shape Storage Path",
          "masking": {
            "masked": false
          },
          "name": "shape_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "shape_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "label",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Display label for this equipment's shape on the chart -- overrides the equipment's own name when set.",
          "indexed": false,
          "label": "Chart Label",
          "masking": {
            "masked": false
          },
          "name": "label",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "label",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "slug": "jfb_dredge_equipment_config",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Dredge Equipment Config"
  },
  "jfb_dredge_progress": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_dredge_progres",
      "domain_table_name": "jfb_dredge_progress",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Owning project.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "report_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The day's report this progress row belongs to. Unique together with equipment_id.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_reports"
          },
          "indexed": true,
          "label": "Report Id",
          "masking": {
            "masked": false
          },
          "name": "report_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "report_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "equipment_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Which piece of equipment this row is for.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_equipments"
          },
          "indexed": true,
          "label": "Equipment Id",
          "masking": {
            "masked": false
          },
          "name": "equipment_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "equipment_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "chart_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The rendered/saved chart image for this day.",
          "indexed": false,
          "label": "Chart Path",
          "masking": {
            "masked": false
          },
          "name": "chart_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "chart_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "surface_export_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "This day's full-surface Earthworks export (gzipped CSV), banked so the next full-surface upload for this equipment can diff against it for cross-day CY. Null on day-scoped exports and on days nothing was saved.",
          "indexed": false,
          "label": "Surface Export Path",
          "masking": {
            "masked": false
          },
          "name": "surface_export_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "surface_export_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "coverage_rings",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Net-new (first-pass) coverage area for the day.",
          "indexed": false,
          "label": "Coverage Rings",
          "masking": {
            "masked": false
          },
          "name": "coverage_rings",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "coverage_rings",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "footprint_rings",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Full raw digging footprint for the day (falls back to coverage_rings for older rows).",
          "indexed": false,
          "label": "Footprint Rings",
          "masking": {
            "masked": false
          },
          "name": "footprint_rings",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "footprint_rings",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "today_sqft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Square footage covered today.",
          "indexed": false,
          "label": "Today Sq Ft",
          "masking": {
            "masked": false
          },
          "name": "today_sqft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "today_sqft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "cumulative_sqft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Running total square footage covered to date.",
          "indexed": false,
          "label": "Cumulative Sq Ft",
          "masking": {
            "masked": false
          },
          "name": "cumulative_sqft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "cumulative_sqft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "dredge_pose",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Last known cutter/stern position, carried forward to the next day's chart.",
          "indexed": false,
          "label": "Dredge Pose",
          "masking": {
            "masked": false
          },
          "name": "dredge_pose",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "dredge_pose",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "placement_override",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Manual correction to the dredge's cutter/stern placement.",
          "indexed": false,
          "label": "Placement Override",
          "masking": {
            "masked": false
          },
          "name": "placement_override",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "placement_override",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "second_pass_flags",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Rings flagged as rework (a second pass over already-covered ground).",
          "indexed": false,
          "label": "Second Pass Flags",
          "masking": {
            "masked": false
          },
          "name": "second_pass_flags",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "second_pass_flags",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "advance_ft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Distance advanced today, for station/chainage-style projects.",
          "indexed": false,
          "label": "Advance Ft",
          "masking": {
            "masked": false
          },
          "name": "advance_ft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "advance_ft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "advance_lines",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Geometry behind the advance-distance calculation.",
          "indexed": false,
          "label": "Advance Lines",
          "masking": {
            "masked": false
          },
          "name": "advance_lines",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "advance_lines",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "progress_rings",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Present for schema parity with the source table; confirmed unused/legacy there -- no current code reads or writes it.",
          "indexed": false,
          "label": "Progress Rings",
          "masking": {
            "masked": false
          },
          "name": "progress_rings",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "progress_rings",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "cell_breakdown",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Per-grid-cell coverage/area breakdown.",
          "indexed": false,
          "label": "Cell Breakdown",
          "masking": {
            "masked": false
          },
          "name": "cell_breakdown",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "cell_breakdown",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "material_text",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The PE's typed 'material encountered' note for the day.",
          "indexed": false,
          "label": "Material Text",
          "masking": {
            "masked": false
          },
          "name": "material_text",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "material_text",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "generated_by_user_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The Pivotly IAM user id who saved this row.",
          "indexed": false,
          "label": "Generated By (User Id)",
          "masking": {
            "masked": false
          },
          "name": "generated_by_user_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "generated_by_user_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "chart_paths",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Array of zoomed split-view chart PNG paths, for days where a large dredge move splits the chart into per-area pages. Confirmed used by jfb-fieldops-daily's saveDredgeProgress().",
          "indexed": false,
          "label": "Chart Paths (Zoomed Views)",
          "masking": {
            "masked": false
          },
          "name": "chart_paths",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "chart_paths",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "gross_cy",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Estimated volume (CY) removed today, before the recovery factor is applied.",
          "indexed": false,
          "label": "Gross CY",
          "masking": {
            "masked": false
          },
          "name": "gross_cy",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "gross_cy",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "adjusted_cy",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Estimated volume (CY) removed today, after the recovery factor is applied. This is the reported number.",
          "indexed": false,
          "label": "Adjusted CY",
          "masking": {
            "masked": false
          },
          "name": "adjusted_cy",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "adjusted_cy",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "source_batch_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The day's survey source files for this dredge, stored as a single compressed zip attachment on this row -- the operator picks a folder of RAW files (or, on earthworks projects, the Tracking .dxf and/or surface .csv) and the whole set is archived verbatim. One archive per report date per equipment, and the geometry in coverage_rings was computed from exactly these files, so the two can always be checked against each other. Null only on rows saved before source retention existed. Note that on earthworks full-surface days the picked .csv is also held separately in surface_export_path, re-encoded for cross-day diffing; this field keeps the original upload instead.",
          "indexed": false,
          "label": "Source Batch Path",
          "masking": {
            "masked": false
          },
          "name": "source_batch_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "source_batch_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "source_batch_info",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Manifest of the archive in source_batch_path: checksum, file_count, file_names, total_bytes, compressed_bytes, source_date (the date parsed out of the batch's own RAW log filename, which can disagree with report_date and is warned about at upload), uploaded_at and uploaded_by. checksum is a content fingerprint over the sorted name:size manifest, not a cryptographic hash -- its only job is to recognise a re-pick of the same folder so an unchanged batch is never re-uploaded.",
          "indexed": false,
          "label": "Source Batch Info",
          "masking": {
            "masked": false
          },
          "name": "source_batch_info",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "source_batch_info",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "source_batch_history",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Append-only record of superseded source batches, one entry per replacement: file_id of the archive that was replaced, its checksum and file_count, replaced_at, replaced_by, and the reason the user typed. The superseded file itself is soft-deleted rather than purged, so an entry here is enough to recover a batch replaced in error. Null until a batch is replaced for the first time.",
          "indexed": false,
          "label": "Source Batch History",
          "masking": {
            "masked": false
          },
          "name": "source_batch_history",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "source_batch_history",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "baseline_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Pivotly file id of the as-built border DXF imported as this row's prior coverage baseline, from Project Settings > Dredge Chart > Prior coverage baseline. The DXF is parsed into coverage_rings / footprint_rings at import time; the file is kept so the imported geometry can always be traced back to what the team supplied. Null on every normal daily row.",
          "indexed": false,
          "label": "Prior Baseline DXF Path",
          "masking": {
            "masked": false
          },
          "name": "baseline_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "baseline_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "baseline_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Filename the PM picked for the prior-baseline DXF. The upload endpoint suffixes a random id for uniqueness, so this keeps the name they recognize.",
          "indexed": false,
          "label": "Prior Baseline Original Filename",
          "masking": {
            "masked": false
          },
          "name": "baseline_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "baseline_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "baseline_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Server-assigned storage path of the prior-baseline DXF, read back after upload. Metadata only -- the file is always fetched by the id in baseline_path.",
          "indexed": false,
          "label": "Prior Baseline Storage Path",
          "masking": {
            "masked": false
          },
          "name": "baseline_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "baseline_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "slug": "jfb_dredge_progress",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Dredge Progress"
  },
  "jfb_equipments": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "enabled": true,
        "max_record_versions": 25,
        "retention_days": 0
      },
      "contact": {
        "owner": null,
        "steward": null,
        "support": null
      },
      "default_conflict_resolution": {
        "code": "lww"
      },
      "domain_name_singular": "Equipment",
      "domain_table_name": "jfb_equipments",
      "schema": [
        {
          "column_name": "name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Name",
          "masking": {
            "masked": false
          },
          "name": "name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": false,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "work_type",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Pins this unit's discipline independent of the project's own work_type. NULL (the default, and every pre-existing row) means inherit jfb_projects.work_type. Set only on projects that run two disciplines on different machines at once (matches the non-native app's project_equipment.work_type, added for Torch Lake 152601: a mechanical dredge and a mechanical placement excavator on the same project at the same time). One of 'Hydraulic Dredging', 'Mechanical Dredging', 'Hydraulic Capping', 'Mechanical Capping' when set -- not enforced by a domain-level constraint here, matching this app's convention of validating in application code rather than a DB CHECK.",
          "indexed": false,
          "label": "Work Type",
          "masking": {
            "masked": false
          },
          "name": "work_type",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "work_type",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "work_type_from",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "First report date work_type applies from. NULL (the default) means the pin applies to every date. Set only when ONE machine changes discipline mid-job (matches the non-native app's project_equipment.work_type_from), so earlier dailies for that equipment still render under its prior discipline. Meaningless without work_type also set.",
          "indexed": false,
          "label": "Work Type From",
          "masking": {
            "masked": false
          },
          "name": "work_type_from",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "work_type_from",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "is_active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Retires a unit from the operator app's equipment picker without deleting it, so its historical daily activities still resolve. Matches the non-native app's project_equipment.active, which this domain had no equivalent for -- a demobilised dredge stayed selectable forever. NULL (the default, and every pre-existing row) is treated as active, so nothing disappears on migration.",
          "indexed": false,
          "label": "Is Active",
          "masking": {
            "masked": false
          },
          "name": "is_active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "is_active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Display order of this unit within its project: equipment buttons in the report editor, production sheets in the daily PDF, and the admin Equipment list, ascending. NULL sorts last. Matches the non-native app's project_equipment.sort_order.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "mobilized_on",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "First report date this unit appears on (inclusive). Reports dated before it leave the unit out of the report editor and the daily PDF. NULL means no start bound. Matches the non-native app's project_equipment.mobilized_on (equipmentOnReport in src/lib/projectPhase.ts).",
          "indexed": false,
          "label": "Mobilized On",
          "masking": {
            "masked": false
          },
          "name": "mobilized_on",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "mobilized_on",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "demobilized_on",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "Last report date this unit appears on (inclusive). Reports dated after it leave the unit out of the report editor and the daily PDF, so a demobilized dredge stops printing empty production sheets without being deactivated. NULL means no end bound. Matches the non-native app's project_equipment.demobilized_on.",
          "indexed": false,
          "label": "Demobilized On",
          "masking": {
            "masked": false
          },
          "name": "demobilized_on",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "demobilized_on",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        }
      ],
      "track_versions": true,
      "xref_enabled": false
    },
    "name": "JFB Equipments"
  },
  "jfb_hydraulic_flow_stats": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_hydraulic_flow_stat",
      "domain_table_name": "jfb_hydraulic_flow_stats",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this flow-stat reading belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "equipment_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The equipment this flow reading was taken for.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_equipments"
          },
          "indexed": true,
          "label": "Equipment Id",
          "masking": {
            "masked": false
          },
          "name": "equipment_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "equipment_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "log_date",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "timestamp with time zone",
          "description": "The day this flow-stat reading applies to.",
          "indexed": true,
          "label": "Log Date",
          "masking": {
            "masked": false
          },
          "name": "log_date",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "log_date",
          "triggers_version_change": true,
          "type": "timestamp with time zone",
          "unique": false
        },
        {
          "column_name": "pipe_dia_inches",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Pipe inside diameter, in inches.",
          "indexed": false,
          "label": "Pipe Dia Inches",
          "masking": {
            "masked": false
          },
          "name": "pipe_dia_inches",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "pipe_dia_inches",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "avg_line_velocity",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Average line velocity, in feet per second. Interchangeable with avg_flow_rate via pipe_dia_inches -- the PE enters whichever one they measured and the other derives at entry time.",
          "indexed": false,
          "label": "Avg Line Velocity",
          "masking": {
            "masked": false
          },
          "name": "avg_line_velocity",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "avg_line_velocity",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "avg_flow_rate",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Average flow rate, in GPM. Interchangeable with avg_line_velocity via pipe_dia_inches -- the PE enters whichever one they measured and the other derives at entry time.",
          "indexed": false,
          "label": "Avg Flow Rate",
          "masking": {
            "masked": false
          },
          "name": "avg_flow_rate",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "avg_flow_rate",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "daily_total_gal",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Total gallons pumped through this equipment's line on this day, directly entered by the PE (matches the reference app's report_flow_stats.daily_total_gal -- NOT derived from avg_flow_rate, since that's an instantaneous reading with no reliable operating-duration source to multiply by). Summed across all of this equipment's rows through the report date to get Project Total; Previous Total is Project Total minus this day's value.",
          "indexed": false,
          "label": "Daily Total Flow",
          "masking": {
            "masked": false
          },
          "name": "daily_total_gal",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "daily_total_gal",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        }
      ],
      "slug": "jfb_hydraulic_flow_stats",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Hydraulic Flow Stats"
  },
  "jfb_hydraulic_pipe_configurations": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_hydraulic_pipe_configuration",
      "domain_table_name": "jfb_hydraulic_pipe_configurations",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this pipe segment belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "log_date",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "timestamp with time zone",
          "description": "The day this pipe segment configuration applies to.",
          "indexed": true,
          "label": "Log Date",
          "masking": {
            "masked": false
          },
          "name": "log_date",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "log_date",
          "triggers_version_change": true,
          "type": "timestamp with time zone",
          "unique": false
        },
        {
          "column_name": "segment_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Label for this pipe segment, e.g. \"Dredge -> Booster 1\".",
          "indexed": false,
          "label": "Segment Name",
          "masking": {
            "masked": false
          },
          "name": "segment_name",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "segment_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "length_ft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Length of this segment, in feet.",
          "indexed": false,
          "label": "Length Ft",
          "masking": {
            "masked": false
          },
          "name": "length_ft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "length_ft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        }
      ],
      "slug": "jfb_hydraulic_pipe_configurations",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Hydraulic Pipe Configurations"
  },
  "jfb_layer_types": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_layer_type",
      "domain_table_name": "jfb_layer_types",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The layer-type category label, e.g. \"Armor\", \"Cap\", \"Cover\", \"Backfill\". Globally unique -- shared across every project, not project-scoped.",
          "indexed": true,
          "label": "Name",
          "masking": {
            "masked": false
          },
          "name": "name",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "name",
          "triggers_version_change": true,
          "type": "text",
          "unique": true
        },
        {
          "column_name": "description",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Optional longer explanation of what this layer type means.",
          "indexed": false,
          "label": "Description",
          "masking": {
            "masked": false
          },
          "name": "description",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "description",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Display order in the Layer Type dropdown.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this layer type is currently offered in the dropdown. False retires it without deleting history.",
          "indexed": false,
          "label": "Active",
          "masking": {
            "masked": false
          },
          "name": "active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        }
      ],
      "slug": "jfb_layer_types",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Layer Types"
  },
  "jfb_material_types": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_material_type",
      "domain_table_name": "jfb_material_types",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The material-type category label, e.g. \"Sand\", \"Gravel\", \"Rock\", \"Amended\", \"Dredge Slurry\". Globally unique -- shared across every project, not project-scoped.",
          "indexed": true,
          "label": "Name",
          "masking": {
            "masked": false
          },
          "name": "name",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "name",
          "triggers_version_change": true,
          "type": "text",
          "unique": true
        },
        {
          "column_name": "description",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Optional longer explanation of what this material type means.",
          "indexed": false,
          "label": "Description",
          "masking": {
            "masked": false
          },
          "name": "description",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "description",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Display order in the Material Type dropdown.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this material type is currently offered in the dropdown. False retires it without deleting history.",
          "indexed": false,
          "label": "Active",
          "masking": {
            "masked": false
          },
          "name": "active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        }
      ],
      "slug": "jfb_material_types",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Material Types"
  },
  "jfb_metric_defaults": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_metric_default",
      "domain_table_name": "jfb_metric_defaults",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "metric_key",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Stable machine identifier copied onto a project's jfb_metrics row when a default is applied, e.g. 'total_cy', 'hours_op'. Matches the old app's DEFAULT_METRICS metric_key values (src/types/db.ts). Not the same field as jfb_metric_sources.value -- this identifies the metric row itself, not which computation source it uses.",
          "indexed": true,
          "label": "Metric Key",
          "masking": {
            "masked": false
          },
          "name": "metric_key",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "metric_key",
          "triggers_version_change": true,
          "type": "text",
          "unique": true
        },
        {
          "column_name": "label",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Default display label, e.g. \"Total Volume Removed\".",
          "indexed": false,
          "label": "Label",
          "masking": {
            "masked": false
          },
          "name": "label",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "label",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "source",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Which jfb_metric_sources.value this default uses, copied onto the project's jfb_metrics row when applied. No picklist binding -- pkl-jfb-metric-source is disabled (GET /picklists/:slug/values doesn't resolve domain_query sources yet; MetricsTab.jsx reads jfb_metric_sources directly instead, see METRICS_MIGRATION_PLAN.md).",
          "indexed": false,
          "label": "Source",
          "masking": {
            "masked": false
          },
          "name": "source",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "source",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "unit",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Default unit, e.g. 'CY', 'hrs', '%'.",
          "indexed": false,
          "label": "Unit",
          "masking": {
            "masked": false
          },
          "name": "unit",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "unit",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Display order when this default set is applied to a project's Metrics tab.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        }
      ],
      "slug": "jfb_metric_defaults",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Metric Defaults"
  },
  "jfb_metric_sources": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_metric_source",
      "domain_table_name": "jfb_metric_sources",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "value",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Stored verbatim on jfb_metrics.source when this option is picked. For auto sources this is the data view slug itself (e.g. 'dvw-jfb-metric-cy-v2'), so app code can dispatch straight to usdf.<value> with no separate mapping table. The sentinel row for manual entry uses the literal value 'manual'.",
          "indexed": true,
          "label": "Value",
          "masking": {
            "masked": false
          },
          "name": "value",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "value",
          "triggers_version_change": true,
          "type": "text",
          "unique": true
        },
        {
          "column_name": "label",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Dropdown display text, e.g. \"Auto \u00b7 CY from production stats\".",
          "indexed": false,
          "label": "Label",
          "masking": {
            "masked": false
          },
          "name": "label",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "label",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "unit",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "This source's canonical unit (CY, SF, hrs, %). Null for the manual sentinel. Lets app code auto-populate a metric row's unit from its chosen source instead of the PE typing it -- see METRICS_MIGRATION_PLAN.md \u00a74 open question 2.",
          "indexed": false,
          "label": "Unit",
          "masking": {
            "masked": false
          },
          "name": "unit",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "unit",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Display order in the source dropdown.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "result_column",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "For a data-view-backed source, the column name that data view's function returns (e.g. 'total_volume' for dvw-jfb-metric-cy-v2). Lets app code read the right field off the data view's response without a hardcoded slug-to-column map. Null for the manual sentinel and any source with no data view yet.",
          "indexed": false,
          "label": "Result Column",
          "masking": {
            "masked": false
          },
          "name": "result_column",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "result_column",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this source is currently selectable. False retires a source (e.g. its data view was unpublished) without deleting history on jfb_metrics rows that already reference it. pkl-jfb-metric-source filters on this being true.",
          "indexed": false,
          "label": "Active",
          "masking": {
            "masked": false
          },
          "name": "active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "description",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Optional note surfaced in the dropdown, e.g. a \"pending DB\" caveat for a source with no real data yet.",
          "indexed": false,
          "label": "Description",
          "masking": {
            "masked": false
          },
          "name": "description",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "description",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "slug": "jfb_metric_sources",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Metric Sources"
  },
  "jfb_metrics": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_metric",
      "domain_table_name": "jfb_metrics",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this cover-page metric belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "metric_key",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Stable machine identifier for this metric row within its project (e.g. 'total_cy', 'hours_op'). Matches the old app's metric_key values. Copied from jfb_metric_defaults.metric_key when a default is applied, or typed/slugified from the label for a project-specific metric. Not unique across the whole domain (only within one project) since every project can have its own 'total_cy' row.",
          "indexed": true,
          "label": "Metric Key",
          "masking": {
            "masked": false
          },
          "name": "metric_key",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "metric_key",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "label",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Display label on the Metrics tab, e.g. \"Total Volume Removed\".",
          "indexed": false,
          "label": "Label",
          "masking": {
            "masked": false
          },
          "name": "label",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "label",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "source",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Which jfb_metric_sources.value this row uses -- 'manual' for a PE-typed value, or a data-view slug (e.g. 'dvw-jfb-metric-cy-v2') for a live-computed one. No picklist binding -- pkl-jfb-metric-source is disabled (GET /picklists/:slug/values doesn't resolve domain_query sources yet; MetricsTab.jsx reads jfb_metric_sources directly instead, see METRICS_MIGRATION_PLAN.md).",
          "indexed": false,
          "label": "Source",
          "masking": {
            "masked": false
          },
          "name": "source",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "source",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "equipment_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Optional per-metric equipment scope for an Auto source (matches the old app's text-based equipment_filter, now a real FK). Null means the metric sums every equipment unit on the project.",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_equipments"
          },
          "indexed": false,
          "label": "Equipment Id",
          "masking": {
            "masked": false
          },
          "name": "equipment_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "equipment_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "unit",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Display unit (CY, SF, hrs, %). Auto-populated from jfb_metric_sources.unit when source is chosen; editable for a manual metric with no source-driven default.",
          "indexed": false,
          "label": "Unit",
          "masking": {
            "masked": false
          },
          "name": "unit",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "unit",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "rollup_type",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "How this metric's Week and Project Total roll up, from pkl-jfb-metric-rollup: 'sum' (running total -- volumes, areas, hours) or 'avg' (average of the days that carry a NON-ZERO reading -- turbidity NTU, flow rate). Blank means 'sum', so every existing metric keeps its behavior. Zeros are skipped under 'avg' because a day with no measurement must not pull the average down (Fountain Lake return-water flow read 0.78 instead of ~25 when phantom zero days were counted). Day is always that report's own value.",
          "indexed": false,
          "label": "Rollup Type",
          "masking": {
            "masked": false
          },
          "name": "rollup_type",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "rollup_type",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Display order on the Metrics tab.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this metric row is currently shown on the Metrics tab. False hides it without deleting any historical report_metric_value rows tied to it.",
          "indexed": false,
          "label": "Active",
          "masking": {
            "masked": false
          },
          "name": "active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        }
      ],
      "slug": "jfb_metrics",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Metrics"
  },
  "jfb_narrative_section_defaults": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_narrative_section_default",
      "domain_table_name": "jfb_narrative_section_defaults",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "label",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Display name for this default narrative section, e.g. \"Dredging Operations\".",
          "indexed": false,
          "label": "Label",
          "masking": {
            "masked": false
          },
          "name": "label",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "label",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Display order when seeding a project's narrative sections from this template.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "is_active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this template entry is currently offered by \"Seed from defaults\". False retires it without deleting history.",
          "indexed": false,
          "label": "Is Active",
          "masking": {
            "masked": false
          },
          "name": "is_active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "is_active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        }
      ],
      "slug": "jfb_narrative_section_defaults",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Narrative Section Defaults"
  },
  "jfb_operators": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "enabled": true,
        "max_record_versions": 25,
        "retention_days": 0
      },
      "contact": {
        "owner": null,
        "steward": null,
        "support": null
      },
      "default_conflict_resolution": {
        "code": "lww"
      },
      "domain_name_singular": "Operator",
      "domain_table_name": "jfb_operators",
      "schema": [
        {
          "column_name": "email",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Email",
          "masking": {
            "masked": false
          },
          "name": "email",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "email",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Name",
          "masking": {
            "masked": false
          },
          "name": "name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "favourite_activity_ids",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Favourite Activity Ids",
          "masking": {
            "masked": false
          },
          "name": "favourite_activity_ids",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "favourite_activity_ids",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "track_versions": true,
      "xref_enabled": false
    },
    "name": "JFB Operators"
  },
  "jfb_placement_config": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_placement_config",
      "domain_table_name": "jfb_placement_config",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "One row per project. The project this placement (capping) chart config belongs to; its presence is what shows the Placement Progress tab.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "label",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Work-area name printed on the chart's Area line (e.g. \"Area A - New Breakwater\").",
          "indexed": false,
          "label": "Work Area Label",
          "masking": {
            "masked": false
          },
          "name": "label",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "label",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "grid_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Attachment fileId of the bucket-grid lattice JSON: rotationDeg + originU/originV + cellFt + the sparse list of [col,row] cells that exist, plus an optional boundary polyline and optional clipped-edge partials. Every cell polygon and every bucket index derives from it, so without it the tab cannot account coverage.",
          "indexed": false,
          "label": "Bucket Grid Path",
          "masking": {
            "masked": false
          },
          "name": "grid_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "grid_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "grid_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Filename the PM picked for the bucket-grid lattice JSON. The upload endpoint suffixes a random id for uniqueness, so this keeps the name they recognize.",
          "indexed": false,
          "label": "Grid Original Name",
          "masking": {
            "masked": false
          },
          "name": "grid_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "grid_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "grid_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Server-assigned storage path for the bucket-grid lattice JSON, read back after upload. Metadata only -- the file is always fetched by the id in grid_path.",
          "indexed": false,
          "label": "Grid Storage Path",
          "masking": {
            "masked": false
          },
          "name": "grid_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "grid_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "aerial_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Attachment fileId of the aerial image drawn behind the grid. Optional -- without it the chart renders on a flat map colour.",
          "indexed": false,
          "label": "Aerial Path",
          "masking": {
            "masked": false
          },
          "name": "aerial_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "aerial_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "aerial_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Filename the PM picked for the aerial image. The upload endpoint suffixes a random id for uniqueness, so this keeps the name they recognize.",
          "indexed": false,
          "label": "Aerial Original Name",
          "masking": {
            "masked": false
          },
          "name": "aerial_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "aerial_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "aerial_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Server-assigned storage path for the aerial image, read back after upload. Metadata only -- the file is always fetched by the id in aerial_path.",
          "indexed": false,
          "label": "Aerial Storage Path",
          "masking": {
            "masked": false
          },
          "name": "aerial_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "aerial_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "aerial_georef",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "World bounds of aerial_path as {wL,wR,wT,wB} in the project CRS -- the same shape jfb_dredge_config.aerial_georef uses. Also frames the chart view when set, so the imagery fills the map panel exactly.",
          "indexed": false,
          "label": "Aerial Georeference",
          "masking": {
            "masked": false
          },
          "name": "aerial_georef",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "aerial_georef",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "reference_lines_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Attachment fileId of the PM's alignment/stationing overlay -- open line work plus text labels, drawn thin over the map. A DXF is read directly; a pre-extracted JSON of {segments, labels} may also carry an `emphasis` array for structures such as a sheet pile wall, which draw heavier and in a warm red. Optional; purely visual.",
          "indexed": false,
          "label": "Reference Lines Path",
          "masking": {
            "masked": false
          },
          "name": "reference_lines_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "reference_lines_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "reference_lines_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Filename the PM picked for the alignment overlay. The upload endpoint suffixes a random id for uniqueness, so this keeps the name they recognize.",
          "indexed": false,
          "label": "Reference Lines Original Name",
          "masking": {
            "masked": false
          },
          "name": "reference_lines_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "reference_lines_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "reference_lines_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Server-assigned storage path for the alignment overlay DXF, read back after upload. Metadata only -- the file is always fetched by the id in reference_lines_path.",
          "indexed": false,
          "label": "Reference Lines Storage Path",
          "masking": {
            "masked": false
          },
          "name": "reference_lines_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "reference_lines_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "design_extents_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Attachment fileId of the design-region outline (JSON rings). Drawn as a pale filled region under the coverage so the day's work reads against what the design calls for. Optional.",
          "indexed": false,
          "label": "Design Extents Path",
          "masking": {
            "masked": false
          },
          "name": "design_extents_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "design_extents_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "design_extents_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Filename the PM picked for the design-extents file. The upload endpoint suffixes a random id for uniqueness, so this keeps the name they recognize.",
          "indexed": false,
          "label": "Design Extents Original Name",
          "masking": {
            "masked": false
          },
          "name": "design_extents_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "design_extents_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "design_extents_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Backing storage path for the design-extents file, mirroring the other asset triples.",
          "indexed": false,
          "label": "Design Extents Storage Path",
          "masking": {
            "masked": false
          },
          "name": "design_extents_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "design_extents_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "plant_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Attachment fileId of the plant outline (barge/machine footprint, JSON). Lets the PE place the machine on the chart for scale and orientation. Optional.",
          "indexed": false,
          "label": "Plant Path",
          "masking": {
            "masked": false
          },
          "name": "plant_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "plant_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "plant_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Filename the PM picked for the plant outline file. The upload endpoint suffixes a random id for uniqueness, so this keeps the name they recognize.",
          "indexed": false,
          "label": "Plant Original Name",
          "masking": {
            "masked": false
          },
          "name": "plant_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "plant_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "plant_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Backing storage path for the plant outline file, mirroring the other asset triples.",
          "indexed": false,
          "label": "Plant Storage Path",
          "masking": {
            "masked": false
          },
          "name": "plant_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "plant_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "chart_framing",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "How the chart frames the map. Only the exact string 'work' opts into cropping to the design region plus the day's coverage; NULL, '', 'site' and anything unrecognised keep the full site view, so a half-written config row cannot quietly re-frame a live project's chart.",
          "indexed": false,
          "label": "Chart Framing",
          "masking": {
            "masked": false
          },
          "name": "chart_framing",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "chart_framing",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this config is live. An inactive row hides the Placement Progress tab without deleting the uploaded grid and aerial.",
          "indexed": false,
          "label": "Active",
          "masking": {
            "masked": false
          },
          "name": "active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        }
      ],
      "slug": "jfb_placement_config",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Placement Config"
  },
  "jfb_placement_progress": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_placement_progres",
      "domain_table_name": "jfb_placement_progress",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Owning project.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "report_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The day's report this bucket log belongs to. One row per report per equipment -- re-uploading replaces the day's file.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_reports"
          },
          "indexed": true,
          "label": "Report Id",
          "masking": {
            "masked": false
          },
          "name": "report_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "report_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "equipment_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The placement excavator/barge whose bucket log this is.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_equipments"
          },
          "indexed": true,
          "label": "Equipment Id",
          "masking": {
            "masked": false
          },
          "name": "equipment_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "equipment_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "source_filename",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Name of the uploaded .bkt file, shown back to the PE so they can tell which export is loaded.",
          "indexed": false,
          "label": "Source Filename",
          "masking": {
            "masked": false
          },
          "name": "source_filename",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "source_filename",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "source_header",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The .bkt file's header line verbatim. Informational only -- it is a template default (\"Dredge T\") and does NOT name the machine.",
          "indexed": false,
          "label": "Source Header",
          "masking": {
            "masked": false
          },
          "name": "source_header",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "source_header",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "placements",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "The RAW parsed bucket placements: {line,x,y,elevationFt,station,bucketWidthFt,bucketLengthFt,secs,clock}[]. Coverage is deliberately NOT frozen here -- the per-layer split is re-derived from the current event log on every read, so correcting a layer or an event time reflows the numbers with no re-upload.",
          "indexed": false,
          "label": "Placements",
          "masking": {
            "masked": false
          },
          "name": "placements",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "placements",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "bucket_count",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Number of placements parsed from the file. Denormalized so a report list need not open the jsonb.",
          "indexed": false,
          "label": "Bucket Count",
          "masking": {
            "masked": false
          },
          "name": "bucket_count",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "bucket_count",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "first_secs",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Seconds since local midnight of the day's first bucket. The .bkt clock is the machine's LOCAL wall time, not UTC.",
          "indexed": false,
          "label": "First Bucket Secs",
          "masking": {
            "masked": false
          },
          "name": "first_secs",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "first_secs",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "last_secs",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Seconds since local midnight of the day's last bucket.",
          "indexed": false,
          "label": "Last Bucket Secs",
          "masking": {
            "masked": false
          },
          "name": "last_secs",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "last_secs",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "distinct_cells",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Grid cells touched by any bucket that day. Less than the sum of the per-layer counts whenever two lifts hit one cell, which is expected since lifts stack in plan view.",
          "indexed": false,
          "label": "Distinct Cells",
          "masking": {
            "masked": false
          },
          "name": "distinct_cells",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "distinct_cells",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "today_sqft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Distinct area covered today. A covered cell counts as its FULL area (25 SF on a 5 ft grid) -- the PM's ruling: the grid is the accounting unit, not the smaller bucket footprint the .bkt reports.",
          "indexed": false,
          "label": "Today Sq Ft",
          "masking": {
            "masked": false
          },
          "name": "today_sqft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "today_sqft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "problems",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Rows of the .bkt that could not be parsed, as {line,text,reason}[]. Collected rather than thrown so one bad row never blocks a whole day's upload.",
          "indexed": false,
          "label": "Problems",
          "masking": {
            "masked": false
          },
          "name": "problems",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "problems",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "chart_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Attachment fileId of the rendered Daily Placement Progress Chart PNG for this day. The daily PDF re-serves this image rather than re-rendering.",
          "indexed": false,
          "label": "Chart Path",
          "masking": {
            "masked": false
          },
          "name": "chart_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "chart_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "plant_pose",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Where the plant (barge/machine) sits on this report's chart, as {\"bow\":[x,y],\"stern\":[x,y]} in the project CRS -- the PE clicks the working end and then the stern. Stored per report so the chart and the PDF redraw it identically. NULL means the machine has not been placed and the plant outline is not drawn.",
          "indexed": false,
          "label": "Plant Pose",
          "masking": {
            "masked": false
          },
          "name": "plant_pose",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "plant_pose",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "generated_by_user_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The Pivotly IAM user id who saved this row.",
          "indexed": false,
          "label": "Generated By User Id",
          "masking": {
            "masked": false
          },
          "name": "generated_by_user_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "generated_by_user_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        }
      ],
      "slug": "jfb_placement_progress",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Placement Progress"
  },
  "jfb_production_stats": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_production_stat",
      "domain_table_name": "jfb_production_stats",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "report_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The report this production stat belongs to. Project scope is inherited through the report.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_reports"
          },
          "indexed": true,
          "label": "Report Id",
          "masking": {
            "masked": false
          },
          "name": "report_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "report_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "equipment_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_equipments"
          },
          "indexed": false,
          "label": "Equipment Id",
          "masking": {
            "masked": false
          },
          "name": "equipment_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "equipment_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "area_level_combinations",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "",
          "indexed": false,
          "label": "Area Level Combinations",
          "masking": {
            "masked": false
          },
          "name": "area_level_combinations",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "area_level_combinations",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "pass_value",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Pass Value",
          "masking": {
            "masked": false
          },
          "name": "pass_value",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "pass_value",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "attachment_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The equipment attachment this production row was recorded under (e.g. \"3ft Cutterhead\").",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_project_attachments"
          },
          "indexed": false,
          "label": "Attachment Id",
          "masking": {
            "masked": false
          },
          "name": "attachment_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "attachment_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "layer_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Which capping layer this production row is for. Null on dredging rows.",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_project_layers"
          },
          "indexed": false,
          "label": "Layer Id",
          "masking": {
            "masked": false
          },
          "name": "layer_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "layer_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "material_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Which material this production row is for, filtered by the row's own layer_id via jfb_project_layer_materials. Null on dredging rows.",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_project_materials"
          },
          "indexed": false,
          "label": "Material Id",
          "masking": {
            "masked": false
          },
          "name": "material_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "material_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "tsca",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "",
          "indexed": false,
          "label": "Tsca",
          "masking": {
            "masked": false
          },
          "name": "tsca",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "tsca",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "volume",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "",
          "indexed": false,
          "label": "Volume",
          "masking": {
            "masked": false
          },
          "name": "volume",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "volume",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "area",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "",
          "indexed": false,
          "label": "Area",
          "masking": {
            "masked": false
          },
          "name": "area",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "area",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "notes",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Notes",
          "masking": {
            "masked": false
          },
          "name": "notes",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "notes",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "tons",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Tons placed, entered directly on capping rows (CY in `volume` is then derived as tons / conversion_factor). Null on dredging rows. Matches the non-native app's production_stats.tons.",
          "indexed": false,
          "label": "Tons",
          "masking": {
            "masked": false
          },
          "name": "tons",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "tons",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "conversion_factor",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Tons-to-CY factor snapshotted onto this row at entry time (pre-fills from the project's cap_conversion_factor), so re-tuning the project default never shifts historical CY. Null on dredging rows, and on capping rows paid by the ton with no factor set. Matches the non-native app's production_stats.conversion_factor.",
          "indexed": false,
          "label": "Conversion Factor",
          "masking": {
            "masked": false
          },
          "name": "conversion_factor",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "conversion_factor",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        }
      ],
      "slug": "jfb_production_stats",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Production Stats"
  },
  "jfb_production_week_breaks": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_production_week_break",
      "domain_table_name": "jfb_production_week_breaks",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this shutdown period belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "shutdown_start",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "First calendar date of a planned or unplanned production shutdown (inclusive). The Realized To-Date report's project-week counter pauses for the full shutdown_start..shutdown_end span instead of counting it as elapsed production weeks. Matches the non-native app's production_week_breaks.shutdown_start.",
          "indexed": true,
          "label": "Shutdown Start",
          "masking": {
            "masked": false
          },
          "name": "shutdown_start",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "shutdown_start",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "shutdown_end",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "Last calendar date of the shutdown (inclusive). Matches the non-native app's production_week_breaks.shutdown_end.",
          "indexed": false,
          "label": "Shutdown End",
          "masking": {
            "masked": false
          },
          "name": "shutdown_end",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "shutdown_end",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "reason",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Free-text note explaining the shutdown (e.g. winter lay-up, equipment mobilization gap). Matches the non-native app's production_week_breaks.reason.",
          "indexed": false,
          "label": "Reason",
          "masking": {
            "masked": false
          },
          "name": "reason",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "reason",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "slug": "jfb_production_week_breaks",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Production Week Breaks"
  },
  "jfb_project_area_layers": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_project_area_layer",
      "domain_table_name": "jfb_project_area_layers",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Owning project. Denormalized (rather than resolved through area_id -> jfb_project_areas) so every area/layer mapping for a project loads in one filtered query, matching this app's useDomainData({ projectId }) convention.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "area_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The area this layer is mapped to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_project_areas"
          },
          "indexed": true,
          "label": "Area Id",
          "masking": {
            "masked": false
          },
          "name": "area_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "area_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "layer_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The layer mapped to that area.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_project_layers"
          },
          "indexed": true,
          "label": "Layer Id",
          "masking": {
            "masked": false
          },
          "name": "layer_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "layer_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "min_design_thickness",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Minimum design thickness (inches) for this layer in this area.",
          "indexed": false,
          "label": "Min Design Thickness",
          "masking": {
            "masked": false
          },
          "name": "min_design_thickness",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "min_design_thickness",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "target_thickness",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Target placement thickness (inches) for this layer in this area.",
          "indexed": false,
          "label": "Target Thickness",
          "masking": {
            "masked": false
          },
          "name": "target_thickness",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "target_thickness",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "overplacement_tolerance",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Allowed overplacement tolerance (inches) above target thickness.",
          "indexed": false,
          "label": "Overplacement Tolerance",
          "masking": {
            "masked": false
          },
          "name": "overplacement_tolerance",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "overplacement_tolerance",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "cy_goal",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Design quantity goal in cubic yards for this layer in this area.",
          "indexed": false,
          "label": "Cy Goal",
          "masking": {
            "masked": false
          },
          "name": "cy_goal",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "cy_goal",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "tons_goal",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Design quantity goal in tons for this layer in this area.",
          "indexed": false,
          "label": "Tons Goal",
          "masking": {
            "masked": false
          },
          "name": "tons_goal",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "tons_goal",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "sf_goal",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Design quantity goal in square feet for this layer in this area.",
          "indexed": false,
          "label": "Sf Goal",
          "masking": {
            "masked": false
          },
          "name": "sf_goal",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sf_goal",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        }
      ],
      "slug": "jfb_project_area_layers",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Project Area Layers"
  },
  "jfb_project_area_levels": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "enabled": true,
        "max_record_versions": 25,
        "retention_days": 0
      },
      "contact": {
        "owner": null,
        "steward": null,
        "support": null
      },
      "default_conflict_resolution": {
        "code": "lww"
      },
      "domain_name_singular": "Project Area Level",
      "domain_table_name": "jfb_project_area_levels",
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this level definition belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "depth",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "1-based nesting depth this level represents within the project's area tree (1 = top level). Unbounded -- a project may define as many depths as it needs.",
          "indexed": true,
          "label": "Depth",
          "masking": {
            "masked": false
          },
          "name": "depth",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "depth",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "label",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "What this depth is called for this project, e.g. \"Main Area\", \"Group\", \"CSC\", \"Sub-Area\".",
          "indexed": false,
          "label": "Label",
          "masking": {
            "masked": false
          },
          "name": "label",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "label",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Rendering order among this project's levels. Usually equal to depth.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        }
      ],
      "track_versions": true,
      "xref_enabled": false
    },
    "name": "JFB Project Area Levels"
  },
  "jfb_project_areas": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "enabled": true,
        "max_record_versions": 25,
        "retention_days": 0
      },
      "contact": {
        "owner": null,
        "steward": null,
        "support": null
      },
      "default_conflict_resolution": {
        "code": "lww"
      },
      "domain_name_singular": "Project Area",
      "domain_table_name": "jfb_project_areas",
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this area belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "parent_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Self-reference. Null for the top-level (depth 1) areas; otherwise the area one depth up in the tree.",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_project_areas"
          },
          "indexed": true,
          "label": "Parent Id",
          "masking": {
            "masked": false
          },
          "name": "parent_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "parent_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "area_level_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Which of the project's defined levels (depth + label) this area belongs to. Replaces a bare level-number column -- the depth and display label both come from the referenced jfb_project_area_levels row.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_project_area_levels"
          },
          "indexed": true,
          "label": "Area Level Id",
          "masking": {
            "masked": false
          },
          "name": "area_level_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "area_level_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": true,
          "label": "Name",
          "masking": {
            "masked": false
          },
          "name": "name",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "is_active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "",
          "indexed": false,
          "label": "Is Active",
          "masking": {
            "masked": false
          },
          "name": "is_active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "is_active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "volume_goal_cy",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "",
          "indexed": false,
          "label": "Volume Goal Cy",
          "masking": {
            "masked": false
          },
          "name": "volume_goal_cy",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "volume_goal_cy",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "area_goal_sf",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "",
          "indexed": false,
          "label": "Area Goal Sf",
          "masking": {
            "masked": false
          },
          "name": "area_goal_sf",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "area_goal_sf",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "notes",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Notes",
          "masking": {
            "masked": false
          },
          "name": "notes",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "notes",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "track_versions": true,
      "xref_enabled": false
    },
    "name": "JFB Project Areas"
  },
  "jfb_project_attachments": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_project_attachment",
      "domain_table_name": "jfb_project_attachments",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this equipment attachment (cutterhead/bucket/etc.) is configured for. Matches the non-native app's project_attachments.project_id.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Display name of the attachment (e.g. \"3ft Cutterhead\", \"Env Bucket\"). Selected from a dropdown when logging/editing an activity -- stored as this literal string on jfb_daily_activities.attachment and jfb_production_stats.attachment, not a foreign key, matching the non-native app's convention for pass_number.",
          "indexed": false,
          "label": "Name",
          "masking": {
            "masked": false
          },
          "name": "name",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Display order in the attachment picker, lowest first.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this attachment is currently offered in the picker. False hides it without deleting historical activities/production stats that already reference its name.",
          "indexed": false,
          "label": "Active",
          "masking": {
            "masked": false
          },
          "name": "active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        }
      ],
      "slug": "jfb_project_attachments",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Project Attachments"
  },
  "jfb_project_components": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_project_component",
      "domain_table_name": "jfb_project_components",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this component belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "component_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "This project's own name for the component, e.g. \"Activated Carbon\". Only needed when a material is a blend. Not globally unique -- the same name can exist on multiple projects.",
          "indexed": true,
          "label": "Component Name",
          "masking": {
            "masked": false
          },
          "name": "component_name",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "component_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "component_type_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Which standardized component-type category this component belongs to (Sand, Gravel, Amendment, Open).",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_component_types"
          },
          "indexed": true,
          "label": "Component Type Id",
          "masking": {
            "masked": false
          },
          "name": "component_type_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "component_type_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "component_report_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Optional display-name override used on the printed daily report. Falls back to component_name when blank.",
          "indexed": false,
          "label": "Component Report Name",
          "masking": {
            "masked": false
          },
          "name": "component_report_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "component_report_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "component_report_uom",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Display unit shown on the report, e.g. \"Tons\", \"CY\", \"Qty\".",
          "indexed": false,
          "label": "Component Report Uom",
          "masking": {
            "masked": false
          },
          "name": "component_report_uom",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "component_report_uom",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "component_inventory_uom",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Unit used for inventory tracking, e.g. \"Tons\", \"CY\", \"Qty\" -- may differ from component_report_uom.",
          "indexed": false,
          "label": "Component Inventory Uom",
          "masking": {
            "masked": false
          },
          "name": "component_inventory_uom",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "component_inventory_uom",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Display order on the Capping Setup > Components tab.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this component is currently in use. False retires it without deleting history or mappings.",
          "indexed": false,
          "label": "Active",
          "masking": {
            "masked": false
          },
          "name": "active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        }
      ],
      "slug": "jfb_project_components",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Project Components"
  },
  "jfb_project_delay_codes": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_project_delay_code",
      "domain_table_name": "jfb_project_delay_codes",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this delay code is turned on for.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "delay_code_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The company-library delay code this project has turned on. Null for a project-specific custom code that has no master-list equivalent -- in that case work_type/category/code/code_num below carry the data instead.",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_delay_codes"
          },
          "indexed": true,
          "label": "Delay Code Id",
          "masking": {
            "masked": false
          },
          "name": "delay_code_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "delay_code_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "work_type_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Work-type group for a project-specific custom code (mirrors jfb_delay_codes.work_type_id). Null when delay_code_id is set -- the group comes from the referenced master code instead. Also left null on a custom code meant to apply across all of the project's phases.",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_work_types"
          },
          "indexed": false,
          "label": "Work Type Id",
          "masking": {
            "masked": false
          },
          "name": "work_type_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "work_type_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "category",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Category label for a project-specific custom code. Null when delay_code_id is set -- the category comes from the referenced master code instead.",
          "indexed": false,
          "label": "Category",
          "masking": {
            "masked": false
          },
          "name": "category",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "category",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "code",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Display name for a project-specific custom code. Null when delay_code_id is set -- the name comes from the referenced master code instead.",
          "indexed": false,
          "label": "Code",
          "masking": {
            "masked": false
          },
          "name": "code",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "code",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "code_num",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Number for a project-specific custom code, assigned by the admin app from a high, non-colliding range (e.g. 9900+). Null when delay_code_id is set -- the number comes from the referenced master code instead.",
          "indexed": false,
          "label": "Code Num",
          "masking": {
            "masked": false
          },
          "name": "code_num",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "code_num",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether the PM has this code turned on for the project. False hides it from the field app without removing the row.",
          "indexed": false,
          "label": "Active",
          "masking": {
            "masked": false
          },
          "name": "active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Optional per-project display-order override. Falls back to the referenced jfb_delay_codes.sort_order when null.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        }
      ],
      "slug": "jfb_project_delay_codes",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Project Delay Codes"
  },
  "jfb_project_layer_materials": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_project_layer_material",
      "domain_table_name": "jfb_project_layer_materials",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Owning project. Denormalized (rather than resolved through layer_id -> jfb_project_layers) so every layer/material mapping for a project loads in one filtered query, matching this app's useDomainData({ projectId }) convention.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "layer_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The layer this material is mapped to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_project_layers"
          },
          "indexed": true,
          "label": "Layer Id",
          "masking": {
            "masked": false
          },
          "name": "layer_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "layer_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "material_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The material mapped to that layer.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_project_materials"
          },
          "indexed": true,
          "label": "Material Id",
          "masking": {
            "masked": false
          },
          "name": "material_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "material_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "layer_material_report_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Optional display-name override for this specific layer+material pairing on the printed daily report.",
          "indexed": false,
          "label": "Layer Material Report Name",
          "masking": {
            "masked": false
          },
          "name": "layer_material_report_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "layer_material_report_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "loading_rate",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Target loading rate for this material on this layer, in tons/hour.",
          "indexed": false,
          "label": "Loading Rate",
          "masking": {
            "masked": false
          },
          "name": "loading_rate",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "loading_rate",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        }
      ],
      "slug": "jfb_project_layer_materials",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Project Layer Materials"
  },
  "jfb_project_layers": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_project_layer",
      "domain_table_name": "jfb_project_layers",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this cap layer (lift) belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "layer_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "This project's own name for the layer, e.g. \"Lift 1\", \"Armor Stone Placement\". Not globally unique -- the same name can exist on multiple projects.",
          "indexed": true,
          "label": "Layer Name",
          "masking": {
            "masked": false
          },
          "name": "layer_name",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "layer_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "layer_type_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Which standardized layer-type category this layer belongs to (Armor, Cap, Cover, etc.).",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_layer_types"
          },
          "indexed": true,
          "label": "Layer Type Id",
          "masking": {
            "masked": false
          },
          "name": "layer_type_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "layer_type_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "layer_report_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Optional display-name override used on the printed daily report. Falls back to layer_name when blank.",
          "indexed": false,
          "label": "Layer Report Name",
          "masking": {
            "masked": false
          },
          "name": "layer_report_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "layer_report_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Display order on the Capping Setup > Layers tab.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this layer is currently in use. False retires it without deleting history or mappings.",
          "indexed": false,
          "label": "Active",
          "masking": {
            "masked": false
          },
          "name": "active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "chart_color",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Hex fill for this layer's FIRST-pass coverage on the placement chart. NULL = the built-in material-class palette. Setting it also opts the project into the pass-split scheme, where earlier days collapse to one Progress-To-Date colour.",
          "indexed": false,
          "label": "Chart Color",
          "masking": {
            "masked": false
          },
          "name": "chart_color",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "chart_color",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "chart_color_2nd",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Hex fill for SECOND-pass coverage -- the same layer re-covering ground it already covered on an earlier day. NULL falls back to chart_color.",
          "indexed": false,
          "label": "Chart Color 2nd",
          "masking": {
            "masked": false
          },
          "name": "chart_color_2nd",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "chart_color_2nd",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "pay_group",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The paid line item this layer rolls up into on the capping production sheet. Layers sharing a value are SUMMED into one row, while staying separate everywhere else -- coverage, the .bkt split, per-layer hours and the placement chart all keep them distinct, because only the PAY figure is combined. NULL means the layer is reported on its own, which is every project except Torch Lake - LLRA (152601): it places Structural Backfill and Sand Backfill as one 'Stabilization Backfill' CY line and Restoration Backfill as its own SY line. A project opts in purely by having any layer carry a value here, so leaving it blank changes nothing. Ported from the reference app's project_layers.pay_group (sql/2026-08-19_layer_pay_groups.sql).",
          "indexed": false,
          "label": "Pay Group",
          "masking": {
            "masked": false
          },
          "name": "pay_group",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "pay_group",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "pay_unit",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The unit the pay group is measured in -- CY, SY, SF or TON. SY is derived as area_sf / 9 and is never stored. NULL keeps the project's existing fixed row list (tons / CY). A layer carrying a pay_group but no pay_unit is skipped rather than guessed at. Ported from the reference app's project_layers.pay_unit (sql/2026-08-19_layer_pay_groups.sql), where a CHECK constraint limits it to those four values; enforce the same set in the UI since this is a plain text column.",
          "indexed": false,
          "label": "Pay Unit",
          "masking": {
            "masked": false
          },
          "name": "pay_unit",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "pay_unit",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "slug": "jfb_project_layers",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Project Layers"
  },
  "jfb_project_material_components": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_project_material_component",
      "domain_table_name": "jfb_project_material_components",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Owning project. Denormalized (rather than resolved through material_id -> jfb_project_materials) so every material/component mapping for a project loads in one filtered query, matching this app's useDomainData({ projectId }) convention.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "material_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The blended material this component belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_project_materials"
          },
          "indexed": true,
          "label": "Material Id",
          "masking": {
            "masked": false
          },
          "name": "material_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "material_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "component_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The component mapped into that material.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_project_components"
          },
          "indexed": true,
          "label": "Component Id",
          "masking": {
            "masked": false
          },
          "name": "component_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "component_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "component_percent_of_material",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Target percentage (0-100) of the material this component makes up, when the blend ratio matters.",
          "indexed": false,
          "label": "Component Percent Of Material",
          "masking": {
            "masked": false
          },
          "name": "component_percent_of_material",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "component_percent_of_material",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        }
      ],
      "slug": "jfb_project_material_components",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Project Material Components"
  },
  "jfb_project_materials": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_project_material",
      "domain_table_name": "jfb_project_materials",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this cap material belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "material_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "This project's own name for the material, e.g. \"Sand A\", \"Amended Sand Blend\". Not globally unique -- the same name can exist on multiple projects.",
          "indexed": true,
          "label": "Material Name",
          "masking": {
            "masked": false
          },
          "name": "material_name",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "material_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "material_type_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Which standardized material-type category this material belongs to (Sand, Gravel, Rock, Amended, etc.).",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_material_types"
          },
          "indexed": true,
          "label": "Material Type Id",
          "masking": {
            "masked": false
          },
          "name": "material_type_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "material_type_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "material_report_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Optional display-name override used on the printed daily report. Falls back to material_name when blank.",
          "indexed": false,
          "label": "Material Report Name",
          "masking": {
            "masked": false
          },
          "name": "material_report_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "material_report_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Display order on the Capping Setup > Materials tab.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this material is currently in use. False retires it without deleting history or mappings.",
          "indexed": false,
          "label": "Active",
          "masking": {
            "masked": false
          },
          "name": "active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "tons_goal",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Total tons of this material the contract is bid to place. Summed across a project's active materials to give the Realized To-Date report its goal on tonnage-paid placement projects, which are measured in TON rather than CY. Null on projects and materials with no tonnage bid quantity. Matches the non-native app's project_materials.tons_goal.",
          "indexed": false,
          "label": "Tons Goal",
          "masking": {
            "masked": false
          },
          "name": "tons_goal",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "tons_goal",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "tons_per_hour_goal",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Bid placement rate for this material, in tons per gross operating hour. Combined with tons_goal across the project's active materials to give the Realized To-Date report its blended bid rate (total tons / total bid hours). Null when the material has no rate; a material with a tons_goal but no rate still counts toward the goal but not the rate. Matches the non-native app's project_materials.tons_per_hour_goal.",
          "indexed": false,
          "label": "Tons per Hour Goal",
          "masking": {
            "masked": false
          },
          "name": "tons_per_hour_goal",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "tons_per_hour_goal",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        }
      ],
      "slug": "jfb_project_materials",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Project Materials"
  },
  "jfb_project_members": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_project_member",
      "domain_table_name": "jfb_project_members",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this membership grants access to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "user_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The Pivotly IAM user id (pe or pm) assigned to this project. Not a jfb domain FK \u2014 this references the platform's IAM user, resolved via Pivotly IAM, not a jfb_* table.",
          "indexed": true,
          "label": "User Id",
          "masking": {
            "masked": false
          },
          "name": "user_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "user_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "is_active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this user is currently active on this project's team. False removes them from the project without deleting the historical assignment.",
          "indexed": false,
          "label": "Is Active",
          "masking": {
            "masked": false
          },
          "name": "is_active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "is_active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        }
      ],
      "slug": "jfb_project_members",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Project Members"
  },
  "jfb_project_operators": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_project_operator",
      "domain_table_name": "jfb_project_operators",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this operator is assigned to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "operator_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The operator assigned to this project. An operator can have many of these rows across different projects.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_operators"
          },
          "indexed": true,
          "label": "Operator Id",
          "masking": {
            "masked": false
          },
          "name": "operator_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "operator_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "is_active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this operator is currently active on this project. False removes them from the project without deleting the historical assignment or touching jfb_operators.",
          "indexed": false,
          "label": "Is Active",
          "masking": {
            "masked": false
          },
          "name": "is_active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "is_active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        }
      ],
      "slug": "jfb_project_operators",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Project Operators"
  },
  "jfb_project_report_narratives": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_project_report_narrative",
      "domain_table_name": "jfb_project_report_narratives",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this narrative entry belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "narrative_label",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Freely-editable display name for this section. NOT a stable identifier -- joins must use section_key, never this. Renaming a section only ever touches this column.",
          "indexed": false,
          "label": "Narrative Label",
          "masking": {
            "masked": false
          },
          "name": "narrative_label",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "narrative_label",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "section_key",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Stable slug identifying this section within its project, immutable once set -- unlike narrative_label, renaming a section never changes this. Every jfb_report_narratives_v2 content row and jfb_weekly_summaries row for this section carries the same section_key, so a rename can't orphan prior content the way joining on narrative_label did. Unique per project_id (not globally). Nullable only because existing rows are backfilled by a one-time migration; every row created after that migration must set it.",
          "indexed": true,
          "label": "Section Key",
          "masking": {
            "masked": false
          },
          "name": "section_key",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "section_key",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "is_active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "",
          "indexed": false,
          "label": "Is Active",
          "masking": {
            "masked": false
          },
          "name": "is_active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "is_active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "date",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "timestamp with time zone",
          "description": "",
          "indexed": false,
          "label": "Date",
          "masking": {
            "masked": false
          },
          "name": "date",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "date",
          "triggers_version_change": true,
          "type": "timestamp with time zone",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        }
      ],
      "slug": "jfb_project_report_narratives",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Project Report Narratives"
  },
  "jfb_project_site_equipment": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_project_site_equipment",
      "domain_table_name": "jfb_project_site_equipment",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this site equipment roster row belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "category",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Value from the pkl-jfb-site-equipment-category picklist (brennan / rental), not a domain FK. Matches the non-native app's project_site_equipment.category, which is a two-value DB check constraint there -- here it's a real, editable picklist instead.",
          "indexed": false,
          "label": "Category",
          "masking": {
            "masked": false
          },
          "name": "category",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "category",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "company",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Which subcontractor this piece of equipment belongs to. Set only on rows whose category is 'subcontractor' -- null on Brennan and Rental, where the category already says who owns it. The Safety page prints one \"Subcontractor -- <company>\" group per distinct value, for rows on site that date. A subcontractor row with this still blank groups under a plain \"Subcontractor\" heading rather than disappearing, so the PM can see it and fill the field in.",
          "indexed": false,
          "label": "Company",
          "masking": {
            "masked": false
          },
          "name": "company",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "company",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "description",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Free-text description of the equipment, e.g. \"3 - Kann Boats (7754, 7782, 70021)\".",
          "indexed": false,
          "label": "Description",
          "masking": {
            "masked": false
          },
          "name": "description",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "description",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Display order within its category, lowest first.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "mobilized_at",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "Date this equipment arrived on site. Null if not yet set.",
          "indexed": false,
          "label": "Mobilized At",
          "masking": {
            "masked": false
          },
          "name": "mobilized_at",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "mobilized_at",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "demobilized_at",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "Date this equipment left site. Null while still on site -- rows are not deleted on demob, matching the non-native app's convention (history is preserved).",
          "indexed": false,
          "label": "Demobilized At",
          "masking": {
            "masked": false
          },
          "name": "demobilized_at",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "demobilized_at",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        }
      ],
      "slug": "jfb_project_site_equipment",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Project Site Equipment"
  },
  "jfb_projects": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "enabled": true,
        "max_record_versions": 25,
        "retention_days": 0
      },
      "contact": {
        "owner": null,
        "steward": null,
        "support": null
      },
      "default_conflict_resolution": {
        "code": "lww"
      },
      "domain_name_singular": "Project",
      "domain_table_name": "jfb_projects",
      "schema": [
        {
          "column_name": "name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Name",
          "masking": {
            "masked": false
          },
          "name": "name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "is_active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "",
          "indexed": false,
          "label": "Is Active",
          "masking": {
            "masked": false
          },
          "name": "is_active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "is_active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "client_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Client Name",
          "masking": {
            "masked": false
          },
          "name": "client_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "client_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "project_code",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "",
          "indexed": false,
          "label": "Project Code",
          "masking": {
            "masked": false
          },
          "name": "project_code",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "project_code",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "work_type",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Work Type",
          "masking": {
            "masked": false
          },
          "name": "work_type",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "work_type",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "start_date",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "timestamp with time zone",
          "description": "",
          "indexed": false,
          "label": "Start Date",
          "masking": {
            "masked": false
          },
          "name": "start_date",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "start_date",
          "triggers_version_change": true,
          "type": "timestamp with time zone",
          "unique": false
        },
        {
          "column_name": "end_date",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "",
          "indexed": false,
          "label": "End Date",
          "masking": {
            "masked": false
          },
          "name": "end_date",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "end_date",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "volume_goal",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "",
          "indexed": false,
          "label": "Volume Goal",
          "masking": {
            "masked": false
          },
          "name": "volume_goal",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "volume_goal",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "primary_measure",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Primary Measure",
          "masking": {
            "masked": false
          },
          "name": "primary_measure",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "primary_measure",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "site_city",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Site City",
          "masking": {
            "masked": false
          },
          "name": "site_city",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "site_city",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "site_state",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Site State",
          "masking": {
            "masked": false
          },
          "name": "site_state",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "site_state",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "report_timezone",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "IANA timezone of the job site, e.g. America/Chicago. Event and shift clock times display in this zone rather than the viewer's, and times a PE types are read as wall-clock time in it. Null falls back to the viewer's browser zone, which is the behaviour every project had before.",
          "indexed": false,
          "label": "Report Timezone",
          "masking": {
            "masked": false
          },
          "name": "report_timezone",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "report_timezone",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "is_tsca_zone_tracking",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "",
          "indexed": false,
          "label": "Is Tsca Zone Tracking",
          "masking": {
            "masked": false
          },
          "name": "is_tsca_zone_tracking",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "is_tsca_zone_tracking",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "is_soil_type",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "",
          "indexed": false,
          "label": "Is Soil Type",
          "masking": {
            "masked": false
          },
          "name": "is_soil_type",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "is_soil_type",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "is_pipe_tracking",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "",
          "indexed": false,
          "label": "Is Pipe Tracking",
          "masking": {
            "masked": false
          },
          "name": "is_pipe_tracking",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "is_pipe_tracking",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "show_ssho_field",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "When true, the Safety tab's Sign-off section shows a second 'Project SSHO' name + signature block alongside the report preparer's. Matches the non-native app's projects.show_ssho_field (currently only set for one project, Torch Lake).",
          "indexed": false,
          "label": "Show SSHO Field",
          "masking": {
            "masked": false
          },
          "name": "show_ssho_field",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "show_ssho_field",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "show_next_day_summary",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "When true, the Safety tab's Daily Safety Updates section shows an 8th row, 'Summary of Next Day's Expected Work'. Matches the non-native app's projects.show_next_day_summary (currently only set for one project, Torch Lake).",
          "indexed": false,
          "label": "Show Next Day Summary",
          "masking": {
            "masked": false
          },
          "name": "show_next_day_summary",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "show_next_day_summary",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "latitude",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Project site latitude, used to fetch weather conditions for the Safety tab's Climate Summary. Matches the non-native app's projects.latitude.",
          "indexed": false,
          "label": "Latitude",
          "masking": {
            "masked": false
          },
          "name": "latitude",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "latitude",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "longitude",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Project site longitude, used to fetch weather conditions for the Safety tab's Climate Summary. Matches the non-native app's projects.longitude.",
          "indexed": false,
          "label": "Longitude",
          "masking": {
            "masked": false
          },
          "name": "longitude",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "longitude",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "cy_goh_goal",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Bid/target production rate (quantity per Gross Operating Hour), used by the Realized To-Date report as the plan/pace baseline and as the fallback rate when a projection window has no matching activity. Matches the non-native app's projects.cy_goh_goal. Not editable in-app on either app -- set once during project setup.",
          "indexed": false,
          "label": "CY/GOH Goal",
          "masking": {
            "masked": false
          },
          "name": "cy_goh_goal",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "cy_goh_goal",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "expected_goh_per_day",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Planned Gross Operating Hours per production day, edited from Project Settings. Combined with the projection-window rate to turn remaining quantity into a work-days-remaining estimate on the Realized To-Date report. Matches the non-native app's projects.expected_goh_per_day. Null (unset) means the report's forecast/projection block is disabled, not zero.",
          "indexed": false,
          "label": "Expected GOH per Day",
          "masking": {
            "masked": false
          },
          "name": "expected_goh_per_day",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "expected_goh_per_day",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "production_days_per_week",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Planned work days per calendar week, edited from Project Settings. Used with expected_goh_per_day to convert a work-days-remaining estimate into a calendar finish date on the Realized To-Date report. Matches the non-native app's projects.production_days_per_week.",
          "indexed": false,
          "label": "Production Days per Week",
          "masking": {
            "masked": false
          },
          "name": "production_days_per_week",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "production_days_per_week",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "production_start_date",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "Anchor date the Realized To-Date report's project-week counter (Monday-of-week 1) is calculated from -- separate from start_date, since mobilization and first production rarely land on the same day. Matches the non-native app's projects.production_start_date.",
          "indexed": false,
          "label": "Production Start Date",
          "masking": {
            "masked": false
          },
          "name": "production_start_date",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "production_start_date",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "cap_conversion_factor",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Default tons-to-CY conversion factor for capping production entry (CY = tons / factor). Pre-fills the Factor column on new capping production rows; left null on projects paid by the ton, where CY/thickness simply don't compute. Matches the non-native app's projects.cap_conversion_factor.",
          "indexed": false,
          "label": "Cap Conversion Factor",
          "masking": {
            "masked": false
          },
          "name": "cap_conversion_factor",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "cap_conversion_factor",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "tons_goh_goal",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Capping bid goal rate in tons per gross operating hour, entered on Project Settings next to cap_conversion_factor. Null on projects with no tonnage bid goal; CY-measured projects use cy_goh_goal instead. Matches the non-native app's projects.tons_goh_goal.",
          "indexed": false,
          "label": "Tons GOH Goal",
          "masking": {
            "masked": false
          },
          "name": "tons_goh_goal",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "tons_goh_goal",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "placement_start_date",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "First report date of a mid-job work-type change -- reports on/after it resolve to work_type, earlier ones to prior_work_type. NULL (the default, and every project that never changes phase) means work_type applies to every date. Meaningless without prior_work_type also set. Matches the non-native app's projects.placement_start_date.",
          "indexed": false,
          "label": "Placement Start Date",
          "masking": {
            "masked": false
          },
          "name": "placement_start_date",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "placement_start_date",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "prior_work_type",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "What this project's work_type was before placement_start_date. Set only alongside placement_start_date, so flipping a project's work_type mid-contract doesn't reprint its historical dailies under the new discipline. One of 'Hydraulic Dredging', 'Mechanical Dredging', 'Hydraulic Capping', 'Mechanical Capping' when set. Matches the non-native app's projects.prior_work_type.",
          "indexed": false,
          "label": "Prior Work Type",
          "masking": {
            "masked": false
          },
          "name": "prior_work_type",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "prior_work_type",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "is_spreader_active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this project runs a spreader barge, gating the Spreader Progress tab. Spreader placement is a per-project rig choice rather than a discipline, so it cannot be inferred from work_type the way the placement and dredge tabs are. Null/false hides the tab. Replaces the non-native app's reliance on spreader_config.active.",
          "indexed": false,
          "label": "Is Spreader Active",
          "masking": {
            "masked": false
          },
          "name": "is_spreader_active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "is_spreader_active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        },
        {
          "column_name": "show_dredge_chart",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this project shows the dredge chart in Field Ops: the Dredge Chart tab on Project Settings, the Dredge Progress tab on dredging-phase report dates, and the weekly progress chart status on the Weekly Summary. Null/false hides them. Replaces the non-native app's hardcoded project-name list (DREDGE_ENABLED_PROJECTS in src/lib/dredge/config.ts).",
          "indexed": false,
          "label": "Show Dredge Chart",
          "masking": {
            "masked": false
          },
          "name": "show_dredge_chart",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "show_dredge_chart",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        }
      ],
      "track_versions": true,
      "xref_enabled": false
    },
    "name": "JFB Projects"
  },
  "jfb_realized_excluded_days": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_realized_excluded_day",
      "domain_table_name": "jfb_realized_excluded_days",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this excluded day belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "exclude_date",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "A calendar date to omit from every Realized To-Date rate/pace/forecast calculation for this project -- e.g. a released report day with anomalous or non-representative data. Matches the non-native app's realized_excluded_days.exclude_date. Excluding a day does not delete or alter its underlying production_stats/daily_activities data, only removes it from Realized To-Date's math.",
          "indexed": true,
          "label": "Exclude Date",
          "masking": {
            "masked": false
          },
          "name": "exclude_date",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "exclude_date",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "reason",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Free-text note explaining why this day was excluded, shown when reviewing the exclusion list. Not a constrained/picklist value -- matches the non-native app's realized_excluded_days.reason, which is a typed rationale rather than a category.",
          "indexed": false,
          "label": "Reason",
          "masking": {
            "masked": false
          },
          "name": "reason",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "reason",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "slug": "jfb_realized_excluded_days",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Realized Excluded Days"
  },
  "jfb_realized_scopes": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_realized_scope",
      "domain_table_name": "jfb_realized_scopes",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this scope belongs to. A project with NO scope rows keeps the whole-project behaviour it has today, reading its goal and rate straight off jfb_projects -- so adding this domain changes nothing until someone configures a scope.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "label",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "What the Realized To-Date scope selector shows, e.g. \"Part 1\" or \"Mechanical Dredging (complete)\". The selector only appears when a project has two or more active scopes; a single scope is used silently.",
          "indexed": false,
          "label": "Label",
          "masking": {
            "masked": false
          },
          "name": "label",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "label",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Order the scopes appear in the selector.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "start_date",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "First date this scope counts production from. Anything produced before it belongs in baseline_cy rather than the series.",
          "indexed": false,
          "label": "Start Date",
          "masking": {
            "masked": false
          },
          "name": "start_date",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "start_date",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "end_date",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "Last date this scope counts, inclusive. LEAVE BLANK for a scope still accruing. Set it on a FINISHED phase, otherwise later work in the same areas keeps being added to it -- the case this domain exists for: a project that dredges then places in the SAME areas would otherwise count placement toward the dredging goal and report over 100% complete.",
          "indexed": false,
          "label": "End Date",
          "masking": {
            "masked": false
          },
          "name": "end_date",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "end_date",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "baseline_cy",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Opening balance already produced before start_date, in this scope's unit. A frozen historical figure, not derived -- if earlier history is ever corrected, this has to be corrected with it.",
          "indexed": false,
          "label": "Baseline",
          "masking": {
            "masked": false
          },
          "name": "baseline_cy",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "baseline_cy",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "goal",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Total contract quantity this scope works toward. Drives percent complete and the projected completion date; without it neither can be shown.",
          "indexed": false,
          "label": "Goal",
          "masking": {
            "masked": false
          },
          "name": "goal",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "goal",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "cy_goh_goal",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Bid or forecast production rate per gross operating hour. A scope carries its own rate rather than inheriting the project's, because separate contracts genuinely differ -- Kalamazoo's two parts run 100 and 120 CY/GOH.",
          "indexed": false,
          "label": "Bid Rate",
          "masking": {
            "masked": false
          },
          "name": "cy_goh_goal",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "cy_goh_goal",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "expected_goh_per_day",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Planned gross operating hours per production day. With the bid rate this gives anticipated daily production, which is what planned-vs-actual variance is measured against.",
          "indexed": false,
          "label": "Expected GOH / Day",
          "masking": {
            "masked": false
          },
          "name": "expected_goh_per_day",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "expected_goh_per_day",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "production_days_per_week",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "How many days a week this scope expects to work. Used to project a completion date from the remaining quantity.",
          "indexed": false,
          "label": "Production Days / Week",
          "masking": {
            "masked": false
          },
          "name": "production_days_per_week",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "production_days_per_week",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "include_area_ids",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Array of jfb_project_areas ids. When set, ONLY production and events in these areas count toward this scope. Stored as ids rather than area names so renaming an area cannot silently change what a scope measures. Leave empty to count every area.",
          "indexed": false,
          "label": "Include Areas",
          "masking": {
            "masked": false
          },
          "name": "include_area_ids",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "include_area_ids",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "exclude_area_ids",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Array of jfb_project_areas ids to leave OUT. Used instead of include_area_ids when it is easier to name the exceptions -- e.g. everything except a separate non-contaminated bucket and a pilot channel. Ignored when include_area_ids is set.",
          "indexed": false,
          "label": "Exclude Areas",
          "masking": {
            "masked": false
          },
          "name": "exclude_area_ids",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "exclude_area_ids",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "chart_region",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "How this scope's GROUND is identified on progress charts, from pkl-jfb-scope-chart-region: csc-cells for work inside the numbered sampling cells, outside-csc-cells for a new cut that has none. Ring-level and independent of which areas a day's events logged, because one day can work both contracts. Blank on projects with no such split.",
          "indexed": false,
          "label": "Chart Region",
          "masking": {
            "masked": false
          },
          "name": "chart_region",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "chart_region",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "notes",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Why this scope is drawn the way it is -- the reasoning that would otherwise be lost. Worth recording things like which changeover day belongs to neither phase and why, or why a phase has no scope yet. Without it, an end date looks arbitrary and gets \"corrected\" a year later.",
          "indexed": false,
          "label": "Notes",
          "masking": {
            "masked": false
          },
          "name": "notes",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "notes",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this scope is offered on the Realized To-Date page. False retires it without deleting the figures behind an already-issued report.",
          "indexed": false,
          "label": "Active",
          "masking": {
            "masked": false
          },
          "name": "active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        }
      ],
      "slug": "jfb_realized_scopes",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Realized Scopes"
  },
  "jfb_report_crew_summary_v2": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_report_crew_summary_v2",
      "domain_table_name": "jfb_report_crew_summary_v2",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "report_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The daily report this crew row belongs to. Matches the non-native app's report_crew_summary.report_date_id.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_reports"
          },
          "indexed": true,
          "label": "Report Id",
          "masking": {
            "masked": false
          },
          "name": "report_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "report_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "category",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Crew category label (e.g. \"Sheet Pile Crew\"). Free text, project-specific.",
          "indexed": false,
          "label": "Category",
          "masking": {
            "masked": false
          },
          "name": "category",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "category",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "count",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Headcount for this crew category on this report.",
          "indexed": false,
          "label": "Count",
          "masking": {
            "masked": false
          },
          "name": "count",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "count",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "hours",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Hours worked by this crew category on this report.",
          "indexed": false,
          "label": "Hours",
          "masking": {
            "masked": false
          },
          "name": "hours",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "hours",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "sort_order",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Display order among this report's crew rows.",
          "indexed": false,
          "label": "Sort Order",
          "masking": {
            "masked": false
          },
          "name": "sort_order",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "sort_order",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        }
      ],
      "slug": "jfb_report_crew_summary_v2",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Report Crew Summary V2"
  },
  "jfb_report_generations": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_report_generation",
      "domain_table_name": "jfb_report_generations",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "report_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The report (project + date) this PDF generation was for.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_reports"
          },
          "indexed": true,
          "label": "Report Id",
          "masking": {
            "masked": false
          },
          "name": "report_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "report_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Denormalized from the report, for filtering without a join.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "report_date",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "Denormalized copy of the report's date, for filtering.",
          "indexed": true,
          "label": "Report Date",
          "masking": {
            "masked": false
          },
          "name": "report_date",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "report_date",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "report_slug",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Which published Pivotly report definition was used (e.g. rpt-jfb-daily-report).",
          "indexed": false,
          "label": "Report Slug",
          "masking": {
            "masked": false
          },
          "name": "report_slug",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "report_slug",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "report_type",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "daily, weekly, or realized_to_date.",
          "indexed": true,
          "label": "Report Type",
          "masking": {
            "masked": false
          },
          "name": "report_type",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "report_type",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "generated_at",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "timestamp with time zone",
          "description": "When the PDF was generated (date, time, and timezone).",
          "indexed": true,
          "label": "Generated At",
          "masking": {
            "masked": false
          },
          "name": "generated_at",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "generated_at",
          "triggers_version_change": true,
          "type": "timestamp with time zone",
          "unique": false
        },
        {
          "column_name": "generated_by_user_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The Pivotly IAM user id who generated this PDF.",
          "indexed": false,
          "label": "Generated By (User Id)",
          "masking": {
            "masked": false
          },
          "name": "generated_by_user_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "generated_by_user_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "generated_by_email",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Denormalized copy of the generating user's email at the time of generation.",
          "indexed": false,
          "label": "Generated By (Email)",
          "masking": {
            "masked": false
          },
          "name": "generated_by_email",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "generated_by_email",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "file_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The resulting PDF's id in Pivotly file storage (core.app_files.id).",
          "indexed": false,
          "label": "File Id",
          "masking": {
            "masked": false
          },
          "name": "file_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "file_id",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "file_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The PDF's logical/display file name.",
          "indexed": false,
          "label": "File Name",
          "masking": {
            "masked": false
          },
          "name": "file_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "file_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "file_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The PDF's storage path in Pivotly file storage.",
          "indexed": false,
          "label": "File Path",
          "masking": {
            "masked": false
          },
          "name": "file_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "file_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "download_url",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The resolved download URL returned at generation time.",
          "indexed": false,
          "label": "Download URL",
          "masking": {
            "masked": false
          },
          "name": "download_url",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "download_url",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "slug": "jfb_report_generations",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Report Generations"
  },
  "jfb_report_metric_value": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_report_metric_value",
      "domain_table_name": "jfb_report_metric_value",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "report_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Which day's report this value was entered on. Project scope is inherited through the report.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_reports"
          },
          "indexed": true,
          "label": "Report Id",
          "masking": {
            "masked": false
          },
          "name": "report_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "report_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "metric_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Which jfb_metrics row this value belongs to. One row per (report_id, metric_id) -- app code looks up the existing row for that pair before deciding whether to create or update.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_metrics"
          },
          "indexed": true,
          "label": "Metric Id",
          "masking": {
            "masked": false
          },
          "name": "metric_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "metric_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "metric_key",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The project metric's metric_key (jfb_metrics.metric_key) this value belongs to. Values are matched to a metric by (report_id, metric_key), like the non-native app's report_metrics_data.metric_key, so a metric's Week/Total history follows its key even if the jfb_metrics row is deleted and re-created with the same key. Null on rows written before this column existed; app code falls back to metric_id for those.",
          "indexed": true,
          "label": "Metric Key",
          "masking": {
            "masked": false
          },
          "name": "metric_key",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "metric_key",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "value",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "The number a PE typed for this metric on this report's day. Week/Total are computed at read time by summing this column across a project's reports in range -- not stored duplicates (METRICS_MIGRATION_PLAN.md \u00a74 open question 3).",
          "indexed": false,
          "label": "Value",
          "masking": {
            "masked": false
          },
          "name": "value",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "value",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        }
      ],
      "slug": "jfb_report_metric_value",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Report Metric Value"
  },
  "jfb_report_narratives_v2": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "fww",
        "human_readable": "First Write Wins"
      },
      "domain_name_singular": "jfb_report_narrative_v2",
      "domain_table_name": "jfb_report_narratives_v2",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this narrative content belongs to. Duplicated from report_id's own project scope so callers can filter by project directly instead of joining through jfb_reports.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "report_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The specific report day this narrative content was written for. Combined with narrative_label, should be unique -- one content row per section per report day.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_reports"
          },
          "indexed": true,
          "label": "Report Id",
          "masking": {
            "masked": false
          },
          "name": "report_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "report_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "narrative_label",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Denormalized copy of the section's display label at last save, for convenience only -- NOT used to join back to its jfb_project_report_narratives template row (use section_key for that). Can go stale if the template is renamed afterward; harmless since nothing reads it as a key.",
          "indexed": true,
          "label": "Narrative Label",
          "masking": {
            "masked": false
          },
          "name": "narrative_label",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "narrative_label",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "section_key",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The stable section_key of the jfb_project_report_narratives template row this content belongs to. Combined with report_id, should be unique -- one content row per section per report day. Text match, not a real FK (matches the platform's own report_id/project_id fk_config pattern elsewhere in this domain, but section_key has no dedicated target domain of its own to point at). Nullable only because existing rows are backfilled by a one-time migration; every row created after that migration must set it.",
          "indexed": true,
          "label": "Section Key",
          "masking": {
            "masked": false
          },
          "name": "section_key",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "section_key",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "content",
          "conflict_resolution": {
            "code": "fww"
          },
          "data_type": "text",
          "description": "The narrative text written for this section on this report day. FWW (not LWW, unlike v1): a save whose version_token doesn't match the current record is rejected outright (require_fww_lock) rather than silently dropped, so two users saving the same section at once can't have the second write silently disappear.",
          "indexed": false,
          "label": "Content",
          "masking": {
            "masked": false
          },
          "name": "content",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "content",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "slug": "jfb_report_narratives_v2",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Report Narratives V2"
  },
  "jfb_report_photos": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_repoert_photo",
      "domain_table_name": "jfb_report_photos",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "photo_number",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Which of the report's photo slots this is (e.g. 1 or 2).",
          "indexed": false,
          "label": "Photo Number",
          "masking": {
            "masked": false
          },
          "name": "photo_number",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "photo_number",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "photo_file_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Storage path to the uploaded photo file.",
          "indexed": false,
          "label": "Photo File Path",
          "masking": {
            "masked": false
          },
          "name": "photo_file_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "photo_file_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "original_file_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The file's name as picked by the uploader, before it's renamed to a unique storage name to avoid Pivotly's (folder_id, logical_name, storage_location) collision constraint. See withUniqueName() in PhotosTab.jsx.",
          "indexed": false,
          "label": "Original File Name",
          "masking": {
            "masked": false
          },
          "name": "original_file_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "original_file_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "label",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Caption for the photo.",
          "indexed": false,
          "label": "Label",
          "masking": {
            "masked": false
          },
          "name": "label",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "label",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "uploaded_by",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Pivotly user id of whoever uploaded this photo (the logged-in account). No fk_config -- there is no local jfb_ domain representing platform users to target.",
          "indexed": false,
          "label": "Uploaded By",
          "masking": {
            "masked": false
          },
          "name": "uploaded_by",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "uploaded_by",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "uploaded_date_time",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "timestamp with time zone",
          "description": "When the photo was uploaded.",
          "indexed": false,
          "label": "Uploaded Date Time",
          "masking": {
            "masked": false
          },
          "name": "uploaded_date_time",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "uploaded_date_time",
          "triggers_version_change": true,
          "type": "timestamp with time zone",
          "unique": false
        },
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this photo belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "report_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The specific report this photo belongs to (one of its 2 photo slots).",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_reports"
          },
          "indexed": true,
          "label": "Report Id",
          "masking": {
            "masked": false
          },
          "name": "report_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "report_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "pm_comment",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "PM's rejection reason for this photo. Non-null means the PM has rejected it and the PE needs to replace it; cleared automatically on replacement.",
          "indexed": false,
          "label": "PM Comment",
          "masking": {
            "masked": false
          },
          "name": "pm_comment",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "pm_comment",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "slug": "jfb_report_photos",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Report Photos"
  },
  "jfb_report_safety_v2": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_report_safety_v2",
      "domain_table_name": "jfb_report_safety_v2",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "report_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The daily report this safety record belongs to -- one row per report. Matches the non-native app's report_safety.report_date_id (unique).",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_reports"
          },
          "indexed": true,
          "label": "Report Id",
          "masking": {
            "masked": false
          },
          "name": "report_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "report_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": true
        },
        {
          "column_name": "culture_tenant_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The culture tenant discussed at today's safety meeting.",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_culture_tenants"
          },
          "indexed": false,
          "label": "Culture Tenant Id",
          "masking": {
            "masked": false
          },
          "name": "culture_tenant_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "culture_tenant_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "plan_of_day",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Plan Of Day",
          "masking": {
            "masked": false
          },
          "name": "plan_of_day",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "plan_of_day",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "incidents_to_report",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Incidents To Report",
          "masking": {
            "masked": false
          },
          "name": "incidents_to_report",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "incidents_to_report",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "safety_meeting_topic",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Morning tool box topic.",
          "indexed": false,
          "label": "Safety Meeting Topic",
          "masking": {
            "masked": false
          },
          "name": "safety_meeting_topic",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "safety_meeting_topic",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "afternoon_meeting_topic",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Afternoon Meeting Topic",
          "masking": {
            "masked": false
          },
          "name": "afternoon_meeting_topic",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "afternoon_meeting_topic",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "jha_aha_reviewed",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "Jha Aha Reviewed",
          "masking": {
            "masked": false
          },
          "name": "jha_aha_reviewed",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "jha_aha_reviewed",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "high_risk_task",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "",
          "indexed": false,
          "label": "High Risk Task",
          "masking": {
            "masked": false
          },
          "name": "high_risk_task",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "high_risk_task",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "temp_high_f",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Decimal, not integer -- the non-native table stores this as integer, widened here per explicit direction.",
          "indexed": false,
          "label": "Temp High F",
          "masking": {
            "masked": false
          },
          "name": "temp_high_f",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "temp_high_f",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "temp_low_f",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Decimal, not integer -- widened per explicit direction.",
          "indexed": false,
          "label": "Temp Low F",
          "masking": {
            "masked": false
          },
          "name": "temp_low_f",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "temp_low_f",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "wind_high_mph",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Decimal, not integer -- widened per explicit direction.",
          "indexed": false,
          "label": "Wind High Mph",
          "masking": {
            "masked": false
          },
          "name": "wind_high_mph",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "wind_high_mph",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "wind_gusts_mph",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Decimal, not integer -- widened per explicit direction.",
          "indexed": false,
          "label": "Wind Gusts Mph",
          "masking": {
            "masked": false
          },
          "name": "wind_gusts_mph",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "wind_gusts_mph",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "wind_avg_mph",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Decimal, not integer -- widened per explicit direction.",
          "indexed": false,
          "label": "Wind Avg Mph",
          "masking": {
            "masked": false
          },
          "name": "wind_avg_mph",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "wind_avg_mph",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "wind_direction",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "e.g. NW, S.",
          "indexed": false,
          "label": "Wind Direction",
          "masking": {
            "masked": false
          },
          "name": "wind_direction",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "wind_direction",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "precip_today_in",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "The only precip field actually entered/fetched -- MTD/PTD are derived by summing this across the project's reports, not stored inputs.",
          "indexed": false,
          "label": "Precip Today In",
          "masking": {
            "masked": false
          },
          "name": "precip_today_in",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "precip_today_in",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "precip_mtd_in",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Legacy stored column -- the non-native app now computes this live from SUM(precip_today_in) instead of reading/writing it.",
          "indexed": false,
          "label": "Precip Mtd In",
          "masking": {
            "masked": false
          },
          "name": "precip_mtd_in",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "precip_mtd_in",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "precip_project_total_in",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Legacy stored column -- same as precip_mtd_in, superseded by a live derived sum.",
          "indexed": false,
          "label": "Precip Project Total In",
          "masking": {
            "masked": false
          },
          "name": "precip_project_total_in",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "precip_project_total_in",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "conditions",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "e.g. Light Rain, Sunny, Overcast.",
          "indexed": false,
          "label": "Conditions",
          "masking": {
            "masked": false
          },
          "name": "conditions",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "conditions",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "signature_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Report Preparer name.",
          "indexed": false,
          "label": "Signature Name",
          "masking": {
            "masked": false
          },
          "name": "signature_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "signature_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "signature_image_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Per-report signature override path. Non-native stores the file in a private Supabase Storage bucket and this column holds the path -- native has no equivalent file store wired up yet, so this would need one before it's usable end-to-end.",
          "indexed": false,
          "label": "Signature Image Path",
          "masking": {
            "masked": false
          },
          "name": "signature_image_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "signature_image_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "ssho_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Project SSHO name -- only shown on projects with the SSHO field enabled.",
          "indexed": false,
          "label": "Ssho Name",
          "masking": {
            "masked": false
          },
          "name": "ssho_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "ssho_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "ssho_signature_image_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Same file-store caveat as signature_image_path.",
          "indexed": false,
          "label": "Ssho Signature Image Path",
          "masking": {
            "masked": false
          },
          "name": "ssho_signature_image_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "ssho_signature_image_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "next_day_summary",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Only shown on projects with next-day summary enabled.",
          "indexed": false,
          "label": "Next Day Summary",
          "masking": {
            "masked": false
          },
          "name": "next_day_summary",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "next_day_summary",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "slug": "jfb_report_safety_v2",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Report Safety V2"
  },
  "jfb_reports": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_report",
      "domain_table_name": "jfb_reports",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this report belongs to. Combined with report_date, should be unique -- one report per project per day.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "report_date",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "The calendar day this report covers.",
          "indexed": true,
          "label": "Report Date",
          "masking": {
            "masked": false
          },
          "name": "report_date",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "report_date",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "status",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "draft, cqc_review, approved, or released.",
          "indexed": false,
          "label": "Status",
          "masking": {
            "masked": false
          },
          "name": "status",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "status",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "released_at",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "timestamp with time zone",
          "description": "When this report was released (status transitioned to released). NULL until then. Matches the non-native app's report_dates.released_at.",
          "indexed": false,
          "label": "Released At",
          "masking": {
            "masked": false
          },
          "name": "released_at",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "released_at",
          "triggers_version_change": true,
          "type": "timestamp with time zone",
          "unique": false
        },
        {
          "column_name": "released_by_user_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The Pivotly IAM user id who released this report. NULL until released. Named to match this domain's own generated_by_user_id convention (jfb_report_generations) rather than the non-native app's bare released_by column -- which the non-native app itself never actually writes despite having it.",
          "indexed": false,
          "label": "Released By (User Id)",
          "masking": {
            "masked": false
          },
          "name": "released_by_user_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "released_by_user_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "no_production_day",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Mobilization/demobilization/full-shutdown day: no production expected. NULL/false is the normal case. When true, marks event_log_reviewed, production_stats_entered, and metrics_entered N/A on the completion checklist instead of required, and the PDF generator omits per-equipment production sheets. Matches the non-native app's report_dates.no_production_day.",
          "indexed": false,
          "label": "No Production Day",
          "masking": {
            "masked": false
          },
          "name": "no_production_day",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "no_production_day",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        }
      ],
      "slug": "jfb_reports",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Reports"
  },
  "jfb_spreader_config": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_spreader_config",
      "domain_table_name": "jfb_spreader_config",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "One row per project. The project this spreader chart config belongs to. Unlike the non-native app, the Spreader Progress tab is gated on jfb_projects.is_spreader_active rather than on this row's presence, so a project can be flagged as a spreader job before its boundaries are uploaded.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "spreader_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The spreader rig's name, printed in the chart's title band (e.g. \"Neenah\").",
          "indexed": false,
          "label": "Spreader Name",
          "masking": {
            "masked": false
          },
          "name": "spreader_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "spreader_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "layer_title",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Lift label printed in the chart's title band (e.g. \"Layer 1\").",
          "indexed": false,
          "label": "Layer Title",
          "masking": {
            "masked": false
          },
          "name": "layer_title",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "layer_title",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "aerial_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Attachment fileId of the aerial image drawn behind the coverage. Optional -- the chart renders on a flat map colour without it, and unlike the placement grid a missing aerial never blocks the chart.",
          "indexed": false,
          "label": "Aerial Path",
          "masking": {
            "masked": false
          },
          "name": "aerial_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "aerial_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "aerial_original_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Original filename of the uploaded aerial, shown in the settings tab so a PM can tell which image is loaded.",
          "indexed": false,
          "label": "Aerial Original Name",
          "masking": {
            "masked": false
          },
          "name": "aerial_original_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "aerial_original_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "aerial_storage_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Platform storage path of the uploaded aerial, retained alongside its fileId for traceability.",
          "indexed": false,
          "label": "Aerial Storage Path",
          "masking": {
            "masked": false
          },
          "name": "aerial_storage_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "aerial_storage_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "aerial_georef",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "World bounds of aerial_path as {wL,wR,wT,wB} in the project CRS -- the same shape jfb_dredge_config and jfb_placement_config use.",
          "indexed": false,
          "label": "Aerial Georeference",
          "masking": {
            "masked": false
          },
          "name": "aerial_georef",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "aerial_georef",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "boundaries",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Subarea polygons as [{area, rings}] in world coords, where rings are closed [x,y] rings. Coverage is HARD-CLIPPED to these, so placement is never charted outside the footprint. Empty/absent means no coverage can be derived at all.",
          "indexed": false,
          "label": "Subarea Boundaries",
          "masking": {
            "masked": false
          },
          "name": "boundaries",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "boundaries",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "planned_lanes",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "The operators' lane plan as [{c0,c1,w}] -- first and last cell centres plus broadcast width, since lanes are straight uniform strips. Present means the plan-snap coverage model is used (clean lane-aligned edges matching the PM's hand drawing); absent falls back to the directional model.",
          "indexed": false,
          "label": "Planned Lanes",
          "masking": {
            "masked": false
          },
          "name": "planned_lanes",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "planned_lanes",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "plan_cell_len_ft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Along-lane length of one planned cell, used by the plan-snap model to extend a lane's worked span by half a cell at each end.",
          "indexed": false,
          "label": "Plan Cell Length Ft",
          "masking": {
            "masked": false
          },
          "name": "plan_cell_len_ft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "plan_cell_len_ft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "broadcast_ft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Legacy symmetric broadcast width. Retained for parity with the non-native app; the directional model does not use it.",
          "indexed": false,
          "label": "Broadcast Ft",
          "masking": {
            "masked": false
          },
          "name": "broadcast_ft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "broadcast_ft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "min_step_tons",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Minimum placed tons for a step to count as coverage. The spreader logs a step for every move including walking back to reposition, and those near-zero-tons steps must not paint coverage. 0 keeps every step.",
          "indexed": false,
          "label": "Min Step Tons",
          "masking": {
            "masked": false
          },
          "name": "min_step_tons",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "min_step_tons",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "forward_throw_ft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "How far material carries IN FRONT of the frontmost step, since the spinner throws forward. Nothing is ever painted behind the latest step.",
          "indexed": false,
          "label": "Forward Throw Ft",
          "masking": {
            "masked": false
          },
          "name": "forward_throw_ft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "forward_throw_ft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "cross_extra_ft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Cross-lane spread beyond the step width/2 on each side.",
          "indexed": false,
          "label": "Cross Extra Ft",
          "masking": {
            "masked": false
          },
          "name": "cross_extra_ft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "cross_extra_ft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "transition_ft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Transition-zone band width. Edge lanes are inset from the boundary so no sand lands outside it, but they broadcast to the boundary, so the strip between the outer coverage and the boundary IS complete and gets filled within this band. 0 disables it.",
          "indexed": false,
          "label": "Transition Ft",
          "masking": {
            "masked": false
          },
          "name": "transition_ft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "transition_ft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Whether this config is live. An inactive row stops coverage being derived without deleting the uploaded boundaries, lane plan and aerial.",
          "indexed": false,
          "label": "Active",
          "masking": {
            "masked": false
          },
          "name": "active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        }
      ],
      "slug": "jfb_spreader_config",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Spreader Config"
  },
  "jfb_spreader_progress": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_spreader_progress",
      "domain_table_name": "jfb_spreader_progress",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this day's spreader log belongs to. Denormalized from the report so history can be queried per project without a join.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "report_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The daily report this spreader log belongs to. One row per report per equipment.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_reports"
          },
          "indexed": true,
          "label": "Report Id",
          "masking": {
            "masked": false
          },
          "name": "report_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "report_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "equipment_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The spreader unit this log came from. The non-native app keys on the equipment NAME; native uses the real id, matching every other jfb domain.",
          "fk_config": {
            "required": false,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_equipments"
          },
          "indexed": true,
          "label": "Equipment Id",
          "masking": {
            "masked": false
          },
          "name": "equipment_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "equipment_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "source_filename",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Filename of the uploaded Step Detail export, shown back to the PE so they can confirm the right day's file was ingested.",
          "indexed": false,
          "label": "Source Filename",
          "masking": {
            "masked": false
          },
          "name": "source_filename",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "source_filename",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "steps",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "The parsed Step Detail rows. Coverage is re-derived from these on every load rather than trusted from storage, so a change to the boundaries, lane plan or params reflows historical days automatically.",
          "indexed": false,
          "label": "Steps",
          "masking": {
            "masked": false
          },
          "name": "steps",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "steps",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "coverage",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Derived coverage rings per subarea x lift, banked so PRIOR days can be drawn without re-running the engine for every day of history.",
          "indexed": false,
          "label": "Coverage",
          "masking": {
            "masked": false
          },
          "name": "coverage",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "coverage",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "override_rings",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "A PM's hand-drawn coverage border. When present this replaces step-derived coverage entirely -- on a difficult day the drawn polygon IS the reportable coverage.",
          "indexed": false,
          "label": "Override Rings",
          "masking": {
            "masked": false
          },
          "name": "override_rings",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "override_rings",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "today_sqft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Square feet covered on this report date, denormalized so report lists need not parse the jsonb.",
          "indexed": false,
          "label": "Today SqFt",
          "masking": {
            "masked": false
          },
          "name": "today_sqft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "today_sqft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "cumulative_sqft",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Square feet covered from the start of the job through this report date.",
          "indexed": false,
          "label": "Cumulative SqFt",
          "masking": {
            "masked": false
          },
          "name": "cumulative_sqft",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "cumulative_sqft",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "chart_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Attachment fileId of the rendered Daily Spreader Progress Chart PNG. The daily PDF re-serves this rather than re-rendering, the same route the dredge and placement charts use.",
          "indexed": false,
          "label": "Chart Path",
          "masking": {
            "masked": false
          },
          "name": "chart_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "chart_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "generated_by_user_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Who last generated and saved the chart image.",
          "indexed": false,
          "label": "Generated By User Id",
          "masking": {
            "masked": false
          },
          "name": "generated_by_user_id",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "generated_by_user_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        }
      ],
      "slug": "jfb_spreader_progress",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Spreader Progress"
  },
  "jfb_user_signatures": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_user_signature",
      "domain_table_name": "jfb_user_signatures",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "user_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The Pivotly IAM user this default signature belongs to -- one row per user. No fk_config -- there is no local jfb_ domain representing platform users to target, matching the convention already used by jfb_report_photos.uploaded_by / jfb_weekly_summaries.edited_by.",
          "indexed": true,
          "label": "User Id",
          "masking": {
            "masked": false
          },
          "name": "user_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "user_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": true
        },
        {
          "column_name": "signature_image_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Attachment file id for this user's saved default signature image, set via the Safety tab's \"Also save as my default signature\" checkbox. Backs the \"Use my saved signature\" pre-fill on the preparer Sign-off block -- once accepted there, it's copied onto that report's own jfb_report_safety_v2.signature_image_path, so nothing downstream (including PDF generation) needs its own fallback logic.",
          "indexed": false,
          "label": "Signature Image Path",
          "masking": {
            "masked": false
          },
          "name": "signature_image_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "signature_image_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        }
      ],
      "slug": "jfb_user_signatures",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB User Signatures"
  },
  "jfb_water_monitoring_config": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_water_monitoring_config",
      "domain_table_name": "jfb_water_monitoring_config",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "One row per project. The project this water monitoring configuration belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "provider",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Data source for turbidity readings: 'hydrovu' (fixed-site) or 'wqdatalive' (NexSens, tidal sites). Defaults to 'hydrovu'.",
          "indexed": false,
          "label": "Provider",
          "masking": {
            "masked": false
          },
          "name": "provider",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "provider",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "timezone",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "IANA timezone the reporting window (window_start/window_end) is expressed in. Defaults to 'America/New_York'.",
          "indexed": false,
          "label": "Timezone",
          "masking": {
            "masked": false
          },
          "name": "timezone",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "timezone",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "window_start",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Local time-of-day (HH:MM:SS) the daily reporting window opens. Defaults to '06:00:00'.",
          "indexed": false,
          "label": "Window Start",
          "masking": {
            "masked": false
          },
          "name": "window_start",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "window_start",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "window_end",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Local time-of-day (HH:MM:SS) the daily reporting window closes. Defaults to '18:00:00'.",
          "indexed": false,
          "label": "Window End",
          "masking": {
            "masked": false
          },
          "name": "window_end",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "window_end",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "interval_minutes",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Expected spacing between readings, in minutes. Defaults to 15.",
          "indexed": false,
          "label": "Interval (minutes)",
          "masking": {
            "masked": false
          },
          "name": "interval_minutes",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "interval_minutes",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "locations",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Array of monitor locations: {role, label, hydrovu_location_id?, wqdatalive_device_id?, wqdatalive_device_name?, display_coords}. role is 'background'|'early_warning'|'compliance'|'upstream'|'downstream' -- the FUNCTIONAL role for fixed-site providers (HydroVu), or the PHYSICAL position for tidal sites (WQData LIVE) where the functional role is instead assigned per tide phase at report time.",
          "indexed": false,
          "label": "Monitor Locations",
          "masking": {
            "masked": false
          },
          "name": "locations",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "locations",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "thresholds",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "jsonb",
          "description": "Turbidity limit lines. Absolute/x-background style: {early_warning_ntu?, compliance_4hr_ntu?, compliance_1hr_ntu?, background_multiplier?}. Background-relative style (Penobscot TLC): {early_warning_delta_ntu?, compliance_delta_ntu?} -- when either delta is set the chart renders in 'delta mode' (line = background + delta) and skips the absolute/x-background lines.",
          "indexed": false,
          "label": "Thresholds",
          "masking": {
            "masked": false
          },
          "name": "thresholds",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "thresholds",
          "triggers_version_change": true,
          "type": "jsonb",
          "unique": false
        },
        {
          "column_name": "mode",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "'background' = baseline collection only (monitor series, no criterion lines or exceedance). 'compliance' = criterion lines + exceedance, plus the tide-aware background/compliance switch on tidal sites. Defaults to 'compliance'.",
          "indexed": false,
          "label": "Mode",
          "masking": {
            "masked": false
          },
          "name": "mode",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "mode",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "compliance_started_at",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "timestamp with time zone",
          "description": "When this project's water monitoring was last switched INTO compliance mode (mode = 'compliance'); cleared (NULL) when switched back to 'background'. Audit trail only -- no report or chart logic reads it. Written by the Water Quality tab's background/compliance toggle alongside mode. Carried over from the original app, where Penobscot went to compliance on 2026-08-20.",
          "indexed": false,
          "label": "Compliance Started At",
          "masking": {
            "masked": false
          },
          "name": "compliance_started_at",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "compliance_started_at",
          "triggers_version_change": true,
          "type": "timestamp with time zone",
          "unique": false
        },
        {
          "column_name": "aerial_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Annotated aerial site map showing monitor positions. Null = no aerial block on the page.",
          "indexed": false,
          "label": "Aerial Image Path",
          "masking": {
            "masked": false
          },
          "name": "aerial_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "aerial_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "active",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "boolean",
          "description": "Optional explicit disable switch for the Water Quality tab. Fails open, matching the reference app: this row's mere existence is the tab visibility gate -- a missing row hides the tab, but an existing row shows it unless active is explicitly set to false. Left unset (not required), same as a legacy/migrated row that predates this column.",
          "indexed": false,
          "label": "Active",
          "masking": {
            "masked": false
          },
          "name": "active",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "active",
          "triggers_version_change": true,
          "type": "boolean",
          "unique": false
        }
      ],
      "slug": "jfb_water_monitoring_config",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Water Monitoring Config"
  },
  "jfb_water_monitoring_notes": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_water_monitoring_note",
      "domain_table_name": "jfb_water_monitoring_notes",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this note belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "report_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "One row per report. The daily report this note/reference reading belongs to. Unique per report -- enforced at the domain level as defense-in-depth against a client-side race (e.g. switching report dates without leaving the Water Quality tab) issuing a duplicate create instead of an update.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_reports"
          },
          "indexed": true,
          "label": "Report Id",
          "masking": {
            "masked": false
          },
          "name": "report_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "report_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": true
        },
        {
          "column_name": "notes",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "PE's free-text narrative for the Water Quality page -- the one human input left on an otherwise auto-populated page.",
          "indexed": false,
          "label": "Notes",
          "masking": {
            "masked": false
          },
          "name": "notes",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "notes",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "reference_ntu",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "Daily turbidity reference (NTU) entered by the engineer; feeds the flat/background-relative limit lines on the chart.",
          "indexed": false,
          "label": "Reference NTU",
          "masking": {
            "masked": false
          },
          "name": "reference_ntu",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "reference_ntu",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        }
      ],
      "slug": "jfb_water_monitoring_notes",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Water Monitoring Notes"
  },
  "jfb_water_quality_readings": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_water_quality_reading",
      "domain_table_name": "jfb_water_quality_readings",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this reading belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "location_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Matches a locations[].label (or provider device id) inside this project's jfb_water_monitoring_config row. Not a domain FK -- locations are stored as a jsonb array on the config row rather than their own domain (see that domain's open question on normalizing this).",
          "indexed": true,
          "label": "Location Id",
          "masking": {
            "masked": false
          },
          "name": "location_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "location_id",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "role",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "background|early_warning|compliance|upstream|downstream -- the functional role this reading counted as at the time it was pulled.",
          "indexed": false,
          "label": "Role",
          "masking": {
            "masked": false
          },
          "name": "role",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "role",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "parameter",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The measured parameter. Defaults to 'turbidity'.",
          "indexed": false,
          "label": "Parameter",
          "masking": {
            "masked": false
          },
          "name": "parameter",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "parameter",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "unit",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Unit of value, e.g. 'NTU'.",
          "indexed": false,
          "label": "Unit",
          "masking": {
            "masked": false
          },
          "name": "unit",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "unit",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "value",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "numeric",
          "description": "The measured value.",
          "indexed": false,
          "label": "Value",
          "masking": {
            "masked": false
          },
          "name": "value",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "value",
          "triggers_version_change": true,
          "type": "numeric",
          "unique": false
        },
        {
          "column_name": "reading_at",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "timestamp with time zone",
          "description": "Timestamp the reading was taken (device/provider time, in UTC). Combined with project_id, location_id, and parameter, should be unique -- one reading per location per parameter per timestamp.",
          "indexed": true,
          "label": "Reading At",
          "masking": {
            "masked": false
          },
          "name": "reading_at",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "reading_at",
          "triggers_version_change": true,
          "type": "timestamp with time zone",
          "unique": false
        },
        {
          "column_name": "source",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Which provider produced this reading. Defaults to 'hydrovu'.",
          "indexed": false,
          "label": "Source",
          "masking": {
            "masked": false
          },
          "name": "source",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "source",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "fetched_at",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "timestamp with time zone",
          "description": "When this app pulled/ingested the reading -- may lag reading_at.",
          "indexed": false,
          "label": "Fetched At",
          "masking": {
            "masked": false
          },
          "name": "fetched_at",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "fetched_at",
          "triggers_version_change": true,
          "type": "timestamp with time zone",
          "unique": false
        }
      ],
      "slug": "jfb_water_quality_readings",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Water Quality Readings"
  },
  "jfb_weekly_summaries": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_weekly_summary",
      "domain_table_name": "jfb_weekly_summaries",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this weekly summary belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "week_start",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "Monday date of the Monday-Sunday production week this summary covers (matches the vanilla app's week convention for this feature -- the sibling Metrics feature uses Sunday-start weeks instead, a different convention, not a bug).",
          "indexed": true,
          "label": "Week Start",
          "masking": {
            "masked": false
          },
          "name": "week_start",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "week_start",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "section_key",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Which narrative section this weekly summary is for (e.g. \"mobilization_demobilization\", \"dredging_operations\") -- matches the project's narrative section config/defaults. One row per (project_id, week_start, section_key); the app is responsible for checking for an existing row before creating a new one, since this platform's domains don't enforce composite-unique constraints.",
          "indexed": true,
          "label": "Section Key",
          "masking": {
            "masked": false
          },
          "name": "section_key",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "section_key",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "content",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The PM's hand-written week-level summary for this section. Not the daily narrative text -- that's read live from jfb_report_narratives_v2 as reference only and never stored here.",
          "indexed": false,
          "label": "Content",
          "masking": {
            "masked": false
          },
          "name": "content",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "content",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "edited_by",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Pivotly user id of whoever last saved this section's summary. No fk_config -- there is no local jfb_ domain representing platform users to target.",
          "indexed": false,
          "label": "Edited By",
          "masking": {
            "masked": false
          },
          "name": "edited_by",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "edited_by",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "edited_at",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "timestamp with time zone",
          "description": "When this section's summary was last saved (autosave timestamp).",
          "indexed": false,
          "label": "Edited At",
          "masking": {
            "masked": false
          },
          "name": "edited_at",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "edited_at",
          "triggers_version_change": true,
          "type": "timestamp with time zone",
          "unique": false
        }
      ],
      "slug": "jfb_weekly_summaries",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Weekly Summaries"
  },
  "jfb_weekly_summary_photos": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_weekly_summary_photo",
      "domain_table_name": "jfb_weekly_summary_photos",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "project_id",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "The project this weekly photo belongs to.",
          "fk_config": {
            "required": true,
            "resolution_policy": "lookup_only",
            "target_attr": "id",
            "target_domain": "jfb_projects"
          },
          "indexed": true,
          "label": "Project Id",
          "masking": {
            "masked": false
          },
          "name": "project_id",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "project_id",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "week_start",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "date",
          "description": "Monday date of the Monday-Sunday production week this photo belongs to. Weekly photos aren't tied to a single daily report_id (unlike jfb_report_photos) -- project_id + week_start is their scope.",
          "indexed": true,
          "label": "Week Start",
          "masking": {
            "masked": false
          },
          "name": "week_start",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "week_start",
          "triggers_version_change": true,
          "type": "date",
          "unique": false
        },
        {
          "column_name": "photo_number",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "integer",
          "description": "Which of the week's 2 photo slots this is (1 or 2).",
          "indexed": false,
          "label": "Photo Number",
          "masking": {
            "masked": false
          },
          "name": "photo_number",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "photo_number",
          "triggers_version_change": true,
          "type": "integer",
          "unique": false
        },
        {
          "column_name": "photo_file_path",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The Pivotly attachment file id returned by uploadAttachment(), NOT a raw storage path. Same two-step flow as jfb_report_photos: create this row first, upload the file with coreRecordId = this row's id and domain = 'jfb_weekly_summary_photos', then write the returned fileId here. downloadAttachment(photo_file_path) resolves it back to the file for preview/download.",
          "indexed": false,
          "label": "Photo File Path",
          "masking": {
            "masked": false
          },
          "name": "photo_file_path",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "photo_file_path",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "original_file_name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The file's name as picked by the uploader, before it's renamed to a unique storage name to avoid Pivotly's (folder_id, logical_name, storage_location) collision constraint -- same withUniqueName() pattern as jfb_report_photos.",
          "indexed": false,
          "label": "Original File Name",
          "masking": {
            "masked": false
          },
          "name": "original_file_name",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "original_file_name",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "label",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "Caption for the photo.",
          "indexed": false,
          "label": "Label",
          "masking": {
            "masked": false
          },
          "name": "label",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "label",
          "triggers_version_change": true,
          "type": "text",
          "unique": false
        },
        {
          "column_name": "uploaded_by",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "uuid",
          "description": "Pivotly user id of whoever uploaded this photo. No fk_config -- there is no local jfb_ domain representing platform users to target.",
          "indexed": false,
          "label": "Uploaded By",
          "masking": {
            "masked": false
          },
          "name": "uploaded_by",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "uploaded_by",
          "triggers_version_change": true,
          "type": "uuid",
          "unique": false
        },
        {
          "column_name": "uploaded_date_time",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "timestamp with time zone",
          "description": "When the photo was uploaded.",
          "indexed": false,
          "label": "Uploaded Date Time",
          "masking": {
            "masked": false
          },
          "name": "uploaded_date_time",
          "nullable": true,
          "pii": false,
          "required": false,
          "slug": "uploaded_date_time",
          "triggers_version_change": true,
          "type": "timestamp with time zone",
          "unique": false
        }
      ],
      "slug": "jfb_weekly_summary_photos",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Weekly Summary Photos"
  },
  "jfb_work_types": {
    "cfg_data": {
      "access_control": {
        "delete_access": true,
        "direct_write_enabled": true,
        "hard_delete_allowed": true,
        "insert_access": true,
        "model": "all_systems",
        "read_access": true,
        "update_access": true
      },
      "archive": true,
      "archive_policy": {
        "max_record_versions": 10000,
        "retention_days": 365
      },
      "contact": {
        "name": "System Administrator"
      },
      "default_conflict_resolution": {
        "code": "lww",
        "human_readable": "Last Write Wins"
      },
      "domain_name_singular": "jfb_work_type",
      "domain_table_name": "jfb_work_types",
      "multi_tenant": false,
      "schema": [
        {
          "column_name": "name",
          "conflict_resolution": {
            "code": "lww"
          },
          "data_type": "text",
          "description": "The work-type / discipline label, e.g. \"Hydraulic Dredging\". Globally unique.",
          "indexed": true,
          "label": "Name",
          "masking": {
            "masked": false
          },
          "name": "name",
          "nullable": false,
          "pii": false,
          "required": true,
          "slug": "name",
          "triggers_version_change": true,
          "type": "text",
          "unique": true
        }
      ],
      "slug": "jfb_work_types",
      "track_versions": true,
      "xref_enabled": true
    },
    "name": "JFB Work Types"
  }
}
'''

DOMAIN_ITEMS = json.loads(_RAW_DOMAINS_JSON)

ALL_ITEM_SLUGS = list(DOMAIN_ITEMS.keys())


def resolve_item_scope(item_scope):
    raw = str(item_scope or "all").strip()
    if raw == "" or raw.lower() == "all":
        return list(ALL_ITEM_SLUGS), []

    requested = [item.strip() for item in raw.split(",") if item.strip()]
    known = [slug for slug in requested if slug in DOMAIN_ITEMS]
    unknown = [slug for slug in requested if slug not in DOMAIN_ITEMS]
    return known, unknown


def item_configs(item_scope="all"):
    slugs, unknown = resolve_item_scope(item_scope)
    items = []
    for slug in slugs:
        entry = DOMAIN_ITEMS[slug]
        items.append({
            "slug": slug,
            "name": entry["name"],
            "cfg_data": entry["cfg_data"],
        })
    return items, unknown


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
                "The Allowed Secrets grant resolved but the Variable is empty. "
                "Store the actual credential value, not a secret ID."
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


def stable_uuid(label):
    return str(uuid.uuid5(SCRIPT_NAMESPACE, label))


def lookup_domain_by_slug(api, slug):
    endpoint = "/api/v3/config-items/" + DOMAIN_ITEM_TYPE + "/by-slug/" + slug
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


def existing_cfg_data(existing):
    raw = (existing or {}).get("cfg_data")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = {}
    return raw if isinstance(raw, dict) else {}


def schema_columns(schema):
    return {a.get("column_name") for a in schema if isinstance(a, dict)}


def reconcile_cfg_data_for_existing(cfg_data, existing):
    notes = []

    existing_types = {}
    for item in existing_cfg_data(existing).get("schema") or []:
        if isinstance(item, dict):
            col = str(item.get("column_name") or item.get("name") or "").strip()
            dtype = str(item.get("data_type") or "").strip()
            if col and dtype:
                existing_types[col] = dtype

    if not existing_types:
        return cfg_data, notes

    new_cfg = json.loads(json.dumps(cfg_data))
    for item in new_cfg.get("schema") or []:
        col = str(item.get("column_name") or item.get("name") or "").strip()
        proposed = str(item.get("data_type") or "").strip()
        current = existing_types.get(col, "")
        if current and proposed and current.lower() != proposed.lower():
            item["data_type"] = current
            notes.append("preserved_data_type:" + col + ":" + proposed + "->" + current)

    return new_cfg, notes


def save_domain(api, slug, name, cfg_data, existing=None):
    if existing is None:
        existing = lookup_domain_by_slug(api, slug)
    existing_id = str(existing.get("id") or "").strip()

    cfg_data, notes = reconcile_cfg_data_for_existing(cfg_data, existing)

    item_id = existing_id or stable_uuid("config:" + DOMAIN_ITEM_TYPE + ":" + slug)
    action = "updated_existing_by_slug_id_driven" if existing_id else "created_by_deterministic_id"

    payload = {
        "parameters": {"id": item_id},
        "data": {
            "id": item_id,
            "slug": slug,
            "item_type": DOMAIN_ITEM_TYPE,
            "name": name,
            "description": "JFB managed " + DOMAIN_ITEM_TYPE + ": " + slug,
            "enabled": True,
            "version": int(existing.get("version") or 1),
            "cfg_data": cfg_data,
        },
    }

    endpoint = "/api/v3/config-items/" + DOMAIN_ITEM_TYPE + "/" + item_id
    response = api._request("PATCH", endpoint, data=payload)

    return {
        "action": action,
        "id": item_id,
        "existing_id": existing_id,
        "slug": slug,
        "cfg_data_reconciliation": notes,
        "data": response.get("data") if isinstance(response, dict) else response,
    }


def result(name, ok, message, count=0, details=None):
    return {
        "name": name,
        "ok": bool(ok),
        "message": message,
        "count": int(count),
        "details": details or {},
    }


def _reserved_name_check(attrs):
    return [
        a.get("name") for a in attrs
        if str(a.get("name") or "").lower() in RESERVED_ATTRIBUTE_NAMES
        or str(a.get("name") or "").startswith("_")
        or str(a.get("name") or "").startswith("sys_")
        or str(a.get("name") or "").startswith("p_")
    ]


def check_domain_item(slug, cfg_data):
    failures = []
    warnings = []

    table_name = cfg_data.get("domain_table_name") or ""
    if table_name != slug:
        failures.append("domain_table_name_mismatch:" + table_name)
    if not slug.startswith("jfb_"):
        failures.append("slug_missing_jfb_prefix")

    attrs = cfg_data.get("schema")
    if not isinstance(attrs, list) or not attrs:
        failures.append("empty_or_missing_schema")
        attrs = []

    reserved_hits = _reserved_name_check(attrs)
    if reserved_hits:
        failures.append("reserved_attribute_names:" + ",".join(reserved_hits))

    for a in attrs:
        if not a.get("column_name") or not a.get("data_type"):
            failures.append("attribute_missing_column_name_or_data_type:" + str(a.get("name")))

    if not any(a.get("unique") is True for a in attrs):
        warnings.append("no_unique_business_key_relies_on_platform_id")

    return failures, warnings, {"slug": slug, "attribute_count": len(attrs)}


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
        failures, warnings, info = check_domain_item(item["slug"], item["cfg_data"])
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
            "param_contract_version": config["param_contract_version"],
            "param_contract_version_ok": config["param_contract_version"] == PARAM_CONTRACT_VERSION,
            "accepted_param_names": list(PUBLIC_RUNNER_PARAMS),
            "accepted_param_count": len(PUBLIC_RUNNER_PARAMS),
            "dry_run": config["dry_run"],
            "token_ready": token_ready,
            "write_ready": token_ready and not all_failures,
            "pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC),
            "diagnostics": {"failures": all_failures, "warnings": all_warnings},
        },
    )


def build_additive_schema(existing_schema, target_schema):
    existing_cols = schema_columns(existing_schema)

    merged = list(existing_schema)
    for attr in target_schema:
        if not isinstance(attr, dict) or attr.get("column_name") in existing_cols:
            continue
        safe_attr = dict(attr)
        safe_attr["nullable"] = True
        safe_attr["required"] = False
        safe_attr["unique"] = False
        safe_attr["indexed"] = False
        merged.append(safe_attr)

    return merged


def migrate_additive_one(api, slug, name, target_cfg_data):
    existing = lookup_domain_by_slug(api, slug)
    if not existing.get("id"):
        return save_domain(api, slug, name, target_cfg_data, existing), False

    raw_existing_cfg = existing_cfg_data(existing)
    merged_schema = build_additive_schema(
        raw_existing_cfg.get("schema") or [],
        target_cfg_data.get("schema") or [],
    )

    phase_cfg_data = dict(raw_existing_cfg)
    phase_cfg_data["schema"] = merged_schema

    return save_domain(api, slug, name, phase_cfg_data, existing), True


def save_domain_item_auto_reconcile(api, slug, name, target_cfg_data):
    existing = lookup_domain_by_slug(api, slug)
    if not existing.get("id"):
        save_result = save_domain(api, slug, name, target_cfg_data, existing)
        save_result["auto_reconcile_phase"] = "direct_new_record"
        return save_result

    raw_existing_cfg = existing_cfg_data(existing)
    existing_schema = raw_existing_cfg.get("schema") or []
    target_schema = target_cfg_data.get("schema") or []
    columns_being_removed = schema_columns(existing_schema) - schema_columns(target_schema)

    if not columns_being_removed:
        save_result = save_domain(api, slug, name, target_cfg_data, existing)
        save_result["auto_reconcile_phase"] = "direct_no_columns_removed"
        return save_result

    phase_cfg_data = dict(raw_existing_cfg)
    phase_cfg_data["schema"] = build_additive_schema(existing_schema, target_schema)
    additive_step = save_domain(api, slug, name, phase_cfg_data, existing)

    final_result = save_domain(api, slug, name, target_cfg_data)
    final_result["auto_reconcile_phase"] = "additive_then_target"
    final_result["auto_reconcile_additive_step"] = additive_step
    return final_result


def migrate_additive(config):
    items, unknown_slugs = item_configs(config["item_scope"])

    if unknown_slugs:
        return result(
            "migrate_additive",
            False,
            "item_scope named slugs this script doesn't know about.",
            0,
            {"unknown_item_scope_slugs": unknown_slugs, "all_item_slugs": list(ALL_ITEM_SLUGS)},
        )

    if config["dry_run"]:
        api = get_pivotly_api_safe()
        preview = []
        for it in items:
            entry = {"slug": it["slug"]}
            if api is None:
                entry["plan"] = "no_api_in_this_context -> cannot preview against live state"
                preview.append(entry)
                continue
            try:
                existing = lookup_domain_by_slug(api, it["slug"])
            except Exception as exc:
                entry["plan"] = "lookup_failed"
                entry["error"] = safe_text(exc, 300)
                preview.append(entry)
                continue
            if not existing.get("id"):
                entry["plan"] = "no_existing_record -> would be saved directly with target cfg_data"
                preview.append(entry)
                continue
            existing_cols = schema_columns(existing_cfg_data(existing).get("schema") or [])
            target_cols = schema_columns(it["cfg_data"].get("schema") or [])
            entry["plan"] = "additive_merge"
            entry["columns_to_add_nullable"] = sorted(target_cols - existing_cols)
            entry["existing_columns_kept_for_now"] = sorted(existing_cols - target_cols)
            preview.append(entry)

        return result(
            "migrate_additive",
            True,
            "Dry run: additive-merge plan for " + str(len(items)) + " domain(s). No writes performed.",
            len(items),
            {"item_scope": config["item_scope"], "preview": preview, "dry_run": True},
        )

    api = get_pivotly_api_safe()
    if api is None:
        return result(
            "migrate_additive",
            False,
            "Pivotly API helper is not configured in this runner context.",
            0,
            {"pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC)},
        )

    errors = []
    saved = {}
    migrated = []
    created = []

    for it in items:
        slug = it["slug"]
        try:
            save_result, was_migration = migrate_additive_one(api, slug, it["name"], it["cfg_data"])
            saved[slug] = save_result
            (migrated if was_migration else created).append(slug)
        except Exception as exc:
            errors.append(slug + ": " + safe_text(exc, 1200))

    if errors:
        message = "Additive migration completed with errors."
    else:
        message = (
            "Additive migration applied for " + str(len(saved)) + " domain(s) ("
            + str(len(migrated)) + " migrated in place, " + str(len(created)) + " created directly). "
            "Run mode=bootstrap_only next to apply the true target schema -- it now only needs to drop "
            "the now-superseded old column(s) and tighten the newly-added one(s), instead of doing "
            "the add + drop + tighten together in one PATCH."
        )

    return result(
        "migrate_additive",
        len(errors) == 0,
        message,
        len(saved),
        {
            "item_scope": config["item_scope"],
            "items_attempted": [it["slug"] for it in items],
            "items_saved": list(saved.keys()),
            "save_results": saved,
            "migrated_in_place": migrated,
            "created_directly": created,
            "errors": errors,
        },
    )


def publish_domain(api, slug):
    method = getattr(api, "domain_publish", None)
    if method is None:
        raise RuntimeError("PivotlyAPI has no domain_publish() method in this runner context.")
    return method(slug)


def bootstrap_only_message_and_next_step(errors, published, publish_config_requested):
    if errors and published:
        message = (
            str(len(published)) + " domain(s) saved and published; " + str(len(errors))
            + " error(s) on the rest -- see errors. Already-published domains in this batch"
            " do not need to be rerun."
        )
    elif errors:
        message = "Bootstrap completed with errors."
    elif published:
        message = "Domains saved and published for " + str(len(published)) + " domain(s)."
    elif publish_config_requested:
        message = "Nothing was saved -- item_scope resolved to no domains."
    else:
        message = (
            "Domains saved but NOT published, because publish_config resolved to false"
            " (see param_resolution.publish_config for whether the Portal sent that or it fell back"
            " to the default). To publish, either re-run with publish_config=true, or run"
            " mode=publish_only with dry_run=false."
        )

    if published and not errors:
        next_step = "none"
    elif published:
        next_step = (
            "resolve the errors below for the remaining domain(s); everything already"
            " listed under published is done and does not need to be rerun"
        )
    else:
        next_step = "run mode=publish_only with dry_run=false (or bootstrap_only with publish_config=true)"

    return message, next_step


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

    if config["dry_run"]:
        return result(
            "bootstrap_only",
            True,
            "Dry run validated the bootstrap plan for "
            + str(len(items)) + " domain(s); no config-item write or publish attempted.",
            len(items),
            {
                "item_scope": config["item_scope"],
                "items": [{"slug": it["slug"], "name": it["name"]} for it in items],
                "publish_config": config["publish_config"],
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

    if config["param_contract_version"] != PARAM_CONTRACT_VERSION:
        warnings.append(
            "param_contract_version_mismatch:expected=" + PARAM_CONTRACT_VERSION
            + ",received=" + str(config["param_contract_version"])
        )

    for it in items:
        slug = it["slug"]
        try:
            saved[slug] = save_domain_item_auto_reconcile(api, slug, it["name"], it["cfg_data"])
        except Exception as exc:
            errors.append(slug + ": " + safe_text(exc, 1200))

    if config["publish_config"]:
        for it in items:
            slug = it["slug"]
            if slug not in saved:
                continue
            try:
                publish_domain(api, slug)
                published.append(slug)
            except Exception as exc:
                errors.append(slug + "/publish: " + safe_text(exc, 1200))

    unsaved = [it["slug"] for it in items if it["slug"] not in saved]

    message, next_step = bootstrap_only_message_and_next_step(errors, published, config["publish_config"])

    return result(
        "bootstrap_only",
        len(errors) == 0,
        message,
        len(saved),
        {
            "item_scope": config["item_scope"],
            "items_attempted": [it["slug"] for it in items],
            "items_saved": list(saved.keys()),
            "items_not_saved": unsaved,
            "save_results": saved,
            "published": published,
            "publish_config": config["publish_config"],
            "record_writes_ready": bool(published),
            "next_step": next_step,
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
            "Dry run: would publish " + str(len(items)) + " domain(s). Re-run with dry_run=false to publish.",
            0,
            {
                "item_scope": config["item_scope"],
                "items": [it["slug"] for it in items],
                "published": False,
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

    for it in items:
        slug = it["slug"]
        try:
            existing = lookup_domain_by_slug(api, slug)
        except Exception as exc:
            errors.append(slug + "/lookup: " + safe_text(exc, 1200))
            continue

        if not existing.get("id"):
            not_found.append(slug)
            continue

        try:
            publish_domain(api, slug)
            published.append(slug)
        except Exception as exc:
            errors.append(slug + "/publish: " + safe_text(exc, 1200))

    if not_found and not errors and not published:
        message = "No saved domain found for any slug in scope. Run bootstrap_only with dry_run=false first."
    elif errors:
        message = "Publish completed with errors."
    else:
        message = "Domains published; runtime tables generated for " + str(len(published)) + " domain(s)."

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
            "record_writes_ready": bool(published),
            "errors": errors,
        },
    )


def run(config):
    if config["mode"] == "bootstrap_only":
        output = bootstrap_only(config)
    elif config["mode"] == "publish_only":
        output = publish_only(config)
    elif config["mode"] == "migrate_additive":
        output = migrate_additive(config)
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

    return output


def main():
    print(json.dumps(run(load_config()), sort_keys=True))
    return 0


raise SystemExit(main())
