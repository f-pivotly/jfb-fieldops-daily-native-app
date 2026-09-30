# Air & Water Quality in Pivotly: port plan

How to make the native app (Pivotly) collect and show air and water quality the way the non-native app (Netlify + Supabase) does.

Written 2026-09-28 after reading both codebases, the Pivotly workflow engine (`Connect_Custom`) and the local data in both databases. Updated 2026-09-29 after the tidal (Penobscot) port and a second full parity pass — see §11 for the feature-by-feature comparison.

---

## Progress (2026-09-29)

| Step | Status | Result |
|---|---|---|
| D1 domain `compliance_started_at` | ✅ Published | Column live in local Pivotly; now written by the Water tab's mode toggle |
| DA1 Penobscot water config | ✅ Loaded | Identical to Supabase (checksum) |
| DA3 Penobscot notes | ✅ Loaded | 23 notes (21 with `reference_ntu`), plus 23 report dates; identical to Supabase |
| S1 `jfb_monitoring_pull.py` | ✅ Written, `r6` | All 3 providers. 48 h window, insert-missing + update-changed (§5.3), pulls inactive configs too; `r6` keeps the full error text and redacts only the API key / password values. Imports are only `datetime`, `json`, `pivotly`, `requests`, `zoneinfo`. |
| T1 `self_check` | ✅ Pass (on `r2`) | Secrets resolve; HydroVu and ECOMZEN find Torch Lake, WQData LIVE finds Penobscot |
| T2 `dry_run` 6 h | ✅ Pass (on `r2`) | HydroVu 23/station; ECOMZEN 296–360/station (NE Beach offline); WQData 0 (buoys offline). Matches the check with the Netlify vendor clients. |
| T3 pull twice | ✅ Pass (on `r2`) | Second run wrote 0; 0 duplicate keys in Pivotly. **Re-run on `r6`** (§8). |
| T4 parity | ✅ Pass (on `r2`) | 2026-09-20 → 21: all 3 water and 5 air series identical to what the Netlify functions stored in Supabase |
| `r5` insert/update planner | ✅ Offline test | String `"1.20"` vs `1.2` → skipped; changed value → updated; changed unit → updated; new reading → inserted |
| DA2 backfill 2026-09-14 → now | ➖ Optional | Only to migrate history. **Skip on a fresh deploy with no data.** |
| Phase 5 tidal mode (native app) | ✅ Ported | Tab, chart, NOAA tide, mode toggle, reference NTU, PDF page (R1). `buildTidalTurbidityDay` output byte-identical to non-native on all 23 Penobscot days × both modes (46/46). |
| Parity fixes (§11) | ✅ Done | Fixed-site PDF wording/layout/number format, 50-row tables, window-end readings, per-page PDF failure isolation |
| K1–K8 secrets + allow-list | ☐ You | |
| Paste S1 (`r6`) into the Pivotly Script Editor | ☐ You | Slug `jfb_monitoring_pull` |
| W1–W3 workflows | ☐ You | See §4.5 |
| Deploy native app | ☐ You | Upload the new `dist/index.html` and publish `pivotly/reports/rpt-jfb-daily-report.json` |

**How the local tests ran:** a harness supplied the Runner's `declare_param`, `get_privileged_secret` (read from `jfb-fieldops-daily/.env`, in memory only) and `PivotlyAPI._request`. Reads went to local Pivotly directly, and writes went through `core.fnc_tx`, the same function behind `/core-data-write`. The Azure token call was the only call intercepted. The script file itself wasn't changed for the test.

---

## 1. How the non-native app does it

