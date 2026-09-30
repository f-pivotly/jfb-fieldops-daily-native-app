import { useEffect, useState } from 'react'
import { useAppConfig } from '../../contexts/appConfigContext'
import { useFieldOpsAction, useFieldOpsAccessLoading } from '../../contexts/fieldOpsAccessContext'
import { useDomainData } from '../core/useDomainData'
import { executeDataView } from '../../data'

export function useVisibleProjects({ loadAll = true } = {}) {
  const { config } = useAppConfig()
  const isCrossProject = useFieldOpsAction('manage_team')
  const accessLoading = useFieldOpsAccessLoading()
  const myEmail = (config.user?.email || '').trim().toLowerCase()

  const needAll = !accessLoading && isCrossProject && loadAll
  const { records: allProjects, loading: projectsLoading, error: projectsError, reload: reloadProjects } =
    useDomainData({ domain: needAll ? 'jfb_projects' : null, system: 'core' })

  const [myProjects, setMyProjects] = useState([])
  const [myProjectsLoading, setMyProjectsLoading] = useState(true)
  const [myProjectsError, setMyProjectsError] = useState(null)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    if (accessLoading || isCrossProject || !myEmail) return
    let cancelled = false
    setMyProjectsLoading(true)
    setMyProjectsError(null)
    executeDataView('dvw-jfb-visible-projects-v2', { p_email: myEmail })
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

  const loading = accessLoading || (needAll && projectsLoading) || (!isCrossProject && myProjectsLoading)
  const error = (needAll ? projectsError : null) || (!isCrossProject ? myProjectsError : null)

  let visibleProjects = []
  if (!loading) {
    visibleProjects = isCrossProject ? (needAll ? allProjects : []) : myProjects
  }

  function reload() {
    reloadProjects()
    setReloadTick((t) => t + 1)
  }

  return { projects: visibleProjects, loading, error, reload, isCrossProject }
}
