// Thin fetch helpers. Only mobx stores call these; render components never do.

export const apiGet = async (endpoint) => {
  try {
    const response = await fetch(endpoint)
    return await response.json()
  } catch (error) {
    return { code: -1, data: null, message: error?.message || 'network error' }
  }
}

export const apiPost = async (endpoint, body) => {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
    return await response.json()
  } catch (error) {
    return { code: -1, data: null, message: error?.message || 'network error' }
  }
}
