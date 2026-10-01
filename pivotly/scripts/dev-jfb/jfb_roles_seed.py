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


SCRIPT_VERSION = "v2-jfb-iam-roles-seed-r3"

PARAM_CONTRACT_VERSION = "jfb_iam_roles_params_v1"

STABLE_PARAM_CONTRACT = [
    {"name": "mode", "type": "TEXT", "default": "self_check"},
    {"name": "param_contract_version", "type": "TEXT", "default": PARAM_CONTRACT_VERSION},
    {"name": "dry_run", "type": "BOOLEAN", "default": True},
    {"name": "role_prefix", "type": "TEXT", "default": ""},
    {"name": "output_shape", "type": "TEXT", "default": "summary"},
]

PUBLIC_RUNNER_PARAMS = [item["name"] for item in STABLE_PARAM_CONTRACT]

VALID_MODES = ["self_check", "seed_only", "verify", "teardown"]
VALID_TRANSPORTS = ["http"]

PARAM_DEBUG = {}

APP_SLUG = "app-jfb-fieldsops-admin"
ROLE_SCOPE = "app"

PRIVILEGED_USER_ID = "00000000-0000-7000-8000-a00000000001"

TOKEN_ENDPOINT = "https://login.microsoftonline.com/39f6cf5e-725d-4087-a1e3-e7b4442c867e/oauth2/v2.0/token"
API_SCOPE = "https://pivotlyidentityplatformdev.onmicrosoft.com/api/.default"
CLIENT_ID_SECRET = "jfb-pivotly-api-client-id"
CLIENT_SECRET_SECRET = "jfb-pivotly-api-client-secret"

TRANSPORT_DIAGNOSTIC = {}

LOCAL_OVERRIDES = {}

MAX_PAGE_SIZE = 100
MAX_PAGES = 20


ROLE_DEFS = [
    {
        "key": "admins",
        "code": "jfb_admins",
        "name": "jfb_admins",
        "description": "JFB field ops administrators -- full control of configuration, reference data and reports.",
    },
    {
        "key": "directors",
        "code": "jfb_directors",
        "name": "jfb_directors",
        "description": "JFB directors -- same operational reach as admins across project and report data.",
    },
    {
        "key": "managers",
        "code": "jfb_project_managers",
        "name": "jfb_project_managers",
        "description": "JFB project managers -- own project execution data, read-only on reference and membership.",
    },
    {
        "key": "engineers",
        "code": "jfb_project_engineers",
        "name": "jfb_project_engineers",
        "description": "JFB project engineers -- daily field data entry, read-only on configuration and reference.",
    },
]

ROLE_KEYS = [item["key"] for item in ROLE_DEFS]

ADMIN_CLAIMS = [
    "apg-jfb-admin.view",
    "apg-jfb-fieldops.view",
    "app.access",
    "app.resolve",
    "app.view",
    "data_view.run",
    "event.create",
    "photo.reject",
    "project_members.write",
    "project_settings.write",
    "report.approve",
    "report.generate_pdf",
    "report.release_pdf",
    "report.send_back",
    "report.skip_pdf_validation",
    "report.submit",
    "role.list",
    "user_role.list",
]

CLAIMS_BY_ROLE = {
    "admins": list(ADMIN_CLAIMS),
    "directors": list(ADMIN_CLAIMS),
    "managers": [
        "apg-jfb-admin.view",
        "apg-jfb-fieldops.view",
        "app.access",
        "app.resolve",
        "app.view",
        "data_view.run",
        "event.create",
        "photo.reject",
        "project_settings.write",
        "report.approve",
        "report.generate_pdf",
        "report.release_pdf",
        "report.send_back",
        "report.submit",
    ],
    "engineers": [
        "apg-jfb-fieldops.view",
        "app.access",
        "app.resolve",
        "app.view",
        "data_view.run",
        "event.create",
        "report.generate_pdf",
        "report.release_pdf",
        "report.submit",
    ],
}

FULL = {"read": True, "insert": True, "update": True, "delete": True}
READ = {"read": True, "insert": False, "update": False, "delete": False}
READ_UPDATE = {"read": True, "insert": False, "update": True, "delete": False}
READ_INSERT = {"read": True, "insert": True, "update": False, "delete": False}

