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


SCRIPT_VERSION = "v1-jfb-monitoring-test-seed-r2"

PARAM_CONTRACT_VERSION = "jfb_monitoring_test_seed_params_v1"

STABLE_PARAM_CONTRACT = [
    {"name": "mode", "type": "TEXT", "default": "self_check"},
    {"name": "param_contract_version", "type": "TEXT", "default": PARAM_CONTRACT_VERSION},
    {"name": "dry_run", "type": "BOOLEAN", "default": True},
    {"name": "output_shape", "type": "TEXT", "default": "summary"},
]

PUBLIC_RUNNER_PARAMS = [item["name"] for item in STABLE_PARAM_CONTRACT]

VALID_MODES = ["self_check", "seed_only"]

PARAM_DEBUG = {}

TOKEN_ENDPOINT = "https://login.microsoftonline.com/39f6cf5e-725d-4087-a1e3-e7b4442c867e/oauth2/v2.0/token"
API_SCOPE = "https://pivotlyidentityplatformdev.onmicrosoft.com/api/.default"
CLIENT_ID_SECRET = "jfb-pivotly-api-client-id"
CLIENT_SECRET_SECRET = "jfb-pivotly-api-client-secret"

CORE_DATA_SYSTEM = "core"

PIVOTLY_API_DIAGNOSTIC = {}

SECRET_ERROR_REMEDIATION = {
    "secret_not_allowed": (
        "No approved Allowed Secrets grant for this script. "
        "Admin -> Variables -> Allowed Secrets: Consumer Type=script, "
        "Consumer Slug=<this script's slug>, Variable Slug=<secret slug>, Status=approved."
    ),
    "secret_not_found": (
        "The runner could not read the secret. On dev this also means the Allowed Secrets row "
        "is missing or its Consumer Slug does not match this script's slug exactly."
    ),
    "runner_signed_token_rejected": (
        "The runner signed-token was rejected for this job. Re-run from the Portal "
        "rather than replaying an old job, and confirm the script record is enabled."
    ),
    "secret_accessor_missing": "Unexpected Secret wrapper shape; report the runner version.",
    "secret_read_exception": "Inspect error_detail in secret_reads for the raw runner message.",
}

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
            CLIENT_ID_SECRET: {"value": "present" if client_id else "missing", "error_code": id_error, "error_detail": id_detail},
            CLIENT_SECRET_SECRET: {"value": "present" if client_secret else "missing", "error_code": secret_error, "error_detail": secret_detail},
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
            return None

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
    failures = check_seed_shape()

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
    failures = check_seed_shape()
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

    try:
        ids = seed_projects(api, dry_run, steps["jfb_projects"])
        seed_configs(api, "jfb_water_monitoring_config", WATER_CONFIGS, ids, dry_run, steps["jfb_water_monitoring_config"])
        seed_configs(api, "jfb_air_monitoring_config", AIR_CONFIGS, ids, dry_run, steps["jfb_air_monitoring_config"])
        seed_reports(api, ids, dry_run, steps["jfb_reports"])
    except Exception as exc:
        return result("seed_only", False, "Seeding stopped on a read error.", 0, {"error": safe_text(exc, 1200), "steps": steps})

    errors = [domain + " " + e for domain, step in steps.items() for e in step["errors"]]
    created = sum(len(step["created"]) for step in steps.values())
    would_create = sum(len(step["would_create"]) for step in steps.values())

    if dry_run:
        message = "Dry run: would create " + str(would_create) + " row(s). No writes performed. Re-run with dry_run=false."
    elif errors:
        message = "Seeding completed with errors: " + str(created) + " row(s) created, " + str(len(errors)) + " error(s)."
    else:
        message = "Seeding complete: " + str(created) + " row(s) created. Existing rows were left untouched."

    return result(
        "seed_only",
        len(errors) == 0,
        message,
        would_create if dry_run else created,
        {
            "steps": steps,
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


def main():
    print(json.dumps(run(load_config()), sort_keys=True))
    return 0


raise SystemExit(main())
