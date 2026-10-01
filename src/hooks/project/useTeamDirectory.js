import { useCallback, useEffect, useState } from 'react'
import {
  createDomainRecord, deleteDomainRecord, fetchAllDomainRecords, fetchRecordsByField,
  fetchRoleByCode, fetchRoleUsersPage, updateDomainRecord,
} from '../../data'
import { useAppConfig } from '../../contexts/appConfigContext'

const MEMBERS_DOMAIN = 'jfb_project_members'
const ROLE_USERS_PAGE_SIZE = 100

export const TEAM_ROLES = [
  { code: 'jfb_project_engineers', label: 'PE' },
  { code: 'jfb_project_managers', label: 'PM' },
]

async function fetchAllRoleUsers(roleId) {
  const all = []
  for (let page = 1; ; page += 1) {
    const { rows, hasNext } = await fetchRoleUsersPage(roleId, { page, pageSize: ROLE_USERS_PAGE_SIZE })
    all.push(...rows)
    if (!hasNext || !rows.length) return all
  }
}

async function loadDirectory(appSlug) {
  const roles = await Promise.all(TEAM_ROLES.map(async (r) => ({ ...r, id: (await fetchRoleByCode(r.code))?.id ?? null })))
  const roleUsers = await Promise.all(roles.map((r) => (r.id ? fetchAllRoleUsers(r.id) : [])))
  const usersById = new Map()
  roles.forEach((r, i) => {
    for (const u of roleUsers[i]) {
      if (!u?.userId) continue
      const entry = usersById.get(u.userId) ?? { ...u, roles: [] }
      if (!entry.roles.includes(r.label)) entry.roles.push(r.label)
      usersById.set(u.userId, entry)
    }
  })
  const links = await fetchAllDomainRecords({ domain: MEMBERS_DOMAIN, system: 'core', appSlug })
  const projects = await fetchRecordsByField({ domain: 'jfb_projects', appSlug, values: links.map((l) => l.project_id) })
  return {
    usersById,
    links,
    projectsById: new Map(projects.map((p) => [p.id, p])),
    missingRoles: roles.filter((r) => !r.id).map((r) => r.code),
  }
}

export function useTeamDirectory() {
  const { config } = useAppConfig()
  const appSlug = config.appSlug
  const [reloadToken, setReloadToken] = useState(0)
  const key = `${appSlug}|${reloadToken}`
  const [state, setState] = useState({ key: null, data: null, error: null })

  useEffect(() => {
    let cancelled = false
    loadDirectory(appSlug)
      .then((data) => { if (!cancelled) setState({ key, data, error: null }) })
      .catch((err) => { if (!cancelled) setState((s) => ({ key, data: s.data, error: err.message })) })
    return () => { cancelled = true }
  }, [key, appSlug])

  const reload = useCallback(() => setReloadToken((n) => n + 1), [])
  const links = state.data?.links

  const addMembership = useCallback(async (user, projectId) => {
    const existing = (links ?? []).find((l) => l.user_id === user.userId && l.project_id === projectId)
    if (existing) {
      await updateDomainRecord({ domain: MEMBERS_DOMAIN, system: 'core', appSlug, recordId: existing.id, recordData: { is_active: true } })
    } else {
      await createDomainRecord({
        domain: MEMBERS_DOMAIN, system: 'core', appSlug,
        recordData: { project_id: projectId, user_id: user.userId, email: user.email ?? null, is_active: true },
      })
    }
    reload()
  }, [links, appSlug, reload])

  const setMembershipActive = useCallback(async (link, isActive) => {
    await updateDomainRecord({ domain: MEMBERS_DOMAIN, system: 'core', appSlug, recordId: link.id, recordData: { is_active: isActive } })
    reload()
  }, [appSlug, reload])

  const removeMembership = useCallback(async (link) => {
    await deleteDomainRecord({ domain: MEMBERS_DOMAIN, system: 'core', appSlug, recordId: link.id })
    reload()
  }, [appSlug, reload])

  return {
    data: state.data,
    error: state.error,
    loading: state.key !== key,
    reload,
    addMembership,
    setMembershipActive,
    removeMembership,
  }
}
