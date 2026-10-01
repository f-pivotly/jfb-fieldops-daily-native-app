
import base64
import json
import re

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


SCRIPT_VERSION = "v1-jfb-app-pages-sync-2-r2"

PARAM_CONTRACT_VERSION = "jfb_app_page_params_v1"

APP_PAGE_ITEM_TYPE = "app_page"
DOMAIN_ITEM_TYPE = "domain"
APP_PAGE_SCHEMA_VERSION = "1.0"

STABLE_PARAM_CONTRACT = [
    {"name": "mode", "type": "TEXT", "default": "self_check"},
    {"name": "param_contract_version", "type": "TEXT", "default": PARAM_CONTRACT_VERSION},
    {"name": "dry_run", "type": "BOOLEAN", "default": True},
    {"name": "publish_config", "type": "BOOLEAN", "default": False},
    {"name": "item_scope", "type": "TEXT", "default": "all"},
    {"name": "output_shape", "type": "TEXT", "default": "summary"},
]

PUBLIC_RUNNER_PARAMS = [item["name"] for item in STABLE_PARAM_CONTRACT]

VALID_MODES = ["self_check", "bootstrap_only", "publish_only"]

PARAM_DEBUG = {}

TOKEN_ENDPOINT = "https://login.microsoftonline.com/856436c2-a60d-486d-bca3-9c1367fa632a/oauth2/v2.0/token"
API_SCOPE = "api://1a10b2a3-2fbf-4cc8-b32c-634766e1172b/.default"
CLIENT_ID_SECRET = "jfb-pivotly-api-client-id"
CLIENT_SECRET_SECRET = "jfb-pivotly-api-client-secret"

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

SLUG_REGEX = re.compile(r"^[a-z][a-z0-9_-]{0,127}$")
CLAIM_REGEX = re.compile(r"^[a-z0-9][a-z0-9_-]*\.[a-z0-9][a-z0-9_-]*$")
RESERVED_GENERIC_CLAIM = "page.view"
ACTION_TYPE_ENUM = [
    "pe_action", "workflow", "prompt", "script", "record_insert",
    "record_update", "record_delete", "file_upload", "file_download", "route",
]
ACTION_KEYS = ["action_key", "action_type", "slug", "required_claim"]

APP_PAGES = {
    "apg-jfb-fieldops": {
        "name": "jfb-fieldops",
        "description": "jfb-fieldops",
        "domains": [
            "jfb_air_monitoring_config",
            "jfb_air_monitoring_daily",
            "jfb_air_quality_readings",
            "jfb_culture_tenants",
            "jfb_daily_activities",
            "jfb_delay_codes",
            "jfb_dredge_cell_status",
            "jfb_dredge_config",
            "jfb_dredge_equipment_config",
            "jfb_dredge_progress",
            "jfb_equipments",
            "jfb_hydraulic_flow_stats",
            "jfb_hydraulic_pipe_configurations",
            "jfb_metric_defaults",
            "jfb_metric_sources",
            "jfb_metrics",
            "jfb_narrative_section_defaults",
            "jfb_operators",
            "jfb_placement_config",
            "jfb_placement_progress",
            "jfb_production_stats",
            "jfb_production_week_breaks",
            "jfb_project_area_levels",
            "jfb_project_areas",
            "jfb_project_attachments",
            "jfb_project_delay_codes",
            "jfb_project_layer_materials",
            "jfb_project_layers",
            "jfb_project_materials",
            "jfb_project_operators",
            "jfb_project_report_narratives",
            "jfb_project_site_equipment",
            "jfb_projects",
            "jfb_realized_excluded_days",
            "jfb_realized_scopes",
            "jfb_report_crew_summary_v2",
            "jfb_report_generations",
            "jfb_report_metric_value",
            "jfb_report_narratives_v2",
            "jfb_report_photos",
            "jfb_report_safety_v2",
            "jfb_reports",
            "jfb_spreader_config",
            "jfb_spreader_progress",
            "jfb_user_signatures",
            "jfb_water_monitoring_config",
            "jfb_water_monitoring_notes",
            "jfb_water_quality_readings",
            "jfb_weekly_summaries",
            "jfb_weekly_summary_photos",
            "jfb_work_types",
        ],
        "actions": [
            {"action_key": "manage_team", "action_type": "route", "slug": "manage_team", "required_claim": "project_members.write"},
            {"action_key": "view_operator_hours", "action_type": "route", "slug": "view_operator_hours", "required_claim": "data_view.run"},
            {"action_key": "manage_project_settings", "action_type": "route", "slug": "manage_project_settings", "required_claim": "project_settings.write"},
            {"action_key": "manage_metric_source_type", "action_type": "route", "slug": "manage_metric_source_type", "required_claim": "project_members.write"},
            {"action_key": "reject_photos", "action_type": "route", "slug": "reject_photos", "required_claim": "project_settings.write"},
            {"action_key": "view_deleted_events", "action_type": "route", "slug": "view_deleted_events", "required_claim": "project_settings.write"},
            {"action_key": "pm_review", "action_type": "route", "slug": "pm_review", "required_claim": "project_settings.write"},
            {"action_key": "manage_project_location", "action_type": "route", "slug": "manage_project_location", "required_claim": "project_settings.write"},
            {"action_key": "release_report", "action_type": "route", "slug": "release_report", "required_claim": "report.release_pdf"},
            {"action_key": "skip_pdf_validation", "action_type": "route", "slug": "skip_pdf_validation", "required_claim": "report.skip_pdf_validation"},
        ],
    },
    "apg-jfb-admin": {
        "name": "jfb-admin",
        "description": "jfb-admin",
        "domains": [
            "jfb_component_types",
            "jfb_daily_activities",
            "jfb_delay_codes",
            "jfb_equipments",
            "jfb_layer_types",
            "jfb_material_types",
            "jfb_operators",
            "jfb_project_area_layers",
            "jfb_project_area_levels",
            "jfb_project_areas",
            "jfb_project_components",
            "jfb_project_delay_codes",
            "jfb_project_layer_materials",
            "jfb_project_layers",
            "jfb_project_material_components",
            "jfb_project_materials",
            "jfb_project_members",
            "jfb_project_operators",
            "jfb_projects",
            "jfb_work_types",
        ],
        "actions": [],
    },
}

