
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


SCRIPT_VERSION = "v1-jfb-picklist-sync-6-r2"

PARAM_CONTRACT_VERSION = "jfb_picklist_params_v1"

PICKLIST_ITEM_TYPE = "picklist"
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

VALID_MODES = ["self_check", "bootstrap_only", "publish_only"]

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

SOURCE_TYPE_ENUM = ["static", "domain_query", "data_view"]


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


_RAW_PICKLISTS_JSON = r'''
{
  "pkl-jfb-lift": {
    "cfg_data": {
      "source": {
        "type": "static",
        "values": [
          {
            "label": "Lift 1",
            "value": "lift_1"
          },
          {
            "label": "Lift 2",
            "value": "lift_2"
          },
          {
            "label": "Lift 3",
            "value": "lift_3"
          },
          {
            "label": "Lift 4",
            "value": "lift_4"
          },
          {
            "label": "Lift 5",
            "value": "lift_5"
          },
          {
            "label": "Lift 6",
            "value": "lift_6"
          },
          {
            "label": "Lift 7",
            "value": "lift_7"
          },
          {
            "label": "Lift 8",
            "value": "lift_8"
          },
          {
            "label": "N/A",
            "value": "lift_na"
          }
        ]
      }
    },
    "name": "JFB Lift"
  },
  "pkl-jfb-metric-rollup": {
    "cfg_data": {
      "source": {
        "type": "static",
        "values": [
          {
            "label": "Sum",
            "value": "sum"
          },
          {
            "label": "Average (non-zero days)",
            "value": "avg"
          }
        ]
      }
    },
    "name": "JFB Metric Rollup"
  },
  "pkl-jfb-pass-type": {
    "cfg_data": {
      "source": {
        "type": "static",
        "values": [
          {
            "label": "1st Pass",
            "value": "1st_pass"
          },
          {
            "label": "2nd Pass",
            "value": "2nd_pass"
          },
          {
            "label": "Residual",
            "value": "residual"
          },
          {
            "label": "Rework",
            "value": "rework"
          },
          {
            "label": "Spot Check",
            "value": "spot_check"
          },
          {
            "label": "Verification",
            "value": "verification"
          },
          {
            "label": "N/A",
            "value": "n_a"
          }
        ]
      }
    },
    "name": "JFB Pass Type"
  },
  "pkl-jfb-primary-measure": {
    "cfg_data": {
      "source": {
        "type": "static",
        "values": [
          {
            "label": "CY",
            "value": "cy"
          },
          {
            "label": "Tons",
            "value": "tons"
          },
          {
            "label": "SF",
            "value": "sf"
          },
          {
            "label": "Linear FT",
            "value": "linear_ft"
          }
        ]
      }
    },
    "name": "JFB Primary Measure"
  },
  "pkl-jfb-scope-chart-region": {
    "cfg_data": {
      "source": {
        "type": "static",
        "values": [
          {
            "label": "Inside sampling cells",
            "value": "csc-cells"
          },
          {
            "label": "Outside sampling cells",
            "value": "outside-csc-cells"
          }
        ]
      }
    },
    "name": "JFB Scope Chart Region"
  },
  "pkl-jfb-site-equipment-category": {
    "cfg_data": {
      "source": {
        "type": "static",
        "values": [
          {
            "label": "Brennan Equipment",
            "value": "brennan"
          },
          {
            "label": "Rental Equipment",
            "value": "rental"
          },
          {
            "label": "Subcontractor Equipment",
            "value": "subcontractor"
          }
        ]
      }
    },
    "name": "JFB Site Equipment Category"
  }
}
'''

PICKLIST_ITEMS = json.loads(_RAW_PICKLISTS_JSON)

ALL_ITEM_SLUGS = list(PICKLIST_ITEMS.keys())


def resolve_item_scope(item_scope):
    raw = str(item_scope or "all").strip()
    if raw == "" or raw.lower() == "all":
        return list(ALL_ITEM_SLUGS), []

    requested = [item.strip() for item in raw.split(",") if item.strip()]
    known = [slug for slug in requested if slug in PICKLIST_ITEMS]
    unknown = [slug for slug in requested if slug not in PICKLIST_ITEMS]
    return known, unknown


def item_configs(item_scope="all"):
    slugs, unknown = resolve_item_scope(item_scope)
    items = []
    for slug in slugs:
        entry = PICKLIST_ITEMS[slug]
        items.append({
            "slug": slug,
            "name": entry["name"],
            "cfg_data": entry["cfg_data"],
        })
    return items, unknown


