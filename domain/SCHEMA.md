

## jfb_air_monitoring_config
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| provider | text |
| base_url | text |
| timezone | text |
| window_start | text |
| window_end | text |
| interval_minutes | integer |
| stations | jsonb |
| thresholds | jsonb |
| equipment_text | text |
| calibration_text | text |
| notes_text | text |
| aerial_path | text |

## jfb_air_monitoring_daily
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| report_id | uuid, unique, FK → jfb_reports.id |
| activity | text |
| notes | text |

## jfb_air_quality_readings
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| sensor_id | text |
| station_key | text |
| parameter | text |
| unit | text |
| value | numeric |
| reading_at | timestamp with time zone |
| source | text |
| fetched_at | timestamp with time zone |

## jfb_component_types
TABLE

| Field | Type |
|---|---|
| name | text (unique) |
| description | text |
| sort_order | integer |
| active | boolean |

## jfb_culture_tenants
TABLE

| Field | Type |
|---|---|
| name | text |
| description | text |
| sort_order | integer |
| active | boolean |

## jfb_daily_activities
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| equipment_id | uuid, FK → jfb_equipments.id |
| operator_id | uuid, FK → jfb_operators.id |
| start_date_time | timestamp with time zone |
| end_date_time | timestamp with time zone |
| timezone | text |
| session_id | text |
| pass_type | text |
| attachment_id | uuid, FK → jfb_project_attachments.id |
| area | jsonb |
| notes | text |
| tsca | boolean |
| delay_code_id | uuid, FK → jfb_project_delay_codes.id |
| category | text |
| layer_id | uuid, FK → jfb_project_layers.id |

## jfb_delay_codes
TABLE

| Field | Type |
|---|---|
| work_type_id | uuid, FK → jfb_work_types.id |
| category | text |
| category_num | integer |
| code | text |
| code_num | integer (unique) |
| sort_order | integer |
| active | boolean |
| notes | text |

## jfb_dredge_cell_status
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| cell_label | text |
| completed_on | date |
| generated_by_user_id | uuid |

## jfb_dredge_config
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| bg_path | text |
| colorbar_path | text |
| georef | jsonb |
| default_area_id | uuid, FK → jfb_project_areas.id |
| default_material_note | text |
| chart_title_override | text |
| cells_path | text |
| aerial_path | text |
| aerial_georef | jsonb |
| crs_definition | text |
| aerial_tiles | jsonb |
| data_source | text |
| water_elev_ft | numeric |
| earthworks_design_path | text |
| require_stations | boolean |
| reference_lines_path | text |
| alignment_path | text |
| reference_surface_path | text |
| split_gap_ft | integer |
| isopach_tiles | jsonb |
| cells_reference_only | boolean |
| bucket_width_ft | numeric |
| track_bed_tolerance_ft | numeric |
| alignment_snap_ft | numeric |
| volume_mode | text |
| design_elev_ft | numeric |
| reference_surface_date | date |
| reference_cell_ft | numeric |
| volume_recovery_factor | numeric |
| bg_original_name | text |
| bg_storage_path | text |
| colorbar_original_name | text |
| colorbar_storage_path | text |
| cells_original_name | text |
| cells_storage_path | text |
| aerial_original_name | text |
| aerial_storage_path | text |
| earthworks_design_original_name | text |
| earthworks_design_storage_path | text |
| reference_lines_original_name | text |
| reference_lines_storage_path | text |
| alignment_original_name | text |
| alignment_storage_path | text |
| reference_surface_original_name | text |
| reference_surface_storage_path | text |

## jfb_dredge_equipment_config
TABLE

| Field | Type |
|---|---|
| equipment_id | uuid, FK → jfb_equipments.id |
| project_id | uuid, FK → jfb_projects.id |
| shape_path | text |
| label | text |

