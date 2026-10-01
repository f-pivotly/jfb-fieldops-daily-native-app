
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


SCRIPT_VERSION = "v1-jfb-reference-data-seed-r8"

SCRIPT_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "pivotly:jfb:reference-data-seed:v1")

PARAM_CONTRACT_VERSION = "jfb_reference_seed_params_v1"

STABLE_PARAM_CONTRACT = [
    {"name": "mode", "type": "TEXT", "default": "self_check"},
    {"name": "param_contract_version", "type": "TEXT", "default": PARAM_CONTRACT_VERSION},
    {"name": "dry_run", "type": "BOOLEAN", "default": True},
    {"name": "domain_scope", "type": "TEXT", "default": "all"},
    {"name": "output_shape", "type": "TEXT", "default": "summary"},
    {"name": "app_slug", "type": "TEXT", "default": ""},
]

PUBLIC_RUNNER_PARAMS = [item["name"] for item in STABLE_PARAM_CONTRACT]

VALID_MODES = ["self_check", "seed_only"]

PARAM_DEBUG = {}


TOKEN_ENDPOINT = "https://login.microsoftonline.com/39f6cf5e-725d-4087-a1e3-e7b4442c867e/oauth2/v2.0/token"
API_SCOPE = "https://pivotlyidentityplatformdev.onmicrosoft.com/api/.default"
CLIENT_ID_SECRET = "jfb-pivotly-api-client-id"
CLIENT_SECRET_SECRET = "jfb-pivotly-api-client-secret"


APP_SLUG = "app-jfb-fieldsops-admin"


CORE_DATA_SYSTEM = "core"

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
        "domain_scope": str(param_value("domain_scope", TEXT, "all")),
        "output_shape": str(param_value("output_shape", TEXT, "summary")),
        "app_slug": str(param_value("app_slug", TEXT, "")) or APP_SLUG,
    }