DAC_PROFILES = [
    {
        "profile": "shared_project_data",
        "direct_write": True,
        "access": {"admins": FULL, "directors": FULL, "managers": FULL, "engineers": FULL},
        "domains": [
            "jfb_air_monitoring_daily",
            "jfb_air_quality_readings",
            "jfb_culture_tenants",
            "jfb_daily_activities",
            "jfb_dredge_cell_status",
            "jfb_dredge_progress",
            "jfb_equipments",
            "jfb_hydraulic_flow_stats",
            "jfb_hydraulic_pipe_configurations",
            "jfb_placement_progress",
            "jfb_production_stats",
            "jfb_project_area_layers",
            "jfb_project_areas",
            "jfb_project_components",
            "jfb_project_delay_codes",
            "jfb_project_layer_materials",
            "jfb_project_layers",
            "jfb_project_material_components",
            "jfb_project_materials",
            "jfb_project_site_equipment",
            "jfb_report_metric_value",
            "jfb_report_narratives_v2",
            "jfb_report_photos",
            "jfb_reports",
            "jfb_spreader_progress",
            "jfb_water_monitoring_notes",
            "jfb_water_quality_readings",
            "jfb_weekly_summaries",
            "jfb_weekly_summary_photos",
        ],
    },
    {
        "profile": "shared_project_data_no_direct_write",
        "direct_write": False,
        "access": {"admins": FULL, "directors": FULL, "managers": FULL, "engineers": FULL},
        "domains": [
            "jfb_production_week_breaks",
            "jfb_realized_excluded_days",
            "jfb_report_crew_summary_v2",
            "jfb_report_safety_v2",
            "jfb_user_signatures",
        ],
    },
    {
        "profile": "director_managed_reference",
        "direct_write": True,
        "access": {"admins": FULL, "directors": FULL, "managers": READ, "engineers": READ},
        "domains": [
            "jfb_delay_codes",
            "jfb_metric_defaults",
            "jfb_metric_sources",
            "jfb_narrative_section_defaults",
            "jfb_project_area_levels",
            "jfb_project_members",
            "jfb_work_types",
        ],
    },
    {
        "profile": "monitoring_config",
        "direct_write": True,
        "access": {"admins": FULL, "directors": FULL, "managers": FULL, "engineers": READ_UPDATE},
        "domains": [
            "jfb_air_monitoring_config",
            "jfb_placement_config",
            "jfb_spreader_config",
            "jfb_water_monitoring_config",
        ],
    },
    {
        "profile": "admin_only_reference",
        "direct_write": True,
        "access": {"admins": FULL, "directors": READ, "managers": READ, "engineers": READ},
        "domains": [
            "jfb_component_types",
            "jfb_layer_types",
            "jfb_material_types",
            "jfb_operators",
        ],
    },
    {
        "profile": "manager_managed_config",
        "direct_write": True,
        "access": {"admins": FULL, "directors": FULL, "managers": FULL, "engineers": READ},
        "domains": [
            "jfb_dredge_config",
            "jfb_dredge_equipment_config",
            "jfb_project_attachments",
            "jfb_project_report_narratives",
        ],
    },
    {
        "profile": "project_header",
        "direct_write": True,
        "access": {"admins": FULL, "directors": FULL, "managers": READ_UPDATE, "engineers": READ},
        "domains": [
            "jfb_metrics",
            "jfb_projects",
        ],
    },
    {
        "profile": "crew_assignment",
        "direct_write": True,
        "access": {"admins": FULL, "directors": READ, "managers": FULL, "engineers": FULL},
        "domains": [
            "jfb_project_operators",
        ],
    },
    {
        "profile": "report_generation_log",
        "direct_write": True,
        "access": {"admins": FULL, "directors": FULL, "managers": READ_INSERT, "engineers": READ_INSERT},
        "domains": [
            "jfb_report_generations",
        ],
    },
    {
        "profile": "realized_scope_config",
        "direct_write": True,
        "access": {"admins": FULL, "directors": READ, "managers": FULL, "engineers": FULL},
        "domains": [
            "jfb_realized_scopes",
        ],
    },
]

ALL_DAC_DOMAINS = sorted({d for profile in DAC_PROFILES for d in profile["domains"]})


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
    for marker in ["Authorization:", "authorization:", "Bearer ", "bearer ", "password=", "PASSWORD="]:
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


