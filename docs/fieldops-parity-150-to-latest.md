# JFB Field Ops: non-native vs native parity

Comparison of every commit in `jfb-fieldops-daily` (the non-native Supabase app) from **#150 (2026-08-25)** through **`78f0985` (2026-09-22)** against `jfb-fieldops-daily-native-app` (Pivotly).

Checked on 2026-09-28 by reading both codebases, the local Supabase data (loaded from `data.sql`) and the local Pivotly data.

## Legend

| Status | Meaning |
|---|---|
| ✅ Same | Native behaves the same as non-native |
| ⚠️ Different | Native has the feature, but it behaves differently |
| ❌ Missing | Native does not have it |
| ➖ N/A | Tooling, tests or a one-off data fix. Nothing to port, or already reflected in Pivotly data |

## Summary: what needs work in native

| # | Area | Status | Impact |
|---|---|---|---|
| 1 | Weekly dredge charts: one chart per contract, split areas, zoomed "this week" pages (#151, #152, #153) | ✅ Fixed 2026-09-28 | `lib/dredge/weeklyChart.js` now matches non-native: a project with 2+ realized scopes (Kalamazoo) gets one chart per contract, and other projects get area windows plus zoomed "this week" pages. Checked headless on 4 Kalamazoo and 3 Fountain Lake weeks, each app fed its own database. Pages, titles, framing, ring sets, 2nd-pass rings and completed CSCs are identical. |
| 2 | Metric **average** roll-up and skipping zeros (4c62c8c) | ✅ Fixed 2026-09-28 | New `jfb_metrics.rollup_type` (Sum / Average) and an `avg_nonzero` data view column. Average metrics show the mean of non-zero days for Week and Total, on the Metrics tab and the PDF cover. Fountain Lake turbidity matches non-native on real data. |
| 3 | Placement chart: draw clipped edge cells with their real outline (#162) | ✅ Fixed 2026-09-28 | Native now draws each pre-clipped cell's real outline. On the Torch Lake grid, all 4,643 cell shapes match non-native, removing a 5,646 SF spill past the design edge. |
| 4 | Spreader chart header: only the subareas worked that day (#156) | ✅ Fixed 2026-09-28 | The header lists only subareas with coverage today, and falls back to all of them. |
| 5 | Placement warning for an unlayered day (#178) | ✅ Fixed 2026-09-28 | Pass-split projects (e.g. Torch Lake) get the red "today's coverage is not drawn" warning; other projects keep the amber note. |
| 6 | Placement chart in the PDF (#162–#177) | ➖ Different by design (kept) | Non-native re-renders the chart when the PDF is built, so a config change rewrites every past report (its own CLAUDE.md rule 3 flags this). Native embeds the chart saved and approved on the day, so released reports stay stable. **Native's behavior is kept on purpose.** |

All six are closed: five fixed and one kept by design. Everything else is at parity. Items marked "fixed 2026-09-28" were ported in this session. See the **Testing guide** at the end.

## Commit-by-commit

### Dredge charts

| Commit | Date | What it does (non-native) | Native | Notes |
|---|---|---|---|---|
| #150 `202589d` | 08-25 | Weekly chart picks a coarser raster resolution instead of failing on a large extent | ✅ Same | Same `MAX_CELLS` coarsening loop in `lib/dredge/chart.js` |
| #151 `58e7a30` | 08-25 | Weekly chart draws CSC borders and adds zoomed "this week" pages | ✅ Same (fixed 2026-09-28) | Area windows (`detectClusterWindows` with `split_gap_ft`, default 400 ft) and zoomed "this week" pages with a 250 ft margin, only when they tighten the frame. Uses `coverage_rings` like non-native, and orders dredges by equipment `sort_order`. |
| #152 `ff4a657` | 08-26 | Weekly charts: one per contract, framed per contract, with real classification | ✅ Same (fixed 2026-09-28) | Scopes come from `jfb_realized_scopes` (label, `start_date`, `chart_region`) instead of hard-coded code. Each ring is assigned by testing its centre against the CSC cells. |
| #153 `6cb0c6c` | 08-26 | Per-contract weekly: ground-based split, 2nd pass within the week | ✅ Same (fixed 2026-09-28) | The week's footprint goes through the daily classification (1st / 2nd / residual, with completed CSCs up to week end). Re-passes within the week are folded on a 2-ft grid, and there's a 150 ft margin around each contract. |
| #154 `fa16df0` | 08-26 | Confirm before un-flagging a completed CSC | ✅ Same | `hooks/dredge/useDredgeCellStatus.js`, same confirm text |
| #159 `1a865bf` | 08-31 | Daily chart coarsens an oversize legitimate day instead of failing | ✅ Same | Same loop. Native skips only the `console.info` about the coarsened resolution. |
| `c565b9b` | 08-31 | PE-adjustable "Sweep smoothing" for HYPACK sweep days | ✅ Same | `EditToolbar.jsx` slider, 2–20 ft, default 2 ft |
| #168 `458c877` | 09-11 | One rejected upload no longer discards the whole settings save | ✅ Same | `uploadWarning.js`: saves the rest, keeps the old file, and the rejected file stays selected |
| `e45aa97` | 09-18 | Optional coverage-boundary DXF clips the reportable area | ✅ Same | `boundary_path` upload in settings; used in the daily render and the preview |
| `a7c5dec` | 09-18 | Boundary clips only today's coverage, not prior coverage | ✅ Same | Same masking in `chart.js` |
| `202a8d1` | 09-18 | Inset draws merged progress, not raw per-day rings | ✅ Same (fixed 2026-09-28) | Native had **no inset at all**; the whole inset locator was ported |
| `a7f8d85` | 09-21 | Inset builds its own 8-ft grid over the full site for progress to date | ✅ Same (fixed 2026-09-28) | Same polygons as non-native on real Fountain Lake data (27 polygons, same checksum) |
| `78f0985` | 09-22 | Inset: diagnostic log and raw-ring fallback | ✅ Same (fixed 2026-09-28) | Fallback ported. The version-tagged `console.info` is intentionally left out (debug aid only). |

### Placement charts

| Commit | Date | What it does (non-native) | Native | Notes |
|---|---|---|---|---|
| #157 `d33e728` | 08-27 | Dated per-equipment work type (`work_type_from`), so the CAT 374 can switch from dredging to placement | ✅ Same | `pages/FieldOps/lib/workType.js` resolves the same way |
| #157 `d33e728` | 08-27 | Earthworks fill coverage (`earthworksFill.ts`) | ➖ N/A | Library and test script only; **not wired into any screen** in non-native either |
| #160 `8bff1d6` | 08-31 | Torch Lake bucket grid as a small lattice with clipped edge cells; real area per cell | ✅ Same | `partials`, `cellSqFt` and `sqFtForCellKeys` are in `lib/placement/grid.js` |
| #162 `fa08f8f` | 09-11 | **Draw** clipped cells with their real outline; colour layers outside the stone palette | ✅ Same (fixed 2026-09-28) | `cellShapes` and `cellTrimmedSqFt` ported to `lib/placement/grid.js`. The chart draws real outlines, and the "SF trimmed" note now counts pre-clipped cells. |
| #163 `a6f0706` | 09-11 | Chart header names the layer when it matches no stone class | ✅ Same | Same label rule |
| #164 `4e457fe` | 09-11 | Per-project legend, real cell area in the pass totals, cropped Torch aerial | ✅ Same | Legend from project layers; totals use `sqFtForCellKeys`; Torch aerial set in Pivotly |
| #165 `6c8f0c9` | 09-11 | DMU borders and the sheet pile wall (emphasis lines) | ✅ Same | Same heavy red emphasis stroke; Torch `reference_lines_path` set in Pivotly |
| #173 `05ab26d` | 09-15 | Colour by material **and** pass, per the PE's markup | ✅ Same | `buildPassSplitFills`, `layerPassColorsFrom`, `passSplitLegend`; Torch layer colours present in Pivotly |
| #174 `e0b385a` | 09-15 | Hide the bucket lattice so coverage reads as solid regions | ✅ Same (fixed 2026-09-28) | Native always drew the lattice; `showCellGrid` ported |
| #175 `ffbd366` | 09-15 | Draw the Stability Backfill Extents under the coverage | ✅ Same (fixed 2026-09-28) | Legend rule fixed to match. Native now also accepts the PE's **DXF** directly (non-native needs a Python script). |
| #176 `8a07be7` | 09-16 | Frame the chart on the work and add an inset locator | ✅ Same | `computeWorkFrame`, `framingFrom` and the inset are in `lib/placement/chart.js`; Torch `chart_framing = work` |
| #177 `d531efc` | 09-16 | Draw the placement spread (barges, mats, machine) and place it with two clicks | ✅ Same | Place/move-machine flow saves `plant_pose` on the progress row |
| #178 `82f1d8a` | 09-16 | Accurate warning for an unlayered day (red, "not drawn", for pass-split projects) | ✅ Same (fixed 2026-09-28) | Branches on `palette.layerColors.size`, the same test the renderer uses |

### Spreader charts

| Commit | Date | What it does (non-native) | Native | Notes |
|---|---|---|---|---|
| #155 `a67ad7e` | 08-27 | Plan-snap floor so off-plan work is never dropped | ✅ Same | Same `allByLayer` and `laneBoxes` logic in `lib/spreader/coverage.js` |
| #156 `a6a7473` | 08-27 | Header lists only the subareas worked that day | ✅ Same (fixed 2026-09-28) | `SpreaderProgressTab.jsx` filters to subareas with square footage above 0 today. The PDF embeds the saved chart, so it picks up the fix when the chart is saved. |
| #158 `0199d05` | 08-31 | Seal hairline gaps between daily borders | ✅ Same | `SEAL_FT = 3` in both |

### Reports, metrics and safety

| Commit | Date | What it does (non-native) | Native | Notes |
|---|---|---|---|---|
| `4c62c8c` | 08-26 | Average roll-up skips zero readings (Fountain Lake return-water total went to 0.78) | ✅ Same (fixed 2026-09-28) | `jfb_metrics.rollup_type` + `pkl-jfb-metric-rollup` + `avg_nonzero` column. The Day column is always that day's own value. |
| #172 `b2c70b4` | 09-14 | Realized-to-Date: close a finished phase with an end date; scope Torch dredging | ✅ Same | Native reads `jfb_realized_scopes.end_date` (data-driven, not hard-coded). Torch "Mechanical Dredging (complete)" is 2026-05-19 → 2026-09-09 in Pivotly. |
| #179 `343a213` | 09-18 | Subcontractor equipment on the Safety page | ✅ Same | Subcontractor category and company in settings; the PDF groups by company and uses an inline list when the page is crowded |
| #179 `343a213` | 09-18 | Edit-Event area/pass fill-down with `area_source` | ✅ Same | `lib/eventAreaFill.js`; `'operator'` is set by the apps on insert (non-native uses a DB trigger), `'pe'` on edit |

### Data-only fixes (SQL run on Supabase), checked in local Pivotly

| Commit | What it changes | In Pivotly? |
|---|---|---|
| `fe21627` | Torch Sennebogen 840 set inactive | ➖ Superseded by #161 (reactivated 2026-09-11). Pivotly matches: active, mobilized 2026-09-11. |
| #161 `0f1b2e6` | Torch placement go-live 2026-09-11, capping delay codes | ✅ Sennebogen active, mobilized 2026-09-11, `Mechanical Capping` |
| #164 SQL | Torch placement aerial and georef | ✅ Set |
| #165 SQL | Torch reference overlay | ✅ Set |
| #169 `a95dcb5` | Weigand placement events normalised, lifts backfilled | ✅ Applied (deleted event IDs are absent) |
| #170 `93b32a1` | Weigand 6/29 duplicate full-shift removed | ✅ Applied |
| #171 `1429a14` | Torch Stability Backfill reported in CY | ✅ "Stability Backfill Placed" uses `dvw-jfb-metric-cy-v2`, unit CY |
| #173 SQL | Layer chart colours | ✅ Torch Sand / Structural / Restoration colours set |
| #175 SQL | Torch design extents | ✅ Set |
| #176 SQL | Torch chart framing `work` | ✅ Set |
| #177 SQL | Torch plant outline | ✅ Set |
| #178 SQL | Torch chart area label "Torch Lake" | ✅ Set |
| `4c62c8c` SQL | Fountain Lake roll-up settings | ✅ Loaded from current Supabase: `return_turbidity` = `avg`, `return_flow` = `sum`. Supabase has since switched `return_flow` back to `sum`. |

### Tooling (nothing to port)

| Commit | What it does | Native |
|---|---|---|
| #166 `faa3a29` | Test runner, CI, CLAUDE.md conventions | ➖ N/A |
| #167 `2642cea` | Read-only schema extractor; fixes `run-sql.mjs` | ➖ N/A |

## Differences by design (not bugs)

| Topic | Non-native | Native |
|---|---|---|
| Per-project settings | Some are hard-coded by project code (e.g. `realizedScopesFor` for Kalamazoo and Torch, the dredge-chart project list) | Stored as config rows (`jfb_realized_scopes`, `show_dredge_chart`) |
| Charts in PDFs | Re-rendered from current config every time a PDF is built, so config changes rewrite past reports | The chart image saved from the report tab is embedded, so released reports stay as approved. **Kept on purpose.** |
| Design extents upload | JSON only, produced by `scripts/torch-extents-overlay.py` | DXF or JSON; the DXF is read directly in the browser |
| Record IDs | Supabase UUIDs | Pivotly generates its own IDs. Projects and equipment share IDs with Supabase; most reports don't. |

## Testing guide

For checking the 2026-09-28 changes by hand in both apps, on the local data.

### 1. Setup

| Step | Non-native (local Supabase) | Native (local Pivotly) |
|---|---|---|
| Run the app | `cd jfb/jfb-fieldops-daily && npm run dev`, then sign in (local auth is a copy of production) | `cd jfb/jfb-fieldops-daily-native-app && npm run build`, then load `dist/index.html` into the local Portal and open Field Ops. `src/data/index.js` must have `IS_LOCAL = true`. |
| Metadata | – | Domain `jfb_metrics.rollup_type`, picklist `pkl-jfb-metric-rollup` and data view `dvw-jfb-metric-manual-totals-v2` (with `avg_nonzero`) must be published. Already done. |
| Kalamazoo CSC grid (**required for the per-contract weekly**) | Kalamazoo → Settings → Dredge Chart → upload `jfb/Pivotly Dredge Chart Samples/09 CSC cell-grid DXF/250419 CSCs.dxf` as the cells DXF. The copy in local storage is missing. | Kalamazoo → Project Settings → Dredge Chart → Cells DXF → upload the same `250419 CSCs.dxf` |

**Use `250419 CSCs.dxf`, not `cells_kz.dxf`.** `cells_kz.dxf` is a tiny dev sample in Fountain Lake's coordinates. With it, no Kalamazoo coverage falls inside a CSC, so every weekly page comes out as "Part 2A".

**Data already loaded into local Pivotly, identical to local Supabase:**

| Project | Data |
|---|---|
| Fountain Lake Phase 3 | 68 dredge progress days (2026-06-20 → 09-23); 4 cover metrics (`return_turbidity` = Average, the rest Sum); 40 daily manual values; dredge label "Dredge Victor Buhr" |
| Kalamazoo River Area 4 TCRA | Dredge config and equipment config (Michael B); 42 progress days (2026-08-01 → 09-23); completed CSCs 87 (08-28) and 88 (09-17); 7 missing report dates added |

### 2. Weekly dredge charts: per contract, areas, zoom pages (#151–#153)

Open Weekly Summary → pick the week → Download PDF. The chart pages come after the summary page. Compare page titles and pictures between the two apps.

| # | Project / week | Expected chart pages (both apps) | What to look at |
|---|---|---|---|
| W1 | Kalamazoo, Aug 2 – Aug 8 | 1 page: "Weekly Dredge Progress Chart - Michael B — Part 1" | Framed on Part 1 only; area line reads "Part 1"; **no** "Material Encountered" line; orange = this week, green = prior |
| W2 | Kalamazoo, Aug 30 – Sep 5 | 1 page: "… Michael B — Part 2A (Pilot Channel)" | Framed on the Pilot Channel only; olive where the week re-passed its own ground; CSC 87 counts as completed (residual gray if worked) |
| W3 | Kalamazoo, Sep 13 – Sep 19 | 1 page: "… Michael B — Part 1" | CSCs 87 and 88 are both completed by week end, so work inside them is residual gray |
| W4 | Kalamazoo, Sep 20 – Sep 26 | 1 page: "… Michael B — Part 2A (Pilot Channel)" | Framed on the Pilot Channel |
| W5 | Fountain Lake, Aug 23 – Aug 29 | 2 pages: "… Dredge Victor Buhr" (whole site) **and** "… Dredge Victor Buhr — this week" (zoomed) | The zoom page is a close-up of the week's orange work with context around it |
| W6 | Fountain Lake, Sep 6 – Sep 12 | 1 page: "… Dredge Victor Buhr" only | No dredging that week, so there's no zoom page and no orange |
| W7 | Fountain Lake, Sep 20 – Sep 26 | 2 pages: overview + "— this week" | |

**Pass if:** both apps give the same pages, in the same order, with the same titles and framing. Colours for 1st pass, 2nd pass, residual and prior match.

Before this change, native gave one wide page per dredge for Kalamazoo with no contract split and no zoom pages.

### 3. Metric average roll-up (`4c62c8c`)

| # | Where | Steps | Expected |
|---|---|---|---|
| M1 | Native → Fountain Lake → Project Settings → Cover Metrics | Edit "Return Water Turbidity" | "Week / Total roll-up" shows **Average (non-zero days)**. It appears only for Manual metrics. |
| M2 | Same | Edit "Return Water Flow" | Roll-up shows **Sum** |
| M3 | Both apps → Fountain Lake report **2026-09-23** → Metrics tab | Read Turbidity and Flow | Turbidity: Day **23**, Week **20.50**, Total **20.31**. Flow: Day **2,916,000**, Week **4,650,000**, Total **31,755,600**. |
| M4 | Both apps → same report → Download PDF | Cover page production table | The same numbers as M3 |
| M5 | Native → any report | Set a manual metric to Average, enter 0 or leave it blank for a day | That day shows 0 (or blank) in Day, but it doesn't pull the Week/Total average down |
| M6 | Native → Weigand, any report | Look at stone-ton metrics (Sum) | Unchanged from before (e.g. project total for `ballast_stone_tons` = 3,226.43) |

**Why the M3 numbers:**
- **Turbidity's week (Sun 9/20 – Wed 9/23)** is 9/21 = 0 (skipped), 9/22 = 18 and 9/23 = 23, averaging **20.50**. Counting the zero would have given 13.67.
- **Turbidity's total** skips 7 zero days, giving **20.31**; counting them would give 13.20.

### 4. Placement: clipped edge cells (#162) and unlayered-day warning (#178)

Only native can show Torch Lake placement locally: Pivotly has one placement day (2026-09-12), and local Supabase has none.

| # | Where | Expected |
|---|---|---|
| P1 | Native → Torch Lake → report **2026-09-12** → Placement tab | Coverage at the edge of the design area follows the design outline. It doesn't stick out as full squares past the edge. |
| P2 | Same | If the note under the stats says "N SF of cell area fell outside and was trimmed", it now counts pre-clipped edge cells. Before, it showed nothing for Torch Lake. |
| P3 | Native → Torch Lake report with coverage but **no Layer** set on the day's events | A **red** note: "No Layer is set on today's events, so today's coverage is not drawn…" |
| P4 | Native → Weigand placement report with no Layer on the day's events | The **amber** note: "Today's coverage draws in Daily Progress green either way…" |

### 5. Spreader header (#156)

This can't be tested side by side locally yet. Penobscot's spreader data (12 days, 2026-08-20 → 09-02, subareas IFN / IFS / LM) is only in local Supabase.

| # | Where | Expected |
|---|---|---|
| S1 | Non-native → Penobscot → a spreader day that worked only some subareas | Header "Spreader … Daily Progress Chart - IFN" (only the worked subareas) |
| S2 | Native (after Penobscot's spreader data is loaded) | Same header as S1. With no coverage that day, it lists all subareas. |

### 6. Already-verified items (re-check quickly)

| # | Item | Where | Expected |
|---|---|---|---|
| R1 | Dredge inset (`202a8d1`, `a7f8d85`, `78f0985`) | Fountain Lake → Project Settings → Dredge Chart → Preview (Victor Buhr), in both apps | Top-left inset shows all progress green with no holes, a red view rectangle, and matches between apps |
| R2 | Design extents DXF (#175) | Native → Torch Lake → Project Settings → Placement Chart → Design extents → upload the PE's DXF | The pale mint region is drawn with an orange dashed outline, and a "Stability Backfill Extents" legend swatch appears |
| R3 | Hidden bucket lattice (#174) | Native → Torch Lake → 2026-09-12 Placement tab | No bucket grid lines; coverage is solid colour |

### Known limitations of the local test data

| Item | Effect |
|---|---|
| Storage files aren't in `data.sql` (isopach `bg.png`, Kalamazoo aerial, reference lines) | Charts draw on the aerial tiles (Fountain Lake) or a plain background (Kalamazoo). This is the same in both apps. |
| Saving charts during tests | Saving a chart or progress writes to local Supabase (non-native) or local Pivotly (native), and the two will drift. Re-run the loads to reset. |