SEED_DATA = {
    "jfb_layer_types": {
        "business_key": "name",
        "rows": [
            {"name": "Armor", "description": "Top protective layer (large rock / riprap)", "sort_order": 10, "active": True},
            {"name": "Cap", "description": "Primary isolation cap (clean fill)", "sort_order": 20, "active": True},
            {"name": "Cover", "description": "Cover layer over cap", "sort_order": 30, "active": True},
            {"name": "Backfill", "description": "Backfill material", "sort_order": 40, "active": True},
            {"name": "Base", "description": "Base layer below cap", "sort_order": 50, "active": True},
            {"name": "Sand", "description": "Sand layer", "sort_order": 60, "active": True},
            {"name": "Gravel", "description": "Gravel layer", "sort_order": 70, "active": True},
            {"name": "Amendment", "description": "Reactive amendment layer", "sort_order": 80, "active": True},
        ],
    },
    "jfb_material_types": {
        "business_key": "name",
        "rows": [
            {"name": "Sand", "description": "Sand material", "sort_order": 10, "active": True},
            {"name": "Gravel", "description": "Gravel material", "sort_order": 20, "active": True},
            {"name": "Rock", "description": "Rock / riprap material", "sort_order": 30, "active": True},
            {"name": "Amended", "description": "Amended material (sand + amendment)", "sort_order": 40, "active": True},
            {"name": "Dredge Slurry", "description": "Hydraulic dredge slurry placement", "sort_order": 50, "active": True},
            {"name": "Clean Fill", "description": "Generic clean fill", "sort_order": 60, "active": True},
            {"name": "Other", "description": "Project-specific catch-all", "sort_order": 99, "active": True},
        ],
    },
    "jfb_component_types": {
        "business_key": "name",
        "rows": [
            {"name": "Sand", "description": "Sand component", "sort_order": 10, "active": True},
            {"name": "Gravel", "description": "Gravel component", "sort_order": 20, "active": True},
            {"name": "Amendment", "description": "Reactive amendment", "sort_order": 30, "active": True},
            {"name": "Open", "description": "Open / placeholder", "sort_order": 99, "active": True},
        ],
    },
    "jfb_work_types": {
        "business_key": "name",
        "rows": [
            {"name": "Hydraulic Dredging"},
            {"name": "Hydraulic Capping"},
            {"name": "Mechanical Dredging"},
            {"name": "Mechanical Capping"},
        ],
    },
    "jfb_culture_tenants": {
        "business_key": "name",
        "rows": [
            {"name": "PROFESSIONALISM", "description": "We hold ourselves to the highest standard in every interaction, on and off the job site.", "sort_order": 10, "active": True},
            {"name": "TEAMWORK", "description": "We work together across crews and disciplines to get the job done safely and well.", "sort_order": 20, "active": True},
            {"name": "FOCUS ON CLIENTS", "description": "We deliver on our commitments and keep the client's goals at the center of every decision.", "sort_order": 30, "active": True},
            {"name": "SAFETY FIRST", "description": "No task is so urgent that it cannot be done safely.", "sort_order": 40, "active": True},
            {"name": "INTEGRITY", "description": "We do the right thing, especially when no one is watching.", "sort_order": 50, "active": True},
            {"name": "CONTINUOUS IMPROVEMENT", "description": "We look for a better way to do the job every single day.", "sort_order": 60, "active": True},
            {"name": "ACCOUNTABILITY", "description": "When problems occur, it is incumbent upon the individual or team to take full ownership and explain the issue at hand so that we can cooperatively, without blame, correct the problem. We actively promote an environment where each of us can openly present our concerns and take responsibility for our actions.", "sort_order": 100, "active": True},
            {"name": "COMMUNICATION", "description": "We believe open and honest communication builds trust, the foundation of relationships. Success is ultimately determined by our interactions with coworkers, customers, suppliers, communities, and other stakeholders.", "sort_order": 160, "active": True},
            {"name": "DEDICATION", "description": "We understand that loyalty to our teammates and dedication to our work are vital to our success. Our individual commitment to work as a cohesive unit creates unique opportunities and makes a rewarding difference in our families' lives.", "sort_order": 110, "active": True},
            {"name": "DEVELOPMENT", "description": "Our future success relies on the continuous development of employee skills. We operate in an environment where we serve as mentors, provide training, and strive to improve every day. We give open and honest feedback so we can further development by learning from experience.", "sort_order": 60, "active": True},
            {"name": "EFFICIENCY", "description": "We conduct all aspects of our work efficiently. Each day, we analyze our activities to identify more efficient means and methods. We are mindful that our competitive edge within the marketplace is based on continuously efficient work operations.", "sort_order": 30, "active": True},
            {"name": "ENVIRONMENTAL STEWARDSHIP", "description": "We recognize that our work can significantly impact the environment. We adhere to all environmental laws, keep our job sites clean, and leave our work areas in better condition than we found them.", "sort_order": 180, "active": True},
            {"name": "ETHICAL BEHAVIOR", "description": "We adhere to the highest ethical standards in every facet of our work. We always comply with the law, stand by our commitments, communicate transparently, and empower every individual, regardless of position, to report unethical behaviors in the workplace.", "sort_order": 170, "active": True},
            {"name": "FAMILY", "description": "Our unique work requires us to spend a large portion of our time away from our families, and we value the significance of a work-life balance. Therefore, Brennan careers must provide better opportunities for our team members and their families.", "sort_order": 130, "active": True},
            {"name": "FINANCIAL MANAGEMENT", "description": "Brennan's success depends on sound financial management. We accept our duty to understand the impact that our expenditures have on the bottom line. We use corporate resources judiciously for the furtherance of executing our work.", "sort_order": 120, "active": True},
            {"name": "FOCUS ON CLIENT", "description": "We provide specialized services to a limited customer base and for this reason, each of our clients is of the utmost importance. Every person in the company is responsible for ensuring customer satisfaction in all aspects of our work. We listen, communicate effectively, and deliver on our promises.", "sort_order": 150, "active": True},
            {"name": "FUN", "description": "We strive to make all aspects of work enjoyable and to show regular appreciation of our successes. Good morale makes Brennan a great place to work.", "sort_order": 140, "active": True},
            {"name": "INNOVATION", "description": "We seek the opportunity for innovation in every task we perform, collectively understanding that innovative ideas arise from even routine or simple tasks. We are empowered to propose and implement innovations that challenge the status quo.", "sort_order": 40, "active": True},
            {"name": "LEADERSHIP", "description": "People come to Brennan because of their skillsets and stay because of their leadership. We realize leaders are not always defined by position; rather, leadership is demonstrated through the ability to positively influence a coworker or client in a manner that upholds the Brennan culture.", "sort_order": 90, "active": True},
            {"name": "QUALITY", "description": "The quality of our work reflects directly on our organization. Quality shows in our finished products and in our professional work practices. A deliberate and consistent focus on high quality leads to customer satisfaction as well as additional opportunities.", "sort_order": 20, "active": True},
            {"name": "RESPECT", "description": "We respect each other, our clients, and our competitors with a humble disposition. We create a work environment that encourages new ideas and fosters respectful resolution of disagreements. Those who cannot respect others are asked to leave.", "sort_order": 80, "active": True},
            {"name": "SAFETY", "description": "Our commitment to safety is the highest priority of our work. It is the critical responsibility of each and every Brennan team member, regardless of position. We pre-plan all features of work, holding ourselves and those around us accountable to stop work whenever the well-being of any individual is compromised.", "sort_order": 10, "active": True},
        ],
    },
    "jfb_metric_sources": {
        "business_key": "value",
        "rows": [
            {"value": "manual", "label": "Manual (PE enters daily)", "unit": None, "sort_order": 10, "result_column": None, "active": True, "description": None},
            {"value": "dvw-jfb-metric-cy-v2", "label": "Auto · CY from production stats", "unit": "CY", "sort_order": 20, "result_column": "total_volume", "active": True, "description": None},
            {"value": "dvw-jfb-metric-sf-v2", "label": "Auto · SF from production stats", "unit": "SF", "sort_order": 30, "result_column": "total_area", "active": True, "description": None},
            {"value": "dvw-jfb-metric-tons-v2", "label": "Auto · Tons from production stats", "unit": "TON", "sort_order": 40, "result_column": "total_tons", "active": True, "description": None},
            {"value": "dvw-jfb-metric-hours-op-v2", "label": "Auto · Operating Hours", "unit": "hrs", "sort_order": 50, "result_column": "op_hours", "active": True, "description": None},
            {"value": "dvw-jfb-metric-hours-delay-v2", "label": "Auto · Delay Hours", "unit": "hrs", "sort_order": 60, "result_column": "delay_hours", "active": True, "description": None},
            {"value": "dvw-jfb-metric-efficiency-v2", "label": "Auto · Efficiency %", "unit": "%", "sort_order": 70, "result_column": "efficiency_pct", "active": True, "description": None},
            {"value": "auto_discharge_mg", "label": "Auto · Water Treatment Discharge MG (pending DB)", "unit": "MG", "sort_order": 80, "result_column": None, "active": True, "description": "No data view yet; renders blank until a discharge source exists, matching the reference app."},
        ],
    },
    "jfb_metric_defaults": {
        "business_key": "metric_key",
        "rows": [
            {"metric_key": "total_cy", "label": "Total Volume Removed", "source": "dvw-jfb-metric-cy-v2", "unit": "CY", "sort_order": 10},
            {"metric_key": "total_sf", "label": "Total Area Covered", "source": "dvw-jfb-metric-sf-v2", "unit": "SF", "sort_order": 20},
            {"metric_key": "hours_op", "label": "Operating Hours", "source": "dvw-jfb-metric-hours-op-v2", "unit": "hrs", "sort_order": 30},
            {"metric_key": "hours_delay", "label": "Delay Hours", "source": "dvw-jfb-metric-hours-delay-v2", "unit": "hrs", "sort_order": 40},
            {"metric_key": "efficiency", "label": "Efficiency", "source": "dvw-jfb-metric-efficiency-v2", "unit": "%", "sort_order": 50},
        ],
    },
    "jfb_narrative_section_defaults": {
        "business_key": "label",
        "rows": [
            {"label": "Mobilization/Demobilization", "sort_order": 10, "is_active": True},
            {"label": "Dredging Operations", "sort_order": 20, "is_active": True},
            {"label": "Dewatering / Water Treatment", "sort_order": 30, "is_active": True},
            {"label": "Survey Operations", "sort_order": 40, "is_active": True},
            {"label": "Sampling", "sort_order": 50, "is_active": True},
            {"label": "Material Loadout", "sort_order": 60, "is_active": True},
            {"label": "Miscellaneous", "sort_order": 70, "is_active": True},
            {"label": "Additional Site Activities", "sort_order": 80, "is_active": True},
        ],
    },
}

