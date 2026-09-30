# Air & Water Quality pull: dev.pivotly.com setup and test guide

How the hourly air and water quality pull was set up on **dev.pivotly.com**, what state dev is in now, and how to test that it behaves like the non-native (Netlify) app.

| Script | File | Version | Slug on dev |
|---|---|---|---|
| Monitoring pull | `pivotly/scripts/jfb_monitoring_pull.py` | `v1-jfb-monitoring-pull-r6` | `scr_jfb_monitoring_pull` |
| Dev test seed | `pivotly/scripts/jfb_monitoring_test_seed.py` | `v1-jfb-monitoring-test-seed-r2` | `scr_jfb_monitoring_test_seed` |
| Report bootstrap | `pivotly/scripts/jfb_report_bootstrap.py` | `v1-jfb-report-sync-3-r2` | `scr_jfb_report_bootstrap` |

Background and design: [air-water-quality-pivotly-port-plan.md](air-water-quality-pivotly-port-plan.md).

**No credential values are written in this file.**

Last updated 2026-09-28.

---

## Where dev stands (2026-09-28)

| # | Step | Status |
|---|---|---|
| 1 | 7 Secret Variables | ✅ Done |
| 2 | Allowed Secrets for every script that runs on dev | ✅ Done (see §2) |
| 3 | Picklist, domain and data view bootstraps re-run with the new secrets | ✅ Done: 6 picklists, 58 domains, 23 data views, all published |
| 4 | Monitoring pull script created, parameters added | ✅ Done |
| 5 | Test projects, monitoring configs and draft reports seeded | ✅ Done (10 rows, §5) |
| 6 | `self_check`, `dry_run` and `pull` for all 3 providers | ✅ Done (results in §6) |
| 7 | Script published | ✅ Done |
| 8 | 3 hourly schedules | ⚠️ Created, but **5 exist: delete 2 extras** (§8) |
| 9 | Backfill | ⏭️ Skipped on purpose: native reporting starts in October |
| 10 | Parity check against the non-native app | ☐ To do (§10) |

## How projects are chosen (both apps)

Neither app detects projects automatically. Each has a **config table**, and a project is pulled only if it has a row there:

| | Non-native (Netlify + Supabase) | Native (Pivotly) |
|---|---|---|
| Water config | `water_monitoring_config` | `jfb_water_monitoring_config` |
| Air config | `air_monitoring_config` | `jfb_air_monitoring_config` |
| Hourly job | `netlify/functions/pull-water-quality.mts`, `pull-air-quality.mts`, `pull-wqdatalive.mts` | `scr_jfb_monitoring_pull`, one schedule per provider |
| Picks rows by | `provider = 'hydrovu'` / `'ecomzen'` / `'wqdatalive'` | the same |

Each row holds the `project_id`, the sensor list (`locations` / `stations`), time zone, reporting window and thresholds. Readings are saved under that `project_id`. In the non-native app, Dustin added these rows by hand with the SQL files in `jfb-fieldops-daily/sql/`.

## Direct links (dev)

| Page | URL |
|---|---|
| Variables | `https://dev.pivotly.com/vm/portal/variables?tab=variables` |
| Allowed Secrets | `https://dev.pivotly.com/vm/portal/variables?tab=allowed_secrets` |
| Scripts | `https://dev.pivotly.com/vm/portal/configurations/script` |

Sidebar: **Admin ›** → **Variables**.

---

## 1. Secret variables (7)

Variables tab → **Add New Variable**. All are **Type = Secret**, **Scope = Global**.

| Slug | Value comes from |
|---|---|
| `jfb-hydrovu-client-id` | `HYDROVU_CLIENT_ID` in `jfb/jfb-fieldops-daily/.env` |
| `jfb-hydrovu-client-secret` | `HYDROVU_CLIENT_SECRET` in the same `.env` |
| `jfb-wqdatalive-api-key` | `WQDATALIVE_API_KEY` |
| `jfb-ecomzen-username` | `ECOMZEN_USERNAME` |
| `jfb-ecomzen-password` | `ECOMZEN_PASSWORD` |
| `jfb-pivotly-api-client-id` | The Azure app registration the JFB scripts authenticate with |
| `jfb-pivotly-api-client-secret` | Same app registration's client secret |

