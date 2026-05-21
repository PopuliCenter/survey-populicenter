import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api';
import QuotaProgress from '../../components/QuotaProgress';
import useSyncManager from '../hooks/useSyncManager';
import { cacheSurveyList, getCachedSurveyList, cacheSurvey, getCachedSurvey } from '../../utils/storage';
import OfflineStatusBar from '../../components/OfflineStatusBar';
import { addBackButtonListener } from '../../utils/capacitorBridge';

/**
 * Hitung selisih hari antara dua tanggal (dibulatkan ke bawah).
 * @param {string} dateStr - ISO 8601 date string
 * @returns {number} Jumlah hari tersisa
 */
export function daysUntil(dateStr) {
  const now = new Date();
  const target = new Date(dateStr);
  const diffMs = target - now;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Tentukan status temporal survei.
 * @param {string|null} startDate - ISO 8601 date string atau null
 * @param {string|null} endDate - ISO 8601 date string atau null
 * @returns {{ canStart: boolean, label: string|null, isUrgent: boolean }}
 */
export function getSurveyTemporalStatus(startDate, endDate) {
  const now = new Date();

  if (endDate && new Date(endDate) <= now) {
    return { canStart: false, label: 'Berakhir', isUrgent: true };
  }

  if (startDate && new Date(startDate) > now) {
    const days = daysUntil(startDate);
    return { canStart: false, label: `Dimulai dalam ${days} hari`, isUrgent: false };
  }

  if (endDate) {
    const days = daysUntil(endDate);
    return { canStart: true, label: `Sisa ${days} hari`, isUrgent: days < 3 };
  }

  return { canStart: true, label: null, isUrgent: false };
}

/**
 * SurveyList page for TPD role.
 *
 * Displays:
 * - Logged-in TPD name (from localStorage `user`)
 * - Session counter: number of responses submitted in the current session
 * - List of active surveys with quota progress per survey
 * - Logout button
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 14.3, 14.4, 14.5, 14.6, 14.8
 */
function SurveyList() {
  const navigate = useNavigate();
  const location = useLocation();

  // ─── TPD identity ──────────────────────────────────────────────────────────
  const [user, setUser] = useState(null);

  // ─── Session counter (persisted in sessionStorage) ──────────────────────────
  const [sessionCount, setSessionCount] = useState(() => {
    const stored = sessionStorage.getItem('session_response_count');
    return stored ? parseInt(stored, 10) : 0;
  });

  // ─── Surveys & quota data ───────────────────────────────────────────────────
  const [surveys, setSurveys] = useState([]);
  const [quotaMap, setQuotaMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ─── Download status per survey ─────────────────────────────────────────────
  const [downloadedSurveys, setDownloadedSurveys] = useState(new Set());
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });

  // ─── Offline / Sync ─────────────────────────────────────────────────────────
  const { isOnline, isSyncing, pendingCount, failedItems, deleteFailedItem } = useSyncManager();

  // ─── Load user from localStorage ───────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  // ─── Fetch surveys and quota ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Selalu coba fetch dari API dulu (jangan bergantung navigator.onLine
      // karena di Capacitor WebView bisa unreliable)
      try {
        const surveysRes = await api.get('/surveys');
        const activeSurveys = surveysRes.data || [];
        setSurveys(activeSurveys);

        // Cache survey list for offline use
        try {
          await cacheSurveyList(activeSurveys);
        } catch {
          // Caching failure is non-fatal
        }

        // Fetch quota info for current TPD
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const tpdUserId = storedUser.id;
        if (tpdUserId) {
          try {
            const quotaRes = await api.get(`/surveyors/${tpdUserId}/quota`);
            const quotaData = quotaRes.data || [];
            const map = {};
            quotaData.forEach((item) => {
              map[item.survey_id] = {
                quota: item.quota,
                filled: item.filled,
                assigned_numbers: item.assigned_numbers || null,
                submitted_numbers: item.submitted_numbers || [],
              };
            });
            setQuotaMap(map);
          } catch {
            setQuotaMap({});
          }
        }
      } catch (apiErr) {
        // API gagal — coba load dari cache (offline fallback)
        console.error('[SurveyList] API error:', apiErr.message, apiErr.code, apiErr.response?.status);
        const cached = await getCachedSurveyList();
        if (cached && cached.length > 0) {
          setSurveys(cached);

          // Cek mana yang sudah punya questions (fully cached)
          const cachedSet = new Set();
          for (const s of cached) {
            const full = await getCachedSurvey(s.id);
            if (full && full.questions && full.questions.length > 0) {
              cachedSet.add(s.id);
            }
          }
          setDownloadedSurveys(cachedSet);

          // Load quota dari cache offline
          try {
            const cachedQuota = localStorage.getItem('offline_quota_map');
            if (cachedQuota) {
              setQuotaMap(JSON.parse(cachedQuota));
            } else {
              const map = {};
              for (const s of cached) {
                if (s._offlineQuota) {
                  map[s.id] = s._offlineQuota;
                }
              }
              // Juga cek dari full cached survey
              for (const sid of cachedSet) {
                const full = await getCachedSurvey(sid);
                if (full && full._offlineQuota && !map[sid]) {
                  map[sid] = full._offlineQuota;
                }
              }
              setQuotaMap(map);
            }
          } catch {
            setQuotaMap({});
          }
        } else {
          throw apiErr;
        }
      }
    } catch (err) {
      const detail = err.response?.data?.error || err.response?.data?.message || err.message || '';
      setError(`Gagal memuat daftar survei. ${detail}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Check which surveys are already cached ─────────────────────────────────
  useEffect(() => {
    async function checkCached() {
      const cached = new Set();
      for (const s of surveys) {
        const data = await getCachedSurvey(s.id);
        if (data && data.questions && data.questions.length > 0) {
          cached.add(s.id);
        }
      }
      setDownloadedSurveys(cached);
    }
    if (surveys.length > 0) checkCached();
  }, [surveys]);

  // ─── Download all surveys (questions + quota + assigned numbers) for offline ─
  async function handleDownloadAll() {
    setDownloading(true);
    setDownloadProgress({ current: 0, total: surveys.length });
    const newCached = new Set(downloadedSurveys);

    for (let i = 0; i < surveys.length; i++) {
      const s = surveys[i];
      setDownloadProgress({ current: i + 1, total: surveys.length });
      try {
        const res = await api.get(`/surveys/${s.id}`);
        const surveyData = { ...res.data };

        // Simpan quota info
        if (quotaMap[s.id]) {
          surveyData._offlineQuota = quotaMap[s.id];
        }

        // Fetch dan simpan assigned numbers untuk offline
        try {
          const assignedRes = await api.get(`/responses/assigned-numbers/${s.id}`);
          surveyData._assignedNumbers = assignedRes.data.assigned_numbers || null;
          surveyData._usedNumbers = assignedRes.data.used_numbers || [];
        } catch {
          // Non-critical — skip jika gagal
        }

        await cacheSurvey(surveyData);
        newCached.add(s.id);
      } catch {
        // Skip failed — will retry next time
      }
    }

    // Simpan quotaMap ke localStorage agar bisa diakses offline
    try {
      localStorage.setItem('offline_quota_map', JSON.stringify(quotaMap));
    } catch { /* ignore */ }

    setDownloadedSurveys(newCached);
    setDownloading(false);
    localStorage.setItem('last_download_time', new Date().toISOString());
  }

  // ─── Last download time ─────────────────────────────────────────────────────
  const lastDownload = localStorage.getItem('last_download_time');

  // ─── Refresh data when navigating back from SubmitSuccess (Requirement 6.3) ─
  useEffect(() => {
    if (location.state?.refreshQuota) {
      fetchData();
      // Update session count from sessionStorage (may have been incremented by SubmitSuccess)
      const stored = sessionStorage.getItem('session_response_count');
      if (stored) {
        setSessionCount(parseInt(stored, 10));
      }
      // Clear the state flag to prevent re-fetching on subsequent renders
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, fetchData, navigate, location.pathname]);

  // ─── Logout with confirmation ────────────────────────────────────────────────
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // ─── Android back button handler ───────────────────────────────────────────
  useEffect(() => {
    let cleanup = () => {};
    addBackButtonListener(() => {
      // Di halaman daftar survei, back = konfirmasi logout ke login
      setShowLogoutConfirm(true);
      return true; // Prevent default back behavior
    }).then((fn) => { cleanup = fn; });
    return () => cleanup();
  }, []);

  const handleLogoutClick = () => {
    // Selalu tampilkan konfirmasi sebelum logout
    setShowLogoutConfirm(true);
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Proceed with logout even if the API call fails
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('session_response_count');
      navigate('/login', { replace: true });
    }
  };

  // ─── Prevent accidental page close/back when data pending ───────────────────
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (pendingCount > 0) {
        e.preventDefault();
        e.returnValue = 'Ada data yang belum tersinkron. Yakin ingin keluar?';
        return e.returnValue;
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pendingCount]);

  // ─── Navigate to survey form ─────────────────────────────────────────────────
  const handleStartSurvey = (surveyId) => {
    navigate(`/surveyor/survey/${surveyId}`);
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-800">Daftar Survei</h1>
              {user && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Halo, <span className="font-medium text-gray-700">{user.name || user.email}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <OfflineStatusBar isOnline={isOnline} isSyncing={isSyncing} pendingCount={pendingCount} />
              <button onClick={handleLogoutClick} className="text-xs text-red-600 hover:text-red-800 border border-red-200 rounded-lg px-2.5 py-1.5">
                Keluar
              </button>
            </div>
          </div>

          {/* ── Sync & Download Status Bar ── */}
          <div className="mt-3 space-y-2">
            {/* Upload pending indicator */}
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <svg className="animate-spin h-4 w-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-xs text-amber-700 font-medium">
                  {isSyncing ? 'Mengunggah data...' : `${pendingCount} data menunggu diunggah`}
                </span>
              </div>
            )}

            {/* Download all button + status */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleDownloadAll}
                disabled={downloading || surveys.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg disabled:opacity-50 transition-colors"
              >
                {downloading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Mengunduh {downloadProgress.current}/{downloadProgress.total}...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {downloadedSurveys.size === surveys.length && surveys.length > 0
                      ? 'Perbarui Data Offline'
                      : 'Unduh Semua untuk Offline'}
                  </>
                )}
              </button>

              {/* Download status summary */}
              {surveys.length > 0 && (
                <span className={`text-xs font-medium px-2.5 py-1.5 rounded-lg ${
                  downloadedSurveys.size === surveys.length
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {downloadedSurveys.size === surveys.length ? (
                    <>✓ Semua survei tersimpan di HP — siap offline</>
                  ) : (
                    <>{downloadedSurveys.size}/{surveys.length} survei tersimpan — unduh semua agar bisa offline</>
                  )}
                </span>
              )}

              {lastDownload && (
                <span className="text-xs text-gray-400">
                  Terakhir diunduh: {new Date(lastDownload).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              )}
            </div>

            {/* Session counter */}
            {sessionCount > 0 && (
              <div className="text-xs text-gray-500">
                Responden diisi sesi ini: <span className="font-semibold text-blue-700">{sessionCount}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <span className="ml-3 text-gray-500">Memuat survei…</span>
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {error}
            <button
              onClick={fetchData}
              className="ml-3 underline hover:no-underline"
            >
              Coba lagi
            </button>
          </div>
        )}

        {!loading && !error && surveys.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">Tidak ada survei aktif saat ini.</p>
          </div>
        )}

        {!loading && !error && surveys.length > 0 && (
          <div className="space-y-4">
            {surveys.map((survey) => {
              const quotaInfo = quotaMap[survey.id];
              const hasQuota = quotaInfo && quotaInfo.quota != null && quotaInfo.quota > 0;
              const filled = quotaInfo?.filled ?? 0;
              const quota = hasQuota ? quotaInfo.quota : null;
              const targetMet = hasQuota && filled >= quota;
              const temporal = getSurveyTemporalStatus(survey.start_date, survey.end_date);
              // Fitur #6: nomor kuesioner yang ditugaskan dan sudah diisi
              const assignedNumbers = quotaInfo?.assigned_numbers || null;
              const submittedNumbers = quotaInfo?.submitted_numbers || [];
              const submittedSet = new Set(submittedNumbers);

              return (
                <div
                  key={survey.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
                >
                  {/* Survey title & description */}
                  <div className="mb-3">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-base font-semibold text-gray-800">{survey.title}</h2>
                      {/* Download status badge */}
                      <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        downloadedSurveys.has(survey.id)
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-gray-100 text-gray-400 border border-gray-200'
                      }`}>
                        {downloadedSurveys.has(survey.id) ? (
                          <><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> Offline</>
                        ) : (
                          <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" /></svg> Online</>
                        )}
                      </span>
                    </div>
                    {survey.description && (
                      <p className="text-sm text-gray-500 mt-1">{survey.description}</p>
                    )}
                    {temporal.label && (
                      <p className={`text-xs mt-1 font-medium ${temporal.isUrgent ? 'text-red-600' : 'text-gray-500'}`}>
                        {temporal.label}
                      </p>
                    )}
                  </div>

                  {/* Quota progress — Requirements 14.3, 14.4, 14.5, 14.8 */}
                  <div className="mb-4">
                    {hasQuota ? (
                      <>
                        <p className="text-xs text-gray-500 mb-1">Progres kuota</p>
                        <QuotaProgress filled={filled} quota={quota} />
                        {/* Requirement 14.5: notification when target met */}
                        {targetMet && (
                          <p className="mt-2 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1 inline-block">
                            ✓ Target Terpenuhi
                          </p>
                        )}
                      </>
                    ) : (
                      /* Requirement 14.8: no quota set */
                      <p className="text-xs text-gray-400 italic">Tidak ada target</p>
                    )}
                  </div>

                  {/* Fitur #6: Daftar nomor kuesioner yang ditugaskan */}
                  {assignedNumbers && assignedNumbers.length > 0 && (() => {
                    const doneCount = assignedNumbers.filter((n) => submittedSet.has(n)).length;
                    const allDone = doneCount === assignedNumbers.length;
                    const isOfflineReady = downloadedSurveys.has(survey.id);
                    return (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-gray-600 font-medium">
                            Daftar Kuesioner ({doneCount}/{assignedNumbers.length})
                          </p>
                          <div className="flex items-center gap-1.5">
                            {isOfflineReady && (
                              <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                Tersimpan di HP
                              </span>
                            )}
                            {allDone && (
                              <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                                ✓ Semua selesai
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status offline info */}
                        {!isOfflineReady && (
                          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 mb-2 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                            Belum diunduh — tekan "Unduh Semua untuk Offline" agar bisa diisi tanpa internet
                          </p>
                        )}

                        {/* Progress bar mini */}
                        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
                          <div
                            className={`h-1.5 rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${(doneCount / assignedNumbers.length) * 100}%` }}
                          />
                        </div>

                        {/* Daftar nomor kuesioner dengan status lengkap */}
                        <div className="flex flex-wrap gap-1.5">
                          {assignedNumbers.map((num) => {
                            const isDone = submittedSet.has(num);
                            // Determine status: synced > filled > downloaded > pending
                            let statusLabel, statusClass, icon;
                            if (isDone) {
                              statusLabel = 'Sudah diisi & sinkron';
                              statusClass = 'bg-green-100 text-green-800 border-green-300';
                              icon = <svg className="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>;
                            } else if (isOfflineReady) {
                              statusLabel = 'Siap diisi (offline ready)';
                              statusClass = 'bg-blue-50 text-blue-700 border-blue-200';
                              icon = <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>;
                            } else {
                              statusLabel = 'Belum diunduh';
                              statusClass = 'bg-white text-gray-500 border-gray-300';
                              icon = <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 inline-block" />;
                            }
                            return (
                              <span
                                key={num}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${statusClass}`}
                                title={`Kuesioner ${num}: ${statusLabel}`}
                              >
                                {icon}
                                {num}
                              </span>
                            );
                          })}
                        </div>

                        {/* Legend */}
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Selesai
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Siap offline
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" /> Belum diunduh
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Nomor kuesioner sudah tersimpan (tanpa penugasan spesifik) */}
                  {(!assignedNumbers || assignedNumbers.length === 0) && submittedNumbers.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-gray-500 mb-2">
                        Nomor kuesioner tersimpan ({submittedNumbers.length}):
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {submittedNumbers.map((qn) => (
                          <span
                            key={qn}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200"
                          >
                            ✓ {qn}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action button — Requirements 6.2, 9.6, 14.6 */}
                  <button
                    onClick={() => handleStartSurvey(survey.id)}
                    disabled={!temporal.canStart || targetMet}
                    className={`w-full sm:w-auto text-sm font-medium px-5 py-2 rounded-lg transition-colors ${
                      temporal.canStart && !targetMet
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                    aria-label={
                      targetMet
                        ? `Kuota tercapai untuk survei ${survey.title}`
                        : temporal.canStart
                          ? `Mulai isi survei ${survey.title}`
                          : `Survei ${survey.title} tidak dapat diisi`
                    }
                  >
                    {targetMet ? 'Kuota Tercapai' : 'Mulai Isi'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Failed sync items — Requirement 6.2, 6.3 */}
        {failedItems.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
              Respons Gagal Tersinkron ({failedItems.length})
            </h2>
            <div className="space-y-2">
              {failedItems.map((item) => (
                <div
                  key={item.localId}
                  className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-red-800">
                      Survei ID: {item.survey_id}
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">
                      {new Date(item.timestamp).toLocaleString('id-ID')}
                    </p>
                    {item.errorMessage && (
                      <p className="text-xs text-red-700 mt-1 bg-red-100 rounded px-2 py-1">
                        {item.errorMessage}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteFailedItem(item.localId)}
                    className="flex-shrink-0 text-xs font-medium text-red-700 hover:text-red-900 border border-red-300 hover:border-red-500 rounded px-2 py-1 transition-colors"
                    aria-label={`Hapus respons gagal untuk survei ${item.survey_id}`}
                  >
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── Modal Konfirmasi Logout ──────────────────────────────────────────── */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-800">Keluar ke Halaman Login?</h3>
              </div>
            </div>

            <div className="space-y-2 mb-5">
              {pendingCount > 0 && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠️ Ada <strong>{pendingCount} data</strong> yang belum tersinkron ke server. Data akan tetap tersimpan di perangkat dan otomatis diunggah saat Anda login kembali.
                </p>
              )}
              {failedItems.length > 0 && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  ❌ Ada <strong>{failedItems.length} data gagal</strong> yang perlu ditinjau sebelum keluar.
                </p>
              )}
              {pendingCount === 0 && failedItems.length === 0 && (
                <p className="text-sm text-gray-600">
                  Anda akan keluar dan kembali ke halaman login.
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SurveyList;
