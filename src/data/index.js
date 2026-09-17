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

  if (data?.meta?.has_more === true && limit > 1) {
    console.warn(
      `[core-data-read] TRUNCATED: ${domain} returned ${limit} rows at offset ${offset} and more exist — this caller is working from partial data.`,
      { domain, limit, offset, filters },
    )
  }
  return data
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