ALL_SEED_DOMAIN_SLUGS = list(SEED_DATA.keys())


def resolve_domain_scope(domain_scope):
    """Returns (slugs_in_scope, unknown_slugs) for a domain_scope param value."""
    raw = str(domain_scope or "all").strip()
    if raw == "" or raw.lower() == "all":
        return list(ALL_SEED_DOMAIN_SLUGS), []

    requested = [item.strip() for item in raw.split(",") if item.strip()]
    known = [slug for slug in requested if slug in SEED_DATA]
    unknown = [slug for slug in requested if slug not in SEED_DATA]
    return known, unknown


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


# ---------------------------------------------------------------------------
# core-data-read / core-data-write (mirrors src/data/index.js's
# fetchDomainRecords/createDomainRecord -- see the module docstring's
# UNCONFIRMED section for the endpoint-path and response-shape caveats)


# ---------------------------------------------------------------------------

def read_domain_records(api, domain, app_slug, limit=1000):
    """Reads up to `limit` non-deleted records for one domain. Returns a
    list of record dicts (each including its business fields).

    app_slug is accepted but deliberately NOT sent -- it was only ever
    copied from the native app frontend's own convention (src/data/index.js
    always sends it because a browser session runs inside one specific
    app's iframe). The P2 Python Runner authoring guide's own documented
    core-data-write/-read contract (SS0.3, 17) lists parameters as domain,
    system, operation, latency only -- no app_slug. A live run confirmed
    every one of these 8 domains 500ing with message="READ_ACCESS_DENIED"
    despite the calling service account having a global read/insert/update/
    delete DAC policy, which points at app_slug triggering an extra,
    unintended app-scoped access check a script was never meant to hit.
    """
    payload = {
        "parameters": {
            "domain": domain,
            "system": CORE_DATA_SYSTEM,
            "limit": limit,
            "offset": 0,
        }
    }
    response = api._request("POST", "/api/v3/core-data-read", data=payload)

    if isinstance(response, list):
        return response
    if isinstance(response, dict):
        data = response.get("data")
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and isinstance(data.get("data"), list):
            return data["data"]
        if isinstance(data, dict) and isinstance(data.get("rows"), list):
            return data["rows"]
    return []


