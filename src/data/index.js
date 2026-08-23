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
    // Every catch block in this app reads e.message. Left alone, a failed
    // request surfaces axios's generic "Request failed with status code
    // 500" instead of the backend's actual reason -- unwrap it here once,
    // for every call, rather than in each function.
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
export async function fetchPicklistValues(slug) {
  const { data } = await api.get(`/picklists/${slug}/values`)
  return data?.data ?? data ?? []
}

// The platform's internal user UUID is NOT any claim on the JWT itself --
// the backend resolves it server-side (oid/sub/email -> IAM user lookup,
// see Portal_Independent_Backend's user-context.plugin.ts) and hands it
// back here as `id`. Use this for any uuid FK that means "the current
// user" (e.g. uploaded_by) instead of decoding the token client-side.
export async function fetchCurrentUser() {
  const { data } = await api.get('/me')
  return data?.data ?? data
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

// The write envelope's nesting isn't fully consistent (per
// Portal_Independent_Frontend's own app-builder guidance, which recommends
// trying result?.data?.data?.data / result?.data?.data / result?.data /
// result in that order) -- this pulls a just-created record's id out of
// whichever level it landed on.
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

// Uploads a file and links it to a domain record via the Pivotly Attachments
// API (Portal_Independent_Backend: POST /:coreRecordId/:domain/save). Content-Type
// is left unset so the browser fills in the multipart boundary itself -- the
// shared `api` instance's default 'application/json' header would otherwise
// produce a malformed request body.
export async function uploadAttachment({ coreRecordId, domain, file }) {
  const form = new FormData()
  form.append('file', file, file.name)
  const { data } = await api.post(`/attachments/${coreRecordId}/${domain}/save`, form, {
    headers: { 'Content-Type': undefined },
  })
  return data?.data ?? data
}

// Downloads an attachment's bytes as a Blob. The route requires the same
// Bearer auth header as every other call here, so a plain <img src> can't
// point at it directly -- callers must fetch the blob and wrap it in
// URL.createObjectURL for display.
export async function downloadAttachment(fileId) {
  const { data } = await api.get(`/attachments/${fileId}/download`, {
    responseType: 'blob',
  })
  return data
}

// Soft-deletes an attachment. Route shape confirmed from
// Portal_Independent_Backend/src/routes/attachments.routes.ts -- NOT the
// simpler `/:attachmentId` shape the subsystem's own docs describe.
export async function deleteAttachment({ fileId, domain, coreRecordId }) {
  const { data } = await api.delete(
    `/attachments/file/${fileId}/domain/${domain}/core-record/${coreRecordId}`,
  )
  return data
}
