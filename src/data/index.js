import axios from 'axios'
import { requestNewToken, setAuthToken } from '../helpers/pivotlyHelpers'
import { FETCH_PAGE_SIZE } from '../constants/pagination'

const ENVIRONMENTS = {
  local: { apiPrefix: '', fallbackApiBaseUrl: 'https://dev.pivotly.com/vm/api/v3' },
  dev: { apiPrefix: '/vm', fallbackApiBaseUrl: 'https://dev.pivotly.com/vm/api/v3' },
  jfb: { fixedApiBaseUrl: 'https://app-jfbrennan-dev-core-api-cus-001.azurewebsites.net/vm/api/v3' },
}

const ENVIRONMENT = 'jfb'

const { apiPrefix = '', fallbackApiBaseUrl, fixedApiBaseUrl } = ENVIRONMENTS[ENVIRONMENT]
const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || fixedApiBaseUrl || fallbackApiBaseUrl

function resolveApiBase() {
  if (fixedApiBaseUrl) {
    return fixedApiBaseUrl
  }

  const runtimeConfig = window.__PIVOTLY_RUNTIME_CONFIG__;
  if (!runtimeConfig?.apiBaseUrl) {
    return DEFAULT_API_BASE_URL
  }

  let parentOrigin
  try {
    parentOrigin = window.parent.location.origin
  } catch {
    parentOrigin = ''
  }
  if (!parentOrigin && document.referrer) {
    try {
      parentOrigin = new URL(document.referrer).origin
    } catch {
      parentOrigin = ''
    }
  }

  if (!parentOrigin) {
    return DEFAULT_API_BASE_URL
  }

  return parentOrigin + apiPrefix + runtimeConfig.apiBaseUrl
}

const API_BASE_URL = resolveApiBase()

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

export const applyAuthToken = (token) => setAuthToken(api, token)

export const applyAppSlug = (appSlug) => {
  if (appSlug) {
    api.defaults.headers.common['x-app-slug'] = appSlug
  } else {
    delete api.defaults.headers.common['x-app-slug']
  }
}

api.interceptors.response.use(
  response => response,
  async error => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const newToken = await requestNewToken(api)
        original.headers['Authorization'] = `Bearer ${newToken}`
        return api(original)
      } catch (refreshError) {
        return Promise.reject(refreshError)
      }
    }
    const backendMessage = error.response?.data?.message
    if (backendMessage) {
      error.message = backendMessage
    }
    return Promise.reject(error)
  }
)

export async function fetchPageDetails(appSlug, pageSlug) {
  const { data } = await api.get(`/native-apps/${appSlug}/pages/${pageSlug}/resolve`)
  console.log('Fetched page details:', data)
  return data
}
const ROLE_USERS_MAX_PAGE_SIZE = 100

export async function fetchRoleUsersPage(roleId, { page = 1, pageSize = FETCH_PAGE_SIZE, search, userId } = {}) {
  const filterModel = []
  const term = String(search ?? '').trim()
  if (term) filterModel.push({ field: 'displayName', operator: 'contains', value: term })
  if (userId) filterModel.push({ field: 'userId', operator: 'equals', value: userId })
  const size = Math.min(pageSize, ROLE_USERS_MAX_PAGE_SIZE)
  const { data } = await api.get(`/iam/user-roles/role/${roleId}/users`, {
    params: {
      page: page - 1,
      pageSize: size,
      sortModel: JSON.stringify([{ field: 'displayName', sort: 'asc' }]),
      ...(filterModel.length ? { filterModel: JSON.stringify(filterModel) } : {}),
    },
  })
  const rows = data?.data ?? []
  const total = data?.pagination?.total_records ?? null
  return { rows, total, hasNext: total != null ? page * size < total : rows.length === size }
}

export async function fetchUsersByDisplayName(name, { pageSize = 20 } = {}) {
  const { data } = await api.get('/iam/users', {
    params: {
      page: 0,
      pageSize,
      filterModel: JSON.stringify([{ field: 'displayName', operator: 'contains', value: name }]),
    },
  })
  return data?.data ?? []
}

