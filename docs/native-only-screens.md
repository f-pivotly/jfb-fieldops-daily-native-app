# JFB Field Ops: what only the native app has


## Summary

| Type | Count |
|---|---|
| Screen | 5 |
| Field | 19 |
| Modal | 7 |
| Inline preview | 1 |
| **Total** | **32** |

## How to get there in native

The "How to see it" column uses these starting points:

| Shorthand | Clicks |
|---|---|
| **Admin** | Open the JFB app in the Portal → Launch page → **Admin**. Needs access to the Admin page (`apg-jfb-admin`). |
| **Field Ops** | Launch page → **Field Ops Daily**. Users without Admin access skip the Launch page and land here. |
| **Settings** | Field Ops → click a project card → **Settings** (top right of the report list). Needs the `manage_project_settings` action. |
| **Report** | Field Ops → click a project card → click a date. |

## Everything native-only

| # | Type | Name | How to see it in native | Saves to | Non-native | Native file |
|---|---|---|---|---|---|---|
| 1 | Screen | Launch page | Open the JFB app in the Portal. Shown only to users who can open the Admin page; everyone else goes straight to Field Ops. | — | None. The daily app and the admin console are two separate tools. | [LaunchPage.jsx](../src/pages/LaunchPage.jsx) |
| 2 | Screen | Team | **Admin** → left menu **Team** → pick a project. | `jfb_project_members` | No screen. `user_projects` rows are added by SQL or in Supabase Studio; the console's Users screen has one "Assigned Project" per user. | [AdminTeamSection.jsx](../src/pages/Admin/AdminTeamSection.jsx), [TeamTab.jsx](../src/pages/Admin/ProjectDetail/TeamTab.jsx) |
| 3 | Screen | Realized Scopes tab | **Settings** → **Realized Scopes**. Always shown. | `jfb_realized_scopes` | Written in code per project in `src/lib/realizedScopes.ts` (Kalamazoo 152407, Torch Lake 152601). | [RealizedScopesTab.jsx](../src/pages/FieldOps/projectSettingsTabs/RealizedScopesTab.jsx) |
| 4 | Screen | Placement Chart tab | **Settings** → **Placement Chart**. Shown only when the project's or any equipment's work type contains "cap" or "placement". | `jfb_placement_config` | SQL only (e.g. `sql/2026-08-19_torch_lake_placement_config.sql`). The app only reads `placement_config`. | [PlacementChartTab.jsx](../src/pages/FieldOps/projectSettingsTabs/PlacementChartTab.jsx) |
| 5 | Screen | Spreader Chart tab | **Settings** → **Spreader Chart**. Shown only when **Spreader Active** is ticked on the project (see #9). | `jfb_spreader_config` | SQL only (`sql/2026-09-12_spreader_progress.sql`). The app only reads `spreader_config`. | [SpreaderChartTab.jsx](../src/pages/FieldOps/projectSettingsTabs/SpreaderChartTab.jsx) |
| 6 | Field | Prior Work Type | **Admin** → **Projects** → **+ New Project**, or **Edit** on a row. | `jfb_projects.prior_work_type` | SQL only (`sql/2026-08-06_project_phase_split.sql`). | [AdminProjectsSection.jsx](../src/pages/Admin/AdminProjectsSection.jsx) |
| 7 | Field | Phase Change From | Same modal as #6. Greyed out until a Prior Work Type is picked. | `jfb_projects.placement_start_date` | SQL only (same file as #6). | [AdminProjectsSection.jsx](../src/pages/Admin/AdminProjectsSection.jsx) |
| 8 | Field | Report Timezone | Same modal as #6. | `jfb_projects.report_timezone` | SQL only (`sql/2026-08-04_project_report_timezone.sql`). | [AdminProjectsSection.jsx](../src/pages/Admin/AdminProjectsSection.jsx) |
| 9 | Field | Spreader Active | Same modal as #6, in the feature checkboxes. | `jfb_projects.is_spreader_active` | No column. The spreader feature turns on when an active `spreader_config` row exists (SQL). | [AdminProjectsSection.jsx](../src/pages/Admin/AdminProjectsSection.jsx) |
| 10 | Field | Show Dredge Chart | Same modal as #6, in the feature checkboxes. | `jfb_projects.show_dredge_chart` | No column. A list of project names in `src/lib/dredge/config.ts` decides it. | [AdminProjectsSection.jsx](../src/pages/Admin/AdminProjectsSection.jsx) |
| 11 | Field | Mobilized On | **Admin** → **Projects** → **Configure** on a project → **Equipment** → **+ Add Equipment**, or **Edit** on a row. | `jfb_equipments.mobilized_on` | SQL only (`sql/2026-08-06_equipment_mob_demob.sql`). | [EquipmentTab.jsx](../src/pages/Admin/ProjectDetail/EquipmentTab.jsx) |
| 12 | Field | Demobilized On | Same modal as #11. Must be on or after Mobilized On. | `jfb_equipments.demobilized_on` | SQL only (same file as #11). | [EquipmentTab.jsx](../src/pages/Admin/ProjectDetail/EquipmentTab.jsx) |
| 13 | Field | Work Type ("Inherit from project") | Same modal as #11. | `jfb_equipments.work_type` | SQL only (`sql/2026-08-19_equipment_work_type.sql`). | [EquipmentTab.jsx](../src/pages/Admin/ProjectDetail/EquipmentTab.jsx) |
| 14 | Field | Effective From | Same modal as #11. Appears only after a Work Type is picked. | `jfb_equipments.work_type_from` | SQL only (`sql/2026-08-27_equipment_work_type_from.sql`). | [EquipmentTab.jsx](../src/pages/Admin/ProjectDetail/EquipmentTab.jsx) |
| 15 | Field | Email | **Admin** → **Projects** → **Configure** → **Operators** → **+ Add Operator** → switch to **New Operator**. | `jfb_operators.email` | No column. Operators have no email. | [OperatorsTab.jsx](../src/pages/Admin/ProjectDetail/OperatorsTab.jsx) |
| 16 | Field | Pay Group | **Admin** → **Projects** → **Configure** → **Capping Setup** → **Layers** → add or edit a layer. The Capping Setup tab shows only when the project's work type, prior work type or any equipment's work type contains "cap". | `jfb_project_layers.pay_group` | SQL only (`sql/2026-08-19_layer_pay_groups.sql`). | [CappingSetupTab.jsx](../src/pages/Admin/ProjectDetail/CappingSetupTab.jsx) |
| 17 | Field | Pay Unit (CY / SY / SF / TON) | Same modal as #16. | `jfb_project_layers.pay_unit` | SQL only (same file as #16). | [CappingSetupTab.jsx](../src/pages/Admin/ProjectDetail/CappingSetupTab.jsx) |
| 18 | Field | Tons Goal | **Admin** → **Projects** → **Configure** → **Capping Setup** → **Materials** → add or edit a material. Same tab condition as #16. | `jfb_project_materials.tons_goal` | SQL only (`sql/2026-08-06_project_material_tons_goal.sql`). The console's own "Tons Goal" is on Areas → Layers, a different table. | [CappingSetupTab.jsx](../src/pages/Admin/ProjectDetail/CappingSetupTab.jsx) |
| 19 | Field | Bid Rate (tons/GOH) | Same modal as #18. | `jfb_project_materials.tons_per_hour_goal` | SQL only (`sql/2026-08-06_weigand_material_rates.sql`). | [CappingSetupTab.jsx](../src/pages/Admin/ProjectDetail/CappingSetupTab.jsx) |
| 20 | Field | Date | **Settings** → **Narratives** → **+ Add Section**, or edit a section. | `jfb_project_report_narratives.date` | No column. | [NarrativesTab.jsx](../src/pages/Admin/ProjectDetail/NarrativesTab.jsx) |
| 21 | Field | Show cells as a reference overlay only | **Settings** → **Dredge Chart** → "Project background & labels" → just below **CSC / cell-grid DXF**. The tab shows only when **Show Dredge Chart** is ticked (#10). | `jfb_dredge_config.cells_reference_only` | SQL only (`sql/2026-08-04_kalamazoo_cells_reference_only.sql`). | [DredgeChartTab.jsx](../src/pages/FieldOps/projectSettingsTabs/DredgeChartTab.jsx) |
| 22 | Field | Isopach tiles (four corners + **Add tile**) | **Settings** → **Dredge Chart** → "Isopach" tiles, below the isopach chart. Same tab condition as #21. | `jfb_dredge_config.isopach_tiles` | SQL only (`sql/2026-06-26_dredge_isopach_tiles.sql`). | [DredgeChartTab.jsx](../src/pages/FieldOps/projectSettingsTabs/DredgeChartTab.jsx) |
| 23 | Field | Aerial tiles (four corners + **Add tile**) | **Settings** → **Dredge Chart** → "Aerial base layer" → "Aerial" tiles. Same tab condition as #21. | `jfb_dredge_config.aerial_tiles` | SQL only (`sql/2026-06-26_dredge_aerial_tiles_fl_seed.sql`). | [DredgeChartTab.jsx](../src/pages/FieldOps/projectSettingsTabs/DredgeChartTab.jsx) |
| 24 | Field | Why are these files being replaced? | **Report** → **Dredge Progress** → choose RAW files → **Update saved progress**. Asked only when the day already has stored source files and you picked a different set. The tab shows when Show Dredge Chart is on and the machine is dredging that day. | `jfb_dredge_progress.source_batch_history[].reason` | Absent. Non-native never stores the uploaded source files. | [DredgeProgressTab.jsx](../src/pages/FieldOps/reportEditorTabs/DredgeProgressTab.jsx) |
| 25 | Modal | "Remove {file}? The stored file will be deleted." | **Settings** → **Dredge Chart** → **Remove** next to any saved file (isopach, colour bar, aerial, cells, boundary, mile markers, alignment, design grade, QA survey). | Clears that file's `_path` / `_original_name` / `_storage_path` on `jfb_dredge_config` and deletes the file. | Absent. A file can only be replaced, never cleared. | [DredgeChartTab.jsx](../src/pages/FieldOps/projectSettingsTabs/DredgeChartTab.jsx) |
| 26 | Modal | "Remove tile N? The stored file will be deleted." | **Settings** → **Dredge Chart** → **Remove** next to a saved isopach or aerial tile. | Removes one entry from `isopach_tiles` / `aerial_tiles`. | Absent. Tiles are SQL only. | [DredgeChartTab.jsx](../src/pages/FieldOps/projectSettingsTabs/DredgeChartTab.jsx) |
| 27 | Modal | Remove dredge shape | **Settings** → **Dredge Chart** → "Dredge shapes (per equipment)" → **Remove** next to a saved shape. | Clears `jfb_dredge_equipment_config.shape_path` / `shape_original_name` / `shape_storage_path`. | Absent. A shape can only be replaced. | [DredgeChartTab.jsx](../src/pages/FieldOps/projectSettingsTabs/DredgeChartTab.jsx) |
| 28 | Modal | "Replace stored source files?" | Same trigger as #24. This is the dialog that holds that field. | `jfb_dredge_progress.source_batch_history` | Absent. | [DredgeProgressTab.jsx](../src/pages/FieldOps/reportEditorTabs/DredgeProgressTab.jsx) |
| 29 | Modal | "Delete this production stat row?" | **Report** on a capping or placement machine → **Production Stats** → trash icon on a saved row. The report must be editable. | Deletes a `jfb_production_stats` row. | Multi-layer rows delete with no confirm; single-layer rows can't be deleted. | [CappingProductionTable.jsx](../src/pages/FieldOps/reportEditorTabs/ProductionStats/CappingProductionTable.jsx) |
| 30 | Modal | `Remove the "X" section?` | **Report** → **Narratives** → **Manage sections** → trash icon on a section. The button needs create or update access on `jfb_project_report_narratives`. | Deletes a `jfb_project_report_narratives` row. | Sections can only be hidden and restored. | [NarrativesTab.jsx](../src/pages/FieldOps/reportEditorTabs/NarrativesTab.jsx) |
| 31 | Modal | "Update conflict" | **Report** → **Narratives**. Two people edit the same section and the second one saves after the first; the platform's version check rejects it. | — | Uses edit locks ("locked by X") instead. | [NarrativesTab.jsx](../src/pages/FieldOps/reportEditorTabs/NarrativesTab.jsx) |
| 32 | Inline preview | "Use my saved signature" → **Accept and use** | **Report** → **Safety** → **Use my saved signature**, above the signature. Shown when the report has no signature yet and you have a saved default. | Copies `jfb_user_signatures.signature_image_path` to `jfb_report_safety_v2.signature_image_path`. | Applies the saved signature automatically, with no accept step. | [SafetyTab.jsx](../src/pages/FieldOps/reportEditorTabs/SafetyTab.jsx) |
