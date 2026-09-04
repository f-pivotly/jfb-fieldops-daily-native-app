import { useDomainData } from './useDomainData'

export function useWorkTypes() {
  const { records, loading, error } = useDomainData({ domain: 'jfb_work_types', system: 'core' })
  return { workTypes: records, loading, error }
}