export async function fetchRoleByCode(code) {
  const { data } = await api.get('/iam/roles', {
    params: {
      pageSize: 1,
      filterModel: JSON.stringify([{ field: 'code', operator: 'equals', value: code }]),
    },
  })
  const rows = data?.data ?? data ?? []
  return rows[0] ?? null
}

export async function fetchPicklistValues(slug) {
  const { data } = await api.get(`/picklists/${slug}/values`)
  return data?.data ?? data ?? []
}

export async function executeDataView(slug, parameters) {
  const { data } = await api.post(`/data-views/${slug}/execute`, { parameters })
  return data?.data ?? []
}

export const REPORT_TIMEOUT_MS = 120000

export async function executeReport(slug, { parameters, filters } = {}) {
  const { data } = await api.post(`/reports/${slug}/execute?wait=true`, { parameters, filters }, { timeout: REPORT_TIMEOUT_MS })
  return data?.data ?? data
}

export async function fetchFileById(fileId) {
  const { data } = await api.get(`/files/${fileId}`)
  return data?.data ?? data
}

export async function fetchCurrentUser() {
  const { data } = await api.get('/me')
  return data?.data ?? data
}

const MAX_PAGED_ROWS = 50000

let truncationListener = null

export function setTruncationListener(fn) {
  truncationListener = fn
}

function onTruncation(detail) {
  if (truncationListener) truncationListener(detail)
}

export async function fetchDomainRecords({ domain, system, appSlug, limit = 25, offset = 0, filters, sortCol, sortDir, countMode, forceMeta, includeDeleted, selectCols, paged = false }) {
  const { data } = await api.post('/core-data-read', {
    parameters: {
      domain, system, app_slug: appSlug, limit, offset,
      ...(filters ? { filters } : {}),
      ...(sortCol ? { sort_col: sortCol } : {}),
      ...(sortDir ? { sort_dir: sortDir } : {}),
      ...(countMode ? { count_mode: countMode } : {}),
      ...(forceMeta ? { force_meta: forceMeta } : {}),
      ...(includeDeleted ? { include_deleted_records: true } : {}),
      ...(selectCols?.length ? { select_cols: selectCols } : {}),
    },
  })

  if (!paged && data?.meta?.has_more === true && limit > 1) {
    const message = `[core-data-read] TRUNCATED: ${domain} returned ${limit} rows at offset ${offset} and more exist — this caller is working from partial data.`
    console.warn(message, { domain, limit, offset, filters })
    onTruncation({ domain, limit, offset, filters, message })
  }
  return data
}

export async function* iterateDomainRecords({ domain, system, appSlug, filters, sortCol, sortDir, includeDeleted, selectCols, pageSize = FETCH_PAGE_SIZE }) {
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetchDomainRecords({
      domain, system, appSlug, filters, sortCol, sortDir, includeDeleted, selectCols,
      limit: pageSize, offset, countMode: 'none', paged: true,
    })
    const page = Array.isArray(res) ? res : (res?.data ?? [])
    if (page.length) yield page
    if (page.length < pageSize || res?.meta?.has_more === false) return
  }
}

export async function fetchAllDomainRecords(options) {
  const all = []
  for await (const page of iterateDomainRecords(options)) {
    all.push(...page)
    if (all.length > MAX_PAGED_ROWS) {
      throw new Error(`${options.domain} exceeded ${MAX_PAGED_ROWS} rows while paging — refusing to keep loading.`)
    }
  }
  return all
}

export async function fetchRecordPage({ domain, system = 'core', appSlug, filters, sortCol, sortDir, page = 1, pageSize = FETCH_PAGE_SIZE }) {
  const res = await fetchDomainRecords({
    domain, system, appSlug, filters, sortCol, sortDir,
    limit: pageSize, offset: (page - 1) * pageSize, countMode: 'none', paged: true,
  })
  const rows = res?.data ?? []
  return { rows: rows.slice(0, pageSize), hasNext: res?.meta?.has_more === true }
}

export async function fetchFirstRecord({ domain, system = 'core', appSlug, filters, sortCol, sortDir }) {
  const { rows } = await fetchRecordPage({ domain, system, appSlug, filters, sortCol, sortDir, pageSize: 1 })
  return rows[0] ?? null
}