| Piece | What it does |
|---|---|
| `netlify/functions/pull-water-quality.mts` (`17 * * * *`) | HydroVu → `water_quality_readings` (Torch Lake turbidity, 3 stations, every 15 min → 12 rows/hr) |
| `netlify/functions/pull-wqdatalive.mts` (`47 * * * *`) | WQData LIVE → `water_quality_readings` (Penobscot turbidity + conductivity, 2 buoys, every 10 min → 24 rows/hr) |
| `netlify/functions/pull-air-quality.mts` (`37 * * * *`) | ECOMZEN (SGS Galson SmartSense) → `air_quality_readings` (Torch Lake PM10, 5 stations, every minute → up to 300 rows/hr) |
| `netlify/lib/hydrovu.mjs`, `wqdatalive.mjs`, `ecomzen.mjs` | The vendor clients. Each run re-pulls the **last 48 h** and `upsert`s on the natural key: new readings are inserted, existing ones are **overwritten** (value, unit, role, `fetched_at`). Nothing is ever deleted. Configs are pulled regardless of `active`. |
| Netlify env vars | `HYDROVU_CLIENT_ID/SECRET`, `WQDATALIVE_API_KEY`, `ECOMZEN_USERNAME/PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` |
| `water_/air_monitoring_config` | Per-project provider, window, slot size, stations or locations, thresholds, mode, `active` |
| Water Quality / Air Quality tabs, PDF pages | Read the stored readings only; they never call a vendor (the tidal page also calls NOAA for the tide) |

The three schedules run hourly, offset to :17 / :37 / :47 so they never start together. About 330 new rows an hour in total (~8,000/day); air is ~90% of it.

---

## 2. What the native app has today

| Area | Status | Detail |
|---|---|---|
| Reading domains `jfb_water_quality_readings`, `jfb_air_quality_readings` | ✅ Present | Same fields as Supabase. Local Pivotly holds a one-off load that **stops at 2026-09-14**. |
| Config domains `jfb_water_monitoring_config`, `jfb_air_monitoring_config` | ✅ Present | `compliance_started_at` added (D1). `tide_offset_minutes` is not added: production Supabase has no such column, so it's always 0. |
| Notes / daily domains `jfb_water_monitoring_notes`, `jfb_air_monitoring_daily` | ✅ Present | Same fields (`report_date_id` → `report_id`); notes include `reference_ntu` |
| Torch Lake + Penobscot configs in local Pivotly | ✅ Present | Torch water (HydroVu, compliance) and air (ECOMZEN); Penobscot water (WQData LIVE, compliance) |
| Fixed-station water tab + PDF (Torch Lake) | ✅ Present | `lib/waterQuality/data.js` `buildTurbidityDay`, `chart.js` `renderTurbidityChart` |
| Tidal water mode (Penobscot) | ✅ Ported | `lib/waterQuality/noaaTide.js`, `buildTidalTurbidityDay`, `renderTidalTurbidityChart`, mode toggle, reference NTU input, tidal PDF page |
| Air tab + PDF | ✅ Present | `lib/airQuality/data.js`, `chart.js` |
| Automatic hourly pull | ⚠️ Script ready, not scheduled | `pivotly/scripts/jfb_monitoring_pull.py` `r6`; needs K1–K8 and W1–W3 |

---

## 3. Target design in Pivotly

```
 Workflow "jfb-pull-hydrovu"   (Schedule Trigger, hourly :17)  ─┐
 Workflow "jfb-pull-ecomzen"   (Schedule Trigger, hourly :37)  ─┼─▶ Pivotly Script step
 Workflow "jfb-pull-wqdatalive"(Schedule Trigger, hourly :47)  ─┘      runs jfb_monitoring_pull.py (provider=…)
                                                                          │
      Pivotly secrets (allow-listed for the script) ──────────────────────┤
                                                                          ▼
          vendor APIs (last 48 h) ──▶ insert missing / update changed ──▶ jfb_water_quality_readings / jfb_air_quality_readings
                                                                          │
                                                   native Water / Air tabs + PDF (read only)
```

| Non-native piece | Pivotly piece |
|---|---|
| Netlify schedule (`export const config = { schedule }`) | Workflow with a **Schedule Trigger** (cron saved in `wrk_job_schedules_b`) |
| Netlify function body | **Pivotly Script** step (`pivotly_script` connector) running a Python Runner script |
| Netlify env vars | Pivotly **secret variables**, read with `get_privileged_secret()` and **allow-listed** for the script (`cfg_allowed_secrets_b`) |
| Supabase service-role upsert | `PivotlyAPI` window read, then `core-data-write` bundle **inserts** for missing readings and per-record **updates** for changed ones (§5.3) |
| `scripts/*-backfill.mjs` | The same script with `mode=backfill` and a date range |

### Why a script and not a pure workflow

Checked in `Connect_Custom`:

