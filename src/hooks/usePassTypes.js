import { useDomainData } from './useDomainData'

export function usePassTypes() {
  const { records, loading, error, creating, updating, create, update, remove } =
    useDomainData({ domain: 'jfb_pass_types', system: 'core' })
  return { passTypes: records, loading, error, creating, updating, create, update, remove }
}
