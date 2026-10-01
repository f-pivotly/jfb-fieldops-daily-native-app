import json
from datetime import datetime, timedelta, timezone

try:
    import requests
    REQUESTS_AVAILABLE = True
except ModuleNotFoundError:
    requests = None
    REQUESTS_AVAILABLE = False

try:
    from pivotly import (
        TEXT,
        PivotlyAPI,
        declare_param,
        get_privileged_secret,
    )
    PIVOTLY_AVAILABLE = True
except ModuleNotFoundError:
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


SCRIPT_VERSION = "v1-jfb-monitoring-pull-r6"

PARAM_CONTRACT_VERSION = "jfb_monitoring_pull_params_v1"

STABLE_PARAM_CONTRACT = [
    {"name": "mode", "type": "TEXT", "default": "self_check"},
    {"name": "provider", "type": "TEXT", "default": ""},
    {"name": "window_hours", "type": "TEXT", "default": "48"},
    {"name": "start_date", "type": "TEXT", "default": ""},
    {"name": "end_date", "type": "TEXT", "default": ""},
    {"name": "project_code", "type": "TEXT", "default": ""},
    {"name": "param_contract_version", "type": "TEXT", "default": PARAM_CONTRACT_VERSION},
]

PUBLIC_RUNNER_PARAMS = [item["name"] for item in STABLE_PARAM_CONTRACT]

VALID_MODES = ["self_check", "dry_run", "pull", "backfill"]

VALID_PROVIDERS = ["hydrovu", "wqdatalive", "ecomzen"]

TOKEN_ENDPOINT = "https://login.microsoftonline.com/39f6cf5e-725d-4087-a1e3-e7b4442c867e/oauth2/v2.0/token"
API_SCOPE = "https://pivotlyidentityplatformdev.onmicrosoft.com/api/.default"
PIVOTLY_CLIENT_ID_SECRET = "jfb-pivotly-api-client-id"
PIVOTLY_CLIENT_SECRET_SECRET = "jfb-pivotly-api-client-secret"

VENDOR_SECRETS = {
    "hydrovu": {"client_id": "jfb-hydrovu-client-id", "client_secret": "jfb-hydrovu-client-secret"},
    "wqdatalive": {"api_key": "jfb-wqdatalive-api-key"},
    "ecomzen": {"username": "jfb-ecomzen-username", "password": "jfb-ecomzen-password"},
}

PROVIDER_TARGETS = {
    "hydrovu": {"config_domain": "jfb_water_monitoring_config", "readings_domain": "jfb_water_quality_readings", "key_field": "location_id"},
    "wqdatalive": {"config_domain": "jfb_water_monitoring_config", "readings_domain": "jfb_water_quality_readings", "key_field": "location_id"},
    "ecomzen": {"config_domain": "jfb_air_monitoring_config", "readings_domain": "jfb_air_quality_readings", "key_field": "sensor_id"},
}

CORE_DATA_SYSTEM = "core"
READ_PAGE_SIZE = 1000
WRITE_CHUNK_SIZE = 200
HTTP_TIMEOUT = 60
BACKFILL_PAD_HOURS = 6

HYDROVU_BASE = "https://www.hydrovu.com/public-api"
WQDATALIVE_BASE = "https://www.wqdatalive.com/api/v1"
WQDATALIVE_WANTED = [("turbidity", "turbid"), ("conductivity", "cond")]

PARAM_DEBUG = {}

SECRET_ERROR_REMEDIATION = {
    "secret_not_allowed": (
        "No approved Allowed Secrets grant for this script. "
        "Admin -> Variables -> Allowed Secrets: Consumer Type=script, "
        "Consumer Slug=<this script's slug>, Variable Slug=<secret slug>, Status=approved."
    ),
    "secret_not_found": "The Secret Variable slug does not exist in this environment. Check Admin -> Variables.",
    "runner_signed_token_rejected": "The runner signed-token was rejected. Re-run from the Portal.",
    "secret_accessor_missing": "Unexpected Secret wrapper shape; report the runner version.",
    "secret_read_exception": "Inspect error_detail for the raw runner message.",
}