| Need | Pure workflow |
|---|---|
| WQData LIVE (API key, JSON, no paging) | Possible |
| HydroVu paging via the `X-ISI-Next-Page` header | ❌ **Not reliable.** The HTTP step returns headers and `do_while` exists. But a reference to a header name with dashes resolves **only** as a bare `${step.data.headers.x-isi-next-page}`, and when the header is absent (the last page) the engine returns the literal text. That's truthy, so the loop runs to its cap (1,000 passes). |
| ECOMZEN (browser-style login with CSRF token and cookies, manual redirects, CSV download and parse) | ❌ Not practical |
| Compare against stored readings; timezone and epoch conversion | Awkward in expressions, which can also turn numbers into strings |

So workflows handle **scheduling**, and one script handles **pulling**.

---

## 4. Metadata changes (publish individually)

### 4.1 Domains

| # | Domain | Change | Status |
|---|---|---|---|
| D1 | `jfb_water_monitoring_config` | **Add field `compliance_started_at`** (timestamp with time zone, nullable). Stamped when the Water tab switches to Compliance, cleared when switched back. Audit trail only. | ✅ Published |

No other domain changes. All six monitoring domains were compared column by column with Supabase; the only other difference is the normal `report_date_id` → `report_id` rename. `tide_offset_minutes` is read by the non-native code but doesn't exist in production, so it isn't added (native treats it as 0, the same result).

### 4.4 Reports

| # | Report | Change | Status |
|---|---|---|---|
| R1 | `rpt-jfb-daily-report` | Water page: `isTidal` branch (upstream/downstream + conductivity + tide table, exceedance rows shaded, NOAA high/low table, exceedance block, limits box in compliance mode only). Fixed-site page brought in line with non-native: title "Daily Turbidity Reporting", "Monitor Coordinates (X,Y)" with depth, Notes always shown ("—" when empty), non-native average-difference wording, thresholds as a footnote under the chart (no limits box), aerial beside the chart. New CSS: `.mon-exceed`, `.mon-kv-head`, `.mon-big-alert`, `.mon-foot-row`, `.mon-bottom*`. | ✅ Edited locally — **publish** |

### 4.5 Scripts, secrets, workflows (Pivotly config, not domains)

| # | Item | Type | Detail |
|---|---|---|---|
| S1 | `jfb_monitoring_pull.py` (`r6`) | Python Runner script | In `pivotly/scripts/` (§5) |
| K1–K5 | `jfb-hydrovu-client-id`, `jfb-hydrovu-client-secret`, `jfb-wqdatalive-api-key`, `jfb-ecomzen-username`, `jfb-ecomzen-password` | Secret variables | **You enter the values.** Same credentials as the Netlify site settings. |
| K6 | Allow-list K1–K5 and K7–K8 for `jfb_monitoring_pull` | `cfg_allowed_secrets_b` (admin approval) | Without it the script gets `secret_not_allowed` |
| K7–K8 | `jfb-pivotly-api-client-id`, `jfb-pivotly-api-client-secret` | Secret variables | The Azure client credentials the script uses to call the Pivotly API. Stored as secrets, not hard-coded. |
| W1 | `jfb-pull-hydrovu` | Workflow | Schedule Trigger `17 * * * *` → Pivotly Script (`provider=hydrovu`, `mode=pull`) |
| W2 | `jfb-pull-ecomzen` | Workflow | Schedule Trigger `37 * * * *` → Pivotly Script (`provider=ecomzen`, `mode=pull`) |
| W3 | `jfb-pull-wqdatalive` | Workflow | Schedule Trigger `47 * * * *` → Pivotly Script (`provider=wqdatalive`, `mode=pull`) |

`window_hours` defaults to 48, so the workflows don't need to pass it.

---

## 5. The pull script: `jfb_monitoring_pull.py`

### 5.1 Parameters

| Name | Type | Default | Meaning |
|---|---|---|---|
| `provider` | TEXT | — | `hydrovu`, `wqdatalive` or `ecomzen` |
| `mode` | TEXT | `self_check` | `self_check` (validate secrets and config, no calls), `dry_run` (pull and plan, report counts, **no writes**), `pull` (hourly), `backfill` |
| `window_hours` | TEXT | `48` | Trailing window for `pull` (clamped 1–72). 48 matches the Netlify functions. |
| `start_date` / `end_date` | TEXT | — | `backfill` only (YYYY-MM-DD) |
| `project_code` | TEXT | all | Limit to one project |

