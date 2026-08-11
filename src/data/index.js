import axios from 'axios'
import { requestNewToken, setAuthToken } from '../helpers/PivotlyHelpers'

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
export async function fetchPicklistValues(slug) {
  const { data } = await api.get(`/picklists/${slug}/values`)
  return data?.data ?? data ?? []
}

export async function fetchDomainRecords({ domain, system, appSlug, limit = 25, offset = 0, filters, sortCol, sortDir, countMode, forceMeta }) {
  const { data } = await api.post('/core-data-read', {
    parameters: {
      domain, system, app_slug: appSlug, limit, offset,
      ...(filters ? { filters } : {}),
      ...(sortCol ? { sort_col: sortCol } : {}),
      ...(sortDir ? { sort_dir: sortDir } : {}),
      ...(countMode ? { count_mode: countMode } : {}),
      ...(forceMeta ? { force_meta: forceMeta } : {}),
    },
  })
  return data
}

export function readTotalRecords(res) {
  return res?.pagination?.total_records ?? res?.meta?.total_records ?? 0
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

export async function updateDomainRecord({ domain, system, appSlug, recordId, recordData }) {
  const { data } = await api.post('/core-data-write', {
    parameters: {
      domain,
      system,
      operation: 'update',
      latency: 'synchronous',
      app_slug: appSlug,
      core_record_id: recordId,
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