def local_override(name, fallback):
    if PIVOTLY_AVAILABLE:
        return fallback
    if name not in LOCAL_OVERRIDES:
        return fallback
    return LOCAL_OVERRIDES[name]


def load_config():
    PARAM_DEBUG.clear()

    mode = str(param_value("mode", TEXT, "self_check"))
    if mode not in VALID_MODES:
        mode = "self_check"

    transport = "http"

    role_prefix = str(param_value("role_prefix", TEXT, ""))
    resolved_mode = str(local_override("mode", mode))
    if resolved_mode not in VALID_MODES:
        resolved_mode = "self_check"

    resolved_transport = transport

    return {
        "mode": resolved_mode,
        "param_contract_version": str(param_value("param_contract_version", TEXT, PARAM_CONTRACT_VERSION)),
        "dry_run": parse_bool(local_override("dry_run", param_value("dry_run", BOOLEAN, True)), True),
        "role_prefix": local_override("role_prefix", role_prefix),
        "transport": resolved_transport,
        "output_shape": str(param_value("output_shape", TEXT, "summary")),
    }


def prefixed(code, role_prefix):
    return str(role_prefix or "") + code


def role_targets(role_prefix):
    return [
        {
            "key": item["key"],
            "code": prefixed(item["code"], role_prefix),
            "source_code": item["code"],
            "name": prefixed(item["name"], role_prefix),
            "description": item["description"],
        }
        for item in ROLE_DEFS
    ]


def claim_parts(claim_code):
    object_type, _sep, action = claim_code.partition(".")
    return object_type, action


def role_save_input(role, user_id):
    return {
        "_parameters": {"allow_insert": True, "user_id": user_id},
        "_data": {
            "code": role["code"],
            "name": role["name"],
            "description": role["description"],
            "scope": ROLE_SCOPE,
            "app_slug": APP_SLUG,
        },
    }


def claim_save_input(role_id, claim_code, user_id):
    object_type, action = claim_parts(claim_code)
    return {
        "_parameters": {"allow_insert": True, "user_id": user_id},
        "_data": {
            "role_id": role_id,
            "object_type": object_type,
            "action": action,
            "code": claim_code,
            "effect": "allow",
        },
    }


def dac_save_input(role_id, domain, access, direct_write, user_id):
    return {
        "_parameters": {"allow_insert": True, "user_id": user_id},
        "_data": {
            "role_id": role_id,
            "target_level": "data_set",
            "target": domain,
            "attribute_default_access": "include",
            "read_access": access["read"],
            "insert_access": access["insert"],
            "update_access": access["update"],
            "delete_access": access["delete"],
            "purge_access": False,
            "direct_write_enabled": direct_write,
        },
    }


def auth_payload(user_id):
    return {"user_id": user_id, "app_slug": APP_SLUG}


def dac_plan(role_prefix):
    plan = {key: [] for key in ROLE_KEYS}
    for profile in DAC_PROFILES:
        for domain in profile["domains"]:
            for key in ROLE_KEYS:
                plan[key].append(
                    {
                        "domain": domain,
                        "access": profile["access"][key],
                        "direct_write": profile["direct_write"],
                        "profile": profile["profile"],
                    }
                )
    return plan


def read_client_secret(slug):
    try:
        secret = get_privileged_secret(slug)
    except Exception as exc:
        raise RuntimeError(
            "cannot read secret '" + slug + "' (" + safe_text(exc, 200) + "). Check Admin -> Variables "
            "(Secret Variable) and Allowed Secrets (Consumer Type=script, this script's slug, Status=approved)."
        )
    if hasattr(secret, "get_raw"):
        raw = secret.get_raw()
    elif hasattr(secret, "_get_raw"):
        raw = secret._get_raw()
    else:
        raw = secret
    value = str(raw or "").strip()
    if not value:
        raise RuntimeError("secret '" + slug + "' is empty; store the actual credential value")
    return value


