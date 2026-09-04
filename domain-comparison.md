# Domain JSON vs. Reference ERD Comparison

Comparing the schema mockup images (reference ERD for the original app) against the actual
`domain/*.json` files in `jfb-fieldops-daily-native-app`.

## Key findings

1. **`daily_activities` is missing two pictured fields.** The ERD shows `category_id` (picklist)
   and `notes` (text) on `daily_activities`; neither exists in `jfb_daily_activities.json`. There's
   also no picklist file for a "category" list under `picklist/` (only `pkl-jfb-work-type.json` and
   `pkl-jfb-primary-measure.json` exist), so this isn't just an unresolved FK — the field is absent
   entirely.
2. **`projects.area_lvl1_label` / `area_lvl2_label` / `area_lvl3_label` were normalized away.** The
   ERD has three flat label columns on `projects`; the domain instead models this via the separate
   `jfb_project_area_levels` domain (`project_id`, `depth`, `label`, `sort_order`), which supports
   unbounded depth rather than a hardcoded 3 levels. This looks like an intentional redesign, not a gap.
3. **`report_photos` gained two fields not in the ERD:** `report_id` (required FK to `jfb_reports`,
   tying a photo to one of a report's 2 photo slots) and `pm_comment` (PM rejection reason). The
   pictured `photos` table only links to `project_id`. This is new functionality beyond the original
   mockup.
4. **`production_stats` drops the pictured `report_date` field in favor of `report_id`.** The ERD
   shows a denormalized `report_date` column; the domain instead has a required `report_id` FK to
   `jfb_reports` with the note "Project scope is inherited through the report" — date comes from the
   related report, not stored redundantly.
5. **Inconsistent linkage pattern across the three "hydraulic-ish" tables.** `production_stats` links
   to a report via `report_id`. `hydraulic_flow_stats` and `hydraulic_pipe_configurations` instead use
   `project_id` + `log_date` (no `report_id` at all), even though the ERD's own note for pipe configs
   says they're "keyed to the report." Functionally equivalent (given `reports` is unique on
   `project_id` + `report_date`), but worth confirming intentional rather than drift.
6. **Picklist FKs aren't wired up yet.** `work_type`, `primary_measure`, and `site_state` on
   `jfb_projects` are plain `text` in the schema with no `fk_config` to a picklist domain, even though
   picklist files exist for `work-type` and `primary-measure` (none for `site_state`). Matches the
   known gap that foundation/picklist domains aren't fully linked in yet.
7. **Minor internal naming inconsistency in `jfb_project_areas`:** the square-footage goal field has
   `name: "area_goal_sf"` / `column_name: "area_goal_sf"` but `slug: "volume_goal_sf"` and
   `label: "Volume Goal Sf"` — the ERD uses the slug/label form (`volume_goal_sf`). Cosmetic, but the
   `name`/`column_name` disagree with `slug`/`label` inside the same file.
8. **Typo in `jfb_report_photos.domain_name_singular`:** `"jfb_repoert_photo"` (should be
   `jfb_report_photo`).
9. **PK naming is a mockup convention, not a real discrepancy.** The ERD labels each table's own
   primary key with a friendly name (`project_id`, `report_id`, `production_stat_id`, `segment_id`).
   In the actual domain JSON the owning table's PK is just the platform's generic `id` — other domains'
   FK columns are the ones named `project_id`/`report_id`/etc., pointing at `target_attr: "id"`. This
   matches the existing `jfb domain FK/id convention` and isn't a bug.

---

## Table-by-table detail

### projects

| Field (ERD) | ERD type | In `jfb_projects.json`? | Notes |
|---|---|---|---|
| project_id (PK) | uuid | — (implicit `id`, see finding 9) | naming convention only |
| name | text | ✅ text | |
| is_active | boolean | ✅ boolean | |
| client_name | text | ✅ text | |
| project_code | int | ✅ integer | |
| work_type | picklist | ⚠️ plain text | no `fk_config` to picklist domain yet |
| start_date | date_time | ✅ timestamp with time zone | |
| end_date | date | ✅ date | |
| volume_goal | decimal | ✅ numeric | |
| primary_measure | picklist | ⚠️ plain text | no `fk_config` to picklist domain yet |
| site_city | text | ✅ text | |
| site_state | picklist ("may change") | ⚠️ plain text | no picklist file exists for this either |
| area_lvl1_label | text | ❌ missing | replaced by `jfb_project_area_levels` (finding 2) |
| area_lvl2_label | text | ❌ missing | replaced by `jfb_project_area_levels` (finding 2) |
| area_lvl3_label | text | ❌ missing | replaced by `jfb_project_area_levels` (finding 2) |
| is_tsca_zone_tracking | boolean | ✅ boolean | |
| is_soil_type | boolean ("may change — appears unused") | ✅ boolean | present in schema, matches |
| is_pipe_tracking | boolean | ✅ boolean | |

### reports

| Field (ERD) | ERD type | In `jfb_reports.json`? | Notes |
|---|---|---|---|
| report_id (PK) | uuid | — (implicit `id`) | naming convention only |
| status | text | ✅ text | "draft, cqc_review, approved, or released" |
| *(not pictured)* | — | ✅ `project_id` (required FK → `jfb_projects`) | domain has more than the mockup shows |
| *(not pictured)* | — | ✅ `report_date` (required date) | "Combined with project_id, should be unique — one report per project per day" |

The ERD card for `reports` appears to be a partial/abbreviated view — the domain is richer than pictured, not narrower.

### operators