def write_domain_record_insert(api, domain, app_slug, record_data):
    # app_slug accepted but not sent -- see read_domain_records()'s docstring.
    payload = {
        "parameters": {
            "domain": domain,
            "system": CORE_DATA_SYSTEM,
            "operation": "insert",
            "latency": "synchronous",
        },
        "data": record_data,
    }
    return api._request("POST", "/api/v3/core-data-write", data=payload)


def raw_diagnostic_core_data_read(api, domain):
    """One unwrapped HTTP call to the exact endpoint read_domain_records()
    hits, using the same bearer token PivotlyAPI already holds -- per the P2
    authoring guide S12.4, PivotlyAPI's own retry wrapper summarizes repeated
    500s into "too many 500 error responses" and discards the actual
    response body, which is the only place Core's real validation/crash
    detail (e.g. an auth-context or DAC message) would show up. This makes
    exactly one extra call, only after read_domain_records() has already
    failed, so it adds no cost to a working run.
    """
    if not REQUESTS_AVAILABLE:
        return {"raw_status": None, "raw_body": "requests_unavailable"}

    token = getattr(api, "_access_token", None)
    if not token:
        return {"raw_status": None, "raw_body": "no_access_token_on_api_object"}

    # Hardcoded rather than reusing api._request()'s own path resolution --
    # a prior run's error text confirmed PivotlyAPI._request() sends
    # "/api/v3/..." paths to an actual wire URL of
    # "https://dev.pivotly.com/vm/api/v3/...", so this mirrors that exact
    # confirmed URL rather than guessing at a second, possibly different one.
    url = "https://dev.pivotly.com/vm/api/v3/core-data-read"
    payload = {
        "parameters": {
            "domain": domain,
            "system": CORE_DATA_SYSTEM,
            "limit": 1,
            "offset": 0,
        }
    }
    try:
        response = requests.post(
            url,
            json=payload,
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
            timeout=30,
        )
        return {"raw_status": response.status_code, "raw_body": safe_text(response.text, 1500)}
    except Exception as exc:
        return {"raw_status": None, "raw_body": "raw_diagnostic_call_failed: " + safe_text(exc, 500)}