ALL_ITEM_SLUGS = list(APP_PAGES.keys())


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


def resolve_item_scope(item_scope):
    raw = str(item_scope or "all").strip()
    if raw == "" or raw.lower() == "all":
        return list(ALL_ITEM_SLUGS), []

    requested = [item.strip() for item in raw.split(",") if item.strip()]
    known = [slug for slug in requested if slug in APP_PAGES]
    unknown = [slug for slug in requested if slug not in APP_PAGES]
    return known, unknown


def page_view_claim(slug):
    return slug + ".view"


def check_page(slug, page):
    failures = []
    warnings = []

    if not SLUG_REGEX.match(slug):
        failures.append("page_slug_fails_platform_regex")
    if not CLAIM_REGEX.match(page_view_claim(slug)):
        failures.append("page_view_claim_fails_claim_regex:" + page_view_claim(slug))

    domains = page.get("domains") or []
    seen_domains = []
    for domain in domains:
        if not SLUG_REGEX.match(domain):
            failures.append("domain_fails_slug_regex:" + domain)
        if domain in seen_domains:
            failures.append("duplicate_data_source:" + domain)
        seen_domains.append(domain)

    seen_keys = []
    for action in page.get("actions") or []:
        key = str(action.get("action_key") or "")
        for field in ACTION_KEYS:
            if not str(action.get(field) or "").strip():
                failures.append("action_missing_field:" + key + ":" + field)
        for field in action:
            if field not in ACTION_KEYS:
                failures.append("action_field_not_in_contract:" + key + ":" + field)
        if action.get("action_type") not in ACTION_TYPE_ENUM:
            failures.append("action_type_not_in_enum:" + key + ":" + str(action.get("action_type")))
        claim = str(action.get("required_claim") or "")
        if not CLAIM_REGEX.match(claim) or claim == RESERVED_GENERIC_CLAIM:
            failures.append("action_required_claim_invalid:" + key + ":" + claim)
        if key in seen_keys:
            failures.append("duplicate_action_key:" + key)
        seen_keys.append(key)

    if not domains:
        warnings.append("page_declares_no_data_sources")

    return failures, warnings, {
        "slug": slug,
        "data_source_count": len(domains),
        "action_count": len(page.get("actions") or []),
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
            PIVOTLY_API_DIAGNOSTIC["remediation"] = (
                "The token endpoint rejected the credentials. Check the client id/secret "
                "values, TOKEN_ENDPOINT tenant, and API_SCOPE audience for this environment."
            )
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


def existing_cfg_data(existing):
    raw = (existing or {}).get("cfg_data")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = {}
    return raw if isinstance(raw, dict) else {}


def find_missing_domains(api, domains, cache):
    missing = []
    for domain in domains:
        if domain not in cache:
            cache[domain] = bool(str(lookup_config_item_by_slug(api, DOMAIN_ITEM_TYPE, domain).get("id") or "").strip())
        if not cache[domain]:
            missing.append(domain)
    return missing


def build_cfg_data(slug, page, existing, skip_domains):
    current = existing_cfg_data(existing)
    current_identity = current.get("identity") if isinstance(current.get("identity"), dict) else {}
    current_security = current.get("security") if isinstance(current.get("security"), dict) else {}

    claims = []
    for claim in current_security.get("required_claims") or []:
        claim = str(claim or "").strip()
        if claim and CLAIM_REGEX.match(claim) and claim != RESERVED_GENERIC_CLAIM and claim not in claims:
            claims.append(claim)
    if page_view_claim(slug) not in claims:
        claims.insert(0, page_view_claim(slug))

    cfg_data = {
        "schema_version": APP_PAGE_SCHEMA_VERSION,
        "identity": {
            "page_slug": slug,
            "name": str(current_identity.get("name") or existing.get("name") or page["name"]),
            "description": str(current_identity.get("description") or existing.get("description") or page["description"]),
        },
        "security": {"required_claims": claims},
        "data": [
            {"source_type": "domain", "domain": domain}
            for domain in page["domains"]
            if domain not in skip_domains
        ],
        "actions": [dict(action) for action in page["actions"]],
    }

    if isinstance(current.get("render"), dict) and current.get("render"):
        cfg_data["render"] = current["render"]

    return cfg_data


def source_identity(source):
    if not isinstance(source, dict):
        return ""
    if source.get("source_type") == "domain":
        return "domain:" + str(source.get("domain") or "")
    return str(source.get("source_type") or "") + ":" + str(source.get("source_slug") or "")


def diff_cfg_data(existing, target):
    current = existing_cfg_data(existing)

    current_sources = [source_identity(s) for s in current.get("data") or []]
    target_sources = [source_identity(s) for s in target.get("data") or []]

    current_actions = {
        str(a.get("action_key") or ""): a for a in current.get("actions") or [] if isinstance(a, dict)
    }
    target_actions = {str(a["action_key"]): a for a in target.get("actions") or []}

    changed = []
    for key in sorted(set(current_actions) & set(target_actions)):
        before = {field: current_actions[key].get(field) for field in ACTION_KEYS}
        after = {field: target_actions[key].get(field) for field in ACTION_KEYS}
        if before != after:
            changed.append({"action_key": key, "before": before, "after": after})

    current_claims = (current.get("security") or {}).get("required_claims") or [] if isinstance(current.get("security"), dict) else []

    return {
        "page_exists": bool(str((existing or {}).get("id") or "").strip()),
        "data_sources_added": sorted(set(target_sources) - set(current_sources)),
        "data_sources_removed": sorted(set(current_sources) - set(target_sources)),
        "actions_added": sorted(set(target_actions) - set(current_actions)),
        "actions_removed": sorted(set(current_actions) - set(target_actions)),
        "actions_changed": changed,
        "required_claims_before": list(current_claims),
        "required_claims_after": list(target["security"]["required_claims"]),
    }


def create_app_page(api, slug, cfg_data):
    payload = {
        "parameters": {},
        "data": {
            "slug": slug,
            "item_type": APP_PAGE_ITEM_TYPE,
            "name": cfg_data["identity"]["name"],
            "description": cfg_data["identity"]["description"],
            "enabled": True,
            "cfg_data": cfg_data,
        },
    }
    response = api._request("POST", "/api/v3/config-items/" + APP_PAGE_ITEM_TYPE, data=payload)
    return {
        "action": "created_via_post",
        "slug": slug,
        "data": response.get("data") if isinstance(response, dict) else response,
    }


def update_app_page(api, existing, slug, cfg_data):
    item_id = str(existing.get("id"))
    version = existing.get("version")
    version = int(version) if isinstance(version, int) or str(version or "").isdigit() else 1
    payload = {
        "parameters": {"id": item_id},
        "data": {
            "id": item_id,
            "slug": slug,
            "item_type": APP_PAGE_ITEM_TYPE,
            "name": str(existing.get("name") or cfg_data["identity"]["name"]),
            "description": str(existing.get("description") or cfg_data["identity"]["description"]),
            "enabled": True,
            "version": version,
            "cfg_data": cfg_data,
        },
    }
    response = api._request("PATCH", "/api/v3/config-items/" + APP_PAGE_ITEM_TYPE + "/" + item_id, data=payload)
    return {
        "action": "updated_via_patch",
        "id": item_id,
        "slug": slug,
        "data": response.get("data") if isinstance(response, dict) else response,
    }


def save_app_page(api, slug, existing, cfg_data):
    if str(existing.get("id") or "").strip():
        return update_app_page(api, existing, slug, cfg_data)
    return create_app_page(api, slug, cfg_data)


def publish_app_page(api, slug):
    return api._request("POST", "/api/v3/native-apps/pages/" + slug + "/publish", data={})


def result(name, ok, message, count=0, details=None):
    return {
        "name": name,
        "ok": bool(ok),
        "message": message,
        "count": int(count),
        "details": details or {},
    }


def unknown_scope_result(name, unknown_slugs):
    return result(
        name,
        False,
        "item_scope named page slugs this script doesn't know about.",
        0,
        {"unknown_item_scope_slugs": unknown_slugs, "all_item_slugs": list(ALL_ITEM_SLUGS)},
    )


def no_api_result(name):
    return result(
        name,
        False,
        "Pivotly API helper is not configured in this runner context.",
        0,
        {"pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC)},
    )


def self_check(config):
    slugs, unknown_slugs = resolve_item_scope(config["item_scope"])

    all_failures = []
    all_warnings = []
    per_page = {}

    if unknown_slugs:
        all_failures.append("unknown_item_scope_slugs:" + ",".join(unknown_slugs))

    for slug in slugs:
        failures, warnings, info = check_page(slug, APP_PAGES[slug])
        per_page[slug] = {"failures": failures, "warnings": warnings, "info": info}
        all_failures.extend([slug + ":" + f for f in failures])
        all_warnings.extend([slug + ":" + w for w in warnings])

    api = get_pivotly_api_safe()
    token_ready = api is not None

    if token_ready:
        domain_cache = {}
        for slug in slugs:
            try:
                missing = find_missing_domains(api, APP_PAGES[slug]["domains"], domain_cache)
                existing = lookup_config_item_by_slug(api, APP_PAGE_ITEM_TYPE, slug)
            except Exception as exc:
                all_failures.append(slug + ":lookup_failed:" + safe_text(exc, 300))
                continue
            per_page[slug]["missing_domains"] = missing
            per_page[slug]["plan"] = diff_cfg_data(existing, build_cfg_data(slug, APP_PAGES[slug], existing, set(missing)))
            if missing:
                all_warnings.append(slug + ":domains_not_found_will_be_skipped:" + ",".join(missing))
    elif PIVOTLY_AVAILABLE:
        all_failures.append("core_api_token_unavailable:" + str(PIVOTLY_API_DIAGNOSTIC.get("token_error") or "unknown"))
    else:
        all_warnings.append("pivotly_api_unavailable_outside_runner")

    return result(
        "self_check",
        len(all_failures) == 0,
        "Self-check passed." if not all_failures else "Self-check found contract problems.",
        len(slugs),
        {
            "item_scope": config["item_scope"],
            "all_item_slugs": list(ALL_ITEM_SLUGS),
            "per_page": per_page,
            "valid_modes": VALID_MODES,
            "param_contract_version": config["param_contract_version"],
            "param_contract_version_ok": config["param_contract_version"] == PARAM_CONTRACT_VERSION,
            "accepted_param_names": list(PUBLIC_RUNNER_PARAMS),
            "token_ready": token_ready,
            "write_ready": token_ready and not all_failures,
            "pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC),
            "diagnostics": {"failures": all_failures, "warnings": all_warnings},
        },
    )


def bootstrap_only(config):
    slugs, unknown_slugs = resolve_item_scope(config["item_scope"])
    if unknown_slugs:
        return unknown_scope_result("bootstrap_only", unknown_slugs)

    contract_failures = {}
    writable = []
    for slug in slugs:
        failures, _warnings, _info = check_page(slug, APP_PAGES[slug])
        if failures:
            contract_failures[slug] = failures
        else:
            writable.append(slug)

    api = get_pivotly_api_safe()
    if api is None:
        return no_api_result("bootstrap_only")

    errors = []
    warnings = []
    plans = {}
    saved = {}
    published = []
    domain_cache = {}

    if config["param_contract_version"] != PARAM_CONTRACT_VERSION:
        warnings.append(
            "param_contract_version_mismatch:expected=" + PARAM_CONTRACT_VERSION
            + ",received=" + str(config["param_contract_version"])
        )

    for slug in writable:
        page = APP_PAGES[slug]
        try:
            missing = find_missing_domains(api, page["domains"], domain_cache)
            existing = lookup_config_item_by_slug(api, APP_PAGE_ITEM_TYPE, slug)
        except Exception as exc:
            errors.append(slug + "/lookup: " + safe_text(exc, 1200))
            continue

        if missing:
            warnings.append(slug + ":domains_not_found_skipped:" + ",".join(missing))

        cfg_data = build_cfg_data(slug, page, existing, set(missing))
        plans[slug] = diff_cfg_data(existing, cfg_data)
        plans[slug]["missing_domains_skipped"] = missing

        if config["dry_run"]:
            continue

        try:
            saved[slug] = save_app_page(api, slug, existing, cfg_data)
        except Exception as exc:
            errors.append(slug + ": " + safe_text(exc, 1200))
            continue

        if config["publish_config"]:
            try:
                publish_app_page(api, slug)
                published.append(slug)
            except Exception as exc:
                errors.append(slug + "/publish: " + safe_text(exc, 1200))

    if contract_failures:
        warnings.append("skipped_for_contract_failures:" + ",".join(sorted(contract_failures)))

    if config["dry_run"]:
        message = (
            "Dry run: " + str(len(plans)) + " app page(s) planned, "
            + str(len(contract_failures)) + " skipped for contract failures. Nothing written."
        )
    elif errors:
        message = str(len(saved)) + " app page(s) saved, " + str(len(errors)) + " error(s) -- see errors."
    elif published:
        message = str(len(saved)) + " app page(s) saved and " + str(len(published)) + " published."
    else:
        message = (
            str(len(saved)) + " app page(s) saved but NOT published (publish_config=false). The app reads "
            "the published page, so re-run with publish_config=true or use mode=publish_only."
        )

    return result(
        "bootstrap_only",
        len(errors) == 0 and not contract_failures,
        message,
        len(saved) if not config["dry_run"] else len(plans),
        {
            "item_scope": config["item_scope"],
            "items_attempted": writable,
            "items_saved": list(saved.keys()),
            "contract_failures": contract_failures,
            "plans": plans,
            "save_results": saved,
            "published": published,
            "publish_config": config["publish_config"],
            "dry_run": config["dry_run"],
            "errors": errors,
            "warnings": warnings,
            "pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC),
        },
    )


def publish_only(config):
    slugs, unknown_slugs = resolve_item_scope(config["item_scope"])
    if unknown_slugs:
        return unknown_scope_result("publish_only", unknown_slugs)

    if config["dry_run"]:
        return result(
            "publish_only",
            True,
            "Dry run: would publish " + str(len(slugs)) + " app page(s). Re-run with dry_run=false.",
            0,
            {"item_scope": config["item_scope"], "items": slugs, "dry_run": True},
        )

    api = get_pivotly_api_safe()
    if api is None:
        return no_api_result("publish_only")

    errors = []
    not_found = []
    published = []

    for slug in slugs:
        try:
            existing = lookup_config_item_by_slug(api, APP_PAGE_ITEM_TYPE, slug)
        except Exception as exc:
            errors.append(slug + "/lookup: " + safe_text(exc, 1200))
            continue

        if not str(existing.get("id") or "").strip():
            not_found.append(slug)
            continue

        try:
            publish_app_page(api, slug)
            published.append(slug)
        except Exception as exc:
            errors.append(slug + "/publish: " + safe_text(exc, 1200))

    if not_found and not published and not errors:
        message = "No saved app page found for any slug in scope. Run mode=bootstrap_only with dry_run=false first."
    elif errors:
        message = "Publish completed with errors."
    else:
        message = str(len(published)) + " app page(s) published."

    return result(
        "publish_only",
        len(errors) == 0 and not not_found,
        message,
        len(published),
        {
            "item_scope": config["item_scope"],
            "items_attempted": slugs,
            "config_item_not_found": not_found,
            "published": published,
            "errors": errors,
            "pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC),
        },
    )


def run(config):
    if config["mode"] == "bootstrap_only":
        output = bootstrap_only(config)
    elif config["mode"] == "publish_only":
        output = publish_only(config)
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
        output["details"].pop("save_results", None)

    return output


def main():
    print(json.dumps(run(load_config()), sort_keys=True))
    return 0


raise SystemExit(main())