def check_picklist(slug, cfg_data):
    failures = []
    warnings = []

    if not slug.startswith("pkl-"):
        failures.append("slug_missing_pkl_prefix")

    source = cfg_data.get("source")
    if not isinstance(source, dict) or not source.get("type"):
        failures.append("missing_source_type")
        source = {}

    source_type = source.get("type")
    if source_type and source_type not in SOURCE_TYPE_ENUM:
        failures.append("source_type_not_in_enum:" + str(source_type))

    value_count = 0
    if source_type == "static":
        values = source.get("values")
        if not isinstance(values, list) or not values:
            failures.append("static_source_missing_values")
            values = []
        seen_values = []
        for entry in values:
            if not isinstance(entry, dict):
                failures.append("static_value_not_an_object")
                continue
            value = str(entry.get("value") or "").strip()
            label = str(entry.get("label") or "").strip()
            if not value:
                failures.append("static_value_missing_value")
                continue
            if not label:
                warnings.append("static_value_missing_label_falls_back_to_value:" + value)
            if value in seen_values:
                failures.append("duplicate_static_value:" + value)
            seen_values.append(value)
        value_count = len(seen_values)

    return failures, warnings, {
        "slug": slug,
        "source_type": source_type,
        "value_count": value_count,
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


def lookup_picklist_by_slug(api, slug):
    endpoint = "/api/v3/config-items/" + PICKLIST_ITEM_TYPE + "/by-slug/" + slug
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


def row_description(slug):
    return ("JFB managed " + PICKLIST_ITEM_TYPE + ": " + slug)[:MAX_DESCRIPTION_LENGTH]


def create_picklist(api, slug, name, cfg_data):
    payload = {
        "parameters": {},
        "data": {
            "slug": slug,
            "item_type": PICKLIST_ITEM_TYPE,
            "name": name,
            "description": row_description(slug),
            "enabled": True,
            "cfg_data": cfg_data,
        },
    }
    endpoint = "/api/v3/config-items/" + PICKLIST_ITEM_TYPE
    response = api._request("POST", endpoint, data=payload)
    return {
        "action": "created_via_post",
        "slug": slug,
        "data": response.get("data") if isinstance(response, dict) else response,
    }


def update_picklist(api, item_id, slug, name, cfg_data, version):
    payload = {
        "parameters": {"id": item_id},
        "data": {
            "id": item_id,
            "slug": slug,
            "item_type": PICKLIST_ITEM_TYPE,
            "name": name,
            "description": row_description(slug),
            "enabled": True,
            "version": version,
            "cfg_data": cfg_data,
        },
    }
    endpoint = "/api/v3/config-items/" + PICKLIST_ITEM_TYPE + "/" + item_id
    response = api._request("PATCH", endpoint, data=payload)
    return {
        "action": "updated_via_patch",
        "id": item_id,
        "slug": slug,
        "data": response.get("data") if isinstance(response, dict) else response,
    }


def save_picklist(api, slug, name, cfg_data):
    existing = lookup_picklist_by_slug(api, slug)
    existing_id = str(existing.get("id") or "").strip()

    if existing_id:
        version = existing.get("version")
        version = int(version) if isinstance(version, int) or str(version or "").isdigit() else 1
        return update_picklist(api, existing_id, slug, name, cfg_data, version)

    return create_picklist(api, slug, name, cfg_data)


def publish_picklist(api, slug):
    endpoint = "/api/v3/picklists/" + slug + "/publish"
    return api._request("POST", endpoint, data={})


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
        failures, warnings, info = check_picklist(item["slug"], item["cfg_data"])
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
            "item_type_used": PICKLIST_ITEM_TYPE,
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
        failures, _warnings, _info = check_picklist(item["slug"], item["cfg_data"])
        if failures:
            contract_failures[item["slug"]] = failures
        else:
            writable.append(item)

    if config["dry_run"]:
        return result(
            "bootstrap_only",
            not contract_failures,
            "Dry run: " + str(len(writable)) + " picklist(s) would be written, "
            + str(len(contract_failures)) + " skipped for failing the contract. Nothing written.",
            len(writable),
            {
                "item_scope": config["item_scope"],
                "items": [{"slug": it["slug"], "name": it["name"]} for it in writable],
                "contract_failures": contract_failures,
                "publish_config": config["publish_config"],
                "item_type_used": PICKLIST_ITEM_TYPE,
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

    for item in writable:
        slug = item["slug"]
        try:
            saved[slug] = save_picklist(api, slug, item["name"], item["cfg_data"])
        except Exception as exc:
            errors.append(slug + ": " + safe_text(exc, 1200))

    if config["publish_config"]:
        for item in writable:
            slug = item["slug"]
            if slug not in saved:
                continue
            try:
                publish_picklist(api, slug)
                published.append(slug)
            except Exception as exc:
                errors.append(slug + "/publish: " + safe_text(exc, 1200))

    if contract_failures:
        warnings.append("skipped_for_contract_failures:" + ",".join(sorted(contract_failures)))

    if errors:
        message = str(len(saved)) + " picklist(s) saved, " + str(len(errors)) + " error(s) -- see errors."
    elif published:
        message = str(len(saved)) + " picklist(s) saved and " + str(len(published)) + " published to pkl_values_b."
    elif config["publish_config"]:
        message = str(len(saved)) + " picklist(s) saved; nothing published."
    else:
        message = (
            str(len(saved)) + " picklist(s) saved but NOT published (publish_config=false). Static "
            "values only resolve once published -- re-run with publish_config=true, or use "
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
            "Dry run: would publish " + str(len(items)) + " picklist(s). Re-run with dry_run=false.",
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
            existing = lookup_picklist_by_slug(api, slug)
        except Exception as exc:
            errors.append(slug + "/lookup: " + safe_text(exc, 1200))
            continue

        if not existing.get("id"):
            not_found.append(slug)
            continue

        try:
            publish_picklist(api, slug)
            published.append(slug)
        except Exception as exc:
            errors.append(slug + "/publish: " + safe_text(exc, 1200))

    if not_found and not published and not errors:
        message = (
            "No saved picklist found for any slug in scope. Run mode=bootstrap_only with "
            "dry_run=false first."
        )
    elif errors:
        message = "Publish completed with errors."
    else:
        message = str(len(published)) + " picklist(s) published to pkl_values_b."

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