def seed_one_domain(api, slug, business_key, rows, app_slug, dry_run):
    """Seeds one domain's missing rows. Returns a per-domain result dict."""
    try:
        existing_records = read_domain_records(api, slug, app_slug)
    except Exception as exc:
        return {
            "slug": slug,
            "ok": False,
            "error": "read_failed: " + safe_text(exc, 800),
            "raw_diagnostic": raw_diagnostic_core_data_read(api, slug),
        }

    existing_keys = set()
    for record in existing_records:
        if isinstance(record, dict) and business_key in record:
            existing_keys.add(record[business_key])

    to_create = [row for row in rows if row.get(business_key) not in existing_keys]
    already_present = [row.get(business_key) for row in rows if row.get(business_key) in existing_keys]

    if dry_run:
        return {
            "slug": slug,
            "ok": True,
            "existing_row_count": len(existing_records),
            "already_present_keys": already_present,
            "would_create_keys": [row.get(business_key) for row in to_create],
            "dry_run": True,
        }

    created_keys = []
    errors = []
    for row in to_create:
        try:
            write_domain_record_insert(api, slug, app_slug, row)
            created_keys.append(row.get(business_key))
        except Exception as exc:
            errors.append(str(row.get(business_key)) + ": " + safe_text(exc, 800))

    return {
        "slug": slug,
        "ok": len(errors) == 0,
        "existing_row_count": len(existing_records),
        "already_present_keys": already_present,
        "created_keys": created_keys,
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# Modes


# ---------------------------------------------------------------------------

def result(name, ok, message, count=0, details=None):
    return {
        "name": name,
        "ok": bool(ok),
        "message": message,
        "count": int(count),
        "details": details or {},
    }


def check_seed_domain_shape(slug, entry):
    failures = []
    business_key = entry.get("business_key")
    rows = entry.get("rows")

    if not business_key:
        failures.append("missing_business_key")
    if not isinstance(rows, list) or not rows:
        failures.append("empty_or_missing_rows")
        rows = []

    for row in rows:
        if not isinstance(row, dict) or business_key not in row or row.get(business_key) in (None, ""):
            failures.append("row_missing_business_key_value:" + str(row))

    keys_seen = [row.get(business_key) for row in rows if isinstance(row, dict)]
    duplicates = {k for k in keys_seen if keys_seen.count(k) > 1}
    if duplicates:
        failures.append("duplicate_business_key_values:" + ",".join(str(d) for d in duplicates))

    return failures, {"slug": slug, "business_key": business_key, "row_count": len(rows)}


def self_check(config):
    slugs, unknown_slugs = resolve_domain_scope(config["domain_scope"])

    api = get_pivotly_api_safe()
    token_ready = api is not None

    all_failures = []
    per_domain = {}

    if unknown_slugs:
        all_failures.append("unknown_domain_scope_slugs:" + ",".join(unknown_slugs))

    for slug in slugs:
        failures, info = check_seed_domain_shape(slug, SEED_DATA[slug])
        per_domain[slug] = {"failures": failures, "info": info}
        if failures:
            all_failures.extend([slug + ":" + f for f in failures])

    if not config["app_slug"] or config["app_slug"] == "REPLACE_WITH_NATIVE_APP_SLUG":
        all_failures.append("app_slug_not_configured -- set APP_SLUG in this script or pass the app_slug Runner param")

    if not token_ready:
        if PIVOTLY_AVAILABLE:
            all_failures.append("core_api_token_unavailable:" + str(PIVOTLY_API_DIAGNOSTIC.get("token_error") or "unknown"))
        else:
            all_failures.append("pivotly_api_unavailable_outside_runner")

    return result(
        "self_check",
        len(all_failures) == 0,
        "Self-check passed." if not all_failures else "Self-check found contract problems.",
        len(slugs),
        {
            "domain_scope": config["domain_scope"],
            "domain_count_in_scope": len(slugs),
            "unknown_domain_scope_slugs": unknown_slugs,
            "all_seed_domain_slugs": list(ALL_SEED_DOMAIN_SLUGS),
            "per_domain": per_domain,
            "valid_modes": VALID_MODES,
            "param_contract_version": config["param_contract_version"],
            "param_contract_version_ok": config["param_contract_version"] == PARAM_CONTRACT_VERSION,
            "accepted_param_names": list(PUBLIC_RUNNER_PARAMS),
            "app_slug_configured": bool(config["app_slug"]) and config["app_slug"] != "REPLACE_WITH_NATIVE_APP_SLUG",
            "dry_run": config["dry_run"],
            "token_ready": token_ready,
            "write_ready": token_ready and not all_failures,
            "pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC),
            "diagnostics": {"failures": all_failures},
        },
    )


def seed_only(config):
    slugs, unknown_slugs = resolve_domain_scope(config["domain_scope"])

    if unknown_slugs:
        return result(
            "seed_only",
            False,
            "domain_scope named slugs this script doesn't know about.",
            0,
            {"unknown_domain_scope_slugs": unknown_slugs, "all_seed_domain_slugs": list(ALL_SEED_DOMAIN_SLUGS)},
        )

    if not config["app_slug"] or config["app_slug"] == "REPLACE_WITH_NATIVE_APP_SLUG":
        return result(
            "seed_only",
            False,
            "app_slug is not configured. Set APP_SLUG in this script (from Pivotly Admin > Native Apps) "
            "or pass the app_slug Runner param, then re-run.",
            0,
            {},
        )

    api = get_pivotly_api_safe()
    if api is None:
        return result(
            "seed_only",
            False,
            "Pivotly API helper is not configured in this runner context.",
            0,
            {"pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC)},
        )

    per_domain = {}
    errors = []
    for slug in slugs:
        entry = SEED_DATA[slug]
        outcome = seed_one_domain(api, slug, entry["business_key"], entry["rows"], config["app_slug"], config["dry_run"])
        per_domain[slug] = outcome
        if not outcome.get("ok"):
            errors.append(slug + ": " + str(outcome.get("error") or outcome.get("errors")))

    if config["dry_run"]:
        total_would_create = sum(len(v.get("would_create_keys") or []) for v in per_domain.values())
        message = (
            "Dry run: would create " + str(total_would_create) + " row(s) across "
            + str(len(slugs)) + " domain(s). No writes performed."
        )
    elif errors:
        message = "Seeding completed with errors."
    else:
        total_created = sum(len(v.get("created_keys") or []) for v in per_domain.values())
        message = "Seeding complete: " + str(total_created) + " row(s) created across " + str(len(slugs)) + " domain(s)."

    return result(
        "seed_only",
        len(errors) == 0,
        message,
        len(slugs),
        {
            "domain_scope": config["domain_scope"],
            "app_slug": config["app_slug"],
            "per_domain": per_domain,
            "errors": errors,
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
        output["details"].pop("per_domain", None)

    return output


def main():
    print(json.dumps(run(load_config()), sort_keys=True))
    return 0


raise SystemExit(main())
