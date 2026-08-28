import { useDomainData } from './useDomainData'

export function useOperators(projectId) {
  const { records: operatorRecords, loading: operatorsLoading, error: operatorsError, creating, updating, create, update, remove } =
    useDomainData({ domain: 'jfb_operators', system: 'core' })
  const { records: linkRecords, loading: linksLoading, error: linksError } =
    useDomainData({ domain: 'jfb_project_operators', system: 'core', projectId })

  if (!projectId) {
    return { operators: operatorRecords, loading: operatorsLoading, error: operatorsError, creating, updating, create, update, remove }
  }

  const operatorsById = new Map(operatorRecords.map((o) => [o.id, o]))
  const operators = linkRecords
    .filter((link) => link.is_active !== false)
    .map((link) => operatorsById.get(link.operator_id))
    .filter(Boolean)

  return {
    operators,
    loading: operatorsLoading || linksLoading,
    error: operatorsError || linksError,
    creating,
    updating,
    create,
    update,
    remove,
  }
}
