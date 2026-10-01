import base64
import json
from datetime import datetime, timezone

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


SCRIPT_VERSION = "v1-jfb-monitoring-test-seed-r5"

PARAM_CONTRACT_VERSION = "jfb_monitoring_test_seed_params_v1"

STABLE_PARAM_CONTRACT = [
    {"name": "mode", "type": "TEXT", "default": "self_check"},
    {"name": "param_contract_version", "type": "TEXT", "default": PARAM_CONTRACT_VERSION},
    {"name": "dry_run", "type": "BOOLEAN", "default": True},
    {"name": "include_history", "type": "BOOLEAN", "default": True},
    {"name": "output_shape", "type": "TEXT", "default": "summary"},
]

PUBLIC_RUNNER_PARAMS = [item["name"] for item in STABLE_PARAM_CONTRACT]

VALID_MODES = ["self_check", "seed_only"]

PARAM_DEBUG = {}

TOKEN_ENDPOINT = "https://login.microsoftonline.com/856436c2-a60d-486d-bca3-9c1367fa632a/oauth2/v2.0/token"
API_SCOPE = "api://1a10b2a3-2fbf-4cc8-b32c-634766e1172b/.default"
CLIENT_ID_SECRET = "jfb-pivotly-api-client-id"
CLIENT_SECRET_SECRET = "jfb-pivotly-api-client-secret"

CORE_DATA_SYSTEM = "core"

PIVOTLY_API_DIAGNOSTIC = {}

SECRET_ERROR_REMEDIATION = {
    "secret_not_allowed": (
        "No approved Allowed Secrets row for this script. Admin -> Variables -> Allowed Secrets: "
        "Consumer Type=script, Consumer Slug=<this script's slug>, Variable Slug=<secret slug>, Status=approved."
    ),
    "secret_not_found": (
        "The Runner reports every failed secret read this way, so check all of these in this instance: "
        "the Secret Variable exists under exactly this slug; an approved Allowed Secrets row names this "
        "script's slug; and the value has been re-entered and saved, since saving is what writes it to the vault."
    ),
    "runner_signed_token_rejected": (
        "The runner signed-token was rejected for this job. Re-run from the Portal "
        "rather than replaying an old job, and confirm the script record is enabled."
    ),
    "secret_accessor_missing": "Unexpected Secret wrapper shape; report the runner version.",
    "secret_read_exception": "Inspect error_detail in secret_reads for the raw runner message.",
}

TOKEN_CLAIMS_TO_SHOW = ["aud", "iss", "ver", "tid", "appid", "azp", "roles", "scp", "exp"]

PROJECTS = [
    {
        "name": "Torch Lake - LLRA",
        "project_code": 152601,
        "client_name": "U.S. EPA",
        "work_type": "Mechanical Dredging",
        "is_active": True,
        "start_date": "2026-05-18T00:00:00Z",
        "production_start_date": "2026-07-20",
        "report_timezone": "America/Detroit",
        "site_city": "Lake Linden",
        "site_state": "MI",
        "latitude": 47.1922,
        "longitude": -88.4039,
        "show_ssho_field": True,
        "show_next_day_summary": True,
    },
    {
        "name": "Penobscot Thin Layer Cap Pilot",
        "project_code": 152505,
        "client_name": "Greenfield Trust",
        "work_type": "Hydraulic Capping",
        "primary_measure": "SF",
        "is_active": True,
        "start_date": "2026-08-04T00:00:00Z",
        "end_date": "2026-08-31",
        "production_start_date": "2026-08-17",
        "volume_goal": 260085,
        "cap_conversion_factor": 1.4,
        "is_pipe_tracking": True,
        "report_timezone": "America/New_York",
        "site_city": "Orrington",
        "site_state": "ME",
        "latitude": 44.7206,
        "longitude": -68.8195,
        "show_next_day_summary": True,
    },
]

WATER_CONFIGS = [
    {
        "project_code": 152601,
        "row": {
            "provider": "hydrovu",
            "timezone": "America/New_York",
            "window_start": "06:00:00",
            "window_end": "18:00:00",
            "interval_minutes": 15,
            "locations": [
                {"role": "background", "label": "Background", "hydrovu_location_id": "6462853912002560", "display_coords": "25896909.367, 879137.739"},
                {"role": "early_warning", "label": "Early Warning", "hydrovu_location_id": "6346553277612032", "display_coords": "25896951.781, 879902.99"},
                {"role": "compliance", "label": "Compliance", "hydrovu_location_id": "5732313999147008", "display_coords": "25896925.262, 879554.957"},
            ],
            "thresholds": {"early_warning_ntu": 13, "compliance_4hr_ntu": 26, "compliance_1hr_ntu": 50, "background_multiplier": 1.5},
            "mode": "compliance",
            "active": True,
        },
    },
    {
        "project_code": 152505,
        "row": {
            "provider": "wqdatalive",
            "timezone": "America/New_York",
            "window_start": "00:00:00",
            "window_end": "23:00:00",
            "interval_minutes": 60,
            "locations": [
                {"role": "upstream", "label": "Upstream", "wqdatalive_device_id": 5566, "wqdatalive_device_name": "Upstream", "display_coords": "898353.02, 385454.87", "depth_ft": 3},
                {"role": "downstream", "label": "Downstream", "wqdatalive_device_id": 5565, "wqdatalive_device_name": "Downstream", "display_coords": "897818.417, 383408.412", "depth_ft": 3},
            ],
            "thresholds": {"early_warning_delta_ntu": 20, "compliance_delta_ntu": 35},
            "mode": "compliance",
            "compliance_started_at": "2026-08-20T22:48:03Z",
            "active": True,
        },
    },
]

AIR_CONFIGS = [
    {
        "project_code": 152601,
        "row": {
            "provider": "ecomzen",
            "base_url": "https://sgsusa-ws.i-comesure.com",
            "timezone": "America/New_York",
            "window_start": "06:00:00",
            "window_end": "18:00:00",
            "interval_minutes": 15,
            "stations": [
                {"key": "nw_beach", "label": "Background (NW Beach)", "sensor_id": "17764", "chart": "llra", "role": "background"},
                {"key": "ne_beach", "label": "Downwind (NE Beach)", "sensor_id": "16804", "chart": "llra"},
                {"key": "south_beach", "label": "South Beach (Perimeter)", "sensor_id": "16858", "chart": "llra"},
                {"key": "mbp_entrance", "label": "Entrance Gate (St. 4)", "sensor_id": "16559", "chart": "mbp"},
                {"key": "spa_south_fence", "label": "SPA South Fence (St. 5)", "sensor_id": "17767", "chart": "mbp"},
            ],
            "thresholds": {"alert_offset_mgm3": 0.10, "action_offset_mgm3": 0.15, "early_warning_mgm3": 1.0, "not_to_exceed_mgm3": 3.92},
            "equipment_text": "SGS Galson SmartSense (NextPM particulate sensor) — five (5) PM10 real-time monitors deployed at perimeter beaches, SPA Entrance Gate, and SPA South Fence.",
            "calibration_text": "Sensors zero/span calibrated per SGS Galson manufacturer specifications.",
            "notes_text": "Five (5) PM10 stations operated continuously: NW Beach (Background/Upwind), NE Corner Beach (Downwind), South Beach (Perimeter), MBP Entrance Gate (Station 4 — early warning), SPA South Fence (Station 5 — early warning). All readings are displayed as 15-minute time-weighted average concentrations.",
        },
    },
]

REPORTS = [
    {"project_code": 152601, "report_date": "2026-09-20"},
    {"project_code": 152601, "report_date": "2026-09-21"},
    {"project_code": 152601, "report_date": "2026-09-27"},
    {"project_code": 152505, "report_date": "2026-09-13"},
    {"project_code": 152505, "report_date": "2026-09-14"},
]

STEPS = ["jfb_projects", "jfb_water_monitoring_config", "jfb_air_monitoring_config", "jfb_reports"]


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
        "include_history": parse_bool(param_value("include_history", BOOLEAN, True), True),
        "output_shape": str(param_value("output_shape", TEXT, "summary")),
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


def token_claims(token):
    try:
        payload = str(token or "").split(".")[1]
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")).decode("utf-8"))
    except Exception as exc:
        return {"decode_error": safe_text(exc)}
    return {key: claims.get(key) for key in TOKEN_CLAIMS_TO_SHOW if key in claims}


