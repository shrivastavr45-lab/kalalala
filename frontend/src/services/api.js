const rawBase = import.meta.env.VITE_API_BASE_URL || '/api';
const API_BASE = rawBase.endsWith('/api') ? rawBase.replace(/\/+$/, '') : `${rawBase.replace(/\/+$/, '')}/api`;

async function getJson(path, { signal } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = typeof payload?.detail === 'string'
      ? payload.detail
      : `Request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('The API returned an invalid JSON response.');
  }
  return payload;
}

export function fetchAnalysis({ date, cutoffTime, refresh = false, signal }) {
  const params = new URLSearchParams({ date, cutoff_time: cutoffTime, refresh: String(refresh) });
  return getJson(`/analysis?${params}`, { signal });
}

export function fetchMonthlyOverview({ cutoffTime, refresh = false, signal }) {
  const params = new URLSearchParams({ cutoff_time: cutoffTime, refresh: String(refresh) });
  return getJson(`/overview?${params}`, { signal });
}

export function fetchCutoffComparison({ date, cutoffTimes, refresh = false, signal }) {
  const params = new URLSearchParams({ date, cutoff_times: cutoffTimes.join(','), refresh: String(refresh) });
  return getJson(`/cutoff-comparison?${params}`, { signal });
}