def safe_text(value, max_length=400):
    text = str(value or "")
    for marker in ("apiKey=", "password="):
        while marker in text and marker + "[REDACTED]" not in text:
            head, _sep, tail = text.partition(marker)
            cut = min([i for i in (tail.find(c) for c in "&\"' ),") if i >= 0] or [len(tail)])
            text = head + marker + "[REDACTED]" + tail[cut:]
    for marker in ["Authorization:", "authorization:", "Bearer ", "bearer "]:
        if marker in text:
            head, _sep, _tail = text.partition(marker)
            text = head + marker + "[REDACTED]"
            break
    if len(text) > max_length:
        return text[:max_length] + "...truncated"
    return text


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
        PARAM_DEBUG[name] = {"returned_default": True, "default": debuggable(default), "error": safe_text(exc)}
        return default
    present = value is not None and not (isinstance(value, str) and value.strip() == "")
    PARAM_DEBUG[name] = {"raw_value": debuggable(value), "returned_default": not present, "default": debuggable(default), "error": error}
    return value if present else default


def load_config():
    PARAM_DEBUG.clear()
    mode = str(param_value("mode", TEXT, "self_check")).strip()
    provider = str(param_value("provider", TEXT, "")).strip().lower()
    try:
        window_hours = float(param_value("window_hours", TEXT, "48"))
    except (TypeError, ValueError):
        window_hours = 48.0
    return {
        "mode": mode if mode in VALID_MODES else "self_check",
        "mode_requested": mode,
        "provider": provider,
        "window_hours": max(1.0, min(window_hours, 72.0)),
        "start_date": str(param_value("start_date", TEXT, "")).strip(),
        "end_date": str(param_value("end_date", TEXT, "")).strip(),
        "project_code": str(param_value("project_code", TEXT, "")).strip(),
        "param_contract_version": str(param_value("param_contract_version", TEXT, PARAM_CONTRACT_VERSION)),
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
        elif isinstance(secret, str):
            raw = secret
        else:
            return "", "secret_accessor_missing", "Secret wrapper exposes neither get_raw nor _get_raw."
    except Exception as exc:
        return "", classify_secret_error(exc), safe_text(exc)
    return str(raw or "").strip(), "", ""


def read_secrets(slug_map):
    values, report = {}, {}
    for name, slug in slug_map.items():
        value, code, detail = privileged_secret_raw(slug)
        values[name] = value
        report[slug] = {"value": "present" if value else "missing", "error_code": code, "error_detail": detail}
        if code:
            report[slug]["remediation"] = SECRET_ERROR_REMEDIATION.get(code, "")
    ok = all(values.values())
    return ok, values, report


def get_pivotly_api():
    diag = {"stage": "start"}
    if not PIVOTLY_AVAILABLE or PivotlyAPI is None:
        diag.update(stage="import", error="pivotly_helper_unavailable")
        return None, diag
    if not REQUESTS_AVAILABLE:
        diag.update(stage="import", error="requests_unavailable")
        return None, diag
    ok, creds, report = read_secrets({"client_id": PIVOTLY_CLIENT_ID_SECRET, "client_secret": PIVOTLY_CLIENT_SECRET_SECRET})
    diag["secret_reads"] = report
    if not ok:
        diag.update(stage="secret_read", error="pivotly_api_secret_unavailable")
        return None, diag
    try:
        response = requests.post(
            TOKEN_ENDPOINT,
            data={"grant_type": "client_credentials", "client_id": creds["client_id"], "client_secret": creds["client_secret"], "scope": API_SCOPE},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )
        body = response.json() if response.content else {}
        if response.status_code >= 400 or not body.get("access_token"):
            diag.update(stage="token_post", error=str(body.get("error", "token_http_error")), status=response.status_code)
            return None, diag
        api = PivotlyAPI(client_id=creds["client_id"], client_secret=creds["client_secret"], token_endpoint=TOKEN_ENDPOINT, api_scope=API_SCOPE)
        api._access_token = body.get("access_token")
        diag["stage"] = "ok"
        return api, diag
    except Exception as exc:
        diag.update(stage="token_post", error="exception:" + type(exc).__name__, detail=safe_text(exc))
        return None, diag


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


def read_page(api, domain, filters=None, sort_col=None, sort_dir=None, limit=READ_PAGE_SIZE, offset=0):
    parameters = {"domain": domain, "system": CORE_DATA_SYSTEM, "limit": limit, "offset": offset}
    if filters:
        parameters["filters"] = filters
    if sort_col:
        parameters["sort_col"] = sort_col
    if sort_dir:
        parameters["sort_dir"] = sort_dir
    return extract_rows(api._request("POST", "/api/v3/core-data-read", data={"parameters": parameters}))


def read_all(api, domain, filters=None, sort_col=None, sort_dir=None):
    rows, offset = [], 0
    while True:
        page = read_page(api, domain, filters, sort_col, sort_dir, READ_PAGE_SIZE, offset)
        rows.extend(page)
        if len(page) < READ_PAGE_SIZE:
            return rows
        offset += READ_PAGE_SIZE


def update_record(api, domain, record_id, patch):
    payload = {
        "parameters": {"domain": domain, "system": CORE_DATA_SYSTEM, "operation": "update", "latency": "synchronous", "core_record_id": record_id},
        "data": patch,
    }
    response = api._request("POST", "/api/v3/core-data-write", data=payload)
    if isinstance(response, dict) and str(response.get("result", "success")).lower() == "error":
        raise RuntimeError("core-data-write update failed: " + safe_text(response.get("message") or response))


def write_bundle(api, domain, records):
    written = 0
    for i in range(0, len(records), WRITE_CHUNK_SIZE):
        chunk = records[i:i + WRITE_CHUNK_SIZE]
        payload = {
            "parameters": {"domain": domain, "system": CORE_DATA_SYSTEM, "operation": "insert", "latency": "synchronous"},
            "data": chunk,
        }
        response = api._request("POST", "/api/v3/core-data-write", data=payload)
        if isinstance(response, dict) and str(response.get("result", "success")).lower() == "error":
            raise RuntimeError("core-data-write failed: " + safe_text(response.get("message") or response))
        written += len(chunk)
    return written


def parse_ts(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip().replace(" ", "T", 1)
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def iso_utc(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def now_utc():
    return datetime.now(timezone.utc)


def hydrovu_token(creds):
    response = requests.post(
        HYDROVU_BASE + "/oauth/token",
        data={"grant_type": "client_credentials", "client_id": creds["client_id"], "client_secret": creds["client_secret"]},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=HTTP_TIMEOUT,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"HydroVu token: HTTP {response.status_code} {safe_text(response.text)}")
    return response.json()["access_token"]


def hydrovu_get(token, path, params=None):
    pages, next_page = [], None
    while True:
        headers = {"Authorization": "Bearer " + token}
        if next_page:
            headers["X-ISI-Start-Page"] = next_page
        response = requests.get(HYDROVU_BASE + path, params=params or {}, headers=headers, timeout=HTTP_TIMEOUT)
        if response.status_code == 404:
            return pages
        if response.status_code >= 400:
            raise RuntimeError(f"HydroVu {path}: HTTP {response.status_code} {safe_text(response.text)}")
        pages.append(response.json())
        next_page = response.headers.get("X-ISI-Next-Page")
        if not next_page:
            return pages


def hydrovu_pull(creds, config, start_dt, end_dt, state):
    if "hydrovu_token" not in state:
        state["hydrovu_token"] = hydrovu_token(creds)
        pages = hydrovu_get(state["hydrovu_token"], "/v1/sispec/friendlynames")
        state["hydrovu_names"] = pages[0] if pages else {"parameters": {}, "units": {}}
    token, names = state["hydrovu_token"], state["hydrovu_names"]
    fetched_at = iso_utc(now_utc())
    rows = []
    for loc in config.get("locations") or []:
        location_id = loc.get("hydrovu_location_id")
        if location_id is None:
            continue
        pages = hydrovu_get(token, f"/v1/locations/{location_id}/data",
                            {"startTime": int(start_dt.timestamp()), "endTime": int(end_dt.timestamp())})
        for page in pages:
            for param in page.get("parameters") or []:
                pname = str((names.get("parameters") or {}).get(param.get("parameterId"), param.get("parameterId")))
                if "turbid" not in pname.lower():
                    continue
                unit = str((names.get("units") or {}).get(param.get("unitId"), param.get("unitId") or "NTU"))
                for reading in param.get("readings") or []:
                    value = reading.get("value")
                    if not isinstance(value, (int, float)) or isinstance(value, bool) or value != value:
                        continue
                    rows.append({
                        "project_id": config["project_id"],
                        "location_id": str(location_id),
                        "role": loc.get("role"),
                        "parameter": "turbidity",
                        "unit": unit,
                        "value": value,
                        "reading_at": iso_utc(datetime.fromtimestamp(reading["timestamp"], timezone.utc)),
                        "source": "hydrovu",
                        "fetched_at": fetched_at,
                    })
    return rows


def wqdatalive_get(api_key, path, params=None):
    query = {"apiKey": api_key}
    query.update(params or {})
    response = requests.get(WQDATALIVE_BASE + path, params=query, timeout=HTTP_TIMEOUT)
    if response.status_code == 429:
        raise RuntimeError("WQData LIVE rate limit (429): 180 requests/hour exceeded")
    if response.status_code >= 400:
        raise RuntimeError(f"WQData {path}: HTTP {response.status_code} {safe_text(response.text)}")
    return response.json()


def wqdatalive_fmt(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def wqdatalive_parameter_data(api_key, device_id, parameter_id, start_dt, end_dt):
    out = []
    to_str, from_str, prev_from = wqdatalive_fmt(end_dt), wqdatalive_fmt(start_dt), None
    for _guard in range(50):
        body = wqdatalive_get(api_key, f"/devices/{device_id}/parameters/{parameter_id}/data", {"from": from_str, "to": to_str})
        for point in body.get("data") or []:
            try:
                value = float(point.get("value"))
            except (TypeError, ValueError):
                continue
            if value != value or not point.get("timestamp"):
                continue
            out.append((iso_utc(parse_ts(str(point["timestamp"]) + "Z")), value))
        info = body.get("info") or {}
        last = info.get("lastDataPointTimestamp")
        if not info.get("more") or not last or last == prev_from:
            break
        prev_from, from_str = from_str, last
    return out


def wqdatalive_pull(creds, config, start_dt, end_dt, state):
    api_key = creds["api_key"]
    fetched_at = iso_utc(now_utc())
    rows = []
    for loc in config.get("locations") or []:
        device_id = loc.get("wqdatalive_device_id", loc.get("device_id"))
        if device_id is None:
            continue
        params = wqdatalive_get(api_key, f"/devices/{device_id}/parameters").get("parameters") or []
        for parameter, needle in WQDATALIVE_WANTED:
            match = next((p for p in params if needle in str(p.get("name") or "").lower()), None)
            if not match:
                continue
            for reading_at, value in wqdatalive_parameter_data(api_key, device_id, match.get("id"), start_dt, end_dt):
                rows.append({
                    "project_id": config["project_id"],
                    "location_id": str(device_id),
                    "role": loc.get("role"),
                    "parameter": parameter,
                    "unit": match.get("unit"),
                    "value": value,
                    "reading_at": reading_at,
                    "source": "wqdatalive",
                    "fetched_at": fetched_at,
                })
    return rows


def ecomzen_login(base_url, username, password):
    session = requests.Session()
    response = session.get(base_url + "/en/accounts/login/", timeout=HTTP_TIMEOUT, allow_redirects=True)
    login_url = response.url
    csrf = session.cookies.get("csrftoken")
    if not csrf:
        raise RuntimeError("ECOMZEN login page gave no csrftoken")
    session.post(
        login_url,
        data={"csrfmiddlewaretoken": csrf, "username": username, "password": password},
        headers={"Referer": login_url},
        timeout=HTTP_TIMEOUT,
        allow_redirects=False,
    )
    if not session.cookies.get("sessionid"):
        raise RuntimeError("ECOMZEN login failed: check the jfb-ecomzen-username / jfb-ecomzen-password secrets")
    return session


def ecomzen_download(session, base_url, sensor_id, start_local, end_local):
    response = session.post(
        f"{base_url}/en/sensor/{sensor_id}/download-data/",
        data={"csrfmiddlewaretoken": session.cookies.get("csrftoken"), "start": start_local, "end": end_local, "frequency": "minute", "csv": ""},
        headers={"Referer": f"{base_url}/en/sensor/{sensor_id}/download/"},
        timeout=HTTP_TIMEOUT,
        allow_redirects=False,
    )
    if 300 <= response.status_code < 400:
        return ""
    if response.status_code != 200:
        raise RuntimeError(f"ECOMZEN download sensor {sensor_id}: HTTP {response.status_code}")
    return response.text


def parse_pm10_csv(text):
    lines = text.splitlines()
    header_idx = next((i for i, line in enumerate(lines) if "Date (UTC)" in line), -1)
    if header_idx == -1:
        return []
    header = lines[header_idx]
    delim = ";" if ";" in header else ","
    cols = [c.strip().strip('"') for c in header.split(delim)]
    date_col = next((i for i, c in enumerate(cols) if c == "Date (UTC)"), -1)
    pm_col = next((i for i, c in enumerate(cols) if c.replace(" ", "").upper() == "PM10"), -1)
    if date_col == -1 or pm_col == -1:
        return []
    out = []
    for line in lines[header_idx + 1:]:
        if not line.strip():
            continue
        parts = [c.strip().strip('"') for c in line.split(delim)]
        if max(date_col, pm_col) >= len(parts):
            continue
        raw_date, raw_val = parts[date_col], parts[pm_col]
        if not raw_date or raw_val == "":
            continue
        try:
            value = float(raw_val)
            reading_at = parse_ts(raw_date if raw_date.endswith("Z") else raw_date + "Z")
        except ValueError:
            continue
        if value != value:
            continue
        out.append((iso_utc(reading_at), value))
    return out


US_STANDARD_OFFSETS = {
    "America/New_York": -5,
    "America/Detroit": -5,
    "America/Indiana/Indianapolis": -5,
    "America/Chicago": -6,
    "America/Denver": -7,
    "America/Phoenix": -7,
    "America/Los_Angeles": -8,
    "America/Anchorage": -9,
    "Pacific/Honolulu": -10,
}

NO_DST_ZONES = {"America/Phoenix", "Pacific/Honolulu"}


def nth_sunday(year, month, n):
    first = datetime(year, month, 1)
    return 1 + (6 - first.weekday()) % 7 + 7 * (n - 1)


def utc_offset_hours(dt, tz_name):
    if tz_name in ("UTC", "Etc/UTC"):
        return 0
    if tz_name not in US_STANDARD_OFFSETS:
        raise RuntimeError(f"Unsupported timezone '{tz_name}'; add it to US_STANDARD_OFFSETS")
    std = US_STANDARD_OFFSETS[tz_name]
    if tz_name in NO_DST_ZONES:
        return std
    year = dt.astimezone(timezone.utc).year
    dst_start = datetime(year, 3, nth_sunday(year, 3, 2), 2, tzinfo=timezone.utc) - timedelta(hours=std)
    dst_end = datetime(year, 11, nth_sunday(year, 11, 1), 2, tzinfo=timezone.utc) - timedelta(hours=std + 1)
    return std + 1 if dst_start <= dt.astimezone(timezone.utc) < dst_end else std


def format_local(dt, tz_name):
    local = dt.astimezone(timezone.utc) + timedelta(hours=utc_offset_hours(dt, tz_name))
    return local.strftime("%Y-%m-%d %H:%M:%S")


def ecomzen_pull(creds, config, start_dt, end_dt, state):
    base_url = config.get("base_url")
    session_key = "ecomzen_session:" + str(base_url)
    if session_key not in state:
        state[session_key] = ecomzen_login(base_url, creds["username"], creds["password"])
    session = state[session_key]
    tz_name = config.get("timezone") or "America/New_York"
    fetched_at = iso_utc(now_utc())
    rows = []
    day = start_dt
    while day < end_dt:
        chunk_end = min(day + timedelta(days=1), end_dt)
        for station in config.get("stations") or []:
            csv_text = ecomzen_download(session, base_url, station.get("sensor_id"), format_local(day, tz_name), format_local(chunk_end, tz_name))
            for reading_at, value in parse_pm10_csv(csv_text):
                rows.append({
                    "project_id": config["project_id"],
                    "sensor_id": str(station.get("sensor_id")),
                    "station_key": station.get("key"),
                    "parameter": "pm10",
                    "unit": "ug/m3",
                    "value": value,
                    "reading_at": reading_at,
                    "source": "ecomzen",
                    "fetched_at": fetched_at,
                })
        day = chunk_end
    return rows


PULLERS = {"hydrovu": hydrovu_pull, "wqdatalive": wqdatalive_pull, "ecomzen": ecomzen_pull}


def reading_key(row, key_field):
    return (str(row.get(key_field)), str(row.get("parameter")), parse_ts(row.get("reading_at")))


COMPARED_FIELDS = ("unit", "role", "station_key", "source")


def value_changed(stored, fresh):
    try:
        return abs(float(stored) - float(fresh)) > 1e-9
    except (TypeError, ValueError):
        return str(stored) != str(fresh)


def changed_patch(stored, row):
    patch = {}
    if value_changed(stored.get("value"), row.get("value")):
        patch["value"] = row["value"]
    for field in COMPARED_FIELDS:
        if field in row and str(stored.get(field) or "") != str(row.get(field) or ""):
            patch[field] = row[field]
    if patch:
        patch["fetched_at"] = row["fetched_at"]
    return patch


def plan_window_writes(api, readings_domain, key_field, project_id, rows, start_dt, end_dt):
    existing = read_all(api, readings_domain, {"project_id": project_id, "reading_at": {"gte": iso_utc(start_dt), "lt": iso_utc(end_dt)}})
    stored = {reading_key(r, key_field): r for r in existing}
    inserts, updates = [], []
    for row in rows:
        current = stored.get(reading_key(row, key_field))
        if current is None:
            inserts.append(row)
            continue
        patch = changed_patch(current, row)
        if patch and current.get("id"):
            updates.append((current["id"], patch))
    return inserts, updates


def dedupe_batch(rows, key_field):
    seen, out = set(), []
    for row in rows:
        key = reading_key(row, key_field)
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def resolve_window(config):
    if config["mode"] == "backfill":
        if not config["start_date"]:
            raise ValueError("backfill needs start_date (YYYY-MM-DD)")
        start = datetime.fromisoformat(config["start_date"]).replace(tzinfo=timezone.utc) - timedelta(hours=BACKFILL_PAD_HOURS)
        end_day = datetime.fromisoformat(config["end_date"]).replace(tzinfo=timezone.utc) if config["end_date"] else now_utc()
        end = min(end_day.replace(hour=23, minute=59, second=59) + timedelta(hours=BACKFILL_PAD_HOURS), now_utc())
        return start, end
    end = now_utc()
    return end - timedelta(hours=config["window_hours"]), end


def load_monitoring_configs(api, provider, project_code):
    target = PROVIDER_TARGETS[provider]
    configs = [c for c in read_all(api, target["config_domain"]) if str(c.get("provider") or "").lower() == provider]
    if project_code:
        projects = read_all(api, "jfb_projects", {"project_code": int(project_code) if project_code.isdigit() else project_code})
        ids = {p.get("id") for p in projects}
        configs = [c for c in configs if c.get("project_id") in ids]
    return configs


def summarize_rows(rows, key_field):
    by = {}
    for row in rows:
        k = f"{row.get('role') or row.get('station_key')}:{row[key_field]}:{row['parameter']}"
        entry = by.setdefault(k, {"count": 0, "first": row["reading_at"], "last": row["reading_at"]})
        entry["count"] += 1
        entry["first"] = min(entry["first"], row["reading_at"])
        entry["last"] = max(entry["last"], row["reading_at"])
    return by


def run_provider(config, api):
    provider = config["provider"]
    target = PROVIDER_TARGETS[provider]
    ok, creds, secret_report = read_secrets(VENDOR_SECRETS[provider])
    output = {"provider": provider, "vendor_secret_reads": secret_report}
    if not ok:
        output.update(ok=False, error="vendor_secret_unavailable")
        return output
    configs = load_monitoring_configs(api, provider, config["project_code"])
    output["config_count"] = len(configs)
    if config["mode"] == "self_check":
        output.update(ok=True, projects=[c.get("project_id") for c in configs])
        return output
    start_dt, end_dt = resolve_window(config)
    output["window"] = {"start": iso_utc(start_dt), "end": iso_utc(end_dt)}
    state, summary, details = {}, {}, {}
    for cfg in configs:
        project_id = cfg.get("project_id")
        try:
            rows = dedupe_batch(PULLERS[provider](creds, cfg, start_dt, end_dt, state), target["key_field"])
            inserts, updates = plan_window_writes(api, target["readings_domain"], target["key_field"], project_id, rows, start_dt, end_dt)
            written, updated = 0, 0
            if config["mode"] != "dry_run":
                written = write_bundle(api, target["readings_domain"], inserts)
                for record_id, patch in updates:
                    update_record(api, target["readings_domain"], record_id, patch)
                    updated += 1
            summary[project_id] = written + updated
            details[project_id] = {
                "fetched": len(rows),
                "new": len(inserts),
                "changed": len(updates),
                "written": written,
                "updated": updated,
                "by_series": summarize_rows(rows, target["key_field"]),
            }
        except Exception as exc:
            summary[project_id] = -1
            details[project_id] = {"error": safe_text(exc)}
    output.update(ok=all(v != -1 for v in summary.values()), summary=summary, details=details)
    return output


def run(config):
    output = {"script_version": SCRIPT_VERSION, "mode": config["mode"], "param_contract_version": config["param_contract_version"]}
    if config["mode_requested"] and config["mode_requested"] != config["mode"]:
        output["mode_warning"] = f"unknown mode '{config['mode_requested']}', ran self_check"
    if config["provider"] not in VALID_PROVIDERS:
        output.update(ok=False, error=f"provider must be one of {VALID_PROVIDERS}")
    else:
        api, diag = get_pivotly_api()
        output["pivotly_api"] = diag
        if api is None:
            output.update(ok=False, error="pivotly_api_unavailable")
        else:
            try:
                output.update(run_provider(config, api))
            except Exception as exc:
                output.update(ok=False, error=safe_text(exc))
    output["param_resolution"] = dict(PARAM_DEBUG)
    output["accepted_param_count"] = len(PUBLIC_RUNNER_PARAMS)
    return output


def main():
    print(json.dumps(run(load_config()), sort_keys=True, default=str))
    return 0


raise SystemExit(main())
