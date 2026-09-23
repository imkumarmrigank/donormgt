const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const DEFAULT_GET_CACHE_TTL_MS = 60_000
const MASTER_DATA_CACHE_TTL_MS = 10 * 60_000
const SESSION_EXPIRY_SKEW_SECONDS = 5 * 60
const REQUEST_TIMEOUT_MS = 15_000
const MAX_REQUEST_RETRIES = 2

const getRequestCache = new Map()
let refreshPromise = null

function getAuthToken() {
  return localStorage.getItem('fp_id_token') || ''
}

function getTokenExpiryMs() {
  const value = Number(localStorage.getItem('fp_token_expires_at') || 0)
  return Number.isFinite(value) ? value : 0
}

function parseJwtExp(idToken) {
  try {
    const payload = JSON.parse(atob(String(idToken || '').split('.')[1] || ''))
    return Number(payload.exp || 0)
  } catch {
    return 0
  }
}

export function clearApiCache() {
  getRequestCache.clear()
}

export function invalidateApiCache(predicate) {
  if (!predicate) {
    clearApiCache()
    return
  }

  for (const [key, entry] of getRequestCache.entries()) {
    if (predicate(entry.path, entry)) getRequestCache.delete(key)
  }
}

function setSession(session) {
  clearApiCache()
  if (session?.idToken) localStorage.setItem('fp_id_token', session.idToken)
  if (session?.refreshToken) localStorage.setItem('fp_refresh_token', session.refreshToken)
  if (session?.user?.role) localStorage.setItem('fp_role', String(session.user.role).toLowerCase())
  const expiresInSeconds = Number(session?.expiresIn || 0)
  const tokenExpSeconds = parseJwtExp(session?.idToken)
  const fallbackSeconds = Math.max(60, expiresInSeconds || 3600)
  const expiresAtMs = tokenExpSeconds
    ? tokenExpSeconds * 1000
    : Date.now() + fallbackSeconds * 1000
  localStorage.setItem('fp_token_expires_at', String(expiresAtMs))
}

function clearSession() {
  clearApiCache()
  localStorage.removeItem('fp_id_token')
  localStorage.removeItem('fp_refresh_token')
  localStorage.removeItem('fp_role')
  localStorage.removeItem('fp_token_expires_at')
}

function toQuery(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') search.set(key, value)
    })

  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

function isFile(value) {
  return typeof File !== 'undefined' && value instanceof File
}

function appendFormDataValue(formData, key, value) {
  if (value === undefined || key.startsWith('_')) return
  if (isFile(value)) {
    formData.append(key, value)
    return
  }
  if (value === null) {
    formData.append(key, 'null')
    return
  }
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    formData.append(key, JSON.stringify(value))
    return
  }
  formData.append(key, String(value))
}

function toPartnerFormData(data = {}) {
  const formData = new FormData()
  Object.entries(data).forEach(([key, value]) => appendFormDataValue(formData, key, value))
  return formData
}

function cacheKey(path, token) {
  return `${token || 'anonymous'}::${path}`
}