class HttpTransport:
    name = "http"

    def __init__(self):
        self.api = None
        self.user_id = PRIVILEGED_USER_ID
        self._role_index = None

    def connect(self):
        if not PIVOTLY_AVAILABLE or PivotlyAPI is None:
            raise RuntimeError("pivotly helper unavailable; http transport only runs inside the Pivotly runner")
        if not REQUESTS_AVAILABLE:
            raise RuntimeError("requests is not installed")
        client_id = read_client_secret(CLIENT_ID_SECRET)
        client_secret = read_client_secret(CLIENT_SECRET_SECRET)
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
        body = {}
        try:
            body = response.json()
        except Exception:
            body = {}
        if response.status_code >= 400 or not body.get("access_token"):
            raise RuntimeError(
                "token endpoint rejected credentials: "
                + str(response.status_code)
                + " "
                + safe_text(body.get("error_description", ""), 200)
            )
        self.api = PivotlyAPI(
            client_id=client_id,
            client_secret=client_secret,
            token_endpoint=TOKEN_ENDPOINT,
            api_scope=API_SCOPE,
        )
        self.api._access_token = body.get("access_token")
        return self

    def close(self):
        self.api = None

    def probe(self):
        self.api._request("GET", "/api/v3/iam/roles?page=0&pageSize=1")
        return {"iam_roles_reachable": True}

    def _rows(self, response):
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

    def find_role(self, code):
        if self._role_index is None:
            self._role_index = {}
            for row in self._paged_rows("/api/v3/iam/roles"):
                if not isinstance(row, dict):
                    continue
                row_code = row.get("code")
                row_id = row.get("id")
                deleted = row.get("isDeleted") or row.get("is_deleted")
                if row_code and row_id and not deleted:
                    self._role_index[row_code] = str(row_id)
        return self._role_index.get(code)

    def forget_roles(self):
        self._role_index = None

    def _paged_rows(self, path):
        collected = []
        page = 0
        while page < MAX_PAGES:
            separator = "&" if "?" in path else "?"
            response = self.api._request(
                "GET", path + separator + "page=" + str(page) + "&pageSize=" + str(MAX_PAGE_SIZE)
            )
            rows = self._rows(response)
            collected.extend(rows)
            if len(rows) < MAX_PAGE_SIZE:
                break
            page += 1
        return collected

    def existing_claim_codes(self, role_id):
        codes = set()
        for row in self._paged_rows("/api/v3/iam/role-claims/role/" + role_id + "/claims"):
            if isinstance(row, dict):
                code = row.get("claimCode") or row.get("code")
                if code:
                    codes.add(code)
        return codes

    def existing_dac_targets(self, role_id):
        targets = set()
        for row in self._paged_rows("/api/v3/iam/dac-policy/roles/" + role_id):
            if isinstance(row, dict):
                target = row.get("dacTarget") or row.get("dac_target")
                if target:
                    targets.add(target)
        return targets

    def save_role(self, role):
        response = self.api._request(
            "POST",
            "/api/v3/iam/roles",
            data={
                "code": role["code"],
                "name": role["name"],
                "description": role["description"],
                "scope": ROLE_SCOPE,
                "appSlug": APP_SLUG,
            },
        )
        rows = self._rows(response)
        if rows and isinstance(rows[0], dict) and rows[0].get("id"):
            return str(rows[0]["id"])
        if isinstance(response, dict) and isinstance(response.get("data"), dict):
            candidate = response["data"].get("id")
            if candidate:
                return str(candidate)
        self.forget_roles()
        return self.find_role(role["code"])

    def save_claim(self, role_id, claim_code):
        object_type, action = claim_parts(claim_code)
        return self.api._request(
            "POST",
            "/api/v3/iam/role-claims",
            data={
                "roleId": role_id,
                "claimObjectType": object_type,
                "claimAction": action,
                "claimCode": claim_code,
                "claimEffect": "allow",
                "_role": {"appSlug": APP_SLUG},
            },
        )

    def save_dac(self, role_id, entry):
        access = entry["access"]
        return self.api._request(
            "POST",
            "/api/v3/iam/dac-policy/roles/" + role_id,
            data={
                "roleId": role_id,
                "appSlug": APP_SLUG,
                "dacTarget": entry["domain"],
                "dacTargetLevel": "data_set",
                "dacAttributeDefaultAccess": "include",
                "dacReadAccess": access["read"],
                "dacInsertAccess": access["insert"],
                "dacUpdateAccess": access["update"],
                "dacDeleteAccess": access["delete"],
                "dacPurgeAccess": False,
                "dacDirectWriteEnabled": entry["direct_write"],
            },
        )

    def delete_role(self, role_id):
        return self.api._request("DELETE", "/api/v3/iam/roles/" + role_id)


