import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchDomainRecords, createDomainRecord, updateDomainRecord } from '../data'
import { useAppConfig } from '../contexts/appConfigContext'
import {
  getAllPersonRecords,
  putPersonRecord,
  deletePersonRecord,
  getAllQueueItems,
  enqueueSync,
  deleteQueueItem,
} from '../data/offlineDb'

const MAX_SYNC_ATTEMPTS = 10
const SYNC_INTERVAL_MS = 30000

function nowIso() {
  return new Date().toISOString()
}

export function useOfflinePersonRoster({ domain, system }) {
  const { config } = useAppConfig()
  const appSlug = config.appSlug

  const [records, setRecords] = useState([])
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [cachedOnly, setCachedOnly] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const syncingRef = useRef(false)

  const refreshLocalState = useCallback(async () => {
    const [freshRecords, freshQueue] = await Promise.all([
      getAllPersonRecords(),
      getAllQueueItems(),
    ])
    setRecords(freshRecords)
    setQueue(freshQueue)
  }, [])

  const syncOneItem = useCallback(async (item) => {
    try {
      if (item.op === 'create') {
        const existingRes = await fetchDomainRecords({
          domain, system, appSlug, filters: { local_id: item.local_id },
        })
        const existingRecords = Array.isArray(existingRes) ? existingRes : (existingRes?.data ?? [])
        let serverRecord = existingRecords[0]
        if (!serverRecord) {
          const res = await createDomainRecord({ domain, system, appSlug, recordData: item.payload })
          serverRecord = res?.data ?? res
        }
        const local = (await getAllPersonRecords()).find((r) => r.local_id === item.local_id)
        await putPersonRecord({ ...local, ...serverRecord, local_id: item.local_id, _pending: false })
        await deleteQueueItem(item.local_id)
      } else if (item.op === 'update') {
        const local = (await getAllPersonRecords()).find((r) => r.local_id === item.local_id)
        if (!local?.id) throw new Error('Record has not synced yet — cannot update')
        await updateDomainRecord({ domain, system, appSlug, recordId: local.id, recordData: item.payload })
        await putPersonRecord({ ...local, ...item.payload, _pending: false })
        await deleteQueueItem(item.local_id)
      }
    } catch (err) {
      const attempts = (item.attempts ?? 0) + 1
      await enqueueSync({
        ...item,
        status: attempts >= MAX_SYNC_ATTEMPTS ? 'failed' : 'pending',
        attempts,
        last_error: err.message,
      })
    }
  }, [domain, system, appSlug])

  const syncQueueNow = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine || !domain || !system) return
    syncingRef.current = true
    try {
      const items = await getAllQueueItems()
      for (const item of items) {
        if (item.status === 'failed') continue
        await syncOneItem(item)
      }
    } finally {
      syncingRef.current = false
      await refreshLocalState()
    }
  }, [domain, system, syncOneItem, refreshLocalState])

  const reconcileFromNetwork = useCallback(() => {
    if (!domain || !system) return Promise.resolve()
    return fetchDomainRecords({ domain, system, appSlug })
      .then(async (res) => {
        const serverRecords = Array.isArray(res) ? res : (res?.data ?? [])
        const cached = await getAllPersonRecords()
        const pendingOnly = cached.filter((r) => r._pending)
        await Promise.all(cached.filter((r) => !r._pending).map((r) => deletePersonRecord(r.local_id)))
        const freshSynced = serverRecords.map((r) => ({ ...r, local_id: r.local_id || r.id, _pending: false }))
        await Promise.all(freshSynced.map(putPersonRecord))
        setRecords([...freshSynced, ...pendingOnly])
        setCachedOnly(false)
        setLastSyncedAt(nowIso())
      })
      .catch(() => {
        setCachedOnly(true)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [domain, system, appSlug])

  useEffect(() => {
    let mounted = true
    getAllPersonRecords().then((cached) => { if (mounted) setRecords(cached) })
    getAllQueueItems().then((q) => { if (mounted) setQueue(q) })
    reconcileFromNetwork()
    return () => { mounted = false }
  }, [reconcileFromNetwork])

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
      syncQueueNow()
    }
    function handleOffline() {
      setIsOnline(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    syncQueueNow()
    const interval = setInterval(syncQueueNow, SYNC_INTERVAL_MS)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [syncQueueNow])

  const createPerson = useCallback(async (name) => {
    const local_id = crypto.randomUUID()
    const payload = { name, local_id }
    await putPersonRecord({ local_id, name, _pending: true })
    await enqueueSync({ local_id, op: 'create', payload, status: 'pending', attempts: 0, created_at: nowIso() })
    await refreshLocalState()
    if (navigator.onLine) syncQueueNow()
  }, [refreshLocalState, syncQueueNow])

  const updatePerson = useCallback(async (localId, patch) => {
    const existing = (await getAllPersonRecords()).find((r) => r.local_id === localId)
    if (!existing) return
    await putPersonRecord({ ...existing, ...patch, _pending: true })
    await enqueueSync({ local_id: localId, op: 'update', payload: patch, status: 'pending', attempts: 0, created_at: nowIso() })
    await refreshLocalState()
    if (navigator.onLine) syncQueueNow()
  }, [refreshLocalState, syncQueueNow])

  const retryFailed = useCallback(async (localId) => {
    const items = await getAllQueueItems()
    const item = items.find((i) => i.local_id === localId)
    if (!item) return
    await enqueueSync({ ...item, status: 'pending', attempts: 0 })
    await refreshLocalState()
    syncQueueNow()
  }, [refreshLocalState, syncQueueNow])

  const statusByLocalId = {}
  for (const item of queue) {
    statusByLocalId[item.local_id] = item.status === 'failed' ? 'Failed' : 'Pending'
  }
  const pendingCount = queue.filter((q) => q.status !== 'failed').length
  const failedCount = queue.filter((q) => q.status === 'failed').length

  return {
    records,
    loading,
    isOnline,
    cachedOnly,
    lastSyncedAt,
    pendingCount,
    failedCount,
    statusByLocalId,
    createPerson,
    updatePerson,
    retryFailed,
    reload: reconcileFromNetwork,
  }
}
