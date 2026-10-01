import base64
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


SCRIPT_VERSION = "v1-jfb-dot-to-dot-role-seed-r3"

PARAM_CONTRACT_VERSION = "jfb_dot_to_dot_role_params_v1"

STABLE_PARAM_CONTRACT = [
    {"name": "mode", "type": "TEXT", "default": "self_check"},
    {"name": "param_contract_version", "type": "TEXT", "default": PARAM_CONTRACT_VERSION},
    {"name": "dry_run", "type": "BOOLEAN", "default": True},
    {"name": "output_shape", "type": "TEXT", "default": "summary"},
]

PUBLIC_RUNNER_PARAMS = [item["name"] for item in STABLE_PARAM_CONTRACT]

VALID_MODES = ["self_check", "seed_only", "verify"]

PARAM_DEBUG = {}

APP_SLUG = "app-jfb-dot-to-dot"
ROLE_SCOPE = "app"
PAGE_SLUG = "apg-jfb-dot-to-dot-daily-event"

TOKEN_ENDPOINT = "https://login.microsoftonline.com/856436c2-a60d-486d-bca3-9c1367fa632a/oauth2/v2.0/token"
API_SCOPE = "api://1a10b2a3-2fbf-4cc8-b32c-634766e1172b/.default"
CLIENT_ID_SECRET = "jfb-pivotly-api-client-id"
CLIENT_SECRET_SECRET = "jfb-pivotly-api-client-secret"

TOKEN_CLAIMS_TO_SHOW = ["aud", "iss", "ver", "tid", "appid", "azp", "roles", "scp", "exp"]

TRANSPORT_DIAGNOSTIC = {}

MAX_PAGE_SIZE = 100
MAX_PAGES = 20

ROLE = {
    "code": "jfb-dot-to-dot",
    "name": "jfb-dot-to-dot",
    "description": "jfb-dot-to-dot",
}

CLAIMS = [
    PAGE_SLUG + ".view",
    "app.access",
    "app.resolve",
    "app.view",
    "picklist.view",
]

READ = {"read": True, "insert": False, "update": False, "delete": False}
FULL = {"read": True, "insert": True, "update": True, "delete": True}

DATA_ACCESS = [
    {"domain": "jfb_daily_activities", "access": FULL, "direct_write": True},
    {"domain": "jfb_delay_codes", "access": READ, "direct_write": False},
    {"domain": "jfb_equipments", "access": READ, "direct_write": False},
    {"domain": "jfb_operators", "access": READ, "direct_write": False},
    {"domain": "jfb_project_area_levels", "access": READ, "direct_write": False},
    {"domain": "jfb_project_areas", "access": READ, "direct_write": False},
    {"domain": "jfb_project_delay_codes", "access": READ, "direct_write": False},
    {"domain": "jfb_project_layers", "access": READ, "direct_write": False},
    {"domain": "jfb_project_operators", "access": READ, "direct_write": False},
    {"domain": "jfb_projects", "access": READ, "direct_write": False},
    {"domain": "jfb_work_types", "access": READ, "direct_write": False},
]


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


def claim_parts(claim_code):
    object_type, _sep, action = claim_code.partition(".")
    return object_type, action