## jfb_dredge_progress
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| report_id | uuid, FK → jfb_reports.id |
| equipment_id | uuid, FK → jfb_equipments.id |
| chart_path | text |
| surface_export_path | text |
| coverage_rings | jsonb |
| footprint_rings | jsonb |
| today_sqft | numeric |
| cumulative_sqft | numeric |
| dredge_pose | jsonb |
| placement_override | jsonb |
| second_pass_flags | jsonb |
| advance_ft | numeric |
| advance_lines | jsonb |
| progress_rings | jsonb |
| cell_breakdown | jsonb |
| material_text | text |
| generated_by_user_id | uuid |
| chart_paths | jsonb |
| gross_cy | numeric |
| adjusted_cy | numeric |

## jfb_equipments
TABLE

| Field | Type |
|---|---|
| name | text |
| project_id | uuid, FK → jfb_projects.id |
| work_type | text |
| work_type_from | date |
| is_active | boolean |

## jfb_hydraulic_flow_stats
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| equipment_id | uuid, FK → jfb_equipments.id |
| log_date | timestamp with time zone |
| pipe_dia_inches | numeric |
| avg_line_velocity | numeric |
| avg_flow_rate | numeric |
| daily_total_gal | numeric |

## jfb_hydraulic_pipe_configurations
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| log_date | timestamp with time zone |
| segment_name | text |
| length_ft | numeric |

## jfb_layer_types
TABLE

| Field | Type |
|---|---|
| name | text (unique) |
| description | text |
| sort_order | integer |
| active | boolean |

## jfb_material_types
TABLE

| Field | Type |
|---|---|
| name | text (unique) |
| description | text |
| sort_order | integer |
| active | boolean |

## jfb_metric_defaults
TABLE

| Field | Type |
|---|---|
| metric_key | text (unique) |
| label | text |
| source | text |
| unit | text |
| sort_order | integer |

## jfb_metric_sources
TABLE

| Field | Type |
|---|---|
| value | text (unique) |
| label | text |
| unit | text |
| sort_order | integer |
| result_column | text |
| active | boolean |
| description | text |

## jfb_metrics
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| metric_key | text |
| label | text |
| source | text |
| equipment_id | uuid, FK → jfb_equipments.id |
| unit | text |
| sort_order | integer |
| active | boolean |

## jfb_narrative_section_defaults
TABLE

| Field | Type |
|---|---|
| label | text |
| sort_order | integer |
| is_active | boolean |

## jfb_operators
TABLE

| Field | Type |
|---|---|
| email | text |
| name | text |
| favourite_activity_ids | text |

## jfb_placement_config
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| label | text |
| grid_path | text |
| grid_original_name | text |
| grid_storage_path | text |
| aerial_path | text |
| aerial_original_name | text |
| aerial_storage_path | text |
| aerial_georef | jsonb |
| reference_lines_path | text |
| reference_lines_original_name | text |
| reference_lines_storage_path | text |
| active | boolean |

## jfb_placement_progress
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| report_id | uuid, FK → jfb_reports.id |
| equipment_id | uuid, FK → jfb_equipments.id |
| source_filename | text |
| source_header | text |
| placements | jsonb |
| bucket_count | integer |
| first_secs | integer |
| last_secs | integer |
| distinct_cells | integer |
| today_sqft | numeric |
| problems | jsonb |
| chart_path | text |
| generated_by_user_id | uuid |

## jfb_production_stats
TABLE

| Field | Type |
|---|---|
| report_id | uuid, FK → jfb_reports.id |
| equipment_id | uuid, FK → jfb_equipments.id |
| area_level_combinations | jsonb |
| pass_value | text |
| attachment_id | uuid, FK → jfb_project_attachments.id |
| layer_id | uuid, FK → jfb_project_layers.id |
| material_id | uuid, FK → jfb_project_materials.id |
| tsca | boolean |
| volume | numeric |
| area | numeric |
| notes | text |
| tons | numeric |
| conversion_factor | numeric |

## jfb_production_week_breaks
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| shutdown_start | date |
| shutdown_end | date |
| reason | text |

## jfb_project_area_layers
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| area_id | uuid, FK → jfb_project_areas.id |
| layer_id | uuid, FK → jfb_project_layers.id |
| min_design_thickness | numeric |
| target_thickness | numeric |
| overplacement_tolerance | numeric |
| cy_goal | numeric |
| tons_goal | numeric |
| sf_goal | numeric |