The same pattern as the existing bootstrap scripts: `declare_param`, `SCRIPT_VERSION`, JSON output.

### 5.2 Per provider (port of `netlify/lib/*.mjs`, logic unchanged)

| Provider | Steps |
|---|---|
| **HydroVu** | POST `/oauth/token` (client credentials) → GET `/v1/sispec/friendlynames` → for each `locations[].hydrovu_location_id`: GET `/v1/locations/{id}/data?startTime&endTime`, following `X-ISI-Next-Page` → keep parameters whose name matches `/turbid/i`, and treat 404 as empty |
| **WQData LIVE** | For each `locations[].wqdatalive_device_id`: get the device parameters → match turbidity and conductivity → fetch each parameter's data for the window |
| **ECOMZEN** | GET `{base_url}/en/accounts/login/` (follow redirects manually, keep cookies, read `csrftoken`) → POST the login form → require `sessionid` → for each `stations[].sensor_id`: POST `/en/sensor/{id}/download-data/` with the start/end in the **portal timezone** → parse the PM10 CSV |

Every config for the provider is pulled, **including `active = false`** — same as Netlify, so readings are already collected when a project's page is switched on. `requests.Session` handles the cookies. Python Runner blocks `os` and `psycopg2` at import time, so validate the script locally before pasting it into the Script Editor.

### 5.3 Output rows and writes

| Domain | Fields written | Natural key |
|---|---|---|
| `jfb_water_quality_readings` | `project_id, location_id, role, parameter, unit, value, reading_at, source, fetched_at` | `project_id + location_id + parameter + reading_at` |
| `jfb_air_quality_readings` | `project_id, sensor_id, station_key, parameter ('pm10'), unit ('ug/m3'), value, reading_at, source ('ecomzen'), fetched_at` | `project_id + sensor_id + parameter + reading_at` |

Each run (`pull` over the last 48 h, `backfill` over its date range) de-duplicates the fetched batch, reads what is already stored for the window, then:

| Re-fetched reading | Non-native (Supabase upsert) | Native (`r6`) |
|---|---|---|
| Not stored yet | Inserted | **Inserted** (`core-data-write` bundle) |
| Stored; `value`, `unit`, `role`/`station_key` or `source` changed | Overwritten | **Updated** by `core_record_id`, with a fresh `fetched_at` |
| Stored and identical | Row rewritten (only `fetched_at` changes) | Left alone |

The one deliberate difference is `fetched_at` on identical readings. The readings domains keep version history, so rewriting the timestamp every hour would add ~16,000 air-reading versions an hour (48 per reading) with no data change. No report reads `fetched_at`. Pivotly's `upsert` operation was considered: it keys on `source_record_ref`, which rows already loaded without one wouldn't match, and it would still version every row for the new `fetched_at`.

`backfill` is only needed to load history or to recover from an outage longer than 48 hours; on a fresh deploy with no data the first hourly `pull` fills the last 48 h and every run after keeps it current.

### 5.4 Output

A per-project summary like the Netlify functions: `{ "<project_id>": <rows inserted + updated> }`, with `-1` for a failed project (the others still run), plus `script_version`, `mode` and the window. Per project, `details` carries `fetched`, `new`, `changed`, `written` (inserted), `updated` and per-series counts. The workflow run log keeps it in `wfl_run_steps_b`.

On a healthy hourly run: `new` ≈ one hour of readings (12 Torch water, 24 Penobscot water, up to 300 Torch air), `updated` normally 0.

---

## 6. Data changes (local Pivotly)

| # | Change | Status |
|---|---|---|
| DA1 | Penobscot `jfb_water_monitoring_config` copied from Supabase (provider `wqdatalive`, America/New_York, 00:00–23:00, 60-minute slots, upstream/downstream with device IDs and `depth_ft: 3`, thresholds `{compliance_delta_ntu: 35, early_warning_delta_ntu: 20}`, mode `compliance`, `compliance_started_at = 2026-08-20T22:48:03Z`, active) | ✅ Loaded |
| DA2 | Backfill readings 2026-09-14 → now | ➖ Optional; skip on a fresh deploy |
| DA3 | Penobscot `jfb_water_monitoring_notes.reference_ntu` from Supabase | ✅ Loaded |