- Paste only the value: no quotes, no spaces.
- A saved Secret can't be viewed again. If one is wrong, delete it and re-create it.
- The scripts in `jfb-fieldops-daily-native-app/pivotly/scripts/` no longer contain the Azure credentials, so they can't be copied from there any more. For a new environment, take them from the Azure app registration.

---

## 2. Allowed secrets

Allowed Secrets tab → **Add New Allowed Secret**. **Every script needs its own rows.** The Runner checks the grant against the **running script's own slug**, so rows for one script don't help another.

| Consumer Slug (Consumer Type = Script) | Variable Slugs | Rows |
|---|---|---|
| `scr_jfb_monitoring_pull` | `jfb-pivotly-api-client-id`, `jfb-pivotly-api-client-secret`, `jfb-hydrovu-client-id`, `jfb-hydrovu-client-secret`, `jfb-wqdatalive-api-key`, `jfb-ecomzen-username`, `jfb-ecomzen-password` | 7 |
| `scr_jfb_monitoring_test_seed` | `jfb-pivotly-api-client-id`, `jfb-pivotly-api-client-secret` | 2 |
| `scr_jfb_report_bootstrap` | the same 2 | 2 |
| `scr_jfb_picklist_bootstrap` | the same 2 | 2 |
| `scr_jfb_domain_bootstrap` | the same 2 | 2 |
| `scr_jfb_dataview_bootstrap` | the same 2 | 2 |
| `scr_jfb_reference_data_seed` | the same 2 (add before its next run) | 2 |
| `scr_jfb_roles_seed_local` | the same 2 (add before its next run) | 2 |

**Always copy the Consumer Slug from the Scripts list's Slug column**, and never type it from memory:
- Dev's slugs all start with **`scr_`**. The domain bootstrap failed because its rows said **`src_`**.
- A script's slug can differ from its name, e.g. `jfb_roles_seed_local` → `scr_jfb_roles_seed_local`.

Approve/Reject are disabled in the Portal, and dev rows save as **approved**.

---

## 3. Script parameters

Scripts are created in Automation → **Scripts** by pasting the whole `.py` file.

**Every parameter the script declares must be supplied.** Parameters are set in the Script Editor under **Add Param Inputs** → **JSON** tab, or with **Paste from AI…**. Leaving them off makes every value fall back to its default, and the output shows `"param_inputs not available. Ensure job parameters include 'param_inputs' array."`. The `data_type` must match the script exactly: here everything is `text` except the seed's `dry_run`, which is `boolean`.

### Monitoring pull (7 parameters, all `text`)

| Name | Values | Default | Meaning |
|---|---|---|---|
| `mode` | `self_check`, `dry_run`, `pull`, `backfill` | `self_check` | `self_check` = secrets + configs only; `dry_run` = fetch and count, **no writes**; `pull` = hourly insert; `backfill` = fill a date range |
| `provider` | `hydrovu`, `ecomzen`, `wqdatalive` | required | Which vendor to pull |
| `window_hours` | 1–72 | `48` | Trailing window for `pull` / `dry_run`. 48 matches the Netlify functions; each run inserts missing readings and updates changed ones in that window. |
| `start_date` / `end_date` | `YYYY-MM-DD` | blank | `backfill` only (`end_date` blank = now) |
| `project_code` | e.g. `152601` | blank = all | Limit to one project |
| `param_contract_version` | `jfb_monitoring_pull_params_v1` | | Leave as is |