def token_claims(token):
    try:
        payload = str(token or "").split(".")[1]
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")).decode("utf-8"))
    except Exception as exc:
        return {"decode_error": safe_text(exc)}
    return {key: claims.get(key) for key in TOKEN_CLAIMS_TO_SHOW if key in claims}


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
    def __init__(self):
        self.api = None
        self._role_index = None

    def connect(self):
        if not PIVOTLY_AVAILABLE or PivotlyAPI is None:
            raise RuntimeError("pivotly helper unavailable; this script only runs inside the Pivotly runner")
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
        TRANSPORT_DIAGNOSTIC["token_claims"] = token_claims(body.get("access_token"))
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
                    self._role_index[row_code] = {
                        "id": str(row_id),
                        "app_slug": row.get("appSlug") or row.get("app_slug"),
                        "scope": row.get("scope") or row.get("roleScope") or row.get("role_scope"),
                    }
        return self._role_index.get(code)

    def forget_roles(self):
        self._role_index = None

    def existing_claim_codes(self, role_id):
        codes = set()
        for row in self._paged_rows("/api/v3/iam/role-claims/role/" + role_id + "/claims"):
            if isinstance(row, dict):
                code = row.get("claimCode") or row.get("code")
                if code:
                    codes.add(code)
        return codes

    def existing_dac_policies(self, role_id):
        policies = {}
        for row in self._paged_rows("/api/v3/iam/dac-policy/roles/" + role_id):
            if not isinstance(row, dict) or row.get("dacIsDeleted"):
                continue
            target = row.get("dacTarget") or row.get("dac_target")
            if target:
                policies[target] = {
                    "policy_id": row.get("dacPolicyId"),
                    "access": {
                        "read": bool(row.get("dacReadAccess")),
                        "insert": bool(row.get("dacInsertAccess")),
                        "update": bool(row.get("dacUpdateAccess")),
                        "delete": bool(row.get("dacDeleteAccess")),
                    },
                    "direct_write": bool(row.get("dacDirectWriteEnabled")),
                }
        return policies

    def save_role(self):
        response = self.api._request(
            "POST",
            "/api/v3/iam/roles",
            data={
                "code": ROLE["code"],
                "name": ROLE["name"],
                "description": ROLE["description"],
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
        found = self.find_role(ROLE["code"])
        return found["id"] if found else None

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

    def save_dac(self, role_id, entry, policy_id=None):
        access = entry["access"]
        payload = {
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
        }
        if policy_id:
            payload["dacPolicyId"] = policy_id
        return self.api._request("POST", "/api/v3/iam/dac-policy/roles/" + role_id, data=payload)


def build_transport():
    global TRANSPORT_DIAGNOSTIC
    TRANSPORT_DIAGNOSTIC = {"stage": "start", "error": "", "probe": {}}

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


def unreachable_result(name):
    return result(
        name,
        False,
        "Could not reach the target: " + str(TRANSPORT_DIAGNOSTIC.get("error") or "unknown"),
        0,
        {"transport_diagnostic": dict(TRANSPORT_DIAGNOSTIC)},
    )


def check_data_shape():
    failures = []

    if len(set(CLAIMS)) != len(CLAIMS):
        failures.append("duplicate_claim_codes")
    for claim in CLAIMS:
        object_type, action = claim_parts(claim)
        if not object_type or not action or claim.count(".") != 1:
            failures.append("malformed_claim_code:" + claim)

    domains = [entry["domain"] for entry in DATA_ACCESS]
    if len(set(domains)) != len(domains):
        failures.append("duplicate_data_access_domain")
    for entry in DATA_ACCESS:
        if set(entry["access"]) != {"read", "insert", "update", "delete"}:
            failures.append("access_flags_incomplete:" + entry["domain"])
        if not entry["access"]["read"]:
            failures.append("access_without_read:" + entry["domain"])

    return failures


def access_differs(entry, policy):
    return policy["access"] != entry["access"] or policy["direct_write"] != entry["direct_write"]


def role_scope_warnings(found):
    warnings = []
    if found and found.get("app_slug") and found["app_slug"] != APP_SLUG:
        warnings.append(
            "role_app_slug_mismatch: role '" + ROLE["code"] + "' is tied to '" + str(found["app_slug"])
            + "', not '" + APP_SLUG + "'. Its claims and data access will not apply inside Dot-to-Dot."
        )
    return warnings


def self_check(config):
    failures = check_data_shape()
    warnings = []

    transport = build_transport()
    if transport is None:
        failures.append("transport_unavailable:" + str(TRANSPORT_DIAGNOSTIC.get("error") or "unknown"))

    role_state = {}
    if transport is not None:
        try:
            found = transport.find_role(ROLE["code"])
            warnings.extend(role_scope_warnings(found))
            role_state = {
                "exists": found is not None,
                "role_id": found["id"] if found else None,
                "app_slug": found.get("app_slug") if found else None,
                "existing_claims": len(transport.existing_claim_codes(found["id"])) if found else 0,
                "existing_dac_policies": len(transport.existing_dac_policies(found["id"])) if found else 0,
            }
        except Exception as exc:
            failures.append("transport_read_failed:" + safe_text(exc, 400))
        finally:
            transport.close()

    return result(
        "self_check",
        len(failures) == 0,
        "Self-check passed." if not failures else "Self-check found problems.",
        1,
        {
            "app_slug": APP_SLUG,
            "role_code": ROLE["code"],
            "role": role_state,
            "planned_claims": list(CLAIMS),
            "planned_dac_policies": len(DATA_ACCESS),
            "transport_diagnostic": dict(TRANSPORT_DIAGNOSTIC),
            "valid_modes": VALID_MODES,
            "param_contract_version_ok": config["param_contract_version"] == PARAM_CONTRACT_VERSION,
            "accepted_param_names": list(PUBLIC_RUNNER_PARAMS),
            "dry_run": config["dry_run"],
            "diagnostics": {"failures": failures, "warnings": warnings},
        },
    )


def seed_only(config):
    failures = check_data_shape()
    if failures:
        return result("seed_only", False, "Seed data failed its own shape check.", 0, {"failures": failures})

    transport = build_transport()
    if transport is None:
        return unreachable_result("seed_only")

    outcome = {
        "role_created": False,
        "role_existed": False,
        "role_id": None,
        "claims_created": [],
        "claims_skipped": [],
        "dac_created": [],
        "dac_updated": [],
        "dac_skipped": [],
        "errors": [],
        "warnings": [],
    }

    try:
        found = transport.find_role(ROLE["code"])
        outcome["role_existed"] = found is not None
        outcome["warnings"].extend(role_scope_warnings(found))
        role_id = found["id"] if found else None

        if role_id is None and not config["dry_run"]:
            try:
                role_id = transport.save_role()
                outcome["role_created"] = True
            except Exception as exc:
                outcome["errors"].append("role_save: " + safe_text(exc, 600))
        elif role_id is None:
            outcome["role_created"] = True

        outcome["role_id"] = role_id

        if role_id is not None or config["dry_run"]:
            have_claims = transport.existing_claim_codes(role_id) if role_id else set()
            for claim_code in CLAIMS:
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

            have_dac = transport.existing_dac_policies(role_id) if role_id else {}
            for entry in DATA_ACCESS:
                policy = have_dac.get(entry["domain"])
                if policy and not access_differs(entry, policy):
                    outcome["dac_skipped"].append(entry["domain"])
                    continue
                bucket = "dac_updated" if policy else "dac_created"
                if config["dry_run"]:
                    outcome[bucket].append(entry["domain"])
                    continue
                try:
                    transport.save_dac(role_id, entry, policy["policy_id"] if policy else None)
                    outcome[bucket].append(entry["domain"])
                except Exception as exc:
                    outcome["errors"].append("dac " + entry["domain"] + ": " + safe_text(exc, 400))
    finally:
        transport.close()

    verb = "would create" if config["dry_run"] else "created"
    message = (
        verb + " " + ("1 role, " if outcome["role_created"] else "0 roles, ")
        + str(len(outcome["claims_created"])) + " claim(s), "
        + str(len(outcome["dac_created"])) + " DAC policy row(s), "
        + ("would update " if config["dry_run"] else "updated ")
        + str(len(outcome["dac_updated"])) + " DAC policy row(s)."
    )
    if config["dry_run"]:
        message = "Dry run: " + message + " No writes performed."
    elif outcome["errors"]:
        message = "Seeding completed with errors. " + message

    return result(
        "seed_only",
        len(outcome["errors"]) == 0,
        message,
        1,
        {"app_slug": APP_SLUG, "role_code": ROLE["code"], "outcome": outcome},
    )


def verify(config):
    transport = build_transport()
    if transport is None:
        return unreachable_result("verify")

    problems = []
    details = {"app_slug": APP_SLUG, "role_code": ROLE["code"]}

    try:
        found = transport.find_role(ROLE["code"])
        if found is None:
            problems.append(ROLE["code"] + ": role missing")
        else:
            problems.extend(role_scope_warnings(found))
            have_claims = transport.existing_claim_codes(found["id"])
            have_dac = transport.existing_dac_policies(found["id"])
            want_claims = set(CLAIMS)
            want_dac = {entry["domain"] for entry in DATA_ACCESS}
            mismatched = [
                {"domain": entry["domain"], "have": have_dac[entry["domain"]]["access"], "want": entry["access"]}
                for entry in DATA_ACCESS
                if entry["domain"] in have_dac and access_differs(entry, have_dac[entry["domain"]])
            ]
            details.update({
                "role_id": found["id"],
                "role_app_slug": found.get("app_slug"),
                "claims_missing": sorted(want_claims - have_claims),
                "claims_extra": sorted(have_claims - want_claims),
                "dac_missing": sorted(want_dac - set(have_dac)),
                "dac_extra": sorted(set(have_dac) - want_dac),
                "dac_access_mismatch": mismatched,
            })
            if details["claims_missing"]:
                problems.append(str(len(details["claims_missing"])) + " claim(s) missing")
            if details["dac_missing"]:
                problems.append(str(len(details["dac_missing"])) + " DAC policy row(s) missing")
            if mismatched:
                problems.append(str(len(mismatched)) + " DAC policy row(s) with different access -- run seed_only to fix")
    finally:
        transport.close()

    details["problems"] = problems
    return result(
        "verify",
        len(problems) == 0,
        "Verify passed: role, claims and DAC policies are all present." if not problems else "Verify found gaps.",
        1,
        details,
    )


def run(config):
    if config["mode"] == "seed_only":
        output = seed_only(config)
    elif config["mode"] == "verify":
        output = verify(config)
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

    if config.get("output_shape") == "summary" and output["ok"]:
        output["details"].pop("transport_diagnostic", None)

    return output


def main():
    print(json.dumps(run(load_config()), sort_keys=True, indent=2))
    return 0


raise SystemExit(main())