def build_transport(config):
    global TRANSPORT_DIAGNOSTIC
    TRANSPORT_DIAGNOSTIC = {"transport": config["transport"], "stage": "start", "error": "", "probe": {}}

    try:
        transport = HttpTransport().connect()
        TRANSPORT_DIAGNOSTIC["stage"] = "probe"
        TRANSPORT_DIAGNOSTIC["probe"] = transport.probe()
        TRANSPORT_DIAGNOSTIC["stage"] = "ready"
        return transport
    except Exception as exc:
        TRANSPORT_DIAGNOSTIC["error"] = type(exc).__name__ + ": " + safe_text(exc, 600)
        return None


def result(name, ok, message, count=0, details=None):
    return {
        "name": name,
        "ok": bool(ok),
        "message": message,
        "count": int(count),
        "details": details or {},
    }


def check_data_shape():
    failures = []

    codes = [item["code"] for item in ROLE_DEFS]
    if len(set(codes)) != len(codes):
        failures.append("duplicate_role_codes")

    for key, claims in CLAIMS_BY_ROLE.items():
        if key not in ROLE_KEYS:
            failures.append("claims_for_unknown_role:" + key)
        if len(set(claims)) != len(claims):
            failures.append("duplicate_claim_codes:" + key)
        for claim in claims:
            object_type, action = claim_parts(claim)
            if not object_type or not action or claim.count(".") != 1:
                failures.append("malformed_claim_code:" + key + ":" + claim)

    for key in ROLE_KEYS:
        if key not in CLAIMS_BY_ROLE:
            failures.append("role_missing_claims:" + key)

    seen_domains = {}
    for profile in DAC_PROFILES:
        for key in ROLE_KEYS:
            if key not in profile["access"]:
                failures.append("profile_missing_role_access:" + profile["profile"] + ":" + key)
        for domain in profile["domains"]:
            if domain in seen_domains:
                failures.append("domain_in_two_profiles:" + domain)
            seen_domains[domain] = profile["profile"]

    return failures


def self_check(config):
    failures = check_data_shape()

    transport = build_transport(config)
    if transport is None:
        failures.append("transport_unavailable:" + str(TRANSPORT_DIAGNOSTIC.get("error") or "unknown"))

    roles = role_targets(config["role_prefix"])
    plan = dac_plan(config["role_prefix"])
    per_role = {}

    if transport is not None:
        try:
            for role in roles:
                role_id = transport.find_role(role["code"])
                per_role[role["code"]] = {
                    "exists": role_id is not None,
                    "role_id": role_id,
                    "planned_claims": len(CLAIMS_BY_ROLE[role["key"]]),
                    "planned_dac_policies": len(plan[role["key"]]),
                    "existing_claims": len(transport.existing_claim_codes(role_id)) if role_id else 0,
                    "existing_dac_policies": len(transport.existing_dac_targets(role_id)) if role_id else 0,
                }
        except Exception as exc:
            failures.append("transport_read_failed:" + safe_text(exc, 400))
        finally:
            transport.close()

    return result(
        "self_check",
        len(failures) == 0,
        "Self-check passed." if not failures else "Self-check found problems.",
        len(roles),
        {
            "transport": config["transport"],
            "role_prefix": config["role_prefix"],
            "app_slug": APP_SLUG,
            "role_scope": ROLE_SCOPE,
            "role_codes": [role["code"] for role in roles],
            "domain_count": len(ALL_DAC_DOMAINS),
            "dac_profile_count": len(DAC_PROFILES),
            "planned_claim_total": sum(len(CLAIMS_BY_ROLE[key]) for key in ROLE_KEYS),
            "planned_dac_total": sum(len(plan[key]) for key in ROLE_KEYS),
            "per_role": per_role,
            "transport_diagnostic": dict(TRANSPORT_DIAGNOSTIC),
            "valid_modes": VALID_MODES,
            "param_contract_version_ok": config["param_contract_version"] == PARAM_CONTRACT_VERSION,
            "accepted_param_names": list(PUBLIC_RUNNER_PARAMS),
            "dry_run": config["dry_run"],
            "diagnostics": {"failures": failures},
        },
    )