```json
{
  "schema_version": "1.0",
  "script_slug": "scr_jfb_monitoring_pull",
  "param_inputs": [
    {"name": "mode", "data_type": "text", "value": "self_check", "allowed_values": ["self_check", "dry_run", "pull", "backfill"]},
    {"name": "provider", "data_type": "text", "value": "hydrovu", "allowed_values": ["hydrovu", "wqdatalive", "ecomzen"]},
    {"name": "window_hours", "data_type": "text", "value": "48"},
    {"name": "start_date", "data_type": "text", "value": ""},
    {"name": "end_date", "data_type": "text", "value": ""},
    {"name": "project_code", "data_type": "text", "value": ""},
    {"name": "param_contract_version", "data_type": "text", "value": "jfb_monitoring_pull_params_v1"}
  ]
}
```

### Runner import restriction

The Runner checks imports **before running**, so a `try/except` around a forbidden import doesn't help. Revision r1 of the pull script was rejected with **`Import not allowed: zoneinfo`**. Since r2 it converts ECOMZEN's local portal time with its own US daylight-saving rules (`utc_offset_hours`). It supports New York, Detroit, Indianapolis, Chicago, Denver, Phoenix, Los Angeles, Anchorage, Honolulu and UTC. Any other `timezone` in an air config stops the ECOMZEN pull with "Unsupported timezone". It was checked against `zoneinfo` every 30 minutes for 2024–2027 with 0 mismatches.

To validate a script locally before pasting it, run `Python_Runner_Independent/src/executor/validator.py` against it with `requests` allowed.

---

## 4. Error messages and what they really mean

| Output shows | Real cause on dev | Fix |
|---|---|---|
| `secret_not_found` / "not found or API error occurred" | **Usually a missing or mismatched Allowed Secrets row**, not a missing variable. Dev reports every refusal this way, so the script's hint "slug does not exist" is misleading. | Check §2 for that exact script slug. If the rows are right, check the variable's slug in §1 |
| Only one secret fails, the others read fine | That one secret's Allowed Secrets row is missing (happened with `jfb-hydrovu-client-secret`) | Add the single row |
| `param_inputs not available` on every parameter | The script was run without parameters | §3 |
| `provider must be one of …` | `provider` blank, usually for the same reason | §3 |
| `Import not allowed: <module>` | Runner import sandbox | §3 |
| `pivotly_api.stage = "token_post"` | Azure rejected the client ID/secret | Re-enter the `jfb-pivotly-api-*` values |
| `"config_count": 0` | No config row for that provider on dev | §5 |
| `summary.<project_id> = -1` | That project's pull failed; others still ran | See `details.<project_id>.error` |

---

## 5. Test data seed (`scr_jfb_monitoring_test_seed`)

Dev started with **no projects at all**, so the pull had nothing to write to. `jfb_monitoring_test_seed.py` creates the minimum needed to test the Water and Air tabs:

| Domain | Rows |
|---|---|
| `jfb_projects` | Torch Lake - LLRA (152601), Penobscot Thin Layer Cap Pilot (152505) |
| `jfb_water_monitoring_config` | 152601 **hydrovu** (3 sensors, 06:00–18:00, 15 min); 152505 **wqdatalive** (2 buoys, 00:00–23:00, 60 min, compliance since 2026-08-20T22:48:03Z) |
| `jfb_air_monitoring_config` | 152601 **ecomzen** (5 PM10 stations, Alert/Action 0.10 / 0.15 mg/m³) |
| `jfb_reports` | Draft: Torch 2026-09-20, 09-21, 09-27; Penobscot 2026-09-13, 09-14 |

- **Where the values came from:** Dustin's SQL in `jfb-fieldops-daily/sql/`, with each later update applied in order:
  - Torch: `2026-07-15_water_monitoring.sql` and `2026-07-15_air_monitoring.sql`
  - Penobscot: `2026-08-06_penobscot_wqdatalive.sql`, `_wq_depth.sql` and `_wq_golive.sql`
  - Torch time zone and location: `2026-08-19_torch_lake_timezone.sql` and `2026-06-10_torch_lake_pre_cutover_setup.sql`