**Known sensor gaps, not our bugs:** the Penobscot buoys have sent nothing since **2026-09-14 17:50 UTC**, and Torch Lake NE Beach (sensor 16804) nothing since **2026-09-24**. A `0` for those in the summary is correct.

---

## 7. Work plan

| Phase | Work | Status |
|---|---|---|
| 0 | Publish D1; create secrets K1–K5 and allow-list K6 | D1 ✅; secrets ☐ You |
| 1 | Script S1: HydroVu; `self_check` and `dry_run` against local Pivotly | ✅ |
| 2 | Add ECOMZEN and WQData LIVE to S1 | ✅ |
| 3 | Workflows W1–W3 (hourly) in the Portal | ☐ You |
| 4 | Data: DA1, DA3 (DA2 optional) | ✅ |
| 5 | Native app: tidal water mode for Penobscot (tab, chart, NOAA tide, toggle, reference NTU, PDF page R1) | ✅ |
| 5b | Parity pass: fixed-site PDF, table paging, window-end readings, PDF failure isolation, pull script write rule (§11) | ✅ |
| 6 | Test (§8) | Partly — T3′, T5–T8 after deploy |
| 7 | Cutover (§9) | — |

---

## 8. Testing

| # | Test | Pass if | Status |
|---|---|---|---|
| T1 | `self_check` for each provider | Secrets readable, configs found, no network calls | ✅ (`r2`) |
| T2 | `dry_run`, 6 h, each provider | Row counts per station match the Netlify vendor clients | ✅ (`r2`) |
| T3′ | `pull` twice in a row on `r6` | Second run: `new` 0 and `updated` 0 (apart from readings that arrived between runs) | ☐ |
| T4 | Backfill a day already in Supabase (e.g. 2026-09-24) | Per station, count and values match Supabase | ✅ (`r2`) |
| T5 | Workflows W1–W3 | A run appears each hour; `wfl_run_steps_b` shows the summary; a bad password shows `-1` for that project only | ☐ |
| T6 | Native Torch Lake report: Water and Air tabs | Today's 15-minute slots and charts fill in, matching non-native for the same day | ☐ |
| T7 | Native PDF | Water ("Daily Turbidity Reporting") and Air pages match T6; thresholds footnote under the chart; aerial beside it | ☐ |
| T8 | Penobscot Water tab + PDF | Hourly averages, tide, mode toggle and limit lines match non-native | ✅ builder parity (46/46 offline); ☐ in-app |

---

## 9. Cutover

1. Run Pivotly's hourly pulls **alongside** Netlify. They write to different databases, so they can't conflict.
2. Compare a few days (T4 for new dates).
3. When the native app goes live for JFB, turn off the three Netlify schedules. Keep `netlify/lib/*` for reference.

---

## 10. Risks and open questions

| # | Item | Plan |
|---|---|---|
| Q1 | Who creates and approves the Pivotly secrets? | Needs a Pivotly admin. Values come from the Netlify site settings. |
| Q2 | ECOMZEN is screen-scraping (login form + CSV), not an API | Any portal change breaks it, as it would in non-native. The script reports `-1` with the error text. |
| Q3 | Pivotly schedule-trigger config and Script-step parameter passing | Confirm in the Portal during Phase 3 (not yet verified) |
| Q4 | Cost of the 48 h window read | Each ECOMZEN run reads ~14,400 stored rows (15 pages of 1,000) to compare against. Measure on the first scheduled runs; lower `window_hours` if needed. |
| Q5 | WQData LIVE key is per project | Store one secret per project if a second WQData project is added (the original notes the same limit) |
| Q6 | NOAA tide station is fixed to Bangor 8414612 | Same as non-native. A second tidal site would need the station on its config. |

---

## 11. Feature parity (non-native vs native)

State after the 2026-09-29 changes. ⚠️ = still open, ➖ = different on purpose.