| Field (ERD) | ERD type | In `jfb_operators.json`? | Notes |
|---|---|---|---|
| email | text | ✅ text | |
| name | text | ✅ text | |
| favourite_activity_ids | text | ✅ text | |
| project_id | uuid, FK → projects | ✅ uuid, FK → jfb_projects | exact match |

### project_area_levels

| Field (ERD) | ERD type | In `jfb_project_area_levels.json`? | Notes |
|---|---|---|---|
| project_id (required) | uuid, FK → projects | ✅ required, FK → jfb_projects | |
| depth (required) | integer | ✅ required integer | "1-based nesting depth ... unbounded" |
| label (required) | text | ✅ required text | e.g. "Main Area", "Group", "CSC" |
| sort_order | integer | ✅ integer | |

Exact match, descriptions included.

### daily_activities

| Field (ERD) | ERD type | In `jfb_daily_activities.json`? | Notes |
|---|---|---|---|
| project_id | FK → projects | ✅ uuid FK | |
| equipment_id | FK → equipments | ✅ uuid FK | |
| operator_id | FK → operators | ✅ uuid FK | |
| start_date_time | date_time | ✅ timestamptz | |
| end_date_time | date_time | ✅ timestamptz | |
| timezone | text | ✅ text | |
| session_id ("not UUID — repeats across rows in same session") | text | ✅ text | matches |
| category_id | picklist | ❌ missing | **no picklist file exists either — see finding 1** |
| notes | text | ❌ missing | **see finding 1** |

### equipments

| Field (ERD) | ERD type | In `jfb_equipments.json`? | Notes |
|---|---|---|---|
| name | text | ✅ text | |
| project_id | uuid, FK → projects | ✅ uuid FK | exact match |

### project_areas

| Field (ERD) | ERD type | In `jfb_project_areas.json`? | Notes |
|---|---|---|---|
| project_id (required) | FK → projects | ✅ required FK | |
| parent_id (nullable, self FK) | FK → project_areas | ✅ nullable, self FK | "null for top-level (depth 1) areas" |
| area_level_id (required) | FK → project_area_levels | ✅ required FK | |
| name (required) | text | ✅ required text | |
| sort_order | integer | ✅ integer | |
| is_active | boolean | ✅ boolean | |
| volume_goal_cy | numeric | ✅ numeric | |
| volume_goal_sf | numeric | ⚠️ numeric, but `name`/`column_name` are `area_goal_sf` while `slug`/`label` say `volume_goal_sf` | internal inconsistency, see finding 7 |
| notes | text | ✅ text | |

### production_stats (mechanical_dredging)

| Field (ERD) | ERD type | In `jfb_production_stats.json`? | Notes |
|---|---|---|---|
| production_stat_id (PK) | uuid | — (implicit `id`) | naming convention only |
| report_date | date_time | ❌ not stored directly | replaced by `report_id` FK, see finding 4 |
| *(implied by report_date)* | — | ✅ `report_id` (required FK → `jfb_reports`) | "Project scope is inherited through the report" |
| equipment_id | FK → equipments | ⚠️ present but optional (nullable, not required) | ERD doesn't mark it required either way |
| area_level_combinations | jsonb | ✅ jsonb | |
| pass_value | text | ✅ text | |
| tsca | boolean | ✅ boolean | |
| volume | double | ✅ numeric | |
| area | double | ✅ numeric | |
| notes | text | ✅ text | |

ERD notes mention a `UNIQUE(report_date_id, equipment, area_l1, area_l2, area_l3, pass_number, tsca)` constraint and dynamic recalculation of an "avg face ft" column — neither is representable in this schema format, so can't be verified from the JSON alone.

### hydraulic_flow_stats

| Field (ERD) | ERD type | In `jfb_hydraulic_flow_stats.json`? | Notes |
|---|---|---|---|
| project_id | FK → projects | ✅ required FK | |
| equipment_id | FK → equipments | ✅ required FK | |
| log_date | date_time | ✅ required timestamptz | |
| pipe_dia_inches | double | ✅ numeric | |
| avg_line_velocity | double | ✅ numeric | description confirms "everything else derives" from this + diameter |
| avg_flow_rate | double | ✅ numeric | description confirms interchangeability with velocity |

Exact match, including the "only 2 numbers actually need storing" intent from the ERD note.

### hydraulic_pipe_configurations

| Field (ERD) | ERD type | In `jfb_hydraulic_pipe_configurations.json`? | Notes |
|---|---|---|---|
| segment_id (PK) | uuid | — (implicit `id`) | naming convention only |
| project_id | FK → projects | ✅ required FK | |
| log_date | date_time | ✅ required timestamptz | |
| segment_name | text | ✅ required text | e.g. "Dredge -> Booster 1" |
| length_ft | double | ✅ numeric | |

Field-for-field match. Note: linked to project + date rather than a `report_id`, see finding 5.

### photos → jfb_report_photos

| Field (ERD) | ERD type | In `jfb_report_photos.json`? | Notes |
|---|---|---|---|
| photo_number | integer | ✅ integer | |
| photo_file_path | text | ✅ text | "should reside in Pivotly's file storage" |
| label | text | ✅ text | caption |
| uploaded_by | uuid, FK → Pivotly user | ✅ uuid, no `fk_config` | matches note: "no local jfb_ domain representing platform users" |
| uploaded_date_time | date_time | ✅ timestamptz | |
| project_id | uuid, FK → projects | ✅ required FK | |
| *(not pictured)* | — | ✅ `report_id` (required FK → `jfb_reports`) | new — ties photo to one of the report's 2 slots, see finding 3 |
| *(not pictured)* | — | ✅ `pm_comment` (text) | new — PM rejection reason, see finding 3 |

Also: `domain_name_singular` is misspelled `"jfb_repoert_photo"` (finding 8).