def seed_only(config):
    failures = check_data_shape()
    if failures:
        return result("seed_only", False, "Seed data failed its own shape check.", 0, {"failures": failures})

    transport = build_transport(config)
    if transport is None:
        return result(
            "seed_only",
            False,
            "Could not reach the target: " + str(TRANSPORT_DIAGNOSTIC.get("error") or "unknown"),
            0,
            {"transport_diagnostic": dict(TRANSPORT_DIAGNOSTIC)},
        )

    roles = role_targets(config["role_prefix"])
    plan = dac_plan(config["role_prefix"])
    per_role = {}
    errors = []

    try:
        for role in roles:
            outcome = {
                "role_created": False,
                "role_existed": False,
                "role_id": None,
                "claims_created": [],
                "claims_skipped": [],
                "dac_created": [],
                "dac_skipped": [],
                "errors": [],
            }

            role_id = transport.find_role(role["code"])
            outcome["role_existed"] = role_id is not None

            if role_id is None and not config["dry_run"]:
                try:
                    role_id = transport.save_role(role)
                    outcome["role_created"] = True
                except Exception as exc:
                    outcome["errors"].append("role_save: " + safe_text(exc, 600))
                    per_role[role["code"]] = outcome
                    errors.append(role["code"] + ": role_save failed")
                    continue
            elif role_id is None:
                outcome["role_created"] = True

            outcome["role_id"] = role_id

            wanted_claims = CLAIMS_BY_ROLE[role["key"]]
            have_claims = transport.existing_claim_codes(role_id) if role_id else set()
            for claim_code in wanted_claims:
                if claim_code in have_claims:
                    outcome["claims_skipped"].append(claim_code)
                    continue
                if config["dry_run"]:
                    outcome["claims_created"].append(claim_code)
                    continue
                try:
                    transport.save_claim(role_id, claim_code)
                    outcome["claims_created"].append(claim_code)
                except Exception as exc:
                    outcome["errors"].append("claim " + claim_code + ": " + safe_text(exc, 400))

            wanted_dac = plan[role["key"]]
            have_dac = transport.existing_dac_targets(role_id) if role_id else set()
            for entry in wanted_dac:
                if entry["domain"] in have_dac:
                    outcome["dac_skipped"].append(entry["domain"])
                    continue
                if config["dry_run"]:
                    outcome["dac_created"].append(entry["domain"])
                    continue
                try:
                    transport.save_dac(role_id, entry)
                    outcome["dac_created"].append(entry["domain"])
                except Exception as exc:
                    outcome["errors"].append("dac " + entry["domain"] + ": " + safe_text(exc, 400))

            per_role[role["code"]] = outcome
            if outcome["errors"]:
                errors.append(role["code"] + ": " + str(len(outcome["errors"])) + " error(s)")
    finally:
        transport.close()

    roles_touched = sum(1 for v in per_role.values() if v["role_created"])
    claims_touched = sum(len(v["claims_created"]) for v in per_role.values())
    dac_touched = sum(len(v["dac_created"]) for v in per_role.values())

    verb = "would create" if config["dry_run"] else "created"
    message = (
        verb
        + " "
        + str(roles_touched)
        + " role(s), "
        + str(claims_touched)
        + " claim(s), "
        + str(dac_touched)
        + " DAC policy row(s)."
    )
    if config["dry_run"]:
        message = "Dry run: " + message + " No writes performed."
    elif errors:
        message = "Seeding completed with errors. " + message

    return result(
        "seed_only",
        len(errors) == 0,
        message,
        len(roles),
        {
            "transport": config["transport"],
            "role_prefix": config["role_prefix"],
            "per_role": per_role,
            "totals": {
                "roles": roles_touched,
                "claims": claims_touched,
                "dac_policies": dac_touched,
            },
            "errors": errors,
        },
    )


