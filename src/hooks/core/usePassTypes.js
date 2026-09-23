import { usePicklist } from './usePicklist'

export function usePassTypes(workType) {
  const pass = usePicklist('pkl-jfb-pass-type')
  const lift = usePicklist('pkl-jfb-lift')
  const wt = String(workType ?? '').toLowerCase()
  const scoped = wt.includes('cap') || wt.includes('placement') ? lift : pass
  return {
    labels: { ...pass.labels, ...lift.labels },
    values: scoped.values,
    loading: pass.loading || lift.loading,
  }
}