- **IDs are never typed.** The script creates the projects, looks them up by `project_code`, and uses their IDs for the configs and reports. Pivotly generates every row ID itself.
- **It's safe to re-run.** Existing rows are skipped and listed under `already_present`.
- **What's missing:**
  - **No aerial images.** The native app stores these as uploaded files, so the Water tab shows "No aerial site map uploaded yet".
  - **Torch's `work_type` is Mechanical Dredging**, its late-August phase. It doesn't affect monitoring.

Parameters (`dry_run` is **boolean**):

```json
{
  "schema_version": "1.0",
  "script_slug": "scr_jfb_monitoring_test_seed",
  "param_inputs": [
    {"name": "mode", "data_type": "text", "value": "self_check", "allowed_values": ["self_check", "seed_only"]},
    {"name": "param_contract_version", "data_type": "text", "value": "jfb_monitoring_test_seed_params_v1"},
    {"name": "dry_run", "data_type": "boolean", "value": true},
    {"name": "output_shape", "data_type": "text", "value": "summary", "allowed_values": ["summary", "full"]}
  ]
}
```

Run order: `self_check` → `seed_only` + `dry_run=true` (expect "would create 10 row(s)") → `seed_only` + `dry_run=false`.

Result on dev, 2026-09-28: **10 rows created, 0 errors.**
- Torch Lake: `01a0e6dc-6f9b-7182-82ae-cc720adb3bd4`
- Penobscot: `01a0e6dc-6fef-76b8-8759-b834f395186c`

⚠️ **These are placeholder projects.** Before migrating real project data to dev, delete them or make the migration skip 152601 and 152505, or you'll have duplicates.

---

## 6. Manual test runs and results

Set the script's parameters, then **Test Run**.

| Run | Pass if | Dev result 2026-09-28 |
|---|---|---|
| `self_check`, each provider | `ok: true`, `pivotly_api.stage: ok`, every vendor secret `present`, `config_count: 1` | ✅ All 3 |
| `dry_run`, `hydrovu` | about 24 readings per sensor per 6 h, `written: 0` | ✅ 72 (3 × 24), 04:00–09:45 UTC |
| `pull`, `hydrovu` | `written` > 0 | ✅ 72 written |
| `pull`, `hydrovu` again | `new: 0`, `written: 0` (no duplicates) | ✅ fetched 69, new 0, written 0 |
| `dry_run`, `ecomzen` | about 300–360 per station per 6 h, 4 stations | ✅ 1,369 from 4 stations |
| `pull`, `ecomzen` | `written` > 0 | ✅ 1,369 written |
| `dry_run`, `wqdatalive` | `ok: true`, `fetched: 0` | ✅ 0, which is correct: the buoys have sent nothing since 2026-09-14 17:50 UTC |

- **NE Beach (air sensor 16804) has been offline since 2026-09-24**, so it's absent from ECOMZEN results. This is correct.
- **SPA South Fence often has fewer readings** than the others. That's a gap in the sensor's own data.
- **How duplicates are avoided:** `pull` inserts only readings newer than the latest one stored for each sensor. Older gaps are filled only by `backfill`, which skips readings it already has.

---

## 7. Publish

Publish the script from the Script Editor **before** adding schedules. Schedules on an unpublished script turn themselves off after their first run.

---

## 8. Hourly schedules

**One script, three schedules.** A run pulls one provider, so each provider needs its own schedule, just as the non-native app has three Netlify functions.

Script Editor → **Schedule** → **Add Schedule** tab:

1. **Schedule Preset:** Custom.
2. **Cron Expression:** from the table below.
3. **Timezone:** leave it on **Asia/Manila**.
   - UTC isn't in the dropdown, because the list comes from the browser and most browsers leave plain "UTC" out.
   - It doesn't matter here: the crons fix only the minute, and Manila is a whole-hour offset with no daylight saving. `Africa/Abidjan` is UTC+0 if you'd rather.
