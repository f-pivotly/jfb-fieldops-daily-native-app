const DB_NAME = 'ofa-offline-db'
const VERSION = 1

const STORE_RECORDS = 'records_ofa_person'
const STORE_QUEUE = 'sync_queue'
const STORE_SHELL = 'app_shell_cache'

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        db.createObjectStore(STORE_RECORDS, { keyPath: 'local_id' })
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'local_id' })
      }
      if (!db.objectStoreNames.contains(STORE_SHELL)) {
        db.createObjectStore(STORE_SHELL, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function store(db, name, mode) {
  return db.transaction(name, mode).objectStore(name)
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putPersonRecord(record) {
  const db = await openDB()
  return wrap(store(db, STORE_RECORDS, 'readwrite').put(record))
}

export async function getAllPersonRecords() {
  const db = await openDB()
  return wrap(store(db, STORE_RECORDS, 'readonly').getAll())
}

export async function deletePersonRecord(localId) {
  const db = await openDB()
  return wrap(store(db, STORE_RECORDS, 'readwrite').delete(localId))
}

export async function enqueueSync(item) {
  const db = await openDB()
  return wrap(store(db, STORE_QUEUE, 'readwrite').put(item))
}

export async function getAllQueueItems() {
  const db = await openDB()
  return wrap(store(db, STORE_QUEUE, 'readonly').getAll())
}

export async function deleteQueueItem(localId) {
  const db = await openDB()
  return wrap(store(db, STORE_QUEUE, 'readwrite').delete(localId))
}

export async function setShellCache(key, value) {
  const db = await openDB()
  return wrap(store(db, STORE_SHELL, 'readwrite').put({ key, value }))
}

export async function getShellCache(key) {
  const db = await openDB()
  const row = await wrap(store(db, STORE_SHELL, 'readonly').get(key))
  return row?.value
}
