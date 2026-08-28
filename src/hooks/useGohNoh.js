import { useEffect, useState } from 'react'
import { executeDataView } from '../data'

function areaIdOf(row) {
  const combo = row.area_level_combinations
  if (!Array.isArray(combo) || combo.length === 0) return null
  return combo[combo.length - 1]?.area_id ?? null
}

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
