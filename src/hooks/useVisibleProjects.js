import { useEffect, useState } from 'react'
import { useAppConfig } from '../contexts/appConfigContext'
import { useFieldOpsAction, useFieldOpsAccessLoading } from '../contexts/fieldOpsAccessContext'
import { useDomainData } from './useDomainData'
import { executeDataView } from '../data'

// Cross-project roles (director/admin) see every active project. pe/pm only
// see projects they're linked to in jfb_project_members, resolved server-side
// by dvw-jfb-visible-projects (joins jfb_projects to jfb_project_members and
// filters by the logged-in user's token email — the client has no other way
// to resolve its own Pivotly user id — see PIVOTLY_IAM_FINDINGS discussion).
// Previously this fetched every jfb_project_members row client-side and
// filtered in JS; the data view does that join+filter in SQL instead, so a
// pe/pm's browser never sees other users' project assignments.
export function useVisibleProjects() {
  const { config } = useAppConfig()
  const isCrossProject = useFieldOpsAction('manage_team')
  const accessLoading = useFieldOpsAccessLoading()
  const myEmail = (config.user?.email || '').trim().toLowerCase()

  const { records: allProjects, loading: projectsLoading, error: projectsError, reload: reloadProjects } =
    useDomainData({ domain: 'jfb_projects', system: 'core' })

  const [myProjects, setMyProjects] = useState([])
  const [myProjectsLoading, setMyProjectsLoading] = useState(true)
  const [myProjectsError, setMyProjectsError] = useState(null)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    if (accessLoading || isCrossProject || !myEmail) return
    let cancelled = false
    setMyProjectsLoading(true)
    setMyProjectsError(null)
    executeDataView('dvw-jfb-visible-projects', { p_email: myEmail })
      .then((rows) => {
        if (!cancelled) setMyProjects(rows)
      })
      .catch((err) => {
        if (!cancelled) setMyProjectsError(err.message)
      })
      .finally(() => {
        if (!cancelled) setMyProjectsLoading(false)
      })
    return () => { cancelled = true }
  }, [accessLoading, isCrossProject, myEmail, reloadTick])

  const loading = accessLoading || projectsLoading || (!isCrossProject && myProjectsLoading)
  const error = projectsError || (!isCrossProject ? myProjectsError : null)

  let visibleProjects = []
  if (!loading) {
    visibleProjects = isCrossProject ? allProjects : myProjects
  }

  function reload() {
    reloadProjects()
    setReloadTick((t) => t + 1)
  }

  return { projects: visibleProjects, loading, error, reload, isCrossProject }
}