def verify(config):
    transport = build_transport(config)
    if transport is None:
        return result(
            "verify",
            False,
            "Could not reach the target: " + str(TRANSPORT_DIAGNOSTIC.get("error") or "unknown"),
            0,
            {"transport_diagnostic": dict(TRANSPORT_DIAGNOSTIC)},
        )

    roles = role_targets(config["role_prefix"])
    plan = dac_plan(config["role_prefix"])
    per_role = {}
    problems = []

    try:
        for role in roles:
            role_id = transport.find_role(role["code"])
            if role_id is None:
                per_role[role["code"]] = {"exists": False}
                problems.append(role["code"] + ": role missing")
                continue

            have_claims = transport.existing_claim_codes(role_id)
            have_dac = transport.existing_dac_targets(role_id)
            want_claims = set(CLAIMS_BY_ROLE[role["key"]])
            want_dac = {entry["domain"] for entry in plan[role["key"]]}

            missing_claims = sorted(want_claims - have_claims)
            missing_dac = sorted(want_dac - have_dac)

            per_role[role["code"]] = {
                "exists": True,
                "role_id": role_id,
                "claims_expected": len(want_claims),
                "claims_present": len(want_claims & have_claims),
                "claims_missing": missing_claims,
                "claims_extra": sorted(have_claims - want_claims),
                "dac_expected": len(want_dac),
                "dac_present": len(want_dac & have_dac),
                "dac_missing": missing_dac,
                "dac_extra": sorted(have_dac - want_dac),
            }

            if missing_claims:
                problems.append(role["code"] + ": " + str(len(missing_claims)) + " claim(s) missing")
            if missing_dac:
                problems.append(role["code"] + ": " + str(len(missing_dac)) + " DAC policy row(s) missing")
    finally:
        transport.close()

    return result(
        "verify",
        len(problems) == 0,
        "Verify passed: every role, claim and DAC policy is present."
        if not problems
        else "Verify found gaps.",
        len(roles),
        {
            "transport": config["transport"],
            "role_prefix": config["role_prefix"],
            "per_role": per_role,
            "problems": problems,
        },
    )


def teardown(config):
    prefix = config["role_prefix"]
    if not prefix or not prefix.strip():
        return result(
            "teardown",
            False,
            "Refusing to run teardown with an empty role_prefix -- that would delete the real jfb_* roles. "
            "Set role_prefix to the prefixed set you want removed, for example test_v2_.",
            0,
            {},
        )

    transport = build_transport(config)
    if transport is None:
        return result(
            "teardown",
            False,
            "Could not reach the target: " + str(TRANSPORT_DIAGNOSTIC.get("error") or "unknown"),
            0,
            {"transport_diagnostic": dict(TRANSPORT_DIAGNOSTIC)},
        )

    roles = role_targets(prefix)
    deleted = []
    skipped = []
    errors = []

    try:
        for role in roles:
            if not role["code"].startswith(prefix):
                errors.append(role["code"] + ": does not carry role_prefix, refusing to delete")
                continue
            role_id = transport.find_role(role["code"])
            if role_id is None:
                skipped.append(role["code"])
                continue
            if config["dry_run"]:
                deleted.append(role["code"])
                continue
            try:
                transport.delete_role(role_id)
                deleted.append(role["code"])
            except Exception as exc:
                errors.append(role["code"] + ": " + safe_text(exc, 400))
    finally:
        transport.close()

    verb = "would delete" if config["dry_run"] else "deleted"
    return result(
        "teardown",
        len(errors) == 0,
        verb + " " + str(len(deleted)) + " role(s) carrying prefix '" + prefix + "'.",
        len(deleted),
        {
            "transport": config["transport"],
            "role_prefix": prefix,
            "deleted": deleted,
            "not_found": skipped,
            "errors": errors,
        },
    )


def run(config):
    if config["mode"] == "seed_only":
        output = seed_only(config)
    elif config["mode"] == "verify":
        output = verify(config)
    elif config["mode"] == "teardown":
        output = teardown(config)
    else:
        output = self_check(config)

    output["script_version"] = SCRIPT_VERSION
    output["mode"] = config["mode"]
    output["dry_run"] = config["dry_run"]
    output["transport"] = config["transport"]
    output["role_prefix"] = config["role_prefix"]
    output["targets_real_roles"] = not config["role_prefix"]
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
        output["details"].pop("per_role", None)

    return output


def main():
    print(json.dumps(run(load_config()), sort_keys=True, indent=2))
    return 0


raise SystemExit(main())