4. **Enable schedule immediately:** on. **Max Retries:** `0`.
5. **Runtime Parameters** → **PASTE FROM AI…** → paste the schedule's JSON → confirm the preview.
   - Alternatively, click **IMPORT SCRIPT DEFAULTS** and edit `mode` and `provider`.
6. **CREATE SCHEDULE.**

| Cron | Provider | Project |
|---|---|---|
| `17 * * * *` | `hydrovu` | Torch water |
| `37 * * * *` | `ecomzen` | Torch air |
| `47 * * * *` | `wqdatalive` | Penobscot water |

The schedule's Runtime Parameters are separate from the script's own parameters. The script's list is used only for manual Test Runs.

**:17, HydroVu**
```json
{"schema_version":"1.0","script_slug":"scr_jfb_monitoring_pull","param_inputs":[
{"name":"mode","data_type":"text","value":"pull"},
{"name":"provider","data_type":"text","value":"hydrovu"},
{"name":"window_hours","data_type":"text","value":"48"},
{"name":"start_date","data_type":"text","value":""},
{"name":"end_date","data_type":"text","value":""},
{"name":"project_code","data_type":"text","value":""},
{"name":"param_contract_version","data_type":"text","value":"jfb_monitoring_pull_params_v1"}]}
```

**:37, ECOMZEN:** the same JSON with `"provider"` = `"ecomzen"`.

**:47, WQData LIVE:** the same JSON with `"provider"` = `"wqdatalive"`.

### ⚠️ Clean-up needed on dev

5 schedules exist, but only 3 are wanted:

| Cron | Created (Manila) | Action |
|---|---|---|
| `47 * * * *` | 6:18:54 PM | Keep: check it's `pull` + `wqdatalive` |
| `7 * * * *` | 6:18:31 PM | **Delete** (typo) |
| `37 * * * *` | 6:18:01 PM | Keep: check it's `pull` + `ecomzen` |
| `17 * * * *` | 6:17:46 PM | Keep whichever `17` is `pull` + `hydrovu` |
| `17 * * * *` | 6:13:48 PM | **Delete** the other `17` |

Check each with **⋮ → Edit**. **Every kept schedule must have `mode = pull`.** A `dry_run` schedule runs every hour with `ok: true` but writes nothing, so it looks healthy while doing nothing.

---

## 9. Backfill (not needed now)

`pull` only looks back 6 hours, so dev has readings only from its first pull (2026-09-28, about 04:00 UTC) onward. **This is why the 9/27 report says "No readings pulled for this date yet".** Nothing is broken: that day was never pulled.

Native reporting starts in October, so a backfill isn't needed. If older days are ever wanted:

