import { useDomainData } from './useDomainData'

export function useDelayCodes() {
  const { records, loading, error, creating, updating, create, update, remove } =
    useDomainData({ domain: 'jfb_delay_codes', system: 'core' })
  return { delayCodes: records, loading, error, creating, updating, create, update, remove }
}
