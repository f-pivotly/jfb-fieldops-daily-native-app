# WQData LIVE: manual test with Postman

How to check the WQData LIVE API (Penobscot water quality) by hand, before or after a `jfb_monitoring_pull` run. Postman calls the same endpoints the script calls, from your own machine, so it tells you whether a failure is WQData LIVE's side or ours.

**No credential values are written in this file.**

---

## 1. Before you start

| Need | Where to get it |
|---|---|
| WQData LIVE API key | Pivotly secret `jfb-wqdatalive-api-key` — same value as `WQDATALIVE_API_KEY` in the non-native app's Netlify settings / `jfb-fieldops-daily/.env` |
| Penobscot device ids | Upstream `5566`, Downstream `5565` (from `jfb_water_monitoring_config.locations`) |
| Rate limit | **180 requests per hour per key**, shared with the hourly pulls (Netlify and Pivotly). A full test below is ~6 requests. |

All WQData LIVE times are **UTC**, formatted `yyyy-MM-dd HH:mm:ss`.

---

## 2. Postman setup

1. **Environments → +** → name it `WQData LIVE`.
2. Add these variables:

| Variable | Type | Initial value | Current value |
|---|---|---|---|
| `wqBase` | default | `https://www.wqdatalive.com/api/v1` | same |
| `wqKey` | **secret** | *(leave blank)* | *(paste the API key)* |
| `upstreamId` | default | `5566` | same |
| `downstreamId` | default | `5565` | same |
| `turbidityId` | default | *(blank — filled in step 3.2)* | |
| `from` | default | `2026-09-13 00:00:00` | |
| `to` | default | `2026-09-14 23:59:59` | |

   Put the key only in **Current value** so it isn't synced or shared if the collection is exported.
3. Select the `WQData LIVE` environment (top-right dropdown).
4. All requests are **GET**, no headers, no body. The key goes in the query string as `apiKey`.

---

## 3. Tests

### 3.0 Is the server up?

Open `https://www.wqdatalive.com` in a browser.

| Result | Meaning | Next |
|---|---|---|
| Page loads | Server up | Go to 3.1 |
| Page never loads / times out | WQData LIVE is down | Stop. Try again later — the API will time out too |

### 3.1 Key works — list devices

```
GET {{wqBase}}/devices?apiKey={{wqKey}}
```

**Pass:** `200` and a JSON list that includes device ids `5566` (Upstream) and `5565` (Downstream).

### 3.2 Upstream parameters — the call that timed out in the script

```
GET {{wqBase}}/devices/{{upstreamId}}/parameters?apiKey={{wqKey}}
```

**Pass:** `200` with a `parameters` array. Each entry has `id`, `name` and `unit`.

- Find the entry whose `name` contains **"Turbid"** → copy its `id` into the `turbidityId` variable.
- There should also be one whose `name` contains **"Cond"** (specific conductance). The script pulls both.

### 3.3 Readings for one day

```
GET {{wqBase}}/devices/{{upstreamId}}/parameters/{{turbidityId}}/data?apiKey={{wqKey}}&from={{from}}&to={{to}}
```

Postman encodes the space in `from` / `to` for you.

**Pass:** `200` with:

| Field | Expect |
|---|---|
| `data` | Array of `{ "timestamp": "yyyy-MM-dd HH:mm:ss", "value": … }`, roughly every 10 minutes |
| `info.more` | `true` if more pages exist (up to 5,000 points per page) |
| `info.lastDataPointTimestamp` | Where the next page starts — the script sends it back as `from` |

With the default `from` / `to` (2026-09-13 → 14) you should get about **144 points per day**. The buoys stopped reporting on **2026-09-14 17:50 UTC**, so any range after that returns `"data": []` — that's correct, not a failure.

### 3.4 Downstream buoy

Repeat 3.2 and 3.3 with `{{downstreamId}}` (its turbidity parameter has its own `id`).

---

## 4. Reading the result

| Postman shows | Meaning | What to do |
|---|---|---|
| Spins, then **"Could not get response"** / `ETIMEDOUT` / `ECONNREFUSED` | WQData LIVE server down — same as the script's `ConnectTimeoutError` | Wait and retry. Not our bug. |
| `401` / `403` | Server up, key rejected | Check / rotate `jfb-wqdatalive-api-key` in Pivotly (and Netlify) |
| `404` on a device | Wrong device id | Check `locations` in Penobscot's `jfb_water_monitoring_config` |
| `429` | Rate limit (180/hour) hit | Wait an hour; the hourly pulls share the same key |
| `200`, `data: []` for dates after 2026-09-14 | Buoys offline (known) | Nothing — expected |
| `200` with readings | All good | Go to section 5 |

---

## 5. After Postman passes: re-run the script

In the Pivotly Script Editor (`scr_jfb_monitoring_pull`), run:

```json
{"schema_version":"1.0","script_slug":"scr_jfb_monitoring_pull","param_inputs":[
{"name":"mode","data_type":"text","value":"dry_run"},
{"name":"provider","data_type":"text","value":"wqdatalive"},
{"name":"window_hours","data_type":"text","value":"48"},
{"name":"start_date","data_type":"text","value":""},
{"name":"end_date","data_type":"text","value":""},
{"name":"project_code","data_type":"text","value":""},
{"name":"param_contract_version","data_type":"text","value":"jfb_monitoring_pull_params_v1"}]}
```

| Output field | Pass |
|---|---|
| `ok` | `true` |
| `script_version` | `v1-jfb-monitoring-pull-r6` (or later) |
| `summary["01a0e6dc-6fef-76b8-8759-b834f395186c"]` (Penobscot) | `0` or more — **not** `-1` |
| `details[…].fetched` | `0` while the buoys are offline; >0 once they report again |
| `details[…].error` | absent |

To prove the script and Postman agree on real data, use `mode: backfill` with `start_date: 2026-09-13`, `end_date: 2026-09-14` and compare `details[…].by_series` counts with the number of points Postman returned in 3.3 / 3.4 (the script's window is padded ±6 h, so its counts can be slightly higher).

---

## 6. Optional: the same checks for the other providers

| Provider | Quick Postman check | Pass |
|---|---|---|
| HydroVu (Torch Lake water) | `POST https://www.hydrovu.com/public-api/oauth/token`, body `x-www-form-urlencoded`: `grant_type=client_credentials`, `client_id`, `client_secret` (secrets `jfb-hydrovu-client-*`) | `200` with `access_token` |
| ECOMZEN (Torch Lake air) | Open `https://sgsusa-ws.i-comesure.com/en/accounts/login/` in a browser | Login page loads (the pull itself is a form login + CSV download, not practical in Postman) |
