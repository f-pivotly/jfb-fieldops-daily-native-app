import { useEffect, useState } from 'react'
import { executeDataView } from '../data'

// GOH/NOH for a single production_stats row's own Area+Pass+TSCA+Attachment
// combo, scoped to the report's one date. Mirrors useAutoMetricValues.js's
// call-per-row pattern, but against dvw-jfb-goh/dvw-jfb-noh instead of the
// metric views. Area/pass/tsca/attachment are combo-identity dimensions
// matched exactly INCLUDING null on the server (see dataview/dvw-jfb-goh.json)
// -- passing a row's own (possibly null) values here is correct; do not
// coerce them to omit-the-filter.
function areaIdOf(row) {
  const combo = row.area_level_combinations
  if (!Array.isArray(combo) || combo.length === 0) return null
  return combo[combo.length - 1]?.area_id ?? null
}

// jfb_production_stats.pass_value stores the pkl-jfb-pass-type LABEL
// ("1st Pass"); jfb_daily_activities.pass_type stores the picklist VALUE
// ("1st_pass") the field app actually writes. The data view's p_pass_type
// filter compares against the activities table, so it needs the value form
// -- resolve the label back to its value via the picklist's own mapping
// (built from passTypeLabels, a value->label map) rather than guessing a
// string transform. Falls back to the raw pass_value if it isn't a known
// label (e.g. picklist still loading, or a legacy free-text value).
function passTypeValueOf(row, passTypeLabels) {
  if (!row.pass_value) return null
  const entry = Object.entries(passTypeLabels).find(([, label]) => label === row.pass_value)
  return entry ? entry[0] : row.pass_value
}

export function useGohNoh(rows, { projectId, reportDate, equipmentId, passTypeLabels = {} }) {
  const signature = rows
    .map((r) => `${r.id}:${areaIdOf(r) ?? ''}:${r.pass_value ?? ''}:${r.tsca ?? ''}:${r.attachment_id ?? ''}`)
    .join(',')
  const labelsSignature = Object.keys(passTypeLabels).join(',')

  const [valuesById, setValuesById] = useState({})

  useEffect(() => {
    if (!projectId || !reportDate || rows.length === 0) return
    let cancelled = false

    rows.forEach(async (row) => {
      const params = {
        p_project_id: projectId,
        p_start_date: reportDate,
        p_end_date: reportDate,
        p_equipment_id: equipmentId ?? null,
        p_area_id: areaIdOf(row),
        p_pass_type: passTypeValueOf(row, passTypeLabels),
        p_tsca: row.tsca ?? null,
        p_attachment_id: row.attachment_id ?? null,
      }
      try {
        const [gohRes, nohRes] = await Promise.all([
          executeDataView('dvw-jfb-goh', params),
          executeDataView('dvw-jfb-noh', params),
        ])
        if (cancelled) return
        setValuesById((prev) => ({
          ...prev,
          [row.id]: {
            goh: Number(gohRes?.[0]?.goh_hours ?? 0),
            noh: Number(nohRes?.[0]?.noh_hours ?? 0),
            error: null,
          },
        }))
      } catch (err) {
        if (cancelled) return
        setValuesById((prev) => ({ ...prev, [row.id]: { goh: 0, noh: 0, error: err.message } }))
      }
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature`/`labelsSignature` are the intentional dependencies
  }, [signature, labelsSignature, projectId, reportDate, equipmentId])

  return valuesById
}
