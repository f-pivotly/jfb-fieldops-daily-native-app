import { stepSecs } from './steps'

export function assignLayers(steps, windows) {
  const sorted = [...windows].sort((a, b) => a.toSecs - a.fromSecs - (b.toSecs - b.fromSecs))
  return steps.map((s) => {
    const secs = stepSecs(s)
    if (secs == null) return { ...s, layerId: s.layerId ?? null }
    const win = sorted.find((w) => secs >= w.fromSecs && secs <= w.toSecs)
    return { ...s, layerId: win ? win.layerId : null }
  })
}
