import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppConfig } from '../contexts/appConfigContext'
import { fetchPageDetails } from '../data'
import { useDomainData } from './useDomainData'

const FIELDOPS_PAGE_SLUG = 'apg-jfb-fieldops'
const CROSS_PROJECT_ACTION_KEY = 'manage_team'

// Cross-project roles (director/admin) see every active project. pe/pm only
// see projects they're linked to in jfb_project_members, matched by the
// logged-in user's token email (the client has no other way to resolve its
// own Pivotly user id — see PIVOTLY_IAM_FINDINGS discussion).
export function useVisibleProjects() {
  const { config, ready } = useAppConfig()
  const [isCrossProject, setIsCrossProject] = useState(null) // null = still resolving
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const resolveAccess = useCallback(() => {
    if (!ready || !config.appSlug) return Promise.resolve()
    return fetchPageDetails(config.appSlug, FIELDOPS_PAGE_SLUG)
      .then((res) => {
        const actions = res?.data?.actions ?? []
        const match = actions.find((a) => a.action_key === CROSS_PROJECT_ACTION_KEY)
        if (mountedRef.current) setIsCrossProject(!!match?.enabled)
      })
      .catch(() => {
        // Fail closed to project-scoped (the more restrictive behavior) rather
        // than accidentally showing every project on a transient error.
        if (mountedRef.current) setIsCrossProject(false)
      })
  }, [ready, config.appSlug])

  useEffect(() => {
    resolveAccess()
  }, [resolveAccess])

  const { records: allProjects, loading: projectsLoading, error: projectsError, reload: reloadProjects } =
    useDomainData({ domain: 'jfb_projects', system: 'core' })
  const { records: members, loading: membersLoading, error: membersError } =
    useDomainData({ domain: 'jfb_project_members', system: 'core' })

  const loading = isCrossProject === null || projectsLoading || (!isCrossProject && membersLoading)
  const error = projectsError || membersError

  let visibleProjects = []
  if (!loading) {
    if (isCrossProject) {
      visibleProjects = allProjects
    } else {
      const myEmail = (config.user?.email || '').trim().toLowerCase()
      const myProjectIds = new Set(
        members
          .filter((m) => m.is_active !== false && (m.email || '').trim().toLowerCase() === myEmail)
          .map((m) => m.project_id)
      )
      visibleProjects = allProjects.filter((p) => myProjectIds.has(p.id))
    }
  }

  return { projects: visibleProjects, loading, error, reload: reloadProjects, isCrossProject }
}