| # | Feature | Non-native (Supabase/Netlify) | Native (Pivotly) | Status |
|---|---|---|---|---|
| **Data collection** |||||
| 1 | HydroVu water pull (Torch Lake) | Netlify function, hourly at :17 | `jfb_monitoring_pull.py` (`provider=hydrovu`) | ⚠️ Script written; schedule not set up |
| 2 | WQData LIVE water pull (Penobscot) | Netlify function, hourly at :47; turbidity + conductivity | Same script (`provider=wqdatalive`); turbidity + conductivity | ⚠️ Script written; schedule not set up |
| 3 | ECOMZEN air pull (Torch Lake PM10) | Netlify function, hourly at :37 | Same script (`provider=ecomzen`) | ⚠️ Script written; schedule not set up |
| 4 | Pull window | Last 48 h every run | Last 48 h every run (1–72 h), plus a `backfill` mode | ✅ |
| 5 | Writing re-fetched readings | Upsert on the natural key: insert new, overwrite existing | Insert new, update changed (`value`, `unit`, `role`/`station_key`, `source`), skip identical | ✅ |
| 6 | `fetched_at` on identical readings | Rewritten every run | Kept from the first pull | ➖ Avoids a new version every hour; no report reads it |
| 7 | Keeps pulling while `active = false` | Yes | Yes | ✅ |
| 8 | Historical backfill | `hydrovu-backfill.mjs`, `ecomzen-backfill.mjs` | `mode=backfill` with `start_date`/`end_date` | ✅ Not needed on a fresh deploy |
| **Configuration** |||||
| 9 | Water config fields | `compliance_started_at`, `mode`, `active` (code also reads `tide_offset_minutes`; no such column in production) | Same; `tide_offset_minutes` treated as 0 | ➖ Not needed |
| 10 | Daily notes + `reference_ntu` | `water_monitoring_notes` | `jfb_water_monitoring_notes` | ✅ |
| 11 | Air daily activity + notes | `air_monitoring_daily` | `jfb_air_monitoring_daily` | ✅ |
| 12 | Tabs only show when config exists | Yes | No: both tabs always shown; "No … monitoring configured" when there's no config | ➖ By choice |
| 13 | `active = false` hides the Water tab | Yes | No: tab still shown | ➖ By choice |
| 14 | `active = false` hides the water PDF page | Yes | Yes | ✅ |
| 15 | PE can toggle mode, edit coordinates, upload aerial, enter reference | Yes (RLS member update) | Yes (engineers: read + update on `monitoring_config`; full on notes) | ✅ |
| **Water tab: fixed station (HydroVu)** |||||
| 16 | 15-min slots (Background / Early Warning / Compliance / Δ) | Yes | Yes | ✅ |
| 17 | Average difference card | Yes | Yes | ✅ |
| 18 | Turbidity chart (50 NTU line or BG + delta, 1.5× BG) | 1560×560 | Same logic, 1000×420 | ✅ (smaller image on the tab) |
| 19 | Readings table | All rows in a scroll box | 50 rows at a time in a scroll box, "Load more" | ✅ (a full Torch day is 49 rows) |
| 20 | "No readings yet" banner | Yes | Yes | ✅ |
| 21 | Upload / replace aerial image | Supabase Storage URL | Pivotly attachment (also accepts a URL) | ✅ |
| 22 | Edit monitor coordinates | Yes | Yes | ✅ |
| 23 | Monitor depth (`depth_ft`) | Shown | Shown | ✅ |
| 24 | Notes (debounced, saved on blur) | Yes | Yes | ✅ |
| 25 | Thresholds card | Yes | Yes | ✅ |
| **Water tab: tidal (Penobscot)** |||||
| 26 | Hourly-averaged upstream/downstream buoys | `buildTidalTurbidityDay` | `buildTidalTurbidityDay` | ✅ Identical output on 23 real days |
| 27 | Conductivity columns | Yes | Yes | ✅ |
| 28 | NOAA tide curve + tide column | Bangor 8414612 | Bangor 8414612 | ✅ |
| 29 | Tide event (high/low) table | Yes | Yes | ✅ |
| 30 | Background ↔ Compliance toggle (stamps `compliance_started_at`) | Yes | Yes, with a confirm dialog | ✅ |
| 31 | Daily reference NTU input | Yes | Yes | ✅ |
| 32 | Flat limit lines (ref + 20 / ref + 35) | Yes | Yes | ✅ |
| 33 | Exceedance rows, red dots, count | Yes | Yes | ✅ |
| 34 | Tidal two-axis chart | `renderTidalTurbidityChart` | Same, 1580×640 | ✅ |
| 35 | Provider label on the tab | HydroVu or WQData LIVE | HydroVu or WQData LIVE | ✅ |
| **Air tab** |||||
| 36 | 15-min average per station (µg → mg/m³) | Yes | Yes | ✅ |
| 37 | Alert/Action = offset + lowest beach station | Yes | Yes | ✅ |
| 38 | LLRA + MBP charts | 900×1150 | Same logic, 620×640 | ✅ (smaller image on the tab) |
| 39 | Project activity + notes inputs | Yes | Yes | ✅ |
| 40 | Aerial image | Shown (no upload) | Shown (URL or attachment, no upload) | ✅ |
| 41 | Readings table | All rows in a scroll box | 50 rows at a time in a scroll box, "Load more" | ✅ (a full Torch day is 49 rows) |
| **PDF: water page** |||||
| 42 | Fixed-station page (table, coordinates, notes, avg Δ, chart, aerial) | Yes | Yes | ✅ |
| 43 | Page title | "Daily Turbidity Reporting" | "Daily Turbidity Reporting" | ✅ |
| 44 | Coordinates block | "Monitor Coordinates (X,Y)"; "{Label} Monitor: X, Y · Depth: N FT" | Same | ✅ |
| 45 | Notes block | Always shown; "—" when empty | Same | ✅ |
| 46 | Average difference wording | "Average Difference Between Background NTUs vs Compliance NTUs" + positive/negative footnote | Same | ✅ |
| 47 | Aerial placement | Bottom row, beside the chart | Same | ✅ |
| 48 | Number format (fixed site) | 1 decimal | 1 decimal | ✅ |
| 49 | Limits (fixed site) | Footnote under the chart | Footnote under the chart | ✅ |
| 50 | Tidal page (buoys, conductivity, tide, hi/lo table, limits, exceedances, chart footnote) | Yes | Yes; limits and exceedances in compliance mode only | ✅ |
| 51 | Water page skipped on days with no readings | Yes | Yes | ✅ |
| 52 | Reading at exactly the window end included | Yes | Yes | ✅ |
| **PDF: air page** |||||
| 53 | Equipment / Calibration / Notes blocks + activity line | Yes | Yes | ✅ |
| 54 | Aerial + LLRA/MBP charts (900×1150) | Yes | Yes | ✅ |
| 55 | Air page skipped on days with no readings | Yes | Yes | ✅ |
| 56 | Reading at exactly the window end included | Yes | Yes | ✅ |
| **PDF: both pages** |||||
| 57 | A failed water/air data load drops only that page | Yes | Yes | ✅ |
| 58 | Page footer line | None | "J.F. Brennan Company, Inc. — Environmental Group — {date} — Water/Air Monitoring", like every native page | ➖ Native report convention |

### Files changed for §11

| File | Change |
|---|---|
| `src/lib/waterQuality/noaaTide.js` | New: NOAA tide predictions + high/low events |
| `src/lib/waterQuality/data.js` | `isTidalConfig`, `buildTidalTurbidityDay`, `tidalLimits` |
| `src/lib/waterQuality/chart.js` | `renderTidalTurbidityChart` |
| `src/pages/FieldOps/reportEditorTabs/WaterQualityTab.jsx` | Tidal branch, mode toggle, reference NTU, tide table, provider label, depth, 50-row paging |
| `src/pages/FieldOps/reportEditorTabs/AirQualityTab.jsx` | 50-row paging |
| `src/pages/FieldOps/lib/reportPdfData.js` | Tidal branch, `active = false` skip, window-end readings (water + air), 1-decimal fixed-site values, fixed-site footnote, bottom row |
| `src/pages/FieldOps/ReportEditorPage.jsx` | Water/air PDF data failures drop only their page |
| `pivotly/reports/rpt-jfb-daily-report.json` | Water page template + CSS (R1) |
| `pivotly/scripts/jfb_monitoring_pull.py` | `r6`: 48 h default, insert-missing + update-changed, pulls inactive configs, full error text with only secrets redacted |