## jfb_project_area_levels
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| depth | integer |
| label | text |
| sort_order | integer |

## jfb_project_areas
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| parent_id | uuid, FK → jfb_project_areas.id |
| area_level_id | uuid, FK → jfb_project_area_levels.id |
| name | text |
| sort_order | integer |
| is_active | boolean |
| volume_goal_cy | numeric |
| area_goal_sf | numeric |
| notes | text |

## jfb_project_attachments
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| name | text |
| sort_order | integer |
| active | boolean |

## jfb_project_components
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| component_name | text |
| component_type_id | uuid, FK → jfb_component_types.id |
| component_report_name | text |
| component_report_uom | text |
| component_inventory_uom | text |
| sort_order | integer |
| active | boolean |

## jfb_project_delay_codes
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| delay_code_id | uuid, FK → jfb_delay_codes.id |
| work_type_id | uuid, FK → jfb_work_types.id |
| category | text |
| code | text |
| code_num | integer |
| active | boolean |
| sort_order | integer |

## jfb_project_layer_materials
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| layer_id | uuid, FK → jfb_project_layers.id |
| material_id | uuid, FK → jfb_project_materials.id |
| layer_material_report_name | text |
| loading_rate | numeric |

## jfb_project_layers
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| layer_name | text |
| layer_type_id | uuid, FK → jfb_layer_types.id |
| layer_report_name | text |
| sort_order | integer |
| active | boolean |

## jfb_project_material_components
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| material_id | uuid, FK → jfb_project_materials.id |
| component_id | uuid, FK → jfb_project_components.id |
| component_percent_of_material | numeric |

## jfb_project_materials
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| material_name | text |
| material_type_id | uuid, FK → jfb_material_types.id |
| material_report_name | text |
| sort_order | integer |
| active | boolean |

## jfb_project_members
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| user_id | uuid |
| is_active | boolean |

## jfb_project_operators
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| operator_id | uuid, FK → jfb_operators.id |
| is_active | boolean |

## jfb_project_report_narratives
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| narrative_label | text |
| section_key | text |
| is_active | boolean |
| date | timestamp with time zone |
| sort_order | integer |

## jfb_project_site_equipment
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| category | text |
| description | text |
| sort_order | integer |
| mobilized_at | date |
| demobilized_at | date |

## jfb_projects
TABLE

| Field | Type |
|---|---|
| name | text |
| is_active | boolean |
| client_name | text |
| project_code | integer |
| work_type | text |
| start_date | timestamp with time zone |
| end_date | date |
| volume_goal | numeric |
| primary_measure | text |
| site_city | text |
| site_state | text |
| is_tsca_zone_tracking | boolean |
| is_soil_type | boolean |
| is_pipe_tracking | boolean |
| show_ssho_field | boolean |
| show_next_day_summary | boolean |
| latitude | numeric |
| longitude | numeric |
| cy_goh_goal | numeric |
| expected_goh_per_day | numeric |
| production_days_per_week | numeric |
| production_start_date | date |
| cap_conversion_factor | numeric |
| placement_start_date | date |
| prior_work_type | text |
| is_spreader_active | boolean |

## jfb_realized_excluded_days
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| exclude_date | date |
| reason | text |

## jfb_report_crew_summary_v2
TABLE

| Field | Type |
|---|---|
| report_id | uuid, FK → jfb_reports.id |
| category | text |
| count | integer |
| hours | numeric |
| sort_order | integer |

## jfb_report_generations
TABLE

| Field | Type |
|---|---|
| report_id | uuid, FK → jfb_reports.id |
| project_id | uuid, FK → jfb_projects.id |
| report_date | date |
| report_slug | text |
| report_type | text |
| generated_at | timestamp with time zone |
| generated_by_user_id | uuid |
| generated_by_email | text |
| file_id | text |
| file_name | text |
| file_path | text |
| download_url | text |

## jfb_report_metric_value
TABLE