def get_pivotly_api_safe():
    global PIVOTLY_API_DIAGNOSTIC
    PIVOTLY_API_DIAGNOSTIC = {
        "stage": "start",
        "token_status": "",
        "token_error": "",
        "token_error_description": "",
        "secret_reads": {},
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
                "The secret read worked but the Variable is empty. Store the actual credential value, not a secret ID."
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
            return None

        PIVOTLY_API_DIAGNOSTIC["stage"] = "token_ready"
        PIVOTLY_API_DIAGNOSTIC["token_claims"] = token_claims(body.get("access_token"))

        api = PivotlyAPI(
            client_id=client_id,
            client_secret=client_secret,
            token_endpoint=TOKEN_ENDPOINT,
            api_scope=API_SCOPE,
        )
        api._access_token = body.get("access_token")
        PIVOTLY_API_DIAGNOSTIC["stage"] = "ok"
        return api
    except Exception as exc:
        PIVOTLY_API_DIAGNOSTIC["token_error"] = "exception:" + type(exc).__name__
        PIVOTLY_API_DIAGNOSTIC["token_error_description"] = safe_text(exc)
        return None


def extract_rows(response):
    if isinstance(response, list):
        return response
    if isinstance(response, dict):
        data = response.get("data")
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for key in ("data", "rows"):
                if isinstance(data.get(key), list):
                    return data[key]
    return []


def read_records(api, domain, filters=None, limit=1000):
    parameters = {"domain": domain, "system": CORE_DATA_SYSTEM, "limit": limit, "offset": 0}
    if filters:
        parameters["filters"] = filters
    return extract_rows(api._request("POST", "/api/v3/core-data-read", data={"parameters": parameters}))


def insert_record(api, domain, record):
    payload = {
        "parameters": {
            "domain": domain,
            "system": CORE_DATA_SYSTEM,
            "operation": "insert",
            "latency": "synchronous",
        },
        "data": record,
    }
    response = api._request("POST", "/api/v3/core-data-write", data=payload)
    if isinstance(response, dict) and str(response.get("result", "success")).lower() == "error":
        raise RuntimeError("core-data-write failed: " + safe_text(response.get("message") or response))
    return response


def result(name, ok, message, count=0, details=None):
    return {
        "name": name,
        "ok": bool(ok),
        "message": message,
        "count": int(count),
        "details": details or {},
    }


def project_ids_by_code(api):
    codes = [p["project_code"] for p in PROJECTS]
    found = {}
    for record in read_records(api, "jfb_projects"):
        try:
            code = int(record.get("project_code"))
        except (TypeError, ValueError):
            continue
        if code in codes and record.get("id") and code not in found:
            found[code] = record["id"]
    return found


def seed_projects(api, dry_run, step):
    ids = project_ids_by_code(api)
    for project in PROJECTS:
        code = project["project_code"]
        if code in ids:
            step["already_present"].append(code)
            continue
        if dry_run:
            step["would_create"].append(code)
            continue
        try:
            insert_record(api, "jfb_projects", dict(project))
            step["created"].append(code)
        except Exception as exc:
            step["errors"].append(str(code) + ": " + safe_text(exc, 800))
    if not dry_run and step["created"]:
        ids = project_ids_by_code(api)
    return ids


def seed_configs(api, domain, configs, ids, dry_run, step):
    for entry in configs:
        code = entry["project_code"]
        project_id = ids.get(code)
        label = str(code) + ":" + entry["row"]["provider"]
        if not project_id:
            if dry_run:
                step["would_create"].append(label + " (after its project is created)")
            else:
                step["errors"].append(label + ": project not found on this environment")
            continue
        existing = read_records(api, domain, {"project_id": project_id})
        if existing:
            step["already_present"].append(label)
            continue
        if dry_run:
            step["would_create"].append(label)
            continue
        record = dict(entry["row"])
        record["project_id"] = project_id
        try:
            insert_record(api, domain, record)
            step["created"].append(label)
        except Exception as exc:
            step["errors"].append(label + ": " + safe_text(exc, 800))


def seed_reports(api, ids, dry_run, step):
    for entry in REPORTS:
        code = entry["project_code"]
        project_id = ids.get(code)
        label = str(code) + ":" + entry["report_date"]
        if not project_id:
            if dry_run:
                step["would_create"].append(label + " (after its project is created)")
            else:
                step["errors"].append(label + ": project not found on this environment")
            continue
        existing = read_records(api, "jfb_reports", {"project_id": project_id, "report_date": entry["report_date"]})
        if existing:
            step["already_present"].append(label)
            continue
        if dry_run:
            step["would_create"].append(label)
            continue
        try:
            insert_record(api, "jfb_reports", {"project_id": project_id, "report_date": entry["report_date"], "status": "draft"})
            step["created"].append(label)
        except Exception as exc:
            step["errors"].append(label + ": " + safe_text(exc, 800))


def new_step():
    return {"already_present": [], "would_create": [], "created": [], "errors": []}


HISTORY_STEPS = [
    "jfb_project_area_levels", "jfb_project_areas", "jfb_equipments", "jfb_operators", "jfb_project_operators",
    "jfb_project_attachments", "jfb_project_delay_codes", "jfb_project_layers", "jfb_project_materials",
    "jfb_project_site_equipment", "jfb_metrics", "jfb_project_report_narratives", "jfb_reports_history",
    "jfb_daily_activities", "jfb_report_metric_value", "jfb_report_narratives_v2", "jfb_report_crew_summary_v2",
    "jfb_report_safety_v2", "jfb_production_stats", "jfb_air_monitoring_daily", "jfb_water_monitoring_notes",
]

HISTORY_ERROR_LIMIT = 25
READ_PAGE_SIZE = 1000


class Unresolved(Exception):
    pass


def new_history_step():
    return {"already_present": 0, "would_create": 0, "created": 0, "errors": [], "error_count": 0}


def pending_id(domain, key):
    return "pending:" + domain + ":" + str(key)


def is_pending(value):
    if isinstance(value, str):
        return value.startswith("pending:")
    if isinstance(value, dict):
        return any(is_pending(v) for v in value.values())
    if isinstance(value, (list, tuple)):
        return any(is_pending(v) for v in value)
    return False


def lower(value):
    return str(value or "").strip().lower()


def norm_date(value):
    return str(value or "")[:10]


def norm_ts(value):
    text = str(value or "").strip().replace(" ", "T", 1)
    if not text:
        return ""
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return text
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def as_json(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return value
    return value


def compact(record):
    return {k: v for k, v in record.items() if v is not None}


def read_all(api, domain, filters=None):
    rows, offset = [], 0
    while True:
        parameters = {"domain": domain, "system": CORE_DATA_SYSTEM, "limit": READ_PAGE_SIZE, "offset": offset}
        if filters:
            parameters["filters"] = filters
        page = extract_rows(api._request("POST", "/api/v3/core-data-read", data={"parameters": parameters}))
        rows.extend(page)
        if len(page) < READ_PAGE_SIZE:
            return rows
        offset += READ_PAGE_SIZE


def scoped_read(api, domain, filters):
    cleaned = {}
    for field, value in (filters or {}).items():
        if isinstance(value, list):
            value = [v for v in value if not is_pending(v)]
            if not value:
                return []
        elif is_pending(value):
            return []
        cleaned[field] = value
    return read_all(api, domain, cleaned or None)


def add_error(step, message):
    step["error_count"] += 1
    if len(step["errors"]) < HISTORY_ERROR_LIMIT:
        step["errors"].append(safe_text(message, 600))


def seed_history_rows(ctx, step_name, domain, items, read_filters, record_key, plan):
    api, dry_run = ctx["api"], ctx["dry_run"]
    step = ctx["steps"][step_name]

    def load_existing():
        found = {}
        for record in scoped_read(api, domain, read_filters):
            found.setdefault(record_key(record), record.get("id"))
        return found

    existing = load_existing()
    created_any = False
    for item in items:
        try:
            key, record = plan(item)
        except Unresolved as exc:
            add_error(step, str(exc))
            continue
        if key in existing:
            if not is_pending(existing[key]):
                step["already_present"] += 1
            continue
        if dry_run or is_pending(record):
            if not dry_run:
                add_error(step, str(key) + ": a parent row was not created")
                continue
            step["would_create"] += 1
            existing[key] = pending_id(domain, key)
            continue
        try:
            insert_record(api, domain, compact(record))
            step["created"] += 1
            created_any = True
            existing[key] = pending_id(domain, key)
        except Exception as exc:
            add_error(step, str(key) + ": " + safe_text(exc, 500))
    if created_any:
        refreshed = load_existing()
        for key, value in existing.items():
            if key not in refreshed:
                refreshed[key] = value
        existing = refreshed
    return existing


def reference_maps(api):
    work_types = {lower(r.get("name")): r.get("id") for r in read_all(api, "jfb_work_types")}
    delay_codes = {}
    for r in read_all(api, "jfb_delay_codes"):
        delay_codes.setdefault((r.get("work_type_id"), lower(r.get("category")), lower(r.get("code"))), r.get("id"))
    tenants = {}
    for r in read_all(api, "jfb_culture_tenants"):
        tenants.setdefault(lower(r.get("name")), []).append(r)
    return {
        "work_types": work_types,
        "delay_codes": delay_codes,
        "layer_types": {lower(r.get("name")): r.get("id") for r in read_all(api, "jfb_layer_types")},
        "material_types": {lower(r.get("name")): r.get("id") for r in read_all(api, "jfb_material_types")},
        "metric_sources": {lower(r.get("value")) for r in read_all(api, "jfb_metric_sources")},
        "tenants": tenants,
    }


def need(mapping, key, what):
    value = mapping.get(key)
    if value is None:
        raise Unresolved(what + " not found: " + str(key))
    return value


def optional_ref(mapping, key, what):
    if key is None:
        return None
    return need(mapping, lower(key), what)


def seed_history(api, dry_run, project_ids, steps):
    project_id = project_ids.get(HISTORY_PROJECT_CODE) or pending_id("jfb_projects", HISTORY_PROJECT_CODE)
    project = next(p for p in PROJECTS if p["project_code"] == HISTORY_PROJECT_CODE)
    tz_name = project.get("report_timezone") or "UTC"
    ctx = {"api": api, "dry_run": dry_run, "steps": steps}
    ref = reference_maps(api)
    in_project = {"project_id": project_id}

    levels = seed_history_rows(
        ctx, "jfb_project_area_levels", "jfb_project_area_levels", HISTORY["area_levels"], in_project,
        lambda r: int(r.get("depth") or 0),
        lambda lv: (lv["depth"], {"project_id": project_id, "depth": lv["depth"], "label": lv["label"], "sort_order": lv["depth"]}),
    )

    areas = {}
    for depth in sorted({len(a["path"]) for a in HISTORY["areas"]}):
        level_id = levels.get(depth)

        def plan_area(a, level_id=level_id):
            if level_id is None:
                raise Unresolved("area level depth " + str(len(a["path"])) + " missing for " + " / ".join(a["path"]))
            parent_id = areas[tuple(a["path"][:-1])]["id"] if len(a["path"]) > 1 else None
            if len(a["path"]) > 1 and parent_id is None:
                raise Unresolved("parent area missing for " + " / ".join(a["path"]))
            record = {
                "project_id": project_id, "parent_id": parent_id, "area_level_id": level_id, "name": a["path"][-1],
                "sort_order": a["sort_order"], "is_active": a["active"], "volume_goal_cy": a["volume_goal_cy"],
                "area_goal_sf": a["area_goal_sf"], "notes": a["notes"],
            }
            return (str(level_id), str(parent_id or ""), lower(a["path"][-1])), record

        rows = [a for a in HISTORY["areas"] if len(a["path"]) == depth]
        found = seed_history_rows(
            ctx, "jfb_project_areas", "jfb_project_areas", rows, in_project,
            lambda r: (str(r.get("area_level_id")), str(r.get("parent_id") or ""), lower(r.get("name"))),
            plan_area,
        )
        for a in rows:
            parent_id = areas[tuple(a["path"][:-1])]["id"] if len(a["path"]) > 1 else None
            area_id = found.get((str(level_id), str(parent_id or ""), lower(a["path"][-1])))
            areas[tuple(a["path"])] = {"id": area_id, "level_id": level_id, "name": a["path"][-1]}

    equipments = seed_history_rows(
        ctx, "jfb_equipments", "jfb_equipments", HISTORY["equipments"], in_project,
        lambda r: lower(r.get("name")),
        lambda e: (lower(e["name"]), dict(e, project_id=project_id)),
    )

    operators = seed_history_rows(
        ctx, "jfb_operators", "jfb_operators", HISTORY["operators"], None,
        lambda r: lower(r.get("name")),
        lambda o: (lower(o["name"]), {"name": o["name"]}),
    )

    seed_history_rows(
        ctx, "jfb_project_operators", "jfb_project_operators", HISTORY["operators"], in_project,
        lambda r: str(r.get("operator_id")),
        lambda o: (str(need(operators, lower(o["name"]), "operator")),
                   {"project_id": project_id, "operator_id": need(operators, lower(o["name"]), "operator"), "is_active": o["is_active"]}),
    )

    attachments = seed_history_rows(
        ctx, "jfb_project_attachments", "jfb_project_attachments", HISTORY["attachments"], in_project,
        lambda r: lower(r.get("name")),
        lambda a: (lower(a["name"]), dict(a, project_id=project_id)),
    )

    def master_delay_id(d):
        work_type_id = need(ref["work_types"], lower(d["work_type"]), "work type")
        return need(ref["delay_codes"], (work_type_id, lower(d["category"]), lower(d["code"])),
                    "delay code " + d["work_type"] + " / " + d["category"] + " / " + d["code"])

    project_delay = seed_history_rows(
        ctx, "jfb_project_delay_codes", "jfb_project_delay_codes", HISTORY["delay_codes"], in_project,
        lambda r: str(r.get("delay_code_id")),
        lambda d: (str(master_delay_id(d)), {"project_id": project_id, "delay_code_id": master_delay_id(d), "active": d["active"], "sort_order": d["sort_order"]}),
    )
    delay_by_triple = {}
    for d in HISTORY["delay_codes"]:
        try:
            delay_by_triple[(d["work_type"], d["category"], d["code"])] = project_delay.get(str(master_delay_id(d)))
        except Unresolved:
            continue

    layers = seed_history_rows(
        ctx, "jfb_project_layers", "jfb_project_layers", HISTORY["layers"], in_project,
        lambda r: lower(r.get("layer_name")),
        lambda l: (lower(l["layer_name"]), {
            "project_id": project_id, "layer_name": l["layer_name"],
            "layer_type_id": optional_ref(ref["layer_types"], l["layer_type"], "layer type"),
            "layer_report_name": l["layer_report_name"], "sort_order": l["sort_order"], "active": l["active"],
            "chart_color": l["chart_color"], "chart_color_2nd": l["chart_color_2nd"], "pay_group": l["pay_group"], "pay_unit": l["pay_unit"],
        }),
    )

    materials = seed_history_rows(
        ctx, "jfb_project_materials", "jfb_project_materials", HISTORY["materials"], in_project,
        lambda r: lower(r.get("material_name")),
        lambda m: (lower(m["material_name"]), {
            "project_id": project_id, "material_name": m["material_name"],
            "material_type_id": optional_ref(ref["material_types"], m["material_type"], "material type"),
            "material_report_name": m["material_report_name"], "sort_order": m["sort_order"], "active": m["active"],
            "tons_goal": m["tons_goal"], "tons_per_hour_goal": m["tons_per_hour_goal"],
        }),
    )

    seed_history_rows(
        ctx, "jfb_project_site_equipment", "jfb_project_site_equipment", HISTORY["site_equipment"], in_project,
        lambda r: (lower(r.get("category")), lower(r.get("description"))),
        lambda s: ((lower(s["category"]), lower(s["description"])), dict(s, project_id=project_id)),
    )

    def plan_metric(m):
        if lower(m["source"]) not in ref["metric_sources"]:
            raise Unresolved("metric source not found: " + m["source"])
        record = {
            "project_id": project_id, "metric_key": m["metric_key"], "label": m["label"], "source": m["source"],
            "equipment_id": optional_ref(equipments, m["equipment"], "metric equipment"), "unit": m["unit"],
            "rollup_type": m["rollup_type"], "sort_order": m["sort_order"], "active": m["active"],
        }
        return m["metric_key"], record

    metrics = seed_history_rows(
        ctx, "jfb_metrics", "jfb_metrics", HISTORY["metrics"], in_project, lambda r: r.get("metric_key"), plan_metric,
    )

    seed_history_rows(
        ctx, "jfb_project_report_narratives", "jfb_project_report_narratives", HISTORY["narrative_sections"], in_project,
        lambda r: r.get("section_key"),
        lambda n: (n["section_key"], {"project_id": project_id, "narrative_label": n["label"], "section_key": n["section_key"],
                                      "is_active": n["is_active"], "sort_order": n["sort_order"]}),
    )
    section_labels = {n["section_key"]: n["label"] for n in HISTORY["narrative_sections"]}

    reports = seed_history_rows(
        ctx, "jfb_reports_history", "jfb_reports", HISTORY["reports"], in_project,
        lambda r: norm_date(r.get("report_date")),
        lambda r: (r["report_date"], {"project_id": project_id, "report_date": r["report_date"], "status": r["status"],
                                      "released_at": r["released_at"], "no_production_day": r["no_production_day"]}),
    )
    report_ids = [reports[r["report_date"]] for r in HISTORY["reports"] if reports.get(r["report_date"])]
    in_reports = {"report_id": report_ids}

    def area_of(path):
        if not path:
            return None
        entry = areas.get(tuple(path))
        if not entry or entry["id"] is None:
            raise Unresolved("area not found: " + " / ".join(path))
        return entry

    def report_of(date):
        return need(reports, date, "report")

    def plan_activity(a):
        equipment_id = need(equipments, lower(a["equipment"]), "equipment")
        area = None
        if a["area"]:
            keys = ["area_id", "sub_area_id", "sub_sub_area_id"]
            area = {keys[i]: area_of(a["area"][:i + 1])["id"] for i in range(len(a["area"]))}
        delay_id = None
        if a["delay"]:
            delay_id = delay_by_triple.get(tuple(a["delay"]))
            if delay_id is None:
                raise Unresolved("project delay code not found: " + " / ".join(a["delay"]))
        record = {
            "project_id": project_id, "equipment_id": equipment_id,
            "operator_id": optional_ref(operators, a["operator"], "operator"),
            "start_date_time": norm_ts(a["start"]), "end_date_time": norm_ts(a["end"]), "report_date": a["report_date"],
            "timezone": tz_name, "category": a["category"], "delay_code_id": delay_id, "area": area,
            "area_source": a["area_source"], "notes": a["notes"], "tsca": a["tsca"], "pass_type": a["pass_type"],
            "attachment_id": optional_ref(attachments, a["attachment"], "attachment"),
            "layer_id": optional_ref(layers, a["layer"], "layer"), "local_id": a["local_id"],
        }
        if a["local_id"]:
            return ("local", a["local_id"]), record
        return ("time", str(equipment_id), record["start_date_time"], record["end_date_time"], a["category"]), record

    def activity_key(r):
        if r.get("local_id"):
            return ("local", r.get("local_id"))
        return ("time", str(r.get("equipment_id")), norm_ts(r.get("start_date_time")), norm_ts(r.get("end_date_time")), r.get("category"))

    seed_history_rows(ctx, "jfb_daily_activities", "jfb_daily_activities", HISTORY["activities"], in_project, activity_key, plan_activity)

    seed_history_rows(
        ctx, "jfb_report_metric_value", "jfb_report_metric_value", HISTORY["metric_values"], in_reports,
        lambda r: (str(r.get("report_id")), r.get("metric_key")),
        lambda v: ((str(report_of(v["report_date"])), v["metric_key"]), {
            "report_id": report_of(v["report_date"]), "metric_id": need(metrics, v["metric_key"], "metric"),
            "metric_key": v["metric_key"], "value": v["value"],
        }),
    )

    seed_history_rows(
        ctx, "jfb_report_narratives_v2", "jfb_report_narratives_v2", HISTORY["report_narratives"], in_project,
        lambda r: (str(r.get("report_id")), r.get("section_key")),
        lambda n: ((str(report_of(n["report_date"])), n["section_key"]), {
            "project_id": project_id, "report_id": report_of(n["report_date"]),
            "narrative_label": need(section_labels, n["section_key"], "narrative section"),
            "section_key": n["section_key"], "content": n["content"],
        }),
    )

    seed_history_rows(
        ctx, "jfb_report_crew_summary_v2", "jfb_report_crew_summary_v2", HISTORY["crew"], in_reports,
        lambda r: (str(r.get("report_id")), lower(r.get("category"))),
        lambda c: ((str(report_of(c["report_date"])), lower(c["category"])), {
            "report_id": report_of(c["report_date"]), "category": c["category"], "count": c["count"],
            "hours": c["hours"], "sort_order": c["sort_order"],
        }),
    )

    def plan_safety(s):
        tenant_id = None
        if s["culture_tenant"]:
            matches = ref["tenants"].get(lower(s["culture_tenant"])) or []
            if len(matches) != 1:
                raise Unresolved("culture tenant " + s["culture_tenant"] + " matched " + str(len(matches)) + " rows")
            tenant_id = matches[0].get("id")
        record = {k: v for k, v in s.items() if k not in ("report_date", "culture_tenant")}
        record.update(report_id=report_of(s["report_date"]), culture_tenant_id=tenant_id)
        return str(record["report_id"]), record

    seed_history_rows(
        ctx, "jfb_report_safety_v2", "jfb_report_safety_v2", HISTORY["safety"], in_reports,
        lambda r: str(r.get("report_id")), plan_safety,
    )

    def plan_production(p):
        report_id = report_of(p["report_date"])
        equipment_id = need(equipments, lower(p["equipment"]), "equipment")
        combos = []
        for i in range(len(p["area"])):
            entry = area_of(p["area"][:i + 1])
            combos.append({"area_level_id": entry["level_id"], "area_id": entry["id"], "label": entry["name"]})
        record = {
            "report_id": report_id, "equipment_id": equipment_id, "area_level_combinations": combos,
            "pass_value": p["pass_value"], "attachment_id": optional_ref(attachments, p["attachment"], "attachment"),
            "layer_id": optional_ref(layers, p["layer"], "layer"), "material_id": optional_ref(materials, p["material"], "material"),
            "tsca": p["tsca"], "volume": p["volume"], "area": p["area_sf"], "notes": p["notes"], "tons": p["tons"],
            "conversion_factor": p["conversion_factor"],
        }
        return production_key(record), record

    seed_history_rows(
        ctx, "jfb_production_stats", "jfb_production_stats", HISTORY["production"], in_reports, production_key, plan_production,
    )

    for step_name, domain, rows, extra in (
        ("jfb_air_monitoring_daily", "jfb_air_monitoring_daily", HISTORY["air_daily"], ("activity", "notes")),
        ("jfb_water_monitoring_notes", "jfb_water_monitoring_notes", HISTORY["water_notes"], ("notes", "reference_ntu")),
    ):
        seed_history_rows(
            ctx, step_name, domain, rows, in_project,
            lambda r: str(r.get("report_id")),
            lambda row, extra=extra: (str(report_of(row["report_date"])), dict(
                {"project_id": project_id, "report_id": report_of(row["report_date"])}, **{k: row[k] for k in extra})),
        )


def production_key(record):
    combos = as_json(record.get("area_level_combinations")) or []
    area_ids = tuple(str(c.get("area_id")) for c in combos if isinstance(c, dict))
    return (
        str(record.get("report_id")), str(record.get("equipment_id")), area_ids, str(record.get("pass_value") or ""),
        str(record.get("layer_id") or ""), str(record.get("attachment_id") or ""), "y" if record.get("tsca") else "n",
    )


def check_history_shape():
    failures = []
    paths = {tuple(a["path"]) for a in HISTORY["areas"]}
    equipment = {e["name"] for e in HISTORY["equipments"]}
    operators = {o["name"] for o in HISTORY["operators"]}
    attachments = {a["name"] for a in HISTORY["attachments"]}
    layers = {l["layer_name"] for l in HISTORY["layers"]}
    materials = {m["material_name"] for m in HISTORY["materials"]}
    delay = {(d["work_type"], d["category"], d["code"]) for d in HISTORY["delay_codes"]}
    dates = {r["report_date"] for r in HISTORY["reports"]}
    sections = {n["section_key"] for n in HISTORY["narrative_sections"]}
    metric_keys = {m["metric_key"] for m in HISTORY["metrics"]}
    if HISTORY_PROJECT_CODE not in [p["project_code"] for p in PROJECTS]:
        failures.append("history_project_not_in_projects")
    for a in HISTORY["activities"] + HISTORY["production"]:
        if a["equipment"] not in equipment:
            failures.append("history_unknown_equipment:" + str(a["equipment"]))
        if a["area"] and tuple(a["area"]) not in paths:
            failures.append("history_unknown_area:" + "/".join(a["area"]))
        if a.get("attachment") and a["attachment"] not in attachments:
            failures.append("history_unknown_attachment:" + a["attachment"])
        if a.get("layer") and a["layer"] not in layers:
            failures.append("history_unknown_layer:" + a["layer"])
        if a.get("material") and a["material"] not in materials:
            failures.append("history_unknown_material:" + a["material"])
    for a in HISTORY["activities"]:
        if a["operator"] and a["operator"] not in operators:
            failures.append("history_unknown_operator:" + a["operator"])
        if a["delay"] and tuple(a["delay"]) not in delay:
            failures.append("history_unknown_delay_code:" + "/".join(a["delay"]))
    for group in ("activities", "metric_values", "report_narratives", "crew", "safety", "production", "air_daily", "water_notes"):
        for row in HISTORY[group]:
            if row["report_date"] not in dates:
                failures.append("history_" + group + "_unknown_report_date:" + row["report_date"])
    for n in HISTORY["report_narratives"]:
        if n["section_key"] not in sections:
            failures.append("history_unknown_section:" + n["section_key"])
    for v in HISTORY["metric_values"]:
        if v["metric_key"] not in metric_keys:
            failures.append("history_unknown_metric:" + v["metric_key"])
    for m in HISTORY["metrics"]:
        if m["equipment"] and m["equipment"] not in equipment:
            failures.append("history_unknown_metric_equipment:" + m["equipment"])
    local_ids = [a["local_id"] for a in HISTORY["activities"] if a["local_id"]]
    if len(local_ids) != len(set(local_ids)):
        failures.append("history_duplicate_local_ids")
    return sorted(set(failures))


def history_counts():
    return {key: len(rows) for key, rows in HISTORY.items()}


def check_seed_shape():
    failures = []
    codes = [p.get("project_code") for p in PROJECTS]
    if len(set(codes)) != len(codes):
        failures.append("duplicate_project_codes")
    for group_name, group in (("water", WATER_CONFIGS), ("air", AIR_CONFIGS), ("reports", REPORTS)):
        for entry in group:
            if entry.get("project_code") not in codes:
                failures.append(group_name + "_references_unknown_project_code:" + str(entry.get("project_code")))
    water_codes = [c["project_code"] for c in WATER_CONFIGS]
    if len(set(water_codes)) != len(water_codes):
        failures.append("more_than_one_water_config_per_project")
    air_codes = [c["project_code"] for c in AIR_CONFIGS]
    if len(set(air_codes)) != len(air_codes):
        failures.append("more_than_one_air_config_per_project")
    return failures


def self_check(config):
    failures = check_seed_shape() + check_history_shape()

    api = get_pivotly_api_safe()
    token_ready = api is not None
    existing = {}

    if not token_ready:
        if PIVOTLY_AVAILABLE:
            failures.append("core_api_token_unavailable:" + str(PIVOTLY_API_DIAGNOSTIC.get("token_error") or "unknown"))
        else:
            failures.append("pivotly_api_unavailable_outside_runner")
    else:
        try:
            ids = project_ids_by_code(api)
            existing["projects_found"] = {str(code): pid for code, pid in ids.items()}
            existing["projects_missing"] = [p["project_code"] for p in PROJECTS if p["project_code"] not in ids]
        except Exception as exc:
            failures.append("jfb_projects_read_failed:" + safe_text(exc, 600))

    return result(
        "self_check",
        len(failures) == 0,
        "Self-check passed." if not failures else "Self-check found problems.",
        len(PROJECTS),
        {
            "steps": list(STEPS),
            "project_codes": [p["project_code"] for p in PROJECTS],
            "water_configs": [str(c["project_code"]) + ":" + c["row"]["provider"] for c in WATER_CONFIGS],
            "air_configs": [str(c["project_code"]) + ":" + c["row"]["provider"] for c in AIR_CONFIGS],
            "reports": [str(r["project_code"]) + ":" + r["report_date"] for r in REPORTS],
            "history": {"project_code": HISTORY_PROJECT_CODE, "rows": history_counts(), "include_history": config["include_history"]},
            "existing": existing,
            "valid_modes": VALID_MODES,
            "param_contract_version_ok": config["param_contract_version"] == PARAM_CONTRACT_VERSION,
            "accepted_param_names": list(PUBLIC_RUNNER_PARAMS),
            "dry_run": config["dry_run"],
            "token_ready": token_ready,
            "pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC),
            "diagnostics": {"failures": failures},
        },
    )


def seed_only(config):
    failures = check_seed_shape() + (check_history_shape() if config["include_history"] else [])
    if failures:
        return result("seed_only", False, "Seed data failed its own shape check.", 0, {"failures": failures})

    api = get_pivotly_api_safe()
    if api is None:
        return result(
            "seed_only",
            False,
            "Pivotly API helper is not configured in this runner context.",
            0,
            {"pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC)},
        )

    dry_run = config["dry_run"]
    steps = {name: new_step() for name in STEPS}
    history_steps = {name: new_history_step() for name in HISTORY_STEPS} if config["include_history"] else {}

    try:
        ids = seed_projects(api, dry_run, steps["jfb_projects"])
        seed_configs(api, "jfb_water_monitoring_config", WATER_CONFIGS, ids, dry_run, steps["jfb_water_monitoring_config"])
        seed_configs(api, "jfb_air_monitoring_config", AIR_CONFIGS, ids, dry_run, steps["jfb_air_monitoring_config"])
        seed_reports(api, ids, dry_run, steps["jfb_reports"])
        if config["include_history"]:
            seed_history(api, dry_run, ids, history_steps)
    except Exception as exc:
        return result("seed_only", False, "Seeding stopped on a read error.", 0,
                      {"error": safe_text(exc, 1200), "steps": steps, "history_steps": history_steps})

    def tally(value):
        return value if isinstance(value, int) else len(value)

    all_steps = list(steps.values()) + list(history_steps.values())
    errors = [domain + " " + e for domain, step in list(steps.items()) + list(history_steps.items()) for e in step["errors"]]
    error_total = sum(step.get("error_count", len(step["errors"])) for step in all_steps)
    created = sum(tally(step["created"]) for step in all_steps)
    would_create = sum(tally(step["would_create"]) for step in all_steps)

    if dry_run:
        message = "Dry run: would create " + str(would_create) + " row(s). No writes performed. Re-run with dry_run=false."
    elif errors:
        message = "Seeding completed with errors: " + str(created) + " row(s) created, " + str(error_total) + " error(s)."
    else:
        message = "Seeding complete: " + str(created) + " row(s) created. Existing rows were left untouched."

    return result(
        "seed_only",
        len(errors) == 0,
        message,
        would_create if dry_run else created,
        {
            "steps": steps,
            "history_steps": history_steps,
            "project_ids": {str(code): pid for code, pid in ids.items()},
            "errors": errors,
            "next_step": "Run scr_jfb_monitoring_pull mode=self_check for each provider; config_count should be 1.",
        },
    )


def run(config):
    if config["mode"] == "seed_only":
        output = seed_only(config)
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
        output["details"].pop("pivotly_api", None)

    return output


HISTORY_PROJECT_CODE = 152601

HISTORY = {
    'area_levels': [
        {'depth': 1, 'label': 'DMU'},
    ],
    'areas': [
        {'path': ['DMU 1'], 'sort_order': 1, 'active': True, 'volume_goal_cy': 2669.5, 'area_goal_sf': 8042.2, 'notes': None},
        {'path': ['DMU 2'], 'sort_order': 2, 'active': True, 'volume_goal_cy': 1777.8, 'area_goal_sf': 5604.7, 'notes': None},
        {'path': ['DMU 3'], 'sort_order': 3, 'active': True, 'volume_goal_cy': 985.1, 'area_goal_sf': 7056.7, 'notes': None},
        {'path': ['DMU 4'], 'sort_order': 4, 'active': True, 'volume_goal_cy': 424.1, 'area_goal_sf': 5334.9, 'notes': None},
        {'path': ['DMU 5'], 'sort_order': 5, 'active': True, 'volume_goal_cy': 1407.3, 'area_goal_sf': 16575.9, 'notes': None},
        {'path': ['DMU 6'], 'sort_order': 6, 'active': True, 'volume_goal_cy': 571.8, 'area_goal_sf': 10140.6, 'notes': None},
        {'path': ['DMU 7'], 'sort_order': 7, 'active': True, 'volume_goal_cy': 544.2, 'area_goal_sf': 10693.8, 'notes': None},
        {'path': ['DMU 8'], 'sort_order': 8, 'active': True, 'volume_goal_cy': 689, 'area_goal_sf': 11823.5, 'notes': None},
        {'path': ['DMU 9'], 'sort_order': 9, 'active': True, 'volume_goal_cy': 882.1, 'area_goal_sf': 13037.6, 'notes': None},
        {'path': ['DMU 10'], 'sort_order': 10, 'active': True, 'volume_goal_cy': 1175.2, 'area_goal_sf': 15597.8, 'notes': None},
        {'path': ['DMU 11'], 'sort_order': 11, 'active': True, 'volume_goal_cy': 1235.6, 'area_goal_sf': 14521.6, 'notes': None},
        {'path': ['DMU 12'], 'sort_order': 12, 'active': True, 'volume_goal_cy': 361.8, 'area_goal_sf': 7214.8, 'notes': None},
        {'path': ['DMU 13'], 'sort_order': 13, 'active': True, 'volume_goal_cy': 520, 'area_goal_sf': 10841.3, 'notes': None},
    ],
    'equipments': [
        {'name': 'CAT 374', 'work_type': None, 'work_type_from': None, 'is_active': True, 'sort_order': 1, 'mobilized_on': None, 'demobilized_on': None},
        {'name': 'Sennebogen 840', 'work_type': 'Mechanical Capping', 'work_type_from': None, 'is_active': True, 'sort_order': 2, 'mobilized_on': '2026-09-11', 'demobilized_on': None},
    ],
    'operators': [
        {'name': 'Chad Defoe', 'is_active': True},
        {'name': 'Jim Todd', 'is_active': True},
        {'name': 'Stacey Schroeder', 'is_active': True},
        {'name': 'Zack Meyers', 'is_active': True},
    ],
    'attachments': [
        {'name': 'Empire Environmental Lidded Bucket', 'sort_order': 10, 'active': True},
        {'name': 'Young 2 CY Clamshell Bucket', 'sort_order': 20, 'active': True},
    ],
    'delay_codes': [
        {'work_type': 'Mechanical Capping', 'category': 'General', 'code': 'ShutDown', 'code_num': 301, 'sort_order': 1, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'General', 'code': 'Maintenance', 'code_num': 302, 'sort_order': 2, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'General', 'code': 'Mobilize Plant to New Area', 'code_num': 303, 'sort_order': 3, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'General', 'code': 'Subcontractor', 'code_num': 304, 'sort_order': 4, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'General', 'code': 'Debris Management', 'code_num': 305, 'sort_order': 5, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Mechanical', 'code': 'Change/Repair Bucket', 'code_num': 323, 'sort_order': 1, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Mechanical', 'code': 'Spuds', 'code_num': 325, 'sort_order': 2, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Mechanical', 'code': 'Generator', 'code_num': 326, 'sort_order': 3, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Mechanical', 'code': 'Excavator Hydarulics', 'code_num': 328, 'sort_order': 4, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Mechanical', 'code': 'Excavator Repairs', 'code_num': 329, 'sort_order': 5, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Movement', 'code': 'Move Placement Plant', 'code_num': 330, 'sort_order': 1, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Survey/Sample', 'code': 'Sensors/DredgePack/GPS', 'code_num': 340, 'sort_order': 1, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Survey/Sample', 'code': 'Survey', 'code_num': 341, 'sort_order': 2, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Survey/Sample', 'code': 'Calibration', 'code_num': 342, 'sort_order': 3, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Survey/Sample', 'code': 'Sampling/Poling', 'code_num': 343, 'sort_order': 4, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Booster or Land Plant', 'code': 'Clean/Repair Booster Pump', 'code_num': 350, 'sort_order': 1, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Booster or Land Plant', 'code': 'Service Water Pump', 'code_num': 351, 'sort_order': 2, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Booster or Land Plant', 'code': 'Booster Generator', 'code_num': 352, 'sort_order': 3, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Booster or Land Plant', 'code': 'Land Plant', 'code_num': 353, 'sort_order': 4, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Booster or Land Plant', 'code': 'Water Intake Plant', 'code_num': 354, 'sort_order': 5, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Booster or Land Plant', 'code': 'Wait for Material Import', 'code_num': 355, 'sort_order': 6, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Barge/Material Transport', 'code': 'Change Barge', 'code_num': 360, 'sort_order': 1, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Barge/Material Transport', 'code': 'Rotate/Move Barge', 'code_num': 361, 'sort_order': 2, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Barge/Material Transport', 'code': 'Wait on Barge', 'code_num': 362, 'sort_order': 3, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Barge/Material Transport', 'code': 'Barge Maintenance', 'code_num': 363, 'sort_order': 4, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Barge/Material Transport', 'code': 'Pushboat Maintenance', 'code_num': 364, 'sort_order': 5, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Barge/Material Transport', 'code': 'Material_Handler/Excavator Maintenance', 'code_num': 365, 'sort_order': 6, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Barge/Material Transport', 'code': 'Bucket Maintenance', 'code_num': 366, 'sort_order': 7, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Barge/Material Transport', 'code': 'Fuel Equipment', 'code_num': 367, 'sort_order': 8, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Barge/Material Transport', 'code': 'Rub Rails', 'code_num': 368, 'sort_order': 9, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Project Specific', 'code': 'Belt Maintenance', 'code_num': 370, 'sort_order': 1, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Project Specific', 'code': 'Roller Maintenance', 'code_num': 371, 'sort_order': 2, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Project Specific', 'code': 'Clean Hopper', 'code_num': 372, 'sort_order': 3, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Project Specific', 'code': 'Move Plant', 'code_num': 373, 'sort_order': 4, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Project Specific', 'code': 'Loading Excavator', 'code_num': 374, 'sort_order': 5, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Project Specific', 'code': 'Wheel Loader', 'code_num': 375, 'sort_order': 6, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Project Specific', 'code': 'Import Truck Delay', 'code_num': 376, 'sort_order': 7, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Project Specific', 'code': 'Other Contractor Delay', 'code_num': 377, 'sort_order': 8, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Misc', 'code': 'Water Quality', 'code_num': 390, 'sort_order': 1, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Misc', 'code': 'Weather', 'code_num': 391, 'sort_order': 2, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Misc', 'code': 'Miscellaneous', 'code_num': 392, 'sort_order': 3, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Misc', 'code': 'Turbidity', 'code_num': 393, 'sort_order': 4, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Misc', 'code': 'Safety', 'code_num': 394, 'sort_order': 5, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'Operational Change', 'code': 'Operational Change', 'code_num': 999, 'sort_order': 1, 'active': True},
        {'work_type': 'Mechanical Capping', 'category': 'General', 'code': 'Startup', 'code_num': 9000, 'sort_order': 6, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'General', 'code': 'Maintenance', 'code_num': 102, 'sort_order': 1, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'General', 'code': 'Mobilize Plant to New Area', 'code_num': 103, 'sort_order': 2, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'General', 'code': 'Subcontractor', 'code_num': 104, 'sort_order': 3, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'General', 'code': 'Debris Management', 'code_num': 105, 'sort_order': 4, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'General', 'code': 'Obstructions', 'code_num': 110, 'sort_order': 5, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Mechanical', 'code': 'HPU', 'code_num': 120, 'sort_order': 1, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Mechanical', 'code': 'Change/Repair Bucket', 'code_num': 123, 'sort_order': 2, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Mechanical', 'code': 'Spuds', 'code_num': 125, 'sort_order': 3, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Mechanical', 'code': 'Generator', 'code_num': 126, 'sort_order': 4, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Mechanical', 'code': 'Excavator Hydraulics', 'code_num': 128, 'sort_order': 5, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Mechanical', 'code': 'Excavator Repairs', 'code_num': 129, 'sort_order': 6, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Movement', 'code': 'Move Dredge Plant', 'code_num': 130, 'sort_order': 1, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Movement', 'code': 'Repair/Replace Pipeline', 'code_num': 131, 'sort_order': 2, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Movement', 'code': 'Add/Remove Pipeline', 'code_num': 132, 'sort_order': 3, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Movement', 'code': 'Move Pipeline', 'code_num': 133, 'sort_order': 4, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Survey/Sample', 'code': 'Sensors/DredgePack/GPS', 'code_num': 140, 'sort_order': 1, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Survey/Sample', 'code': 'Survey', 'code_num': 141, 'sort_order': 2, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Survey/Sample', 'code': 'Calibration', 'code_num': 142, 'sort_order': 3, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Survey/Sample', 'code': 'Sampling/Poling', 'code_num': 143, 'sort_order': 4, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Land Plant/Processing', 'code': 'Clean/Repair Booster Pump', 'code_num': 150, 'sort_order': 1, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Land Plant/Processing', 'code': 'Service Water Booster Pump', 'code_num': 151, 'sort_order': 2, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Land Plant/Processing', 'code': 'Booster Generator', 'code_num': 152, 'sort_order': 3, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Land Plant/Processing', 'code': 'Sediment Processing', 'code_num': 153, 'sort_order': 4, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Land Plant/Processing', 'code': 'Water Treatment Plant', 'code_num': 154, 'sort_order': 5, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Land Plant/Processing', 'code': 'Dewatering', 'code_num': 155, 'sort_order': 6, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Barge/Material Transport', 'code': 'Change Barge', 'code_num': 160, 'sort_order': 1, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Barge/Material Transport', 'code': 'Rotate/Move Barge', 'code_num': 161, 'sort_order': 2, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Barge/Material Transport', 'code': 'Wait on Barge', 'code_num': 162, 'sort_order': 3, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Barge/Material Transport', 'code': 'Barge Maintenance', 'code_num': 163, 'sort_order': 4, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Barge/Material Transport', 'code': 'Pushboat Maintenance', 'code_num': 164, 'sort_order': 5, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Barge/Material Transport', 'code': 'Material_Handler/Excavator Maintenance', 'code_num': 165, 'sort_order': 6, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Barge/Material Transport', 'code': 'Bucket Maintenance', 'code_num': 166, 'sort_order': 7, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Barge/Material Transport', 'code': 'Fuel Equipment', 'code_num': 167, 'sort_order': 8, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Barge/Material Transport', 'code': 'Rub Rails', 'code_num': 168, 'sort_order': 9, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Barge/Material Transport', 'code': 'Clean/Repair Slurry Tank', 'code_num': 169, 'sort_order': 10, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Booster/Land Plant', 'code': 'Dredge Plant Boster', 'code_num': 170, 'sort_order': 1, 'active': False},
        {'work_type': 'Mechanical Dredging', 'category': 'Booster/Land Plant', 'code': 'Land Booster', 'code_num': 171, 'sort_order': 2, 'active': False},
        {'work_type': 'Mechanical Dredging', 'category': 'Booster/Land Plant', 'code': 'Service Water', 'code_num': 172, 'sort_order': 3, 'active': False},
        {'work_type': 'Mechanical Dredging', 'category': 'Booster/Land Plant', 'code': 'Sand Wheel', 'code_num': 173, 'sort_order': 4, 'active': False},
        {'work_type': 'Mechanical Dredging', 'category': 'Booster/Land Plant', 'code': 'Wash Pipeline', 'code_num': 174, 'sort_order': 5, 'active': False},
        {'work_type': 'Mechanical Dredging', 'category': 'Misc', 'code': 'Water Quality', 'code_num': 190, 'sort_order': 1, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Misc', 'code': 'Weather', 'code_num': 191, 'sort_order': 2, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Misc', 'code': 'Miscellaneous', 'code_num': 192, 'sort_order': 3, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Misc', 'code': 'Turbidity', 'code_num': 193, 'sort_order': 4, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Misc', 'code': 'Safety', 'code_num': 194, 'sort_order': 5, 'active': True},
        {'work_type': 'Mechanical Dredging', 'category': 'Operational Change', 'code': 'Operational Change', 'code_num': 997, 'sort_order': 1, 'active': True},
    ],
    'layers': [
        {'layer_name': 'Structural Backfill', 'layer_type': 'Backfill', 'layer_report_name': 'Structural Backfill', 'sort_order': 10, 'active': True, 'chart_color': '#779C5D', 'chart_color_2nd': '#EFE4BE', 'pay_group': 'Stabilization Backfill', 'pay_unit': 'CY'},
        {'layer_name': 'Sand Backfill', 'layer_type': 'Sand', 'layer_report_name': 'Sand Backfill', 'sort_order': 20, 'active': True, 'chart_color': '#E8BEFF', 'chart_color_2nd': '#CD6666', 'pay_group': 'Stabilization Backfill', 'pay_unit': 'CY'},
        {'layer_name': 'Restoration Backfill', 'layer_type': 'Cover', 'layer_report_name': 'Restoration Backfill', 'sort_order': 30, 'active': True, 'chart_color': '#CDAA66', 'chart_color_2nd': '#A8843F', 'pay_group': 'Restoration Backfill', 'pay_unit': 'SY'},
    ],
    'materials': [
        {'material_name': '21AA Stone', 'material_type': 'Rock', 'material_report_name': '21AA Stone', 'sort_order': 10, 'active': True, 'tons_goal': None, 'tons_per_hour_goal': None},
        {'material_name': '2NS Sand', 'material_type': 'Sand', 'material_report_name': '2NS Sand', 'sort_order': 20, 'active': True, 'tons_goal': None, 'tons_per_hour_goal': None},
    ],
    'site_equipment': [
        {'category': 'brennan', 'company': None, 'description': '5 - Kann Jon Boat (JFB #70029, #7819, #7717, #7509, #70022)', 'sort_order': 10, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '4 - Tool Connex', 'sort_order': 20, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - Fuel Cube (JFB #6128)', 'sort_order': 30, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '44 - Pair NZ-26, 60 FT', 'sort_order': 40, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '35 - Pair NZ-19, 64 FT', 'sort_order': 50, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '28 - Pair NZ-26, 54 FT', 'sort_order': 60, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '4 - Man Floats (JFB #729, #142, #PF 72, #PF 57)', 'sort_order': 70, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '3 - Fuel Tanks', 'sort_order': 80, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '3 - Turbidity Curtain Crates', 'sort_order': 90, 'mobilized_at': '2026-05-19', 'demobilized_at': '2026-09-22'},
        {'category': 'brennan', 'company': None, 'description': '1 - Miller Welder (JFB #7045)', 'sort_order': 100, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - 14 IN Moonpool Pipe', 'sort_order': 110, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '4 - Spill Kits', 'sort_order': 120, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '4 - S-50 Flexi Float barges (JFB #4501, #4582, #4659, #4571)', 'sort_order': 130, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '2 - S50 Spudwells', 'sort_order': 140, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - Spud HPU (JFB #4674)', 'sort_order': 150, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '2 - Crane Ramps (JFB #6702A, #6702B)', 'sort_order': 160, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '2 - S50 Spuds', 'sort_order': 170, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - Sennebogen 850E (JFB #1090)', 'sort_order': 180, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - Jet Boat (JFB #4059)', 'sort_order': 190, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '9 - 4 FT X 16 FT X 8 IN Timber Crane Mats', 'sort_order': 210, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '2 - Template 30 FT Beams', 'sort_order': 220, 'mobilized_at': '2026-05-19', 'demobilized_at': '2026-09-23'},
        {'category': 'brennan', 'company': None, 'description': '8 - HP 14 X 73 X 65 FT', 'sort_order': 230, 'mobilized_at': '2026-06-15', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - M/V Debra Mary (JFB #4420)', 'sort_order': 240, 'mobilized_at': '2026-06-16', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - Digging Bucket (JFB #BD003)', 'sort_order': 250, 'mobilized_at': '2026-06-16', 'demobilized_at': '2026-09-22'},
        {'category': 'brennan', 'company': None, 'description': '3 - Mississippi Hopper Barge (BMI #102, #103, JFB #4476)', 'sort_order': 260, 'mobilized_at': '2026-06-17', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '2 - Frac Tanks (JFB #11053, #11128)', 'sort_order': 270, 'mobilized_at': '2026-06-17', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - Enermax KL30TSX Generator (JFB #7985)', 'sort_order': 280, 'mobilized_at': '2026-06-17', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - 4 IN Water Pump (JFB #6510)', 'sort_order': 290, 'mobilized_at': '2026-06-17', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '20 - Dewatering Box Geotubes', 'sort_order': 300, 'mobilized_at': '2026-06-17', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '2 - GAC Filter (JFB #11048, #11050)', 'sort_order': 310, 'mobilized_at': '2026-06-17', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - Quadplex Multimedia Filter (JFB #11116)', 'sort_order': 320, 'mobilized_at': '2026-06-17', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - Hitachi ZX470 Excavator (JFB #1001)', 'sort_order': 340, 'mobilized_at': '2026-06-17', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - Dean Smith Crane Barge (JFB #4400)', 'sort_order': 350, 'mobilized_at': '2026-06-18', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - Deck Material Barge (JFB #4460)', 'sort_order': 360, 'mobilized_at': '2026-06-24', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - Multibeam Survey Vessel (JFB #7771)', 'sort_order': 370, 'mobilized_at': '2026-06-25', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '2 - Young 2 CY Clamshell Bucket (JFB #7267, JFB #7268)', 'sort_order': 380, 'mobilized_at': '2026-07-13', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '2 - Young 2.5 CY Clamshell Bucket (JFB #7228, JFB 7201)', 'sort_order': 390, 'mobilized_at': '2026-07-13', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - Godwin 4 IN Dry Prime Water Pump (JFB #6510)', 'sort_order': 400, 'mobilized_at': '2026-07-14', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - Allu PF 7+7 Pressure Feeder (JFB #1081)', 'sort_order': 410, 'mobilized_at': '2026-06-17', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - MQ Power 25 kW Generator (JFB #7984)', 'sort_order': 420, 'mobilized_at': '2026-07-15', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '2 - 4460 Barge Spuds', 'sort_order': 430, 'mobilized_at': '2026-07-15', 'demobilized_at': '2026-09-23'},
        {'category': 'brennan', 'company': None, 'description': '1 - Sennebogen 840E (JFB #1012)', 'sort_order': 440, 'mobilized_at': '2026-07-17', 'demobilized_at': None},
        {'category': 'brennan', 'company': None, 'description': '1 - 2.5 CY Anvil Clamshell Bucket', 'sort_order': 460, 'mobilized_at': '2026-07-20', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '1 - Cat TL1255D Telehandler', 'sort_order': 10, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '1 - Cat 100kW Generator', 'sort_order': 20, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '6 - Portable Toilets', 'sort_order': 30, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '1 - Hand Wash Station', 'sort_order': 40, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '212 - HDPE Crane Mats', 'sort_order': 50, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '1 - Liebherr 586 Loader, Bucket, Forks', 'sort_order': 60, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '1 - CAT 289 D3 Skidsteer', 'sort_order': 70, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '2 - 10x36 Offices', 'sort_order': 80, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '1 - 12x60 Office', 'sort_order': 90, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '2 - S70 Spuds', 'sort_order': 100, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '4 - 20 FT Poseidon Barges', 'sort_order': 110, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '4 - 40 FT Poseidon Barges', 'sort_order': 120, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '1 - Poseidon HPU', 'sort_order': 130, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '2 - Poseidon Spudwells', 'sort_order': 140, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '1 - Genie S-40 XC Telescopic Boom Lift', 'sort_order': 150, 'mobilized_at': '2026-05-19', 'demobilized_at': '2026-07-29'},
        {'category': 'rental', 'company': None, 'description': '1 - Takeuchi TB2150 Excavator', 'sort_order': 160, 'mobilized_at': '2026-05-19', 'demobilized_at': '2026-07-29'},
        {'category': 'rental', 'company': None, 'description': '1940 - LF of Temporary Fencing', 'sort_order': 170, 'mobilized_at': '2026-05-19', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '1 - Wier Tank', 'sort_order': 190, 'mobilized_at': '2026-06-17', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '2 - Dewatering Boxes', 'sort_order': 200, 'mobilized_at': '2026-06-17', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '1 - Manitowoc 555 Crane', 'sort_order': 210, 'mobilized_at': '2026-06-18', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '4 - 4 IN Dry Prime Water Pumps', 'sort_order': 220, 'mobilized_at': '2026-07-14', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '1 - Cat 340 Excavator', 'sort_order': 250, 'mobilized_at': '2026-08-07', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '2 - Diesel Powered Light Plant', 'sort_order': 270, 'mobilized_at': '2026-08-24', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '1 - Electric Light Plant', 'sort_order': 280, 'mobilized_at': '2026-08-24', 'demobilized_at': None},
        {'category': 'rental', 'company': None, 'description': '1 - APE Vibratory Hammer', 'sort_order': 300, 'mobilized_at': '2026-06-18', 'demobilized_at': None},
    ],
    'metrics': [
        {'metric_key': 'total_cy', 'label': 'Total Volume Removed', 'source': 'dvw-jfb-metric-cy-v2', 'unit': 'CY', 'sort_order': 10, 'active': True, 'rollup_type': 'sum', 'equipment': 'CAT 374'},
        {'metric_key': 'total_sf', 'label': 'Total Area Covered', 'source': 'dvw-jfb-metric-sf-v2', 'unit': 'SF', 'sort_order': 20, 'active': True, 'rollup_type': 'sum', 'equipment': 'CAT 374'},
        {'metric_key': 'material_loadout', 'label': 'Material Loadout', 'source': 'manual', 'unit': 'TON', 'sort_order': 30, 'active': True, 'rollup_type': 'sum', 'equipment': None},
        {'metric_key': 'dredged_material_stabilization_rate', 'label': 'Dredged Material Stabilization Rate', 'source': 'manual', 'unit': 'TON Portland/CY', 'sort_order': 40, 'active': False, 'rollup_type': 'sum', 'equipment': None},
        {'metric_key': 'stability_backfill_placed', 'label': 'Stability Backfill Placed', 'source': 'dvw-jfb-metric-cy-v2', 'unit': 'CY', 'sort_order': 40, 'active': True, 'rollup_type': 'sum', 'equipment': 'Sennebogen 840'},
    ],
    'narrative_sections': [
        {'section_key': 'mobilization', 'label': 'Mobilization/Demobilization', 'sort_order': 10, 'is_active': True},
        {'section_key': 'backfill_placement', 'label': 'Backfill Placement', 'sort_order': 20, 'is_active': True},
        {'section_key': 'dredging', 'label': 'Mechanical Dredging Operations', 'sort_order': 20, 'is_active': False},
        {'section_key': 'temporary_sheet_pile_wall_installation_removal', 'label': 'Temporary Sheet Pile Wall Installation/Removal', 'sort_order': 30, 'is_active': True},
        {'section_key': 'dewatering', 'label': 'Water Treatment', 'sort_order': 40, 'is_active': True},
        {'section_key': 'material_loadout', 'label': 'Material Loadout', 'sort_order': 50, 'is_active': True},
        {'section_key': 'survey', 'label': 'Survey & Sampling', 'sort_order': 60, 'is_active': True},
        {'section_key': 'water_quality_special_instrumentation', 'label': 'Water Quality, Marine Resuspension Controls & Special Instrumentation', 'sort_order': 70, 'is_active': True},
        {'section_key': 'additional_site', 'label': 'Additional Site Activities', 'sort_order': 80, 'is_active': False},
        {'section_key': 'marine_resuspension_controls', 'label': 'Marine Resuspension Controls', 'sort_order': 80, 'is_active': False},
        {'section_key': 'misc', 'label': 'Miscellaneous', 'sort_order': 80, 'is_active': True},
    ],
    'reports': [
        {'report_date': '2026-09-01', 'status': 'released', 'released_at': '2026-09-02T12:11:14.453+00:00', 'no_production_day': False},
        {'report_date': '2026-09-02', 'status': 'released', 'released_at': '2026-09-23T13:45:03.974+00:00', 'no_production_day': False},
        {'report_date': '2026-09-03', 'status': 'released', 'released_at': '2026-09-23T13:46:14.223+00:00', 'no_production_day': False},
        {'report_date': '2026-09-04', 'status': 'released', 'released_at': '2026-09-05T13:11:27.491+00:00', 'no_production_day': False},
        {'report_date': '2026-09-05', 'status': 'released', 'released_at': '2026-09-23T14:34:34.277+00:00', 'no_production_day': False},
        {'report_date': '2026-09-08', 'status': 'released', 'released_at': '2026-09-09T16:20:33.358+00:00', 'no_production_day': False},
        {'report_date': '2026-09-09', 'status': 'released', 'released_at': '2026-09-11T10:59:10.337+00:00', 'no_production_day': False},
        {'report_date': '2026-09-10', 'status': 'released', 'released_at': '2026-09-11T21:30:56.409+00:00', 'no_production_day': False},
        {'report_date': '2026-09-11', 'status': 'released', 'released_at': '2026-09-14T18:03:56.311+00:00', 'no_production_day': False},
        {'report_date': '2026-09-12', 'status': 'released', 'released_at': '2026-09-15T13:07:03.523+00:00', 'no_production_day': False},
        {'report_date': '2026-09-14', 'status': 'released', 'released_at': '2026-09-15T13:11:57.379+00:00', 'no_production_day': False},
        {'report_date': '2026-09-15', 'status': 'released', 'released_at': '2026-09-16T18:33:54.161+00:00', 'no_production_day': False},
        {'report_date': '2026-09-16', 'status': 'released', 'released_at': '2026-09-17T21:30:19.218+00:00', 'no_production_day': False},
        {'report_date': '2026-09-17', 'status': 'released', 'released_at': '2026-09-18T13:06:15.711+00:00', 'no_production_day': False},
        {'report_date': '2026-09-18', 'status': 'released', 'released_at': '2026-09-21T10:20:28.048+00:00', 'no_production_day': False},
        {'report_date': '2026-09-19', 'status': 'released', 'released_at': '2026-09-21T11:56:02.951+00:00', 'no_production_day': False},
    ],
    'activities': [
        {'report_date': '2026-09-01', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-01T17:00:00+00:00', 'end': '2026-09-01T17:45:00+00:00', 'category': 'Startup/Shutdown', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Startup for the Week', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-01', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-01T17:45:00+00:00', 'end': '2026-09-01T18:15:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 8'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-01', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-01T18:15:00+00:00', 'end': '2026-09-01T21:25:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-01', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-01T21:25:00+00:00', 'end': '2026-09-01T21:30:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 6'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-01', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-01T21:30:00+00:00', 'end': '2026-09-01T22:00:00+00:00', 'category': 'Startup/Shutdown', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Shutdown for the Day', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-02T10:00:00+00:00', 'end': '2026-09-02T10:45:00+00:00', 'category': 'Startup/Shutdown', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Safety Meeting/Startup for the Day', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-02T10:45:00+00:00', 'end': '2026-09-02T11:00:00+00:00', 'category': 'Sensors/DredgePack/GPS', 'delay': ['Mechanical Dredging', 'Survey/Sample', 'Sensors/DredgePack/GPS'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Verify Bucket Elevation', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-02T11:00:00+00:00', 'end': '2026-09-02T12:30:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 8'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-02T12:30:00+00:00', 'end': '2026-09-02T12:45:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 13'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'pe', 'local_id': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-02T12:45:00+00:00', 'end': '2026-09-02T13:15:00+00:00', 'category': 'Move Dredge Plant', 'delay': ['Mechanical Dredging', 'Movement', 'Move Dredge Plant'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Adjust Dredge Plant Within the Cut', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-02T13:15:00+00:00', 'end': '2026-09-02T16:45:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-02T16:45:00+00:00', 'end': '2026-09-02T17:15:00+00:00', 'category': 'Rotate/Move Barge', 'delay': ['Mechanical Dredging', 'Barge/Material Transport', 'Rotate/Move Barge'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Adjust Barge Position Winch Cables', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-02T17:15:00+00:00', 'end': '2026-09-02T18:00:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 6'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-02T18:00:00+00:00', 'end': '2026-09-02T18:15:00+00:00', 'category': 'Move Dredge Plant', 'delay': ['Mechanical Dredging', 'Movement', 'Move Dredge Plant'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Reposition Dredge Plant Within the Cut', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-02T18:15:00+00:00', 'end': '2026-09-02T20:15:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-02T20:15:00+00:00', 'end': '2026-09-02T20:30:00+00:00', 'category': 'Survey', 'delay': ['Mechanical Dredging', 'Survey/Sample', 'Survey'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Upload Updated Matrix', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-02T20:30:00+00:00', 'end': '2026-09-02T21:30:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-02T21:30:00+00:00', 'end': '2026-09-02T22:00:00+00:00', 'category': 'Startup/Shutdown', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Shutdown for the Day', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-03', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-03T10:00:00+00:00', 'end': '2026-09-03T10:30:00+00:00', 'category': 'Startup/Shutdown', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Safety Meeting/Startup for the Day', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-03', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-03T10:30:00+00:00', 'end': '2026-09-03T11:00:00+00:00', 'category': 'Material_Handler/Excavator Maintenance', 'delay': ['Mechanical Dredging', 'Barge/Material Transport', 'Material_Handler/Excavator Maintenance'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Perform Routine Maintenance', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-03', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-03T11:00:00+00:00', 'end': '2026-09-03T13:15:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-03', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-03T13:15:00+00:00', 'end': '2026-09-03T16:30:00+00:00', 'category': 'Sediment Processing', 'delay': ['Mechanical Dredging', 'Land Plant/Processing', 'Sediment Processing'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Standby for Hopper Barge', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-03', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-03T16:30:00+00:00', 'end': '2026-09-03T16:45:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 8'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-03', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-03T16:45:00+00:00', 'end': '2026-09-03T21:00:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-03', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-03T21:00:00+00:00', 'end': '2026-09-03T21:30:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 6'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-03', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-03T21:30:00+00:00', 'end': '2026-09-03T22:00:00+00:00', 'category': 'Startup/Shutdown', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Shutdown for the Day', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-04', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-04T10:00:00+00:00', 'end': '2026-09-04T11:00:00+00:00', 'category': 'Startup/Shutdown', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Startup for the Day', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-04', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-04T11:00:00+00:00', 'end': '2026-09-04T12:00:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-04', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-04T12:00:00+00:00', 'end': '2026-09-04T12:45:00+00:00', 'category': 'Survey', 'delay': ['Mechanical Dredging', 'Survey/Sample', 'Survey'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Conduct Update Survey', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-04', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-04T12:45:00+00:00', 'end': '2026-09-04T14:15:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-04', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-04T14:15:00+00:00', 'end': '2026-09-04T14:30:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 6'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-04', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-04T14:30:00+00:00', 'end': '2026-09-04T14:45:00+00:00', 'category': 'Survey', 'delay': ['Mechanical Dredging', 'Survey/Sample', 'Survey'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Conduct QA Survey', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-04', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-04T14:45:00+00:00', 'end': '2026-09-04T19:30:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-04', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-04T19:30:00+00:00', 'end': '2026-09-04T21:00:00+00:00', 'category': 'Sediment Processing', 'delay': ['Mechanical Dredging', 'Land Plant/Processing', 'Sediment Processing'], 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Standby for Tug', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-04', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-04T21:00:00+00:00', 'end': '2026-09-04T21:45:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-04', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-04T21:45:00+00:00', 'end': '2026-09-04T22:00:00+00:00', 'category': 'Startup/Shutdown', 'delay': None, 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Shutdown for the Day', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-05', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-05T10:00:00+00:00', 'end': '2026-09-05T11:00:00+00:00', 'category': 'Startup/Shutdown', 'delay': None, 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Startup for the Day', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-05', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-05T11:00:00+00:00', 'end': '2026-09-05T15:30:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-05', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-05T15:30:00+00:00', 'end': '2026-09-05T15:45:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 4'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': '31', 'tsca': None, 'area_source': 'pe', 'local_id': None},
        {'report_date': '2026-09-05', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-05T15:45:00+00:00', 'end': '2026-09-05T17:30:00+00:00', 'category': 'Change Barge', 'delay': ['Mechanical Dredging', 'Barge/Material Transport', 'Change Barge'], 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Swap Hopper Barge', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-05', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-05T17:30:00+00:00', 'end': '2026-09-05T20:15:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-05', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-05T20:15:00+00:00', 'end': '2026-09-05T20:30:00+00:00', 'category': 'Fuel Equipment', 'delay': ['Mechanical Dredging', 'Barge/Material Transport', 'Fuel Equipment'], 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Fuel Dredge Plant', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-05', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-05T20:30:00+00:00', 'end': '2026-09-05T22:00:00+00:00', 'category': 'Startup/Shutdown', 'delay': None, 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Shutdown for the Week/Secure Equipment', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-08', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-08T10:00:00+00:00', 'end': '2026-09-08T10:45:00+00:00', 'category': 'Startup/Shutdown', 'delay': None, 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Startup for the Week', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-08', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-08T10:45:00+00:00', 'end': '2026-09-08T11:15:00+00:00', 'category': 'Miscellaneous', 'delay': ['Mechanical Dredging', 'Misc', 'Miscellaneous'], 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Adjust Turbidity Curtain', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-08', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-08T11:15:00+00:00', 'end': '2026-09-08T12:30:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-08', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-08T12:30:00+00:00', 'end': '2026-09-08T12:45:00+00:00', 'category': 'Move Dredge Plant', 'delay': ['Mechanical Dredging', 'Movement', 'Move Dredge Plant'], 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Reposition Dredge Plant Within the Cut', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-08', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-08T12:45:00+00:00', 'end': '2026-09-08T13:00:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-08', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-08T13:00:00+00:00', 'end': '2026-09-08T13:45:00+00:00', 'category': 'Sediment Processing', 'delay': ['Mechanical Dredging', 'Land Plant/Processing', 'Sediment Processing'], 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Standby for Tug', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-08', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-08T13:45:00+00:00', 'end': '2026-09-08T18:30:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-08', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-08T18:30:00+00:00', 'end': '2026-09-08T19:15:00+00:00', 'category': 'Survey', 'delay': ['Mechanical Dredging', 'Survey/Sample', 'Survey'], 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Conduct Update Survey', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-08', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-08T19:15:00+00:00', 'end': '2026-09-08T21:30:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Residual Dredging Operations', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-08', 'equipment': 'CAT 374', 'operator': 'Zack Meyers', 'start': '2026-09-08T21:30:00+00:00', 'end': '2026-09-08T22:00:00+00:00', 'category': 'Startup/Shutdown', 'delay': None, 'area': ['DMU 5'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Shutdown for the Day', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-09', 'equipment': 'CAT 374', 'operator': 'Jim Todd', 'start': '2026-09-09T10:00:00+00:00', 'end': '2026-09-09T10:52:00+00:00', 'category': 'STARTUP/SHUTDOWN', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Safety meeting / pre-shift', 'tsca': None, 'area_source': 'operator', 'local_id': '17889511661074y4im7jns'},
        {'report_date': '2026-09-09', 'equipment': 'CAT 374', 'operator': 'Jim Todd', 'start': '2026-09-09T10:52:00+00:00', 'end': '2026-09-09T10:58:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '17889515096851i5oyc8f3'},
        {'report_date': '2026-09-09', 'equipment': 'CAT 374', 'operator': 'Jim Todd', 'start': '2026-09-09T10:58:00+00:00', 'end': '2026-09-09T11:09:00+00:00', 'category': 'Move Dredge Plant', 'delay': ['Mechanical Dredging', 'Movement', 'Move Dredge Plant'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '1788952140366mx7gh1ulj'},
        {'report_date': '2026-09-09', 'equipment': 'CAT 374', 'operator': 'Jim Todd', 'start': '2026-09-09T11:09:00+00:00', 'end': '2026-09-09T13:22:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '1788960136292noygri7rd'},
        {'report_date': '2026-09-09', 'equipment': 'CAT 374', 'operator': 'Jim Todd', 'start': '2026-09-09T13:22:00+00:00', 'end': '2026-09-09T13:33:00+00:00', 'category': 'Survey', 'delay': ['Mechanical Dredging', 'Survey/Sample', 'Survey'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'Active dredging ran long by probably 45 minutes. It should have been move out of area for survey.', 'tsca': None, 'area_source': 'operator', 'local_id': '17889608160718q3zp3nnm'},
        {'report_date': '2026-09-09', 'equipment': 'CAT 374', 'operator': 'Jim Todd', 'start': '2026-09-09T13:33:00+00:00', 'end': '2026-09-09T13:36:00+00:00', 'category': 'Move Dredge Plant', 'delay': ['Mechanical Dredging', 'Movement', 'Move Dredge Plant'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '178896096743288nunebx0'},
        {'report_date': '2026-09-09', 'equipment': 'CAT 374', 'operator': 'Jim Todd', 'start': '2026-09-09T13:36:00+00:00', 'end': '2026-09-09T13:40:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '1788961205044qnklupiu8'},
        {'report_date': '2026-09-09', 'equipment': 'CAT 374', 'operator': 'Jim Todd', 'start': '2026-09-09T13:40:00+00:00', 'end': '2026-09-09T13:40:00+00:00', 'category': 'Barge Maintenance', 'delay': ['Mechanical Dredging', 'Barge/Material Transport', 'Barge Maintenance'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '1788961207617goivcb9v3'},
        {'report_date': '2026-09-09', 'equipment': 'CAT 374', 'operator': 'Jim Todd', 'start': '2026-09-09T13:40:00+00:00', 'end': '2026-09-09T14:29:00+00:00', 'category': 'ACTIVE DREDGING', 'delay': None, 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '1788964170338kb1upx5xy'},
        {'report_date': '2026-09-09', 'equipment': 'CAT 374', 'operator': 'Jim Todd', 'start': '2026-09-09T14:29:00+00:00', 'end': '2026-09-09T14:32:00+00:00', 'category': 'Move Dredge Plant', 'delay': ['Mechanical Dredging', 'Movement', 'Move Dredge Plant'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '1788964369001b2ssp1pif'},
        {'report_date': '2026-09-09', 'equipment': 'CAT 374', 'operator': 'Jim Todd', 'start': '2026-09-09T14:29:00+00:00', 'end': '2026-09-09T14:29:00+00:00', 'category': 'Survey', 'delay': ['Mechanical Dredging', 'Survey/Sample', 'Survey'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '1788964172703ro8kkg31a'},
        {'report_date': '2026-09-09', 'equipment': 'CAT 374', 'operator': 'Jim Todd', 'start': '2026-09-09T14:32:00+00:00', 'end': '2026-09-09T16:02:00+00:00', 'category': 'Survey', 'delay': ['Mechanical Dredging', 'Survey/Sample', 'Survey'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '1788969724990pyd4fql4u'},
        {'report_date': '2026-09-09', 'equipment': 'CAT 374', 'operator': 'Jim Todd', 'start': '2026-09-09T16:02:00+00:00', 'end': '2026-09-09T16:04:00+00:00', 'category': 'Miscellaneous', 'delay': ['Mechanical Dredging', 'Misc', 'Miscellaneous'], 'area': ['DMU 7'], 'pass_type': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'notes': 'End of mission 12:04 sent barge to wall.', 'tsca': None, 'area_source': 'operator', 'local_id': '1788969853228yqzo45mcw'},
        {'report_date': '2026-09-11', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-11T10:00:00+00:00', 'end': '2026-09-11T16:22:00+00:00', 'category': 'STARTUP/SHUTDOWN', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': 'Safety meeting / pre-shift (auto-logged)', 'tsca': None, 'area_source': 'operator', 'local_id': '17891437435684q17zxu76'},
        {'report_date': '2026-09-11', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-11T16:22:00+00:00', 'end': '2026-09-11T16:45:00+00:00', 'category': 'Move Placement Plant', 'delay': ['Mechanical Capping', 'Movement', 'Move Placement Plant'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '1789145157382zw7nxdc2v'},
        {'report_date': '2026-09-11', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-11T16:45:00+00:00', 'end': '2026-09-11T19:05:00+00:00', 'category': 'Survey', 'delay': ['Mechanical Capping', 'Survey/Sample', 'Survey'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': 'Machine needs calibration', 'tsca': None, 'area_source': 'operator', 'local_id': '1789153516897lmsniwb13'},
        {'report_date': '2026-09-11', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-11T19:05:00+00:00', 'end': '2026-09-11T20:47:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '1789159652463ey024rdgz'},
        {'report_date': '2026-09-11', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-11T20:47:00+00:00', 'end': '2026-09-11T21:23:00+00:00', 'category': 'Move Placement Plant', 'delay': ['Mechanical Capping', 'Movement', 'Move Placement Plant'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '1789161827888dlitgj4sn'},
        {'report_date': '2026-09-11', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-11T21:23:00+00:00', 'end': '2026-09-11T21:35:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 11'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '1789162509549m7d7s6mqv'},
        {'report_date': '2026-09-11', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-11T21:35:00+00:00', 'end': '2026-09-11T21:45:00+00:00', 'category': 'Fuel Equipment', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Fuel Equipment'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '1789211649619zgcrlanew'},
        {'report_date': '2026-09-11', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-11T21:45:00+00:00', 'end': '2026-09-11T22:00:00+00:00', 'category': 'ShutDown', 'delay': ['Mechanical Capping', 'General', 'ShutDown'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-12', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-12T10:00:00+00:00', 'end': '2026-09-12T11:14:00+00:00', 'category': 'STARTUP/SHUTDOWN', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': 'Safety meeting / pre-shift', 'tsca': None, 'area_source': 'operator', 'local_id': '1789211688666ipcjwmpcg'},
        {'report_date': '2026-09-12', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-12T11:14:00+00:00', 'end': '2026-09-12T12:02:00+00:00', 'category': 'Survey', 'delay': ['Mechanical Capping', 'Survey/Sample', 'Survey'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': 'Computer troubleshooting', 'tsca': None, 'area_source': 'operator', 'local_id': '17892145525500huk2vq3b'},
        {'report_date': '2026-09-12', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-12T12:02:00+00:00', 'end': '2026-09-12T12:12:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 11'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-12', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-12T12:12:00+00:00', 'end': '2026-09-12T14:53:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '17892248162477y1jzcp4e'},
        {'report_date': '2026-09-12', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-12T14:53:00+00:00', 'end': '2026-09-12T15:39:00+00:00', 'category': 'Rotate/Move Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Rotate/Move Barge'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '17892275685016zywb9p74'},
        {'report_date': '2026-09-12', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-12T15:39:00+00:00', 'end': '2026-09-12T21:10:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '1789248257119a4q5z2go3'},
        {'report_date': '2026-09-12', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-12T21:10:00+00:00', 'end': '2026-09-12T21:24:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 2'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-12', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-12T21:24:00+00:00', 'end': '2026-09-12T21:39:00+00:00', 'category': 'Fuel Equipment', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Fuel Equipment'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': '1789249142748300tkigmi'},
        {'report_date': '2026-09-12', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-12T21:39:00+00:00', 'end': '2026-09-12T22:00:00+00:00', 'category': 'ShutDown', 'delay': ['Mechanical Capping', 'General', 'ShutDown'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': None, 'layer': 'Structural Backfill', 'notes': None, 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-14', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-14T10:00:00+00:00', 'end': '2026-09-14T10:42:00+00:00', 'category': 'STARTUP/SHUTDOWN', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Safety Meeting/Startup for the Week', 'tsca': None, 'area_source': 'operator', 'local_id': '1789382575164r8xiuppt0'},
        {'report_date': '2026-09-14', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-14T10:42:00+00:00', 'end': '2026-09-14T14:42:00+00:00', 'category': 'Change Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Change Barge'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Change Material Barge', 'tsca': None, 'area_source': 'operator', 'local_id': '1789396978827ixixycfbn'},
        {'report_date': '2026-09-14', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-14T14:42:00+00:00', 'end': '2026-09-14T14:50:00+00:00', 'category': 'Move Placement Plant', 'delay': ['Mechanical Capping', 'Movement', 'Move Placement Plant'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Move Placement Plant into DMU-1', 'tsca': None, 'area_source': 'operator', 'local_id': '1789397409088rdmld8wdm'},
        {'report_date': '2026-09-14', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-14T14:50:00+00:00', 'end': '2026-09-14T16:53:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'First-Lift Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '1789404792090zcr8varwa'},
        {'report_date': '2026-09-14', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-14T16:53:00+00:00', 'end': '2026-09-14T17:05:00+00:00', 'category': 'Rotate/Move Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Rotate/Move Barge'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Adjust Material Barge Position', 'tsca': None, 'area_source': 'operator', 'local_id': '1789405556311z51bww4j5'},
        {'report_date': '2026-09-14', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-14T17:05:00+00:00', 'end': '2026-09-14T18:28:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'First-Lift Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '1789410480935r7vw69ier'},
        {'report_date': '2026-09-14', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-14T18:28:00+00:00', 'end': '2026-09-14T18:32:00+00:00', 'category': 'Move Placement Plant', 'delay': ['Mechanical Capping', 'Movement', 'Move Placement Plant'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Move Placement Plant to DMU-2', 'tsca': None, 'area_source': 'operator', 'local_id': '1789410758572ehb3p72g7'},
        {'report_date': '2026-09-14', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-14T18:32:00+00:00', 'end': '2026-09-14T20:41:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'First-Lift Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '1789418507905clcng6hru'},
        {'report_date': '2026-09-14', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-14T20:41:00+00:00', 'end': '2026-09-14T21:03:00+00:00', 'category': 'Rotate/Move Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Rotate/Move Barge'], 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Rotate Placement Plant', 'tsca': None, 'area_source': 'operator', 'local_id': '1789419820601ip25tp7gh'},
        {'report_date': '2026-09-14', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-14T21:03:00+00:00', 'end': '2026-09-14T21:36:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'First-Lift Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '1789421794387bvpsqnr6r'},
        {'report_date': '2026-09-14', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-14T21:36:00+00:00', 'end': '2026-09-14T21:42:00+00:00', 'category': 'Fuel Equipment', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Fuel Equipment'], 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Fuel Placement Plant', 'tsca': None, 'area_source': 'operator', 'local_id': '1789422129876rljenuxg8'},
        {'report_date': '2026-09-14', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-14T21:42:00+00:00', 'end': '2026-09-14T22:00:00+00:00', 'category': 'STARTUP/SHUTDOWN', 'delay': None, 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Shutdown for the Day', 'tsca': None, 'area_source': 'operator', 'local_id': '1789422131704tcpfq0uae'},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T10:00:00+00:00', 'end': '2026-09-15T11:02:00+00:00', 'category': 'STARTUP/SHUTDOWN', 'delay': None, 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Safety Meeting/Startup for the Day', 'tsca': None, 'area_source': 'operator', 'local_id': '1789470122596udbxsc87p'},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T11:02:00+00:00', 'end': '2026-09-15T12:22:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '1789479967030fbelsruzp'},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T12:22:00+00:00', 'end': '2026-09-15T13:46:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T13:46:00+00:00', 'end': '2026-09-15T15:55:00+00:00', 'category': 'Change Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Change Barge'], 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Change Material Barge/Move Dredge Plant', 'tsca': None, 'area_source': 'operator', 'local_id': '178948770298693kdi7y5x'},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T15:55:00+00:00', 'end': '2026-09-15T16:08:00+00:00', 'category': 'Sensors/DredgePack/GPS', 'delay': ['Mechanical Capping', 'Survey/Sample', 'Sensors/DredgePack/GPS'], 'area': ['DMU 11'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Install Spotting Camera', 'tsca': None, 'area_source': 'operator', 'local_id': '1789491226897u9pho84ht'},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T16:08:00+00:00', 'end': '2026-09-15T16:28:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 11'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T16:28:00+00:00', 'end': '2026-09-15T17:32:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '17894935743042ctahy6e6'},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T17:32:00+00:00', 'end': '2026-09-15T17:44:00+00:00', 'category': 'Sensors/DredgePack/GPS', 'delay': ['Mechanical Capping', 'Survey/Sample', 'Sensors/DredgePack/GPS'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Update Computer', 'tsca': None, 'area_source': 'operator', 'local_id': '17894942519169tnup8fm1'},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T17:44:00+00:00', 'end': '2026-09-15T18:45:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '1789497903642tpiuf3rar'},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T18:45:00+00:00', 'end': '2026-09-15T18:59:00+00:00', 'category': 'Clean Hopper', 'delay': ['Mechanical Capping', 'Project Specific', 'Clean Hopper'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Restack Material Within the Material Barge', 'tsca': None, 'area_source': 'operator', 'local_id': '17894987997549355rf6na'},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T18:59:00+00:00', 'end': '2026-09-15T19:41:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '17895012739680gm68mg76'},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T19:41:00+00:00', 'end': '2026-09-15T20:00:00+00:00', 'category': 'Clean Hopper', 'delay': ['Mechanical Capping', 'Project Specific', 'Clean Hopper'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Restack Material Within the Material Barge', 'tsca': None, 'area_source': 'operator', 'local_id': '1789502400888uqu6men0v'},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T20:00:00+00:00', 'end': '2026-09-15T20:39:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '1789504755918kpycgdb39'},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T20:39:00+00:00', 'end': '2026-09-15T21:10:00+00:00', 'category': 'Clean Hopper', 'delay': ['Mechanical Capping', 'Project Specific', 'Clean Hopper'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Restack Material Within the Material Barge', 'tsca': None, 'area_source': 'operator', 'local_id': '1789506625277cpiql0vd4'},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T21:10:00+00:00', 'end': '2026-09-15T21:31:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '17895079156555zhd0zet7'},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T21:31:00+00:00', 'end': '2026-09-15T21:35:00+00:00', 'category': 'Fuel Equipment', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Fuel Equipment'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Fuel Placement Plant', 'tsca': None, 'area_source': 'operator', 'local_id': '1789508150735r0tbpsb2m'},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-15T21:35:00+00:00', 'end': '2026-09-15T22:00:00+00:00', 'category': 'STARTUP/SHUTDOWN', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Shutdown for the Day', 'tsca': None, 'area_source': 'operator', 'local_id': '1789508152768u7dk5irca'},
        {'report_date': '2026-09-16', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-16T10:00:00+00:00', 'end': '2026-09-16T11:16:00+00:00', 'category': 'STARTUP/SHUTDOWN', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Safety Meeting/Startup for the Day', 'tsca': None, 'area_source': 'operator', 'local_id': '1789557410169tbb1dv709'},
        {'report_date': '2026-09-16', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-16T11:16:00+00:00', 'end': '2026-09-16T11:35:00+00:00', 'category': 'Rotate/Move Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Rotate/Move Barge'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Reposition Material Barge', 'tsca': None, 'area_source': 'operator', 'local_id': '1789558547529f3g9wdgrd'},
        {'report_date': '2026-09-16', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-16T11:35:00+00:00', 'end': '2026-09-16T11:42:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '1789558932046jenno54zh'},
        {'report_date': '2026-09-16', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-16T11:42:00+00:00', 'end': '2026-09-16T12:14:00+00:00', 'category': 'Sensors/DredgePack/GPS', 'delay': ['Mechanical Capping', 'Survey/Sample', 'Sensors/DredgePack/GPS'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Upload Updated Matrix', 'tsca': None, 'area_source': 'operator', 'local_id': '1789560898513l1odzxvqo'},
        {'report_date': '2026-09-16', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-16T12:14:00+00:00', 'end': '2026-09-16T13:39:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '178956594996563rlaxb7u'},
        {'report_date': '2026-09-16', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-16T13:39:00+00:00', 'end': '2026-09-16T13:51:00+00:00', 'category': 'Move Placement Plant', 'delay': ['Mechanical Capping', 'Movement', 'Move Placement Plant'], 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Move Placement Plant to DMU-1', 'tsca': None, 'area_source': 'operator', 'local_id': '178956905857728f30h0ja'},
        {'report_date': '2026-09-16', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-16T13:51:00+00:00', 'end': '2026-09-16T15:22:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '17895721506717211a3zru'},
        {'report_date': '2026-09-16', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-16T15:22:00+00:00', 'end': '2026-09-16T17:29:00+00:00', 'category': 'Change Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Change Barge'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Change Material Barge', 'tsca': None, 'area_source': 'operator', 'local_id': '1789579781754p55nhmdki'},
        {'report_date': '2026-09-16', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-16T17:29:00+00:00', 'end': '2026-09-16T17:39:00+00:00', 'category': 'Move Placement Plant', 'delay': ['Mechanical Capping', 'Movement', 'Move Placement Plant'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Reposition Placement Plant', 'tsca': None, 'area_source': 'operator', 'local_id': '1789580352801ld1iqfhj4'},
        {'report_date': '2026-09-16', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-16T17:39:00+00:00', 'end': '2026-09-16T19:57:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '1789588634828vwr2oexuy'},
        {'report_date': '2026-09-16', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-16T19:57:00+00:00', 'end': '2026-09-16T20:13:00+00:00', 'category': 'Rotate/Move Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Rotate/Move Barge'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Reposition Material Barge', 'tsca': None, 'area_source': 'operator', 'local_id': '1789589616549ajakib6ie'},
        {'report_date': '2026-09-16', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-16T20:13:00+00:00', 'end': '2026-09-16T21:09:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '1789594743523ut75k8hzu'},
        {'report_date': '2026-09-16', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-16T21:09:00+00:00', 'end': '2026-09-16T21:39:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': None},
        {'report_date': '2026-09-16', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-16T21:39:00+00:00', 'end': '2026-09-16T22:00:00+00:00', 'category': 'STARTUP/SHUTDOWN', 'delay': None, 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Shutdown for the Day', 'tsca': None, 'area_source': 'operator', 'local_id': '1789594748677fl9qzw6ds'},
        {'report_date': '2026-09-17', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-17T10:00:00+00:00', 'end': '2026-09-17T11:11:00+00:00', 'category': 'STARTUP/SHUTDOWN', 'delay': None, 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Safety Meeting/Startup for the Day', 'tsca': None, 'area_source': 'operator', 'local_id': '1789643513908g7varyf4j'},
        {'report_date': '2026-09-17', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-17T11:11:00+00:00', 'end': '2026-09-17T13:58:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '1789653481451lew56ke2m'},
        {'report_date': '2026-09-17', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-17T13:58:00+00:00', 'end': '2026-09-17T15:44:00+00:00', 'category': 'Change Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Change Barge'], 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Change Material Barge', 'tsca': None, 'area_source': 'operator', 'local_id': '1789659889993qqff62lol'},
        {'report_date': '2026-09-17', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-17T15:44:00+00:00', 'end': '2026-09-17T15:55:00+00:00', 'category': 'Move Placement Plant', 'delay': ['Mechanical Capping', 'Movement', 'Move Placement Plant'], 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Reposition the Placement Plant Within DMU-2', 'tsca': None, 'area_source': 'operator', 'local_id': '1789660526152vkmxxusit'},
        {'report_date': '2026-09-17', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-17T15:55:00+00:00', 'end': '2026-09-17T16:20:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '17896620037503ke2l79jm'},
        {'report_date': '2026-09-17', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-17T16:20:00+00:00', 'end': '2026-09-17T16:49:00+00:00', 'category': 'Move Placement Plant', 'delay': ['Mechanical Capping', 'Movement', 'Move Placement Plant'], 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Move Placement Plant to DMU-1', 'tsca': None, 'area_source': 'operator', 'local_id': '1789663769004o82fbtqn6'},
        {'report_date': '2026-09-17', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-17T16:49:00+00:00', 'end': '2026-09-17T17:06:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Second-Pass Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '1789664765473a9gxl8dyw'},
        {'report_date': '2026-09-17', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-17T17:06:00+00:00', 'end': '2026-09-17T17:19:00+00:00', 'category': 'Move Placement Plant', 'delay': ['Mechanical Capping', 'Movement', 'Move Placement Plant'], 'area': ['DMU 1'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Move Placement Plant to DMU-2', 'tsca': None, 'area_source': 'operator', 'local_id': '1789665570414nqvr4luj8'},
        {'report_date': '2026-09-17', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-17T17:19:00+00:00', 'end': '2026-09-17T20:06:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '1789675617543i3t5jgerb'},
        {'report_date': '2026-09-17', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-17T20:06:00+00:00', 'end': '2026-09-17T20:29:00+00:00', 'category': 'Rotate/Move Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Rotate/Move Barge'], 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Reposition Material Barge', 'tsca': None, 'area_source': 'operator', 'local_id': '17896769625198u39q1lce'},
        {'report_date': '2026-09-17', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-17T20:29:00+00:00', 'end': '2026-09-17T20:32:00+00:00', 'category': 'Move Placement Plant', 'delay': ['Mechanical Capping', 'Movement', 'Move Placement Plant'], 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Reposition Placement Plant Within DMU-2', 'tsca': None, 'area_source': 'operator', 'local_id': '1789677141088wqvnf0bo3'},
        {'report_date': '2026-09-17', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-17T20:32:00+00:00', 'end': '2026-09-17T21:35:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': 'operator', 'local_id': '1789680958098lpfvqi8dw'},
        {'report_date': '2026-09-17', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-17T21:35:00+00:00', 'end': '2026-09-17T22:00:00+00:00', 'category': 'STARTUP/SHUTDOWN', 'delay': None, 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Shutdown for the Day', 'tsca': None, 'area_source': 'operator', 'local_id': '1789681022465kvrkcmi0t'},
        {'report_date': '2026-09-18', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-18T10:00:00+00:00', 'end': '2026-09-18T10:59:00+00:00', 'category': 'STARTUP/SHUTDOWN', 'delay': None, 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Safety Meeting/Startup for the Day', 'tsca': None, 'area_source': None, 'local_id': '1789729145421b3lr1ig0s'},
        {'report_date': '2026-09-18', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-18T10:59:00+00:00', 'end': '2026-09-18T11:08:00+00:00', 'category': 'Sensors/DredgePack/GPS', 'delay': ['Mechanical Capping', 'Survey/Sample', 'Sensors/DredgePack/GPS'], 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Upload Updated Matrix', 'tsca': None, 'area_source': None, 'local_id': '1789730322762kqdtf6q8z'},
        {'report_date': '2026-09-18', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-18T11:08:00+00:00', 'end': '2026-09-18T13:01:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': None, 'local_id': '1789736502150ylymst9cx'},
        {'report_date': '2026-09-18', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-18T13:01:00+00:00', 'end': '2026-09-18T13:27:00+00:00', 'category': 'Rotate/Move Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Rotate/Move Barge'], 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Reposition Material Barge', 'tsca': None, 'area_source': None, 'local_id': '1789740454128755qh6z4m'},
        {'report_date': '2026-09-18', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-18T13:27:00+00:00', 'end': '2026-09-18T15:13:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': None, 'local_id': '1789744426736yh8snrcx5'},
        {'report_date': '2026-09-18', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-18T15:13:00+00:00', 'end': '2026-09-18T16:45:00+00:00', 'category': 'Change Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Change Barge'], 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Change Material Barge', 'tsca': None, 'area_source': None, 'local_id': '1789749958777wqmd6cav2'},
        {'report_date': '2026-09-18', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-18T16:45:00+00:00', 'end': '2026-09-18T17:02:00+00:00', 'category': 'Move Placement Plant', 'delay': ['Mechanical Capping', 'Movement', 'Move Placement Plant'], 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Move Placement Plant to DMU-2', 'tsca': None, 'area_source': None, 'local_id': '1789750947967aal5t4tje'},
        {'report_date': '2026-09-18', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-18T17:02:00+00:00', 'end': '2026-09-18T17:41:00+00:00', 'category': 'Survey', 'delay': ['Mechanical Capping', 'Survey/Sample', 'Survey'], 'area': ['DMU 2'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Conduct Update Survey', 'tsca': None, 'area_source': None, 'local_id': '17897532854594msv1crm6'},
        {'report_date': '2026-09-18', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-18T17:41:00+00:00', 'end': '2026-09-18T17:55:00+00:00', 'category': 'Move Placement Plant', 'delay': ['Mechanical Capping', 'Movement', 'Move Placement Plant'], 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Move Placement Plant to DMU-3', 'tsca': None, 'area_source': None, 'local_id': '1789754136505jsrcvb88r'},
        {'report_date': '2026-09-18', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-18T17:55:00+00:00', 'end': '2026-09-18T21:36:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': None, 'local_id': '17897673760249dpl88a0q'},
        {'report_date': '2026-09-18', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-18T21:36:00+00:00', 'end': '2026-09-18T21:39:00+00:00', 'category': 'Fuel Equipment', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Fuel Equipment'], 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Fuel Placement Plant', 'tsca': None, 'area_source': None, 'local_id': '1789767559800os162r8sd'},
        {'report_date': '2026-09-18', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-18T21:39:00+00:00', 'end': '2026-09-18T22:00:00+00:00', 'category': 'STARTUP/SHUTDOWN', 'delay': None, 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Shutdown for the Day', 'tsca': None, 'area_source': None, 'local_id': '1789767561711m6faqf85i'},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-19T10:00:00+00:00', 'end': '2026-09-19T11:08:00+00:00', 'category': 'STARTUP/SHUTDOWN', 'delay': None, 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Safety Meeting/Startup for the Day', 'tsca': None, 'area_source': None, 'local_id': '17898161392860rdzyr5s1'},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-19T11:08:00+00:00', 'end': '2026-09-19T11:23:00+00:00', 'category': 'Survey', 'delay': ['Mechanical Capping', 'Survey/Sample', 'Survey'], 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Upload Updated Matrix', 'tsca': None, 'area_source': None, 'local_id': '17898169818897j439di57'},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-19T11:23:00+00:00', 'end': '2026-09-19T11:54:00+00:00', 'category': 'Move Placement Plant', 'delay': ['Mechanical Capping', 'Movement', 'Move Placement Plant'], 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Move Placement Plant to DMU-3', 'tsca': None, 'area_source': None, 'local_id': '17898188934795n5m5tn3d'},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-19T11:54:00+00:00', 'end': '2026-09-19T12:20:00+00:00', 'category': 'Rotate/Move Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Rotate/Move Barge'], 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Reposition Material Barge', 'tsca': None, 'area_source': None, 'local_id': '1789820408701sxen9vtaj'},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-19T12:20:00+00:00', 'end': '2026-09-19T12:42:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': None, 'local_id': '17898217268400f4ps2968'},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-19T12:42:00+00:00', 'end': '2026-09-19T12:53:00+00:00', 'category': 'Rotate/Move Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Rotate/Move Barge'], 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Reposition Material Barge', 'tsca': None, 'area_source': None, 'local_id': '17898224107752828b2bhs'},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-19T12:53:00+00:00', 'end': '2026-09-19T14:21:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': None, 'local_id': '1789827678210ump0eey35'},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-19T14:21:00+00:00', 'end': '2026-09-19T14:31:00+00:00', 'category': 'Rotate/Move Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Rotate/Move Barge'], 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Reposition Material Barge', 'tsca': None, 'area_source': None, 'local_id': '17898301063086gaam8k2v'},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-19T14:31:00+00:00', 'end': '2026-09-19T15:09:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': None, 'local_id': '1789830573970iy9e6bdop'},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-19T15:09:00+00:00', 'end': '2026-09-19T16:23:00+00:00', 'category': 'Change Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Change Barge'], 'area': ['DMU 3'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Change Hopper Barge', 'tsca': None, 'area_source': None, 'local_id': '1789834983812y5r4fvqim'},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-19T16:23:00+00:00', 'end': '2026-09-19T18:45:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 4'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': None, 'local_id': '1789843512366wkz5qtqfq'},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-19T18:45:00+00:00', 'end': '2026-09-19T18:59:00+00:00', 'category': 'Rotate/Move Barge', 'delay': ['Mechanical Capping', 'Barge/Material Transport', 'Rotate/Move Barge'], 'area': ['DMU 4'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Reposition Material Barge', 'tsca': None, 'area_source': None, 'local_id': '1789844344462kizwbh6g1'},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-19T18:59:00+00:00', 'end': '2026-09-19T21:29:00+00:00', 'category': 'ACTIVE PLACEMENT', 'delay': None, 'area': ['DMU 4'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Structural Backfill Placement', 'tsca': None, 'area_source': None, 'local_id': '1789853346498f6gaqyzct'},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-19T21:29:00+00:00', 'end': '2026-09-19T22:14:00+00:00', 'category': 'Survey', 'delay': ['Mechanical Capping', 'Survey/Sample', 'Survey'], 'area': ['DMU 4'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Conduct Update Survey', 'tsca': None, 'area_source': None, 'local_id': '1789856077605d0zxrw7bn'},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'operator': 'Jim Todd', 'start': '2026-09-19T22:14:00+00:00', 'end': '2026-09-19T22:30:00+00:00', 'category': 'STARTUP/SHUTDOWN', 'delay': None, 'area': ['DMU 4'], 'pass_type': None, 'attachment': 'Young 2 CY Clamshell Bucket', 'layer': 'Structural Backfill', 'notes': 'Shutdown for the Week', 'tsca': None, 'area_source': None, 'local_id': '1789856094649sfbd5hmqr'},
    ],
    'metric_values': [
        {'report_date': '2026-09-01', 'metric_key': 'material_loadout', 'value': 644.29},
        {'report_date': '2026-09-02', 'metric_key': 'material_loadout', 'value': 803.32},
        {'report_date': '2026-09-03', 'metric_key': 'material_loadout', 'value': 751.68},
        {'report_date': '2026-09-04', 'metric_key': 'material_loadout', 'value': 319.77},
        {'report_date': '2026-09-05', 'metric_key': 'material_loadout', 'value': 0},
        {'report_date': '2026-09-08', 'metric_key': 'material_loadout', 'value': 0},
        {'report_date': '2026-09-09', 'metric_key': 'material_loadout', 'value': 533.85},
        {'report_date': '2026-09-10', 'metric_key': 'material_loadout', 'value': 540.1},
        {'report_date': '2026-09-11', 'metric_key': 'material_loadout', 'value': 618.89},
        {'report_date': '2026-09-12', 'metric_key': 'material_loadout', 'value': 0},
        {'report_date': '2026-09-14', 'metric_key': 'material_loadout', 'value': 624.47},
        {'report_date': '2026-09-15', 'metric_key': 'material_loadout', 'value': 489.15},
        {'report_date': '2026-09-16', 'metric_key': 'material_loadout', 'value': 617.48},
        {'report_date': '2026-09-17', 'metric_key': 'material_loadout', 'value': 563.39},
        {'report_date': '2026-09-18', 'metric_key': 'material_loadout', 'value': 343.34},
        {'report_date': '2026-09-19', 'metric_key': 'material_loadout', 'value': 0},
    ],
    'report_narratives': [
        {'report_date': '2026-09-01', 'section_key': 'backfill_placement', 'content': 'Backfill Placement is expected to begin mid-September. No backfill material was imported to the site throughout the day.'},
        {'report_date': '2026-09-01', 'section_key': 'dewatering', 'content': 'No dredge material was amended throughout the day.\n\nThree truckloads of Portland cement totaling 75 TON were delivered to the Mineral Building Property today.\n\nCrew members treated pore water from the dredge material hopper barges and rainwater captured in the sump.  Throughout the day, 12,200 GAL of treated water was discharged into Torch Lake. A daily SPA inspection was conducted, resulting in no deficiencies identified.'},
        {'report_date': '2026-09-01', 'section_key': 'dredging', 'content': 'The dredge plant remained on standby until approximately 1:00 PM when Brennan received the Residual Dredging design for DMU-7. Crew members subsequently began Residual Dredging operations within DMU-7. The dredge plant advanced to the south through DMU-7 for the remainder of the day, covering small portions of DMUs 6 and 8 within its cut.'},
        {'report_date': '2026-09-01', 'section_key': 'material_loadout', 'content': "Crew members continued loading out amended dredge material from the SPA bin. Thirteen truckloads (644.29 TON) of amended dredge material were sent to the WM's K&W Landfill throughout the day. 285.55 TON of amended dredge material was added to the project total for TON disposed of on 8/31/2026."},
        {'report_date': '2026-09-01', 'section_key': 'misc', 'content': 'GEI was on-site to assist with the Eastern Shoreline Post-Dredge Sample collection. An EPA representative was on-site throughout the day, and an EGLE representative visited the site in the afternoon.'},
        {'report_date': '2026-09-01', 'section_key': 'mobilization', 'content': 'Crew members continued decontaminating the BMI-103 barge.'},
        {'report_date': '2026-09-01', 'section_key': 'survey', 'content': 'Crew members collected three Post-Dredge samples along the eastern shoreline, within the Fixed Resuspension Control System.'},
        {'report_date': '2026-09-01', 'section_key': 'water_quality_special_instrumentation', 'content': "Air Monitoring and Water Quality Monitoring continued throughout the day. No air or water quality exceedances occurred throughout the day's operations.\n\nTwo Daily Marine Resuspension Controls Inspections were conducted, once in the morning and once late in the day- no corrective actions were needed.  \n\nMonitoring of the optical survey reflectors on the temporary sheet pile wall continued throughout the day. GEI crew members are investigating displacement readings on SMP-15. No settling/tilting of the sheeting have been identified during visual inspections near the SMP-15 monitoring location."},
        {'report_date': '2026-09-02', 'section_key': 'backfill_placement', 'content': 'Backfill Placement is expected to begin mid-September. No backfill material was imported to the site throughout the day.'},
        {'report_date': '2026-09-02', 'section_key': 'dewatering', 'content': 'No dredge material was amended throughout the day.\n\nCrew members began offloading amended dredge material into the bin from the JFB 4476 barge. \n\nTwo truckloads of Portland cement totaling 50 TON were delivered to the Mineral Building Property today.\n\nCrew members pumped water from barge decontamination operations into frac tanks; no water was treated throughout the day. A daily SPA inspection was conducted, resulting in no deficiencies identified'},
        {'report_date': '2026-09-02', 'section_key': 'dredging', 'content': 'Crew members continued residual dredging operations within DMU-7. The dredge plant advanced to the south through DMU-7 throughout the day, covering small portions of DMUs 6 and 8 within its cut.'},
        {'report_date': '2026-09-02', 'section_key': 'material_loadout', 'content': "Crew members continued loading out amended dredge material from the SPA bin. Seventeen truckloads totaling 803.32 TON of amended dredge material were sent to the WM's K&W Landfill throughout the day."},
        {'report_date': '2026-09-02', 'section_key': 'misc', 'content': 'An EPA representative was on-site throughout the day.'},
        {'report_date': '2026-09-02', 'section_key': 'mobilization', 'content': 'Decontamination of the BMI-103 barge was completed.'},
        {'report_date': '2026-09-02', 'section_key': 'survey', 'content': 'The Brennan Survey Team checked-in survey equipment and verified the bucket cutting edge elevation prior to commencing dredging operations for the day. Additionally a QC dredge progress survey was conducted in the morning and afternoon.'},
        {'report_date': '2026-09-02', 'section_key': 'water_quality_special_instrumentation', 'content': "Air Monitoring and Water Quality Monitoring continued throughout the day. No air or water quality exceedances occurred throughout the day's operations.\n\nTwo Daily Marine Resuspension Controls Inspections were conducted, once in the morning and once late in the day- no corrective actions were needed.  \n\nMonitoring of the optical survey reflectors on the temporary sheet pile wall continued throughout the day."},
        {'report_date': '2026-09-03', 'section_key': 'backfill_placement', 'content': 'Backfill Placement is expected to begin mid-September. No backfill material was imported to the site throughout the day.'},
        {'report_date': '2026-09-03', 'section_key': 'dewatering', 'content': 'No dredge material was amended throughout the day.\n\nOffloading of the amended dredge material into the bin from the JFB 4476 barge continued throughout the morning. Midmorning, after the barge was emptied, crew members mobilized the JFB 4476 barge to the dredge plant and transported the BMI-102 barge to the amendment plant. Crew members pumped off water and amended the dredge material in the BMI-102 barge for the remainder of the day, using 22 TON of Portland cement to amend approximately 750 CY of dredge material.\n\nThree truckloads of Portland cement totaling 76 TON were delivered to the Mineral Building Property today.\n\nCrew members continued treating water stored in frac tanks and pore water from the BMI-102 barge. Throughout the day, the crew discharged 9,100 GAL of treated water into Torch Lake. A daily SPA inspection was conducted, and no deficiencies were identified.'},
        {'report_date': '2026-09-03', 'section_key': 'dredging', 'content': 'Residual dredging operations continued within DMU-7. The dredge plant advanced to the south through DMU-7 throughout the day, covering small portions of DMUs 6 and 8 within the cut.'},
        {'report_date': '2026-09-03', 'section_key': 'material_loadout', 'content': "Amended dredge material load out from the SPA bin continued. Sixteen truckloads totaling 751.68 TON of amended dredge material were sent to the WM's K&W Landfill throughout the day."},
        {'report_date': '2026-09-03', 'section_key': 'misc', 'content': 'An EPA representative was on-site throughout the day.'},
        {'report_date': '2026-09-03', 'section_key': 'mobilization', 'content': 'None.'},
        {'report_date': '2026-09-03', 'section_key': 'survey', 'content': 'The Brennan Survey Team checked-in survey equipment and verified the bucket cutting edge elevation prior to commencing dredging operations for the day. Additionally a QC dredge progress survey was conducted of residual dredging operations in DMU-7 in the morning and again in the afternoon.'},
        {'report_date': '2026-09-03', 'section_key': 'water_quality_special_instrumentation', 'content': "Air Monitoring and Water Quality Monitoring continued throughout the day. No air or water quality exceedances occurred throughout the day's operations.\n\nTwo Daily Marine Resuspension Controls Inspections were conducted, once in the morning and once late in the day - no corrective actions were needed.  \n\nMonitoring of the optical survey reflectors on the temporary sheet pile wall continued throughout the day."},
        {'report_date': '2026-09-04', 'section_key': 'backfill_placement', 'content': 'Backfill Placement is expected to begin mid-September. No backfill material was imported to the site throughout the day.'},
        {'report_date': '2026-09-04', 'section_key': 'dewatering', 'content': 'Crew members continued amending dredge material within the BMI-102 barge in the morning. 87 TON of Portland cement was utilized to further amend the dredge material within the BMI-102 barge.\n\nIn the early afternoon, crew members began offloading amended dredge material from the BMI-102 barge into the bin.\n\nCrew members continued treating water stored in frac tanks and pore water from the BMI-102 barge. Throughout the day, the crew discharged 38,600 GAL of treated water into Torch Lake. A daily SPA inspection was conducted, and no deficiencies were identified.'},
        {'report_date': '2026-09-04', 'section_key': 'dredging', 'content': 'Residual dredging operations continued within DMU-7 in the morning. In the late morning, crew members moved the dredge plant to DMU-5 to conduct Residual Dredging operations. The dredge plant advanced south for the remainder of the day, covering a small portion of DMU-6 within the cut.'},
        {'report_date': '2026-09-04', 'section_key': 'material_loadout', 'content': "Amended dredge material load out from the SPA bin continued. Six truckloads totaling 319.77 TON of amended dredge material were sent to the WM's K&W Landfill in the morning. Due to site conditions at the landfill, dredge material loadout operations were suspended. Loadout operations are expected to resume on 9/8/2026. To end the day, crew members decontaminated four on-road haul trucks and trailers."},
        {'report_date': '2026-09-04', 'section_key': 'misc', 'content': 'None.'},
        {'report_date': '2026-09-04', 'section_key': 'mobilization', 'content': 'None.'},
        {'report_date': '2026-09-04', 'section_key': 'survey', 'content': 'The Brennan Survey Team checked-in survey equipment and verified the bucket cutting edge elevation prior to commencing dredging operations for the day. In the late morning, a QA Post-Dredge Verification Survey was conducted on DMU-7 residual dredging progress. The Post-Residual Dredge Survey Verification Package for DMU-7 was subsequently submitted for Government review in the afternoon.'},
        {'report_date': '2026-09-04', 'section_key': 'water_quality_special_instrumentation', 'content': "Air Monitoring and Water Quality Monitoring continued throughout the day. No air or water quality exceedances occurred throughout the day's operations.\n\nTwo Daily Marine Resuspension Controls Inspections were conducted, once in the morning and once late in the day - no corrective actions were needed.  \n\nMonitoring of the optical survey reflectors on the temporary sheet pile wall continued throughout the day."},
        {'report_date': '2026-09-05', 'section_key': 'backfill_placement', 'content': 'Backfill Placement is expected to begin mid-September.'},
        {'report_date': '2026-09-05', 'section_key': 'dewatering', 'content': 'In the morning, crew members finished offloading amended dredge material from the BMI-102 barge into the bin. Midday, crew members mobilized the BMI-102 barge to the dredge plant and the JFB 4476 barge to the amendment plant. No dredge material was amended throughout the day.\n\nCrew members continued treating water stored in frac tanks and pore water from the BMI-102 barge. Throughout the day, the crew discharged 22,500 GAL of treated water into Torch Lake. The crew conducted a daily SPA inspection and identified no deficiencies.'},
        {'report_date': '2026-09-05', 'section_key': 'dredging', 'content': 'Residual dredging operations continued within DMU-5. Throughout the day, the dredge plant advanced to the southwest within the cut. Dredging operations were suspended at 4:30 PM to fuel and secure equipment on the dredge plant in preparation for the holiday weekend.'},
        {'report_date': '2026-09-05', 'section_key': 'material_loadout', 'content': 'None.'},
        {'report_date': '2026-09-05', 'section_key': 'misc', 'content': 'Crew members secured the site and all equipment before departing the site for the holiday weekend. Operations will resume on Tuesday, September 8th following the extended Labor Day weekend.'},
        {'report_date': '2026-09-05', 'section_key': 'mobilization', 'content': 'None.'},
        {'report_date': '2026-09-05', 'section_key': 'survey', 'content': 'The Brennan Survey Team checked-in survey equipment and verified the bucket cutting edge elevation prior to commencing dredging operations for the day. In the morning, a QC post-dredge progress survey was conducted. An additional QC post-dredge progress survey was conducted during the barge swap midday.'},
        {'report_date': '2026-09-05', 'section_key': 'water_quality_special_instrumentation', 'content': "Air Monitoring and Water Quality Monitoring continued throughout the day. No air or water quality exceedances occurred throughout the day's operations.\n\nTwo Daily Marine Resuspension Controls Inspections were conducted, once in the morning and once late in the day - no corrective actions were needed.  \n\nMonitoring of the optical survey reflectors on the temporary sheet pile wall continued throughout the day."},
        {'report_date': '2026-09-08', 'section_key': 'backfill_placement', 'content': 'Backfill Placement is expected to begin mid-September.'},
        {'report_date': '2026-09-08', 'section_key': 'dewatering', 'content': 'Crew members continued amending dredge material within the JFB 4476 barge throughout the day.  70 TON of Portland cement was utilized to amend material within the barge.\n\nCrew members continued treating water stored in frac tanks and the sump throughout the day.  61,700 GAL of treated water were discharged into Torch Lake.  A daily SPA inspection was conducted, no deficiencies were identified.  A post-rainfall SESC BMP inspection was conducted, no deficiencies were identified.'},
        {'report_date': '2026-09-08', 'section_key': 'dredging', 'content': 'Crew members resumed residual Mechanical Dredging Operations within DMU-5. Throughout the day, the dredge plant advanced south through DMU-5. '},
        {'report_date': '2026-09-08', 'section_key': 'material_loadout', 'content': 'Due to heavy rainfall at near the K&W Landfill site, no amended dredge material was disposed from the site throughout the day.'},
        {'report_date': '2026-09-08', 'section_key': 'misc', 'content': 'None.'},
        {'report_date': '2026-09-08', 'section_key': 'mobilization', 'content': 'A rental scissor lift was demobilized from the site.'},
        {'report_date': '2026-09-08', 'section_key': 'survey', 'content': 'The Brennan Survey Team checked-in survey equipment and verified the bucket cutting edge elevation prior to commencing dredging operations for the day. In the afternoon, a QC post-dredge progress survey was conducted. \n\nA technician from GEI collected two 21AA and three 2NS QA/QC samples from their respective sources.'},
        {'report_date': '2026-09-08', 'section_key': 'water_quality_special_instrumentation', 'content': "Air Monitoring and Water Quality Monitoring continued throughout the day. No air or water quality exceedances occurred throughout the day's operations.\n\nTwo Daily Marine Resuspension Controls Inspections were conducted, once in the early and once late in the day - no corrective actions were needed.  \n\nMonitoring of the optical survey reflectors on the temporary sheet pile wall continued throughout the day. The weekly monitoring report of the Temporary Sheet Pile Wall for the week of 8/31 has been uploading to the project SharePoint site."},
        {'report_date': '2026-09-09', 'section_key': 'backfill_placement', 'content': 'Backfill Placement is expected to begin mid-September. 211.67 TON of 21AA Structural Backfill Material were imported to site throughout the afternoon.'},
        {'report_date': '2026-09-09', 'section_key': 'dewatering', 'content': 'Crew members continued amending dredge material within the JFB 4476 barge throughout the day.  21.3 TON of Portland cement was utilized to amend material within the barge.\n\nCrew members continued treating water stored in frac tanks and the sump throughout the day.  23,200 GAL of treated water were discharged into Torch Lake.  A daily SPA inspection was conducted, no deficiencies were identified.'},
        {'report_date': '2026-09-09', 'section_key': 'dredging', 'content': 'Crew members continued residual Mechanical Dredging Operations within DMU-5, completing project dredging operations just after 12:00.  The dredge plant was then shifted to standby for high winds and return to the staging area.'},
        {'report_date': '2026-09-09', 'section_key': 'material_loadout', 'content': 'Throughout the day, 10 loads (533.85 TON) of amended dredge material was sent to the WM K&W Landfill.'},
        {'report_date': '2026-09-09', 'section_key': 'misc', 'content': 'None.'},
        {'report_date': '2026-09-09', 'section_key': 'mobilization', 'content': 'No equipment was mobilized/demobilized.'},
        {'report_date': '2026-09-09', 'section_key': 'survey', 'content': 'The Brennan Survey Team checked-in survey equipment and verified the bucket cutting edge elevation prior to commencing dredging operations for the day. A comprehensive QA Post-Dredge survey was conducted of the entire work area.\n\nThe DMU-5 Residual Post-Dredge Survey package was submitted and received approval in the afternoon.'},
        {'report_date': '2026-09-09', 'section_key': 'water_quality_special_instrumentation', 'content': "Air Monitoring and Water Quality Monitoring continued throughout the day. No air or water quality exceedances occurred throughout the day's operations.\n\nTwo Daily Marine Resuspension Controls Inspections were conducted, once in the early and once late in the day - no corrective actions were needed.  \n\nMonitoring of the optical survey reflectors on the temporary sheet pile wall continued throughout the day. "},
        {'report_date': '2026-09-10', 'section_key': 'backfill_placement', 'content': 'Backfill Placement is expected to begin on 9/11. 10 loads (527.45 TON) of 21AA Structural Backfill Material were imported to site throughout the afternoon.'},
        {'report_date': '2026-09-10', 'section_key': 'dewatering', 'content': 'Crew members amended dredge material within the BMI 102 barge throughout the day.  21.6 TON of Portland cement was utilized to amend material within the barge.  The Sennebogen 840E was tracked to shore from the JFB 4450 Barge following the conclusion of amendment operations.  The Allu head was decontaminated, and a clamshell bucket was attached to the machine.\n\nCrew members continued treating water stored in frac tanks and the sump throughout the day.  46,400 GAL of treated water were discharged into Torch Lake.  A daily SPA inspection was conducted, no deficiencies were identified.'},
        {'report_date': '2026-09-10', 'section_key': 'dredging', 'content': "Crew members shifted the mechanical dredge plant to the staging area in the morning and unloaded the CAT 374 from the *Dean Smith* barge.  The CAT 374's bucket was decontaminated in the lined area of the SPA."},
        {'report_date': '2026-09-10', 'section_key': 'material_loadout', 'content': 'Throughout the day, 12 loads (540.1 TON) of amended dredge material was sent to the WM K&W Landfill.'},
        {'report_date': '2026-09-10', 'section_key': 'misc', 'content': 'None.'},
        {'report_date': '2026-09-10', 'section_key': 'mobilization', 'content': 'A rented JLG ES2632 Scissor Lift and skid steer brush attachment were delivered to site today.'},
        {'report_date': '2026-09-10', 'section_key': 'survey', 'content': 'The Brennan Survey Team checked-in survey equipment in the morning and worked on outfitting the Sennebogen 840E with positioning equipment for backfill placement.'},
        {'report_date': '2026-09-10', 'section_key': 'water_quality_special_instrumentation', 'content': "Air Monitoring and Water Quality Monitoring continued throughout the day. No air or water quality exceedances occurred throughout the day's operations.\n\nTwo Daily Marine Resuspension Controls Inspections were conducted, once in the early and once late in the day - no corrective actions were needed.  \n\nMonitoring of the optical survey reflectors on the temporary sheet pile wall continued throughout the day. "},
        {'report_date': '2026-09-11', 'section_key': 'backfill_placement', 'content': 'Backfill Placement commenced in the afternoon.  203 yards of 21AA Structural Backfill Material were placed in DMUs 1 and 11. \n\n8 loads (423.6 TON) of 21AA Structural Backfill Material were imported to site throughout the day.'},
        {'report_date': '2026-09-11', 'section_key': 'dewatering', 'content': 'Dredged sediment amendment concluded on 9/10.\n\nCrew members continued treating water stored in frac tanks and the sump throughout the day.  5,802 GAL of treated water were discharged into Torch Lake.  A daily SPA inspection was conducted, no deficiencies were identified.\n\nJFB 4476 Barge Decontamination continued.'},
        {'report_date': '2026-09-11', 'section_key': 'dredging', 'content': 'Mechanical dredging operations were completed on 9/10/2026.'},
        {'report_date': '2026-09-11', 'section_key': 'material_loadout', 'content': 'Throughout the day, 13 loads (618.9 TON) of amended dredge material was sent to the WM K&W Landfill.'},
        {'report_date': '2026-09-11', 'section_key': 'misc', 'content': 'None.'},
        {'report_date': '2026-09-11', 'section_key': 'mobilization', 'content': 'No equipment was mobilized/demobilized today.'},
        {'report_date': '2026-09-11', 'section_key': 'survey', 'content': 'The Brennan Survey Team checked-in survey equipment in the morning and calibrated the Sennebogen 840E positioning equipment prior to beginning backfill operations.'},
        {'report_date': '2026-09-11', 'section_key': 'water_quality_special_instrumentation', 'content': "Air Monitoring and Water Quality Monitoring continued throughout the day. No air or water quality exceedances occurred throughout the day's operations.\n\nTwo Daily Marine Resuspension Controls Inspections were conducted, once in the morning and once late in the day - no corrective actions were needed.  \n\nMonitoring of the optical survey reflectors on the temporary sheet pile wall continued throughout the day. "},
        {'report_date': '2026-09-12', 'section_key': 'backfill_placement', 'content': 'Backfill Placement continued through the day.  384 yards of 21AA Structural Backfill Material were placed in DMUs 1, 2, and 11. \n\nNo backfill materials were imported to site throughout the day.'},
        {'report_date': '2026-09-12', 'section_key': 'dewatering', 'content': 'Dredged sediment amendment concluded on 9/10.\n\nNo water treatment occurred throughout the day.  No treated water was discharged into Torch Lake.  A daily SPA inspection was conducted, no deficiencies were identified.\n\nJFB 4476 Barge Decontamination was completed.'},
        {'report_date': '2026-09-12', 'section_key': 'dredging', 'content': 'Mechanical dredging operations were completed on 9/10/2026.'},
        {'report_date': '2026-09-12', 'section_key': 'material_loadout', 'content': 'No material was loaded out throughout the day (Saturday landfill shutdown).'},
        {'report_date': '2026-09-12', 'section_key': 'misc', 'content': 'None.'},
        {'report_date': '2026-09-12', 'section_key': 'mobilization', 'content': 'No equipment was mobilized/demobilized today.'},
        {'report_date': '2026-09-12', 'section_key': 'survey', 'content': 'The Brennan Survey Team checked-in survey equipment in the morning and calibrated the Sennebogen 840E positioning equipment prior to beginning backfill operations.\n\nAM and PM QC hydrographic surveys were conducted in the active backfill area.'},
        {'report_date': '2026-09-12', 'section_key': 'water_quality_special_instrumentation', 'content': "Air Monitoring and Water Quality Monitoring continued throughout the day. No air or water quality exceedances occurred throughout the day's operations.\n\nTurbidity buoys/sondes were cleaned and serviced.\n\nTwo Daily Marine Resuspension Controls Inspections were conducted, once in the morning and once late in the day - no corrective actions were needed.  \n\nMonitoring of the optical survey reflectors on the temporary sheet pile wall continued throughout the day. "},
        {'report_date': '2026-09-14', 'section_key': 'backfill_placement', 'content': 'Crew members resumed mechanical placement operations. The placement plant began the day conducting Structural Backfill placement within DMU-1. Throughout the day, the placement plant advanced south along the sheet pile wall, placing Structural Backfill within DMUs 1-3.\n\nCrew members loaded the BMI-103 with Structural Backfill throughout the morning.\n\nOne truckload of 21AA backfill material totaling 47 TON was imported to the site throughout the day. '},
        {'report_date': '2026-09-14', 'section_key': 'dewatering', 'content': 'No water treatment occurred throughout the day. No treated water was discharged into Torch Lake. A daily SPA inspection was conducted, no deficiencies were identified.'},
        {'report_date': '2026-09-14', 'section_key': 'dredging', 'content': 'Mechanical dredging operations were completed on 9/10/2026.'},
        {'report_date': '2026-09-14', 'section_key': 'material_loadout', 'content': 'Twelve truckloads totaling 624.47 TON of amended dredged sediment were shipped to the WM K&W Landfill throughout the day.'},
        {'report_date': '2026-09-14', 'section_key': 'misc', 'content': "Additional CY were added for 9/13's placement following the QC update survey."},
        {'report_date': '2026-09-14', 'section_key': 'mobilization', 'content': 'A rental frac tank, bin blocks, and a rental Deere 460E-II Haul Truck were decontaminated in preparation for demobilization.'},
        {'report_date': '2026-09-14', 'section_key': 'survey', 'content': 'The Brennan Survey Team checked-in survey equipment in the morning and verified water level elevation.\n\nA QC placement progress and stockpile volume survey was conducted in the afternoon.'},
        {'report_date': '2026-09-14', 'section_key': 'water_quality_special_instrumentation', 'content': "Air Monitoring and Water Quality Monitoring continued throughout the day. No air or water quality exceedances occurred throughout the day's operations.\n\nTwo Daily Marine Resuspension Controls Inspections were conducted, once in the morning and once late in the day - no corrective actions were needed.  \n\nMonitoring of the optical survey reflectors on the temporary sheet pile wall continued throughout the day. "},
        {'report_date': '2026-09-15', 'section_key': 'backfill_placement', 'content': 'Crew members continued mechanical placement operations. The placement plant began the day conducting Structural Backfill placement within DMU-2. The placement plant advanced to the south along the sheet pile wall within DMUs 2 and 3 until midmorning, when the placement plant moved into DMU-1 following an update survey. The placement plant advanced to the southwest along the sheet pile wall within DMU-1 for the remainder of the day, placing a small portion of DMU-11.\n\nCrew members loaded the JFB 4476 barge with Structural Backfill throughout the afternoon.\n\nEleven truckloads of 21AA backfill material totaling 540 TON was imported to the site throughout the day. '},
        {'report_date': '2026-09-15', 'section_key': 'dewatering', 'content': 'Crew members treated rainwater and water generated from decontamination operations captured in the sump. Throughout the day, 27,500 GAL of treated water was discharged \ninto Torch Lake. A daily SPA inspection was conducted, resulting in no deficiencies identified.'},
        {'report_date': '2026-09-15', 'section_key': 'material_loadout', 'content': 'Ten truckloads totaling 489.15 TON of amended dredged sediment were shipped to the WM K&W Landfill throughout the day.'},
        {'report_date': '2026-09-15', 'section_key': 'misc', 'content': 'A representative from RHP Risk Management was on-site throughout the day.'},
        {'report_date': '2026-09-15', 'section_key': 'mobilization', 'content': 'Crew members continued decontaminating bin blocks and miscellaneous WTS equipment. Housekeeping activities occurred throughout the Mineral Building Property in the morning.'},
        {'report_date': '2026-09-15', 'section_key': 'survey', 'content': 'The Brennan Survey Team checked-in survey equipment in the morning. Additionally, a QC placement progress survey was collected in the morning and afternoon.\n\nA Brennan surveyor installed a spotting camera on the placement plant in the afternoon.'},
        {'report_date': '2026-09-15', 'section_key': 'water_quality_special_instrumentation', 'content': "Air Monitoring and Water Quality Monitoring continued throughout the day. No air or water quality exceedances occurred throughout the day's operations.\n\nTwo Daily Marine Resuspension Controls Inspections were conducted, once in the morning and once late in the day - no corrective actions were needed.  \n\nMonitoring of the optical survey reflectors on the temporary sheet pile wall continued throughout the day. "},
        {'report_date': '2026-09-16', 'section_key': 'backfill_placement', 'content': 'Crew members continued structural backfill placement. The placement plant began the day in DMU-1, advancing south along the sheet pile. Midmorning, the placement plant moved north to DMU-1 to target the final lift of structural backfill placement within DMU-1. The placement plant advanced south for the remainder of the day, ending the day in the northern portion of DMU-2.\n\nNine truckloads of 21AA backfill material totaling 457 TON was imported to the site throughout the day. '},
        {'report_date': '2026-09-16', 'section_key': 'dewatering', 'content': 'Crew members conducted decontamination operations of miscellaneous ancillary water treatment equipment. No water was treated or discharged throughout the day. A daily SPA inspection was conducted, resulting in no deficiencies identified.'},
        {'report_date': '2026-09-16', 'section_key': 'material_loadout', 'content': 'Thirteen truckloads totaling 617.48 TON of amended dredged sediment were shipped to the WM K&W Landfill throughout the day.'},
        {'report_date': '2026-09-16', 'section_key': 'misc', 'content': 'None.'},
        {'report_date': '2026-09-16', 'section_key': 'mobilization', 'content': 'In the morning, the rental Deere off-road haul truck was demobilized from the site. Crew members subsequently began disassembling the CAT 374 in preparation for demobilization.\n\nCrew members continued decontaminating bin blocks within the SPA throughout the day.'},
        {'report_date': '2026-09-16', 'section_key': 'survey', 'content': 'The Brennan Survey Team checked-in survey equipment in the morning. Additionally, a QC placement progress survey was collected in the morning and afternoon.'},
        {'report_date': '2026-09-16', 'section_key': 'water_quality_special_instrumentation', 'content': "Air Monitoring and Water Quality Monitoring continued throughout the day. No air or water quality exceedances occurred throughout the day's operations. Midday, data at the background monitor did not upload to the project site due to an issue with the cellular uploading device on the monitor which was resolved for the following mornings operations.\n\nTwo Daily Marine Resuspension Controls Inspections were conducted, once in the morning and once late in the day - no corrective actions were needed.  \n\nMonitoring of the optical survey reflectors on the temporary sheet pile wall continued throughout the day. "},
        {'report_date': '2026-09-17', 'section_key': 'backfill_placement', 'content': 'Crew members continued structural backfill placement. The placement plant began the day in DMU-2, advancing south along the sheet pile. Midmorning, the placement plant moved north to DMU-1 to conduct second-pass structural backfill placement within DMU-1. Following second-pass placement operations within DMU-1, the placement plant moved back to DMU-2 and resumed structural backfill placement. The placement plant advanced south along the sheet pile wall for the remainder of the day.\n\nSeventeen truckloads of 21AA backfill material totaling 886 TON was imported to the site throughout the day. Crew members loaded imported material into the JFB 4476 barge throughout the day.'},
        {'report_date': '2026-09-17', 'section_key': 'dewatering', 'content': 'Crew members conducted decontamination operations of miscellaneous ancillary water treatment equipment. No water was treated or discharged throughout the day. A daily SPA inspection was conducted, resulting in no deficiencies identified.'},
        {'report_date': '2026-09-17', 'section_key': 'material_loadout', 'content': 'Twelve truckloads totaling 563.39 TON of amended dredged sediment were shipped to the WM K&W Landfill throughout the day.'},
        {'report_date': '2026-09-17', 'section_key': 'misc', 'content': 'A field mechanic from United Rentals was on-site to perform routine maintenance on various rental equipment.'},
        {'report_date': '2026-09-17', 'section_key': 'mobilization', 'content': 'Two truckloads of equipment were demobilized from the site throughout the day, including 15 - 4 FT X 16 FT X 12 IN Timber Crane Mats, two mixing heads, two mixing head extensions, miscellaneous hoses, and two Allu tool connexes.\n\nCrew members decontaminated six end-dump trailers utilized for amended dredge material loadout.'},
        {'report_date': '2026-09-17', 'section_key': 'survey', 'content': 'The Brennan Survey Team checked-in survey equipment in the morning. Additionally, a QA Post-Placement Verification Survey was collected midday. The Post-Placement Verification Survey Package for DMU-1 was subsequently submitted in the afternoon.'},
        {'report_date': '2026-09-17', 'section_key': 'water_quality_special_instrumentation', 'content': "Air Monitoring and Water Quality Monitoring continued throughout the day. No air or water quality exceedances occurred throughout the day's operations.\n\nTwo Daily Marine Resuspension Controls Inspections were conducted, once in the morning and once late in the day - no corrective actions were needed.  \n\nMonitoring of the optical survey reflectors on the temporary sheet pile wall continued throughout the day. "},
        {'report_date': '2026-09-18', 'section_key': 'backfill_placement', 'content': 'Crew members continued structural backfill placement. The placement plant began the day in DMU-2, advancing south along the sheet pile. Midday following a QA Post-Placement Verification Survey, crew members resumed structural backfill placement within DMU-3. The placement plant advanced south along the sheet pile wall for the remainder of the day. \n\nForty-two truckloads of 21AA backfill material totaling 2,234 TON was imported to the site throughout the day. Crew members loaded imported material into the BMI 103 barge throughout the day.'},
        {'report_date': '2026-09-18', 'section_key': 'dewatering', 'content': 'Crew members continued decontamination operations of miscellaneous ancillary water treatment equipment. Crew members removed solids captured in the filter boxes and stored the material on the pad in preparation for disposal. No water was treated or discharged throughout the day. A daily SPA inspection was conducted, resulting in no deficiencies identified.'},
        {'report_date': '2026-09-18', 'section_key': 'material_loadout', 'content': 'Eight truckloads totaling 434.34 TON of amended dredged sediment were shipped to the WM K&W Landfill throughout the day.'},
        {'report_date': '2026-09-18', 'section_key': 'misc', 'content': 'None.'},
        {'report_date': '2026-09-18', 'section_key': 'mobilization', 'content': 'Crew members continued decontaminating miscellaneous equipment within the SPA, including HDPE Mats, Bin Blocks, diesel water pumps, and a rental frac tank. In the afternoon, a rental manlift was exchanged at the MBP.\n\nTwo end-dump trailers utilized for hauling amended dredge material were decontaminated in the afternoon.'},
        {'report_date': '2026-09-18', 'section_key': 'survey', 'content': 'The Brennan Survey Team checked-in survey equipment in the morning. Additionally, a QA Post-Placement Verification Survey was collected midday. The Post-Placement Verification Survey Package for DMU-2 was subsequently submitted in the afternoon.'},
        {'report_date': '2026-09-18', 'section_key': 'water_quality_special_instrumentation', 'content': "Air Monitoring and Water Quality Monitoring continued throughout the day. No air or water quality exceedances occurred throughout the day's operations.\n\nTwo Daily Marine Resuspension Controls Inspections were conducted, once in the morning and once late in the day - no corrective actions were needed.  \n\nMonitoring of the optical survey reflectors on the temporary sheet pile wall continued throughout the day. "},
        {'report_date': '2026-09-19', 'section_key': 'backfill_placement', 'content': 'Crew members continued structural backfill placement. The placement plant began the day in DMU-3, advancing south along the sheet pile wall into DMU-4. Structural backfill placement of the 21AA material was completed by the end of the day in DMUs 3 and 4.\n\nNo backfill material was imported to the site throughout the day.'},
        {'report_date': '2026-09-19', 'section_key': 'dewatering', 'content': 'Crew members continued decontamination operations of miscellaneous ancillary water treatment equipment. Throughout the day, the crew continued removing solids captured in the filter boxes and stored the material on the pad in preparation for disposal. No water was treated or discharged throughout the day. A daily SPA inspection was conducted, resulting in no deficiencies identified.'},
        {'report_date': '2026-09-19', 'section_key': 'material_loadout', 'content': 'No amended dredge material was shipped off-site throughout the day.'},
        {'report_date': '2026-09-19', 'section_key': 'misc', 'content': 'None.'},
        {'report_date': '2026-09-19', 'section_key': 'mobilization', 'content': 'Crew members completed the decontamination of the concrete bin blocks and began decontaminating and staging HDPE mats for demobilization. Additionally, crew members began removing rock within the SPA above the liner and staging it on the bin pad in preparation for disposal.'},
        {'report_date': '2026-09-19', 'section_key': 'survey', 'content': 'The Brennan Survey Team checked-in survey equipment in the morning. Two QA Post-Backfill Verification Surveys were collected in the evening of the structural backfill progress. The Post-Backfill Survey Verification Packages were submitted for government review the following day. '},
        {'report_date': '2026-09-19', 'section_key': 'water_quality_special_instrumentation', 'content': "Air Monitoring and Water Quality Monitoring continued throughout the day. No water quality exceedances occurred throughout the day's operations. An anomalous spike occurred at the Downwind monitoring location in the late afternoon.\n\nTwo Daily Marine Resuspension Controls Inspections were conducted, once in the morning and once late in the day - no corrective actions were needed.  \n\nMonitoring of the optical survey reflectors on the temporary sheet pile wall continued throughout the day. "},
    ],
    'crew': [
        {'report_date': '2026-09-01', 'category': 'Brennan Management, Survey, Safety', 'sort_order': 10, 'count': 5, 'hours': 60},
        {'report_date': '2026-09-01', 'category': 'Brennan Dredge Crew', 'sort_order': 20, 'count': 11, 'hours': 132},
        {'report_date': '2026-09-01', 'category': 'Brennan Temporary Sheet Pile Installation Crew', 'sort_order': 30, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-01', 'category': 'Brennan Mechanic', 'sort_order': 40, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-01', 'category': 'Subcontractors', 'sort_order': 50, 'count': 1, 'hours': 3},
        {'report_date': '2026-09-01', 'category': 'Brennan Water Treatment Crew', 'sort_order': 60, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-02', 'category': 'Brennan Management, Survey, Safety', 'sort_order': 10, 'count': 5, 'hours': 60},
        {'report_date': '2026-09-02', 'category': 'Brennan Dredge Crew', 'sort_order': 20, 'count': 11, 'hours': 132},
        {'report_date': '2026-09-02', 'category': 'Brennan Temporary Sheet Pile Installation Crew', 'sort_order': 30, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-02', 'category': 'Brennan Mechanic', 'sort_order': 40, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-02', 'category': 'Subcontractors', 'sort_order': 50, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-02', 'category': 'Brennan Water Treatment Crew', 'sort_order': 60, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-03', 'category': 'Brennan Management, Survey, Safety', 'sort_order': 10, 'count': 5, 'hours': 60},
        {'report_date': '2026-09-03', 'category': 'Brennan Dredge Crew', 'sort_order': 20, 'count': 11, 'hours': 132},
        {'report_date': '2026-09-03', 'category': 'Brennan Temporary Sheet Pile Installation Crew', 'sort_order': 30, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-03', 'category': 'Brennan Mechanic', 'sort_order': 40, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-03', 'category': 'Subcontractors', 'sort_order': 50, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-03', 'category': 'Brennan Water Treatment Crew', 'sort_order': 60, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-04', 'category': 'Brennan Management, Survey, Safety', 'sort_order': 10, 'count': 3, 'hours': 36},
        {'report_date': '2026-09-04', 'category': 'Brennan Dredge Crew', 'sort_order': 20, 'count': 11, 'hours': 132},
        {'report_date': '2026-09-04', 'category': 'Brennan Temporary Sheet Pile Installation Crew', 'sort_order': 30, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-04', 'category': 'Brennan Mechanic', 'sort_order': 40, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-04', 'category': 'Subcontractors', 'sort_order': 50, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-04', 'category': 'Brennan Water Treatment Crew', 'sort_order': 60, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-05', 'category': 'Brennan Management, Survey, Safety', 'sort_order': 10, 'count': 3, 'hours': 30},
        {'report_date': '2026-09-05', 'category': 'Brennan Dredge Crew', 'sort_order': 20, 'count': 10, 'hours': 110},
        {'report_date': '2026-09-05', 'category': 'Brennan Temporary Sheet Pile Installation Crew', 'sort_order': 30, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-05', 'category': 'Brennan Mechanic', 'sort_order': 40, 'count': 1, 'hours': 11},
        {'report_date': '2026-09-05', 'category': 'Subcontractors', 'sort_order': 50, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-05', 'category': 'Brennan Water Treatment Crew', 'sort_order': 60, 'count': 1, 'hours': 11},
        {'report_date': '2026-09-08', 'category': 'Brennan Management, Survey, Safety', 'sort_order': 10, 'count': 6, 'hours': 72},
        {'report_date': '2026-09-08', 'category': 'Brennan Dredge Crew', 'sort_order': 20, 'count': 14, 'hours': 168},
        {'report_date': '2026-09-08', 'category': 'Brennan Temporary Sheet Pile Installation Crew', 'sort_order': 30, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-08', 'category': 'Brennan Mechanic', 'sort_order': 40, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-08', 'category': 'Subcontractors', 'sort_order': 50, 'count': 1, 'hours': 4},
        {'report_date': '2026-09-08', 'category': 'Brennan Water Treatment Crew', 'sort_order': 60, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-09', 'category': 'Brennan Management, Survey, Safety', 'sort_order': 10, 'count': 6, 'hours': 72},
        {'report_date': '2026-09-09', 'category': 'Brennan Dredge Crew', 'sort_order': 20, 'count': 14, 'hours': 168},
        {'report_date': '2026-09-09', 'category': 'Brennan Temporary Sheet Pile Installation Crew', 'sort_order': 30, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-09', 'category': 'Brennan Mechanic', 'sort_order': 40, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-09', 'category': 'Subcontractors', 'sort_order': 50, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-09', 'category': 'Brennan Water Treatment Crew', 'sort_order': 60, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-10', 'category': 'Brennan Management, Survey, Safety', 'sort_order': 10, 'count': 3, 'hours': 36},
        {'report_date': '2026-09-10', 'category': 'Brennan Dredge Crew', 'sort_order': 20, 'count': 12, 'hours': 168},
        {'report_date': '2026-09-10', 'category': 'Brennan Temporary Sheet Pile Installation Crew', 'sort_order': 30, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-10', 'category': 'Brennan Mechanic', 'sort_order': 40, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-10', 'category': 'Subcontractors', 'sort_order': 50, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-10', 'category': 'Brennan Water Treatment Crew', 'sort_order': 60, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-11', 'category': 'Brennan Management, Survey, Safety', 'sort_order': 10, 'count': 3, 'hours': 36},
        {'report_date': '2026-09-11', 'category': 'Brennan Dredge Crew', 'sort_order': 20, 'count': 11, 'hours': 156},
        {'report_date': '2026-09-11', 'category': 'Brennan Temporary Sheet Pile Installation Crew', 'sort_order': 30, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-11', 'category': 'Brennan Mechanic', 'sort_order': 40, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-11', 'category': 'Subcontractors', 'sort_order': 50, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-11', 'category': 'Brennan Water Treatment Crew', 'sort_order': 60, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-12', 'category': 'Brennan Management, Survey, Safety', 'sort_order': 10, 'count': 4, 'hours': 48},
        {'report_date': '2026-09-12', 'category': 'Brennan Dredge Crew', 'sort_order': 20, 'count': 11, 'hours': 156},
        {'report_date': '2026-09-12', 'category': 'Brennan Temporary Sheet Pile Installation Crew', 'sort_order': 30, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-12', 'category': 'Brennan Mechanic', 'sort_order': 40, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-12', 'category': 'Subcontractors', 'sort_order': 50, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-12', 'category': 'Brennan Water Treatment Crew', 'sort_order': 60, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-14', 'category': 'Brennan Management, Survey, Safety', 'sort_order': 10, 'count': 7, 'hours': 84},
        {'report_date': '2026-09-14', 'category': 'Brennan Dredge Crew', 'sort_order': 20, 'count': 10, 'hours': 120},
        {'report_date': '2026-09-14', 'category': 'Brennan Temporary Sheet Pile Installation Crew', 'sort_order': 30, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-14', 'category': 'Brennan Mechanic', 'sort_order': 40, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-14', 'category': 'Subcontractors', 'sort_order': 50, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-14', 'category': 'Brennan Water Treatment Crew', 'sort_order': 60, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-15', 'category': 'Brennan Management, Survey, Safety', 'sort_order': 10, 'count': 7, 'hours': 84},
        {'report_date': '2026-09-15', 'category': 'Brennan Dredge Crew', 'sort_order': 20, 'count': 10, 'hours': 120},
        {'report_date': '2026-09-15', 'category': 'Brennan Temporary Sheet Pile Installation Crew', 'sort_order': 30, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-15', 'category': 'Brennan Mechanic', 'sort_order': 40, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-15', 'category': 'Subcontractors', 'sort_order': 50, 'count': 1, 'hours': 8},
        {'report_date': '2026-09-15', 'category': 'Brennan Water Treatment Crew', 'sort_order': 60, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-16', 'category': 'Brennan Management, Survey, Safety', 'sort_order': 10, 'count': 7, 'hours': 84},
        {'report_date': '2026-09-16', 'category': 'Brennan Dredge Crew', 'sort_order': 20, 'count': 10, 'hours': 120},
        {'report_date': '2026-09-16', 'category': 'Brennan Temporary Sheet Pile Installation Crew', 'sort_order': 30, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-16', 'category': 'Brennan Mechanic', 'sort_order': 40, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-16', 'category': 'Subcontractors', 'sort_order': 50, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-16', 'category': 'Brennan Water Treatment Crew', 'sort_order': 60, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-17', 'category': 'Brennan Management, Survey, Safety', 'sort_order': 10, 'count': 4, 'hours': 48},
        {'report_date': '2026-09-17', 'category': 'Brennan Dredge Crew', 'sort_order': 20, 'count': 10, 'hours': 120},
        {'report_date': '2026-09-17', 'category': 'Brennan Temporary Sheet Pile Installation Crew', 'sort_order': 30, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-17', 'category': 'Brennan Mechanic', 'sort_order': 40, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-17', 'category': 'Subcontractors', 'sort_order': 50, 'count': 1, 'hours': 4},
        {'report_date': '2026-09-17', 'category': 'Brennan Water Treatment Crew', 'sort_order': 60, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-18', 'category': 'Brennan Management, Survey, Safety', 'sort_order': 10, 'count': 4, 'hours': 48},
        {'report_date': '2026-09-18', 'category': 'Brennan Dredge Crew', 'sort_order': 20, 'count': 10, 'hours': 114},
        {'report_date': '2026-09-18', 'category': 'Brennan Temporary Sheet Pile Installation Crew', 'sort_order': 30, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-18', 'category': 'Brennan Mechanic', 'sort_order': 40, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-18', 'category': 'Subcontractors', 'sort_order': 50, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-18', 'category': 'Brennan Water Treatment Crew', 'sort_order': 60, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-19', 'category': 'Brennan Management, Survey, Safety', 'sort_order': 10, 'count': 4, 'hours': 48},
        {'report_date': '2026-09-19', 'category': 'Brennan Dredge Crew', 'sort_order': 20, 'count': 9, 'hours': 108},
        {'report_date': '2026-09-19', 'category': 'Brennan Temporary Sheet Pile Installation Crew', 'sort_order': 30, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-19', 'category': 'Brennan Mechanic', 'sort_order': 40, 'count': 1, 'hours': 12},
        {'report_date': '2026-09-19', 'category': 'Subcontractors', 'sort_order': 50, 'count': 0, 'hours': 0},
        {'report_date': '2026-09-19', 'category': 'Brennan Water Treatment Crew', 'sort_order': 60, 'count': 1, 'hours': 12},
    ],
    'safety': [
        {'report_date': '2026-09-01', 'culture_tenant': 'ACCOUNTABILITY', 'plan_of_day': 'Continue Loadout\nContinue Barge Decontamination\nContinue Mechanical Dredging\nConduct Post-Dredge Sample Collection', 'incidents_to_report': 'None.', 'safety_meeting_topic': 'Washing Equipment', 'afternoon_meeting_topic': 'None.', 'jha_aha_reviewed': 'None.', 'high_risk_task': 'Crane Work', 'temp_high_f': 82, 'temp_low_f': 55, 'wind_high_mph': 17, 'wind_gusts_mph': 30, 'wind_avg_mph': 5, 'wind_direction': 'NW', 'precip_today_in': 0, 'conditions': 'Clear', 'signature_name': '', 'ssho_name': None, 'next_day_summary': 'Continue Mechanical Dredging\nContinue Material Amendment/Loadout'},
        {'report_date': '2026-09-02', 'culture_tenant': 'COMMUNICATION', 'plan_of_day': 'Continue Loadout\nContinue Barge Decontamination\nContinue Mechanical Dredging', 'incidents_to_report': 'None.', 'safety_meeting_topic': 'Importance of Stretch and Flex', 'afternoon_meeting_topic': 'None.', 'jha_aha_reviewed': 'None.', 'high_risk_task': 'Crane Work', 'temp_high_f': 75, 'temp_low_f': 57, 'wind_high_mph': 16, 'wind_gusts_mph': 25, 'wind_avg_mph': 9, 'wind_direction': 'NW', 'precip_today_in': 0, 'conditions': 'Clear', 'signature_name': '', 'ssho_name': None, 'next_day_summary': 'Continue Loadout\nContinue Mechanical Dredging'},
        {'report_date': '2026-09-03', 'culture_tenant': 'ENVIRONMENTAL STEWARDSHIP', 'plan_of_day': 'Continue Dredge Material Loadout\nContinue Mechanical Dredging\nContinue Water Treatment', 'incidents_to_report': 'None.', 'safety_meeting_topic': 'Noise - Proper Hearing Protection', 'afternoon_meeting_topic': 'None.', 'jha_aha_reviewed': 'None.', 'high_risk_task': 'Mechanical Dredging', 'temp_high_f': 75, 'temp_low_f': 50, 'wind_high_mph': 15, 'wind_gusts_mph': 21, 'wind_avg_mph': 5, 'wind_direction': 'NE', 'precip_today_in': 0, 'conditions': 'Clear', 'signature_name': '', 'ssho_name': None, 'next_day_summary': 'Continue Dredge Material Loadout\nContinue Mechanical Dredging\nContinue Water Treatment'},
        {'report_date': '2026-09-04', 'culture_tenant': 'FUN', 'plan_of_day': 'Continue Mechanical Dredging\nContinue Water Treatment', 'incidents_to_report': 'None.', 'safety_meeting_topic': 'SBO Friday Discussion', 'afternoon_meeting_topic': 'None.', 'jha_aha_reviewed': 'None.', 'high_risk_task': 'Mechanical', 'temp_high_f': 66, 'temp_low_f': 60, 'wind_high_mph': 15, 'wind_gusts_mph': 23, 'wind_avg_mph': 10, 'wind_direction': 'E', 'precip_today_in': 0.48, 'conditions': 'Fair Morning/Afternoon Rain', 'signature_name': '', 'ssho_name': None, 'next_day_summary': 'Continue Mechanical Dredging\nContinue Water Treatment\nSecure Site for the Holiday Weekend'},
        {'report_date': '2026-09-05', 'culture_tenant': 'COMMUNICATION', 'plan_of_day': 'Continue Mechanical Dredging\nContinue Water Treatment', 'incidents_to_report': 'None.', 'safety_meeting_topic': 'Inspections', 'afternoon_meeting_topic': 'None.', 'jha_aha_reviewed': 'None.', 'high_risk_task': 'Mechanical Dredging', 'temp_high_f': 75, 'temp_low_f': 57, 'wind_high_mph': 10, 'wind_gusts_mph': None, 'wind_avg_mph': 7, 'wind_direction': 'E', 'precip_today_in': 0, 'conditions': 'Clear', 'signature_name': '', 'ssho_name': None, 'next_day_summary': 'Operations to Resume on 9/8.'},
        {'report_date': '2026-09-08', 'culture_tenant': 'QUALITY', 'plan_of_day': 'Continue Mechanical Dredging\nContinue Material Amendment\nContinue Water Treatment', 'incidents_to_report': 'None.', 'safety_meeting_topic': 'General Safety - Alertness', 'afternoon_meeting_topic': 'Barge Safety', 'jha_aha_reviewed': 'None.', 'high_risk_task': 'Mechanical Dredging Operations', 'temp_high_f': 72, 'temp_low_f': 61, 'wind_high_mph': 15, 'wind_gusts_mph': 31, 'wind_avg_mph': 8, 'wind_direction': 'S', 'precip_today_in': 0.47, 'conditions': 'Cloudy', 'signature_name': '', 'ssho_name': None, 'next_day_summary': 'Continue Mechanical Dredging\nContinue Material Amendment\nContinue Water Treatment\nResume Material Loadout'},
        {'report_date': '2026-09-09', 'culture_tenant': 'SAFETY', 'plan_of_day': 'Continue Mechanical Dredging\nContinue Material Amendment\nContinue Water Treatment', 'incidents_to_report': 'N/A', 'safety_meeting_topic': 'Weekly Safety Podcast', 'afternoon_meeting_topic': None, 'jha_aha_reviewed': 'None', 'high_risk_task': 'Truck Traffic, Barge Movement in High Winds', 'temp_high_f': 72, 'temp_low_f': 63, 'wind_high_mph': 20, 'wind_gusts_mph': 51, 'wind_avg_mph': 11, 'wind_direction': 'SW', 'precip_today_in': 0, 'conditions': 'Clear', 'signature_name': None, 'ssho_name': 'Rocky Levercom', 'next_day_summary': 'Return Dean Barge to Staging Area, Decontaminate BMI 102 Barge, Continue Material Amendment, Continue Water Treatment'},
        {'report_date': '2026-09-10', 'culture_tenant': 'ETHICAL BEHAVIOR', 'plan_of_day': 'Move Dredge Plant to Mineral Building Property\nRemove CAT 374 from Dean Smith Barge\nRemove Sennebogen 840E from JFB 4450 Barge\nContinue Material Amendment/Loadout\nContinue Water Treatment\nDecontaminate BMI102 Barge', 'incidents_to_report': 'N/A', 'safety_meeting_topic': 'Health Hazards- Preventing Occupational Illness', 'afternoon_meeting_topic': '', 'jha_aha_reviewed': 'N/A', 'high_risk_task': 'Tracking Equipment On/Off Barges, Truck Traffic', 'temp_high_f': 70, 'temp_low_f': 52, 'wind_high_mph': 17, 'wind_gusts_mph': 29, 'wind_avg_mph': 8, 'wind_direction': 'NW', 'precip_today_in': 0, 'conditions': 'Clear', 'signature_name': None, 'ssho_name': 'Rocky Levercom', 'next_day_summary': 'Track Sennebogen 840E on to Dean Smith barge and begin material placement\nContinue Water Treatment\nContinue Material Loadout\nDecontaminate BMI102 Barge'},
        {'report_date': '2026-09-11', 'culture_tenant': 'EFFICIENCY', 'plan_of_day': 'Move Backfill Plant to LLRA\nCommence Backfill Operations\nContinue Material Loadout\nContinue Water Treatment\nDecontaminate JFB4476 Barge', 'incidents_to_report': 'N/A', 'safety_meeting_topic': 'Mechanical Capping Overview, Sennebogen Barge Safety', 'afternoon_meeting_topic': 'N/A', 'jha_aha_reviewed': 'Mechanical Capping/Backfill Operations', 'high_risk_task': 'Backfill Startup, Truck Traffic, Decontamination', 'temp_high_f': 81, 'temp_low_f': 50, 'wind_high_mph': 15, 'wind_gusts_mph': 25, 'wind_avg_mph': 7, 'wind_direction': 'S', 'precip_today_in': 0, 'conditions': 'Clear', 'signature_name': None, 'ssho_name': 'Rocky Levercom', 'next_day_summary': 'Continue Backfill Operations\nNo Loadout (Saturday)\nContinue Water Treatment\nComplete JFB4476 Decontamination, Fill With 21AA'},
        {'report_date': '2026-09-12', 'culture_tenant': 'SAFETY', 'plan_of_day': 'Continue Backfill Operations\nDecontaminate JFB4476 Barge', 'incidents_to_report': 'N/A', 'safety_meeting_topic': 'Drill Day Report- August Drill Day 2026 Recap', 'afternoon_meeting_topic': 'N/A', 'jha_aha_reviewed': 'N/A', 'high_risk_task': 'Mechanical Placement Operations, Hopper Barge Loading', 'temp_high_f': 75, 'temp_low_f': 60, 'wind_high_mph': 21, 'wind_gusts_mph': 37, 'wind_avg_mph': 8, 'wind_direction': 'SW', 'precip_today_in': 0.11, 'conditions': 'Cloudy', 'signature_name': None, 'ssho_name': 'Rocky Levercom', 'next_day_summary': 'N/A (Sunday Shutdown)'},
        {'report_date': '2026-09-14', 'culture_tenant': 'ACCOUNTABILITY', 'plan_of_day': 'Continue Backfill Operations\nContinue Decontamination Operations\nContinue Material Import/Export', 'incidents_to_report': 'None.', 'safety_meeting_topic': 'Inspections (Quality, Frequency, Follow-Up)', 'afternoon_meeting_topic': 'None.', 'jha_aha_reviewed': 'None.', 'high_risk_task': 'Mechanical Placement', 'temp_high_f': 64, 'temp_low_f': 37, 'wind_high_mph': 14, 'wind_gusts_mph': 20, 'wind_avg_mph': 6, 'wind_direction': 'NW', 'precip_today_in': 0.01, 'conditions': 'Clear', 'signature_name': '', 'ssho_name': 'Rocky Levercom', 'next_day_summary': 'Continue Backfill Operations\nContinue Decontamination Operations\nContinue Material Import/Export\nResume Water Treatment'},
        {'report_date': '2026-09-15', 'culture_tenant': 'QUALITY', 'plan_of_day': 'Continue Mechanical Placement\nContinue Water Treatment\nContinue Dredge Material Loadout\nStage Equipment For Demobilization', 'incidents_to_report': 'None.', 'safety_meeting_topic': 'Brennan Internal Safety Podcast', 'afternoon_meeting_topic': 'None.', 'jha_aha_reviewed': 'None.', 'high_risk_task': 'Conducting Barge Swaps', 'temp_high_f': 66, 'temp_low_f': 54, 'wind_high_mph': 22, 'wind_gusts_mph': 54, 'wind_avg_mph': 12, 'wind_direction': 'S', 'precip_today_in': 0.79, 'conditions': 'Cloudy/Gale Force Winds', 'signature_name': '', 'ssho_name': None, 'next_day_summary': 'Continue Mechanical Placement\nContinue Water Treatment\nContinue Dredge Material Loadout\nContinue Miscellaneous Demobilization'},
        {'report_date': '2026-09-16', 'culture_tenant': 'DEDICATION', 'plan_of_day': 'Continue Mechanical Placement\nContinue Dredge Material Loadout\nContinue Demobilization Operations', 'incidents_to_report': 'None.', 'safety_meeting_topic': 'Kann Boat Working Compacity', 'afternoon_meeting_topic': 'None.', 'jha_aha_reviewed': 'None.', 'high_risk_task': 'Crane Work', 'temp_high_f': 66, 'temp_low_f': 44, 'wind_high_mph': 16, 'wind_gusts_mph': 26, 'wind_avg_mph': 6, 'wind_direction': 'NW', 'precip_today_in': 0, 'conditions': 'Fair/Breezy', 'signature_name': '', 'ssho_name': None, 'next_day_summary': 'Continue Mechanical Placement\nContinue Dredge Material Loadout\nTreat and Discharge Water as Needed\nContinue Demobilization Operations'},
        {'report_date': '2026-09-17', 'culture_tenant': 'PROFESSIONALISM', 'plan_of_day': 'Continue Mechanical Placement\nContinue Dredge Material Loadout\nContinue Demobilization Operations', 'incidents_to_report': 'None.', 'safety_meeting_topic': 'Jon Boat Safety', 'afternoon_meeting_topic': 'None.', 'jha_aha_reviewed': 'None.', 'high_risk_task': 'Mechanical Dredging Operations', 'temp_high_f': 67, 'temp_low_f': 54, 'wind_high_mph': 14, 'wind_gusts_mph': 17, 'wind_avg_mph': 6, 'wind_direction': 'NW', 'precip_today_in': 0, 'conditions': 'Fair', 'signature_name': '', 'ssho_name': None, 'next_day_summary': 'Continue Mechanical Placement\nContinue Dredge Material Loadout\nContinue Demobilization Operations'},
        {'report_date': '2026-09-18', 'culture_tenant': 'DEVELOPMENT', 'plan_of_day': 'Continue Mechanical Placement\nContinue Dredge Material Loadout\nContinue Demobilization Operations', 'incidents_to_report': 'None.', 'safety_meeting_topic': 'SBO Friday Discussion', 'afternoon_meeting_topic': 'None.', 'jha_aha_reviewed': 'None.', 'high_risk_task': 'Mechanical Placement', 'temp_high_f': 59, 'temp_low_f': 48, 'wind_high_mph': 15, 'wind_gusts_mph': 21, 'wind_avg_mph': 8, 'wind_direction': 'E', 'precip_today_in': None, 'conditions': 'Fair/Breezy', 'signature_name': '', 'ssho_name': None, 'next_day_summary': 'Continue Mechanical Placement\nContinue Dredge Material Loadout\nContinue Demobilization Operations'},
        {'report_date': '2026-09-19', 'culture_tenant': 'TEAMWORK', 'plan_of_day': 'Continue Mechanical Placement\nContinue Dredge Material Loadout\nContinue Demobilization Operations', 'incidents_to_report': 'None.', 'safety_meeting_topic': 'AHA Review', 'afternoon_meeting_topic': 'None.', 'jha_aha_reviewed': 'Mobilization and Site Preparation', 'high_risk_task': 'Mechanical Placement', 'temp_high_f': 64, 'temp_low_f': 42, 'wind_high_mph': 9, 'wind_gusts_mph': None, 'wind_avg_mph': 6, 'wind_direction': 'E', 'precip_today_in': 0, 'conditions': 'Fair', 'signature_name': '', 'ssho_name': None, 'next_day_summary': 'None.'},
    ],
    'production': [
        {'report_date': '2026-09-01', 'equipment': 'CAT 374', 'area': ['DMU 6'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 1, 'area_sf': 35, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-01', 'equipment': 'CAT 374', 'area': ['DMU 7'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 241, 'area_sf': 3486, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-01', 'equipment': 'CAT 374', 'area': ['DMU 8'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 54, 'area_sf': 1462, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'area': ['DMU 13'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 8, 'area_sf': 305, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'area': ['DMU 6'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 74, 'area_sf': 1977, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'area': ['DMU 7'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 393, 'area_sf': 8214, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-02', 'equipment': 'CAT 374', 'area': ['DMU 8'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 35, 'area_sf': 386, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-03', 'equipment': 'CAT 374', 'area': ['DMU 6'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 72, 'area_sf': 1232, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-03', 'equipment': 'CAT 374', 'area': ['DMU 7'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 288, 'area_sf': 6822, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-03', 'equipment': 'CAT 374', 'area': ['DMU 8'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 9, 'area_sf': 332, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-04', 'equipment': 'CAT 374', 'area': ['DMU 5'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 195, 'area_sf': 5730, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-04', 'equipment': 'CAT 374', 'area': ['DMU 6'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 23, 'area_sf': 1308, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-04', 'equipment': 'CAT 374', 'area': ['DMU 7'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 236, 'area_sf': 1315, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-05', 'equipment': 'CAT 374', 'area': ['DMU 4'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 1, 'area_sf': 305, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-05', 'equipment': 'CAT 374', 'area': ['DMU 5'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 436, 'area_sf': 12266, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-08', 'equipment': 'CAT 374', 'area': ['DMU 5'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 115, 'area_sf': 5265, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-09', 'equipment': 'CAT 374', 'area': ['DMU 7'], 'pass_value': 'residual', 'attachment': 'Empire Environmental Lidded Bucket', 'layer': None, 'material': None, 'tsca': None, 'volume': 123, 'area_sf': 2983, 'tons': None, 'conversion_factor': None, 'notes': None},
        {'report_date': '2026-09-11', 'equipment': 'Sennebogen 840', 'area': ['DMU 1'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 198.046875, 'area_sf': 2404, 'tons': 253.5, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-11', 'equipment': 'Sennebogen 840', 'area': ['DMU 11'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 5, 'area_sf': 105, 'tons': 6.4, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-12', 'equipment': 'Sennebogen 840', 'area': ['DMU 1'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 397, 'area_sf': 5258, 'tons': 508.16, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-12', 'equipment': 'Sennebogen 840', 'area': ['DMU 11'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 16.015625, 'area_sf': 231, 'tons': 20.5, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-12', 'equipment': 'Sennebogen 840', 'area': ['DMU 2'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 5, 'area_sf': 66, 'tons': 6.4, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-14', 'equipment': 'Sennebogen 840', 'area': ['DMU 1'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 101, 'area_sf': 1558, 'tons': 129.28, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-14', 'equipment': 'Sennebogen 840', 'area': ['DMU 2'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 242, 'area_sf': 3220, 'tons': 309.76, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-14', 'equipment': 'Sennebogen 840', 'area': ['DMU 3'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 31, 'area_sf': 324, 'tons': 39.68, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'area': ['DMU 1'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 408, 'area_sf': 3198, 'tons': 522.24, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'area': ['DMU 11'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 6, 'area_sf': 123, 'tons': 7.68, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'area': ['DMU 2'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 108, 'area_sf': 1330, 'tons': 138.24, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-15', 'equipment': 'Sennebogen 840', 'area': ['DMU 3'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 95, 'area_sf': 1614, 'tons': 121.6, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-16', 'equipment': 'Sennebogen 840', 'area': ['DMU 1'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 612, 'area_sf': 3368, 'tons': 783.36, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-16', 'equipment': 'Sennebogen 840', 'area': ['DMU 2'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 51, 'area_sf': 285, 'tons': 65.28, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-17', 'equipment': 'Sennebogen 840', 'area': ['DMU 1'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 32, 'area_sf': 1952, 'tons': 40.96, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-17', 'equipment': 'Sennebogen 840', 'area': ['DMU 2'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 401.99999999999994, 'area_sf': 3103, 'tons': 514.56, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-18', 'equipment': 'Sennebogen 840', 'area': ['DMU 2'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 284, 'area_sf': 1449, 'tons': 363.52, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-18', 'equipment': 'Sennebogen 840', 'area': ['DMU 3'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 433, 'area_sf': 5403, 'tons': 554.24, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'area': ['DMU 3'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 214, 'area_sf': 1784, 'tons': 273.92, 'conversion_factor': 1.28, 'notes': None},
        {'report_date': '2026-09-19', 'equipment': 'Sennebogen 840', 'area': ['DMU 4'], 'pass_value': None, 'attachment': None, 'layer': 'Structural Backfill', 'material': None, 'tsca': None, 'volume': 619, 'area_sf': 5065, 'tons': 792.32, 'conversion_factor': 1.28, 'notes': None},
    ],
    'air_daily': [
        {'report_date': '2026-09-01', 'activity': 'Barge Decontamination, Mechanical Dredging, Material Loadout', 'notes': "No exceedances occurred throughout the day's operations."},
        {'report_date': '2026-09-02', 'activity': 'Mechanical Dredging, Material Offload, Material Loadout', 'notes': "No exceedances occurred throughout the day's operations."},
        {'report_date': '2026-09-03', 'activity': 'Mechanical Dredging, Material Offload/Amendment, Material Loadout', 'notes': "No exceedances occurred throughout the day's operations."},
        {'report_date': '2026-09-04', 'activity': 'Mechanical Dredging, Material Amendment/Offload, Water Treatment', 'notes': "No exceedances occurred throughout the day's operations."},
        {'report_date': '2026-09-05', 'activity': 'Mechanical Dredging, Material Offload, Water Treatment', 'notes': "No exceedances occurred throughout the day's operations."},
        {'report_date': '2026-09-08', 'activity': 'Mechanical Dredging, Material Amendment, Water Treatment', 'notes': "No exceedances occurred throughout the day's operations. "},
        {'report_date': '2026-09-09', 'activity': 'Mechanical Dredging, Material Amendment/Loadout, Backfill Material Delivery', 'notes': 'No outages/exceedances'},
        {'report_date': '2026-09-10', 'activity': 'Material amendment/loadout, Barge reconfiguration', 'notes': 'No outages/exceedances today'},
        {'report_date': '2026-09-11', 'activity': 'Commencement of Backfill Operations, Loadout', 'notes': 'No exceedances/outages'},
        {'report_date': '2026-09-12', 'activity': 'Backfill Placement, Decontamination Ops', 'notes': 'No outages/exceedances'},
        {'report_date': '2026-09-14', 'activity': 'Backfill Placement, Equipment Decontamination', 'notes': "No exceedances occurred throughout the day's operations"},
        {'report_date': '2026-09-15', 'activity': 'Mechanical Placement, Water Treatment, Dredge Material Loadout', 'notes': "No exceedances occurred throughout the day's operations."},
        {'report_date': '2026-09-16', 'activity': 'Mechanical Placement, Demobilization, Dredge Material Disposal', 'notes': "No exceedances occurred throughout the day's operations."},
        {'report_date': '2026-09-17', 'activity': 'Mechanical Placement, Material Loadout, Demobilization', 'notes': "No exceedances occurred throughout the day's operations."},
        {'report_date': '2026-09-18', 'activity': 'Mechanical Placement. Material Loadout, Demobilization', 'notes': "No exceedances occurred throughout the day's operations."},
        {'report_date': '2026-09-19', 'activity': 'Mechanical Placement, Demobilization ', 'notes': 'An anomalous spike occurred at the Downwind monitoring location in the late afternoon.'},
    ],
    'water_notes': [
        {'report_date': '2026-09-01', 'notes': "No exceedances occurred throughout the day's operations.", 'reference_ntu': None},
        {'report_date': '2026-09-02', 'notes': "No exceedances occurred throughout the day's operations.", 'reference_ntu': None},
        {'report_date': '2026-09-03', 'notes': "No exceedances occurred throughout the day's operations.", 'reference_ntu': None},
        {'report_date': '2026-09-04', 'notes': "No exceedances occurred throughout the day's operations.", 'reference_ntu': None},
        {'report_date': '2026-09-05', 'notes': "No exceedances occurred throughout the day's operations.", 'reference_ntu': None},
        {'report_date': '2026-09-08', 'notes': "No exceedances occurred throughout the day's operations.", 'reference_ntu': None},
        {'report_date': '2026-09-09', 'notes': 'No exceedances today.', 'reference_ntu': None},
        {'report_date': '2026-09-10', 'notes': 'No exceedances recorded today', 'reference_ntu': None},
        {'report_date': '2026-09-11', 'notes': 'No exceedances throughout day.', 'reference_ntu': None},
        {'report_date': '2026-09-12', 'notes': 'Buoy Maintenance was conducted at mid-day.  No outages or exceedances.', 'reference_ntu': None},
        {'report_date': '2026-09-14', 'notes': "No exceedances occurred throughout the day's operations", 'reference_ntu': None},
        {'report_date': '2026-09-15', 'notes': "No exceedances occurred throughout the day's operations.", 'reference_ntu': None},
        {'report_date': '2026-09-16', 'notes': 'An outage at the background monitor occurred from 12:00 PM until 6:00 PM. The outage has since been resolved.', 'reference_ntu': None},
        {'report_date': '2026-09-17', 'notes': "No exceedances occurred throughout the day's operations.", 'reference_ntu': None},
        {'report_date': '2026-09-18', 'notes': "No exceedances occurred throughout the day's operations.", 'reference_ntu': None},
        {'report_date': '2026-09-19', 'notes': "No exceedances occurred throughout the day's operations.", 'reference_ntu': None},
    ],
}


def main():
    print(json.dumps(run(load_config()), sort_keys=True))
    return 0


raise SystemExit(main())