function shouldRetry(error) {
  if (!error) return false
  if (error.name === 'AbortError') return true
  if (error.code === 'NETWORK_ERROR') return true
  return error.status >= 500
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (error.name !== 'AbortError' && !('status' in error)) {
      const networkError = new Error('Network request failed')
      networkError.code = 'NETWORK_ERROR'
      throw networkError
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function ensureFreshSession() {
  const token = getAuthToken()
  if (!token) return null
  const expiresAtMs = getTokenExpiryMs()
  const refreshAtMs = expiresAtMs - SESSION_EXPIRY_SKEW_SECONDS * 1000
  if (expiresAtMs && Date.now() < refreshAtMs) {
    return { idToken: token, expiresAt: expiresAtMs }
  }
  return refreshToken()
}

export async function apiFetch(path, options = {}) {
  const {
    cacheTtl = DEFAULT_GET_CACHE_TTL_MS,
    dedupe = true,
    force = false,
    retry = MAX_REQUEST_RETRIES,
    timeoutMs = REQUEST_TIMEOUT_MS,
    skipSessionRefresh = false,
    ...fetchOptions
  } = options

  const method = (fetchOptions.method || 'GET').toUpperCase()
  const token = getAuthToken()
  const shouldCacheGet = method === 'GET' && dedupe !== false
  const key = shouldCacheGet ? cacheKey(path, token) : ''

  if (shouldCacheGet && !force) {
    const cached = getRequestCache.get(key)
    const now = Date.now()
    if (cached?.data !== undefined && cached.expiresAt > now) return cached.data
    if (cached?.promise) return cached.promise
  }

  const request = (async () => {
    const headers = new Headers(fetchOptions.headers || {})

    if (!headers.has('Content-Type') && !(fetchOptions.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json')
    }
    let currentToken = token
    if (currentToken) {
      try {
        const refreshed = skipSessionRefresh ? null : await ensureFreshSession()
        currentToken = refreshed?.idToken || getAuthToken() || currentToken
      } catch {
        clearSession()
        throw new Error('Session expired, please login again')
      }
      headers.set('Authorization', `Bearer ${currentToken}`)
    }

    let attempt = 0
    // attempt indexes: 0..retry
    while (attempt <= retry) {
      try {
        const response = await fetchWithTimeout(`${BASE_URL}${path}`, {
          ...fetchOptions,
          method,
          headers,
        }, timeoutMs)
        const payload = await response.json().catch(() => ({}))

        if (!response.ok || payload.success === false) {
          const message = payload.error?.message || `API error ${response.status}`
          const error = new Error(message)
          error.status = response.status
          error.code = payload.error?.code
          error.details = payload.error?.details

          if (response.status === 401 && currentToken && attempt === 0) {
            try {
              const refreshed = await refreshToken()
              currentToken = refreshed?.idToken || getAuthToken()
              if (currentToken) {
                headers.set('Authorization', `Bearer ${currentToken}`)
                attempt += 1
                continue
              }
            } catch {
              clearSession()
            }
          }
          throw error
        }

        return payload.data ?? payload
      } catch (error) {
        if (!shouldRetry(error) || attempt >= retry) {
          if (error?.status === 401) clearSession()
          throw error
        }
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
        attempt += 1
      }
    }
    throw new Error('Request failed')
  })()

  if (shouldCacheGet) {
    getRequestCache.set(key, {
      path,
      token,
      promise: request,
      data: undefined,
      expiresAt: 0,
    })
  }

  try {
    const data = await request
    if (shouldCacheGet) {
      getRequestCache.set(key, {
        path,
        token,
        promise: null,
        data,
        expiresAt: Date.now() + Math.max(0, cacheTtl),
      })
    } else if (method !== 'GET') {
      clearApiCache()
    }
    return data
  } catch (error) {
    if (shouldCacheGet) getRequestCache.delete(key)
    throw error
  }
}

// Auth
export async function login(email, password) {
  const session = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setSession(session)
  return session
}

export async function logout() {
  try {
    if (getAuthToken()) await apiFetch('/auth/logout', { method: 'POST' })
  } finally {
    clearSession()
  }
}

export async function refreshToken() {
  if (refreshPromise) return refreshPromise
  const refreshTokenValue = localStorage.getItem('fp_refresh_token')
  if (!refreshTokenValue) throw new Error('Missing refresh token')
  refreshPromise = (async () => {
    const session = await apiFetch('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: refreshTokenValue }),
      retry: 0,
      dedupe: false,
      skipSessionRefresh: true,
    })
    setSession(session)
    return session
  })()

  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

export const fetchCurrentUser = options => apiFetch('/auth/me', options)
export const forgotPassword = email =>
  apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
export const changePassword = (currentPassword, newPassword) =>
  apiFetch('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })

// Master data
export const fetchMasterData = options =>
  apiFetch('/master-data', { cacheTtl: MASTER_DATA_CACHE_TTL_MS, ...options })
export const fetchLocations = options =>
  apiFetch('/locations/tree', { cacheTtl: MASTER_DATA_CACHE_TTL_MS, ...options })

export const fetchRstItems = options =>
  apiFetch('/master-data/rst-items', { cacheTtl: MASTER_DATA_CACHE_TTL_MS, ...options })
export const createRstItem = data =>
  apiFetch('/master-data/rst-items', { method: 'POST', body: JSON.stringify(data) })
export const updateRstItem = (id, data) =>
  apiFetch(`/master-data/rst-items/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteRstItem = id =>
  apiFetch(`/master-data/rst-items/${id}`, { method: 'DELETE' })

export const fetchSksItems = options =>
  apiFetch('/master-data/sks-items', { cacheTtl: MASTER_DATA_CACHE_TTL_MS, ...options })
export const createSksItem = data =>
  apiFetch('/master-data/sks-items', { method: 'POST', body: JSON.stringify(data) })
export const updateSksItem = (id, data) =>
  apiFetch(`/master-data/sks-items/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteSksItem = id =>
  apiFetch(`/master-data/sks-items/${id}`, { method: 'DELETE' })

export const createLocation = data =>
  apiFetch('/locations', { method: 'POST', body: JSON.stringify(data) })
export const deleteCity = id =>
  apiFetch(`/locations/cities/${id}`, { method: 'DELETE' })
export const deleteSector = id =>
  apiFetch(`/locations/sectors/${id}`, { method: 'DELETE' })
export const deleteSociety = id =>
  apiFetch(`/locations/societies/${id}`, { method: 'DELETE' })

// Users
export const fetchUsers = (params, options) => apiFetch(`/users${toQuery(params)}`, options)
export const createUser = data =>
  apiFetch('/users', { method: 'POST', body: JSON.stringify(data) })
export const updateUser = (id, data) =>
  apiFetch(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteUser = id =>
  apiFetch(`/users/${id}`, { method: 'DELETE' })

// Donors
export const fetchDonors = (params, options) => apiFetch(`/donors${toQuery(params)}`, options)
export const createDonor = data =>
  apiFetch('/donors', { method: 'POST', body: JSON.stringify(data) })
export const updateDonor = (id, data) =>
  apiFetch(`/donors/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteDonor = id =>
  apiFetch(`/donors/${id}`, { method: 'DELETE' })
// Check if a donor already exists by mobile number (used for dedup UI)
export const checkDonorByMobile = (mobile, options) =>
  apiFetch(`/donors${toQuery({ mobile, limit: 1 })}`, options);

// Pickups
export const fetchPickups = (params, options) => apiFetch(`/pickups${toQuery(params)}`, options)
export const createPickup = data =>
  apiFetch('/pickups', { method: 'POST', body: JSON.stringify(data) })
export const updatePickup = (id, data) =>
  apiFetch(`/pickups/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const recordPickup = (id, data) =>
  apiFetch(`/pickups/${id}/record`, { method: 'POST', body: JSON.stringify(data) })
export const reschedulePickup = (id, data) =>
  apiFetch(`/pickups/${id}/reschedule`, { method: 'POST', body: JSON.stringify(data) })
export const deletePickup = id =>
  apiFetch(`/pickups/${id}`, { method: 'DELETE' })
// Server-side duplicate scheduling guard — returns { conflict: bool, pickup: doc|null }
export const checkSchedulingConflict = (donorId, date, excludeId = null) =>
  apiFetch(`/pickups/check-conflict${toQuery({ donorId, date, ...(excludeId ? { excludeId } : {}) })}`)

export const fetchRaddiRecords = (params, options) =>
  apiFetch(`/pickups/raddi-records${toQuery(params)}`, options)

// Pickup partners
export const fetchPickupPartners = (params, options) =>
  apiFetch(`/pickup-partners${toQuery(params)}`, options)
export const createPickupPartner = data =>
  apiFetch('/pickup-partners', { method: 'POST', body: toPartnerFormData(data) })
export const updatePickupPartner = (id, data) =>
  apiFetch(`/pickup-partners/${id}`, { method: 'PATCH', body: toPartnerFormData(data) })
export const deletePickupPartner = id =>
  apiFetch(`/pickup-partners/${id}`, { method: 'DELETE' })

// Payments
export const fetchPayments = (params, options) => apiFetch(`/payments${toQuery(params)}`, options)

export const fetchPartnerSummary = (params, options) =>
  apiFetch(`/payments/partners/summary${toQuery(params)}`, options)

export const recordPickupPartnerPayment = (partnerId, data) =>
  apiFetch(`/payments/partners/${partnerId}/record`, {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const clearPartnerBalance = (partnerId, data) =>
  apiFetch(`/payments/partners/${partnerId}/clear-balance`, {
    method: 'POST',
    body: JSON.stringify(data),
  })

// SKS
export const fetchSksInflows = (params, options) =>
  apiFetch(`/sks/inflows${toQuery(params)}`, options)
export const createSksInflow = data =>
  apiFetch('/sks/inflows', { method: 'POST', body: JSON.stringify(data) })
export const updateSksInflow = (id, data) =>
  apiFetch(`/sks/inflows/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteSksInflow = id =>
  apiFetch(`/sks/inflows/${id}`, { method: 'DELETE' })
export const fetchSksOutflows = (params, options) =>
  apiFetch(`/sks/outflows${toQuery(params)}`, options)
export const createSksOutflow = data =>
  apiFetch('/sks/outflows', { method: 'POST', body: JSON.stringify(data) })
export const updateSksOutflow = (id, data) =>
  apiFetch(`/sks/outflows/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteSksOutflow = id =>
  apiFetch(`/sks/outflows/${id}`, { method: 'DELETE' })
export const fetchSksStock = options => apiFetch('/sks/stock', options)

export const recordSksOutflowPayment = (id, payment) =>
  apiFetch(`/sks/outflows/${id}/payment`, { method: 'PATCH', body: JSON.stringify({ payment }) })

// Dashboard
export const fetchDashboardStats = (params, options) =>
  apiFetch(`/dashboard/stats${toQuery(params)}`, options)
export const fetchSchedulerSummary = options => apiFetch('/dashboard/scheduler', options)

// Uploads
export const createUploadSignedUrl = data =>
  apiFetch('/uploads/signed-url', { method: 'POST', body: JSON.stringify(data) })

export const createReadSignedUrl = storagePath =>
  apiFetch('/uploads/read-url', { method: 'POST', body: JSON.stringify({ storagePath }) })

export async function uploadFileViaSignedUrl(file, { purpose = 'general', entityId = 'general' } = {}) {
  const upload = await createUploadSignedUrl({
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    purpose,
    entityId,
  })

  const response = await fetch(upload.signedUrl, {
    method: upload.method || 'PUT',
    headers: { 'Content-Type': upload.contentType },
    body: file,
  })

  if (!response.ok) throw new Error(`File upload failed (${response.status})`)

  const read = await createReadSignedUrl(upload.storagePath)
  return {
    storagePath: upload.storagePath,
    url: read.signedUrl,
    contentType: upload.contentType,
    fileName: file.name,
  }
}