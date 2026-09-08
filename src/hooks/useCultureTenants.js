import { useDomainData } from './useDomainData'

export function useCultureTenants() {
  const { records, loading, error } =
    useDomainData({ domain: 'jfb_culture_tenants', system: 'core' })
  return { cultureTenants: records, loading, error }
}