| `provider` | `mode` | `start_date` | `end_date` |
|---|---|---|---|
| `hydrovu` | `backfill` | first day wanted | blank = now |
| `ecomzen` | `backfill` | first day wanted | blank; slow at about 20k rows/day, so split long ranges |
| `wqdatalive` | `backfill` | `2026-09-13` | `2026-09-14` (the buoys' last data) |

`backfill` skips readings it already has, so overlapping or repeated runs are safe.

---

## 10. Testing procedure: does it match the non-native app?

Run this after the schedules have run for a few hours of **daytime Eastern** readings. 6 AM ET is 6 PM Manila, and the windows are 06:00–18:00 ET.

### A. The schedules fire

Script Editor → **Job History** → **Scheduled Jobs**. Every hour there should be:

| Minute | Output must show |
|---|---|
| :17 | `"mode": "pull"`, `"provider": "hydrovu"`, `"ok": true`, `written` > 0 on most runs |
| :37 | `"mode": "pull"`, `"provider": "ecomzen"`, `"ok": true`, `written` > 0 |
| :47 | `"mode": "pull"`, `"provider": "wqdatalive"`, `"ok": true`, `fetched: 0` (buoys offline) |

A schedule that shows as disabled after its first run means the script wasn't published (§7).

### B. The app shows the data

In the native app on dev, create a **Torch Lake 2026-09-28** report (or today's date).
- **Water Quality tab:** "N of 49 intervals reported · pulled automatically from HydroVu", NTU values in the 15-minute table, and the 3 monitor coordinates.
- **Air Quality tab:** "5 stations · SGS SmartSense", PM10 mg/m³ values for 4 stations, and NE Beach blank.
- The count rises through the day as each hourly pull runs.

### C. The values match the non-native app

Open the **same date** for Torch Lake in the non-native app, side by side:

| Compare | Expected |
|---|---|
| Water: NTU per slot (e.g. 9:00, 9:15, 9:30 AM) for Background, Early Warning, Compliance | Identical |
| Air: PM10 mg/m³ per slot and station | Identical; NE Beach blank in both |
| "N of 49 intervals reported" | Same, give or take one slot if one app pulled more recently |
| Downloaded PDF: Water and Air pages | Same numbers and exceedance flags |

Both apps pull from the same vendor accounts at the same minutes, so any difference is a bug. Note the slot, station and both values when reporting it. The local run on 2026-09-20 → 21 matched Supabase exactly (count, sum and checksum per series), so this is the same check on dev.

### D. Penobscot

The buoys have been offline since 2026-09-14, so neither app will show new data. Only confirm that the :47 job runs with `ok: true`.

---

## Earlier results (local Pivotly, 2026-09-28)

| Test | Result |
|---|---|
| `self_check` × 3 | ✅ |
| `dry_run` 6 h | ✅ Matches the Netlify vendor clients' counts |
| `pull` twice | ✅ Second run wrote 0 |
| Parity 2026-09-20 → 21 | ✅ All 3 water + 5 air series identical to Supabase |
| Backfill 2026-09-14 → now | ✅ Water +2,999, air +65,093; 0 duplicates |

---

## Other changes made alongside this

| Change | Where | Status on dev |
|---|---|---|
| Removed hard-coded Azure credentials; scripts read `jfb-pivotly-api-client-*` from the vault | `jfb_domain_bootstrap.py` (r4), `jfb_dataview_bootstrap.py` (r4), `jfb_picklist_bootstrap.py` (r2), `jfb_reference_data_seed.py` (r8), `jfb_roles_seed.py` (r3) | Picklist, domain and data view re-run ✅; seed scripts not yet re-run |
| `jfb_metrics.rollup_type` (sum / avg) + picklist `pkl-jfb-metric-rollup` | domain + picklist JSON and bootstraps | ✅ Published |
| `jfb_water_monitoring_config.compliance_started_at` | domain JSON + bootstrap | ✅ Published |
| `avg_nonzero` column on `dvw-jfb-metric-manual-totals-v2` | data view JSON + bootstrap | ✅ Published |
| ECOMZEN local-time conversion without `zoneinfo` | `jfb_monitoring_pull.py` r2 | ✅ Running |
| Dev test data seed | `jfb_monitoring_test_seed.py` r1 (new) | ✅ Run |

Dev bootstrap results: picklists 6/6, domains 58/58, data views 23/23, all saved and published with 0 errors.

## Open items

- ☐ Delete the 2 extra schedules (§8).
- ☐ Run the parity check (§10).
- ☐ Before the next run of `jfb_reference_data_seed` or `jfb_roles_seed_local`, paste the updated file and add its 2 Allowed Secrets rows (§2).
- ☐ **Rotate the Azure client secret.** It was hard-coded in the old scripts and shown in a chat session. Then update `jfb-pivotly-api-client-secret`; nothing else changes.
- ☐ `V3/jfb-fieldops-admin/pivotly/scripts/` still hard-codes the secret in its five copies (separate repo, left untouched on purpose).
- ☐ Before real data goes to dev, deal with the placeholder projects 152601 and 152505 (§5).
- ☐ Before the October go-live, decide whether production needs a backfill for days before its first pull.