| Field | Type |
|---|---|
| report_id | uuid, FK → jfb_reports.id |
| metric_id | uuid, FK → jfb_metrics.id |
| value | numeric |

## jfb_report_narratives_v2
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| report_id | uuid, FK → jfb_reports.id |
| narrative_label | text |
| section_key | text |
| content | text (fww) |

## jfb_report_photos
TABLE

| Field | Type |
|---|---|
| photo_number | integer |
| photo_file_path | text |
| original_file_name | text |
| label | text |
| uploaded_by | uuid |
| uploaded_date_time | timestamp with time zone |
| project_id | uuid, FK → jfb_projects.id |
| report_id | uuid, FK → jfb_reports.id |
| pm_comment | text |

## jfb_report_safety_v2
TABLE

| Field | Type |
|---|---|
| report_id | uuid, unique, FK → jfb_reports.id |
| culture_tenant_id | uuid, FK → jfb_culture_tenants.id |
| plan_of_day | text |
| incidents_to_report | text |
| safety_meeting_topic | text |
| afternoon_meeting_topic | text |
| jha_aha_reviewed | text |
| high_risk_task | text |
| temp_high_f | numeric |
| temp_low_f | numeric |
| wind_high_mph | numeric |
| wind_gusts_mph | numeric |
| wind_avg_mph | numeric |
| wind_direction | text |
| precip_today_in | numeric |
| precip_mtd_in | numeric |
| precip_project_total_in | numeric |
| conditions | text |
| signature_name | text |
| signature_image_path | text |
| ssho_name | text |
| ssho_signature_image_path | text |
| next_day_summary | text |

## jfb_reports
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| report_date | date |
| status | text |
| released_at | timestamp with time zone |
| released_by_user_id | uuid |
| no_production_day | boolean |

## jfb_spreader_config
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| spreader_name | text |
| layer_title | text |
| aerial_path | text |
| aerial_original_name | text |
| aerial_storage_path | text |
| aerial_georef | jsonb |
| boundaries | jsonb |
| planned_lanes | jsonb |
| plan_cell_len_ft | numeric |
| broadcast_ft | numeric |
| min_step_tons | numeric |
| forward_throw_ft | numeric |
| cross_extra_ft | numeric |
| transition_ft | numeric |
| active | boolean |

## jfb_spreader_progress
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| report_id | uuid, FK → jfb_reports.id |
| equipment_id | uuid, FK → jfb_equipments.id |
| source_filename | text |
| steps | jsonb |
| coverage | jsonb |
| override_rings | jsonb |
| today_sqft | numeric |
| cumulative_sqft | numeric |
| chart_path | text |
| generated_by_user_id | uuid |

## jfb_user_signatures
TABLE

| Field | Type |
|---|---|
| user_id | uuid (unique) |
| signature_image_path | text |

## jfb_water_monitoring_config
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| provider | text |
| timezone | text |
| window_start | text |
| window_end | text |
| interval_minutes | integer |
| locations | jsonb |
| thresholds | jsonb |
| mode | text |
| aerial_path | text |
| active | boolean |

## jfb_water_monitoring_notes
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| report_id | uuid, unique, FK → jfb_reports.id |
| notes | text |
| reference_ntu | numeric |

## jfb_water_quality_readings
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| location_id | text |
| role | text |
| parameter | text |
| unit | text |
| value | numeric |
| reading_at | timestamp with time zone |
| source | text |
| fetched_at | timestamp with time zone |

## jfb_weekly_summaries
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| week_start | date |
| section_key | text |
| content | text |
| edited_by | uuid |
| edited_at | timestamp with time zone |

## jfb_weekly_summary_photos
TABLE

| Field | Type |
|---|---|
| project_id | uuid, FK → jfb_projects.id |
| week_start | date |
| photo_number | integer |
| photo_file_path | text |
| original_file_name | text |
| label | text |
| uploaded_by | uuid |
| uploaded_date_time | timestamp with time zone |

## jfb_work_types
TABLE

| Field | Type |
|---|---|
| name | text (unique) |