export async function fetchNextSortOrder({ domain, system = 'core', appSlug, filters, step = 10 }) {
  const last = await fetchFirstRecord({ domain, system, appSlug, filters, sortCol: 'sort_order', sortDir: 'desc' })
  return (Number(last?.sort_order) || 0) + step
}

export async function fetchRecordsByField({ domain, system = 'core', appSlug, field = 'id', values, filters, sortCol, sortDir }) {
  const unique = [...new Set((values ?? []).filter((v) => v != null))]
  if (!unique.length) return []
  return fetchAllDomainRecords({ domain, system, appSlug, filters: { ...filters, [field]: unique }, sortCol, sortDir })
}

export function likeFilter(search) {
  const term = String(search ?? '').replace(/[*?]/g, '').trim()
  return term ? { like: `*${term}*` } : undefined
}

export function readWrittenRecordId(res) {
  const record = res?.data?.data?.data ?? res?.data?.data ?? res?.data ?? res
  return record?.id ?? record?.core_record_id ?? null
}
export async function createDomainRecord({ domain, system, appSlug, recordData }) {
  const { data } = await api.post('/core-data-write', {
    parameters: {
      domain,
      system,
      operation: 'insert',
      latency: 'synchronous',
      app_slug: appSlug,
    },
    data: recordData,
  })
  return data
}

export async function updateDomainRecord({ domain, system, appSlug, recordId, recordData, extraParameters }) {
  const { data } = await api.post('/core-data-write', {
    parameters: {
      domain,
      system,
      operation: 'update',
      latency: 'synchronous',
      app_slug: appSlug,
      core_record_id: recordId,
      ...extraParameters,
    },
    data: recordData,
  })
  return data
}

export async function deleteDomainRecord({ domain, system, appSlug, recordId }) {
  const { data } = await api.post('/core-data-write', {
    parameters: {
      domain,
      system,
      operation: 'delete',
      latency: 'synchronous',
      app_slug: appSlug,
      core_record_id: recordId,
    },
    data: {},
  })
  return data
}

function uniqueFileName(name) {
  const match = /\.[a-z0-9]{1,5}\.gz$/i.exec(name) ?? /\.[^.]+$/.exec(name)
  const ext = match && match.index > 0 ? match[0] : ''
  const base = ext ? name.slice(0, -ext.length) : name
  const safeBase = base.replace(/[^\x20-\x7E]/g, '_').trim() || 'file'
  return `${safeBase}-${crypto.randomUUID().slice(0, 8)}${ext}`
}

export async function uploadAttachment({ coreRecordId, domain, file, tags, timeout, onUploadProgress }) {
  const form = new FormData()
  if (tags?.length) form.append('tags', JSON.stringify(tags))
  form.append('file', file, uniqueFileName(file.name))
  const { data } = await api.post(`/attachments/${coreRecordId}/${domain}/save`, form, {
    headers: { 'Content-Type': undefined },
    ...(timeout != null ? { timeout } : {}),
    ...(onUploadProgress ? { onUploadProgress } : {}),
  })
  return data?.data ?? data
}

export async function getAttachments({ coreRecordId, domain, pageSize = FETCH_PAGE_SIZE }) {
  const all = []
  for (let page = 0; ; page++) {
    const { data } = await api.get(`/attachments/${domain}/${coreRecordId}`, {
      params: { page, pageSize },
    })
    const result = data?.data ?? data
    const rows = result?.rows ?? []
    all.push(...rows)
    if (rows.length < pageSize) return all
  }
}

export async function fetchPublicAsset(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.blob()
}

export async function fetchExternalJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.json()
}

export async function downloadAttachment(fileId) {
  const { data } = await api.get(`/attachments/${fileId}/download`, {
    responseType: 'blob',
  })
  return data
}

export async function deleteAttachment({ fileId, domain, coreRecordId }) {
  const { data } = await api.delete(
    `/attachments/file/${fileId}/domain/${domain}/core-record/${coreRecordId}`,
  )
  return data
}
