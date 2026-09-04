import axios from 'axios'
import { requestNewToken, setAuthToken } from '../helpers/pivotlyHelpers'

const IS_LOCAL = true

function resolveApiBase() {
  const runtimeConfig = window.__PIVOTLY_RUNTIME_CONFIG__;
  if (!runtimeConfig?.apiBaseUrl) {
    return import.meta.env.VITE_API_BASE_URL || 'https://dev.pivotly.com/vm/api/v3'
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
    return import.meta.env.VITE_API_BASE_URL || 'https://dev.pivotly.com/vm/api/v3'
  }

  const apiPath = IS_LOCAL
    ? runtimeConfig.apiBaseUrl
    : '/vm' + runtimeConfig.apiBaseUrl

  return parentOrigin + apiPath
}

export const API_BASE_URL = resolveApiBase()
export const FILE_BASE_URL =
  import.meta.env.VITE_FILE_BASE_URL || 'http://localhost:3000/files'

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

export async function fetchNavItems(appSlug) {
  const { data } = await api.get(`/native-apps/${appSlug}/resolve`)
  console.log('Fetched nav items:', data)
  return data?.data?.app?.pages
}

export async function fetchPageDetails(appSlug, pageSlug) {
  const { data } = await api.get(`/native-apps/${appSlug}/pages/${pageSlug}/resolve`)
  console.log('Fetched page details:', data)
  return data
}
export async function fetchRoleUsers(roleId) {
  const { data } = await api.get(`/iam/user-roles/role/${roleId}/users`, {
    params: { pageSize: 100 },
  })
  return data?.data ?? data ?? []
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

export async function executeReport(slug, { parameters, filters } = {}) {
  const { data } = await api.post(`/reports/${slug}/execute?wait=true`, { parameters, filters })
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

export async function fetchDomainRecords({ domain, system, appSlug, limit = 25, offset = 0, filters, sortCol, sortDir, countMode, forceMeta, includeDeleted }) {
  const { data } = await api.post('/core-data-read', {
    parameters: {
      domain, system, app_slug: appSlug, limit, offset,
      ...(filters ? { filters } : {}),
      ...(sortCol ? { sort_col: sortCol } : {}),
      ...(sortDir ? { sort_dir: sortDir } : {}),
      ...(countMode ? { count_mode: countMode } : {}),
      ...(forceMeta ? { force_meta: forceMeta } : {}),
      ...(includeDeleted ? { include_deleted_records: true } : {}),
    },
  })
  return data
}

export function readTotalRecords(res) {
  return res?.pagination?.total_records ?? res?.meta?.total_records ?? 0
}

export function readWrittenRecordId(res) {
  const record = res?.data?.data?.data ?? res?.data?.data ?? res?.data ?? res
  return record?.id ?? record?.core_record_id ?? null
}
export async function fetchDomainRecordCount({ domain, system, appSlug, filters }) {
  const res = await fetchDomainRecords({
    domain, system, appSlug, filters,
    limit: 1, offset: 0,
    countMode: 'auto', forceMeta: true,
  })
  return readTotalRecords(res)
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

// The backend stores the uploaded filename as-is in a column with a
// uniqueness constraint scoped per attachment domain -- two uploads of a
// same-named file (even for different projects/records) collide. Suffixing
// a short random id keeps the name recognizable while guaranteeing
// uniqueness; callers that need the true original name should save it
// themselves (e.g. in a domain's own *_original_name column) since the
// server only ever sees this suffixed one.
function uniqueFileName(name) {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  return `${base}-${crypto.randomUUID().slice(0, 8)}${ext}`
}

export async function uploadAttachment({ coreRecordId, domain, file }) {
  const form = new FormData()
  form.append('file', file, uniqueFileName(file.name))
  const { data } = await api.post(`/attachments/${coreRecordId}/${domain}/save`, form, {
    headers: { 'Content-Type': undefined },
  })
  return data?.data ?? data
}

// Lists attachments for a core record in a domain -- used right after
// uploadAttachment to read back the storage_path the server assigned
// (uploadAttachment's response only returns the new fileId).
export async function getAttachments({ coreRecordId, domain, pageSize = 50 }) {
  const { data } = await api.get(`/attachments/${domain}/${coreRecordId}`, {
    params: { page: 0, pageSize },
  })
  const result = data?.data ?? data
  return result?.rows ?? []
}

export async function fetchPublicAsset(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.blob()
}

// For external (non-Pivotly) JSON APIs, e.g. the USGS basemap metadata call
// in lib/dredge/aerial.js -- lint forbids fetch() outside this file.
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
