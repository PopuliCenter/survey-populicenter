import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api';
import QuotaProgress from '../../components/QuotaProgress';
import useSyncManager from '../hooks/useSyncManager';
import { cacheSurveyList, getCachedSurveyList, cacheSurvey, getCachedSurvey } from '../../utils/storage';
import OfflineStatusBar from '../../components/OfflineStatusBar';
import ConfirmSheet from '../../components/ConfirmSheet';
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
 * Ambil nilai nomor kuesioner (jawaban pertanyaan unique_id) dari sebuah entri antrian offline.
 * @param {object} entry - entri offline_queue (punya .answers: array {question_id, answer_value})
 * @param {string|number|null} qid - id pertanyaan unique_id untuk survei tsb
 * @returns {string|null}
 */
function extractQuestionnaireNumber(entry, qid) {
  if (qid == null || !Array.isArray(entry?.answers)) return null;
  const found = entry.answers.find((a) => String(a.question_id) === String(qid));
  const val = found?.answer_value;
  return val == null || val === '' ? null : String(val);
}

/**
 * SurveyList page for TPD role (Opsi A — ringkas & jelas).
 *
 * Menampilkan daftar survei aktif dengan: progres kuota, status unduh offline,
 * dan status tiap nomor kuesioner yang akurat baik online maupun offline
 * (terkirim / menunggu upload / sedang upload / gagal / siap diisi / belum diunduh).
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

  // ─── Map surveyId → id pertanyaan unique_id (untuk membaca nomor dari antrian) ─
  const [uniqueQidMap, setUniqueQidMap] = useState({});

  // ─── Offline / Sync ─────────────────────────────────────────────────────────
  const { isOnline, isSyncing, pendingCount, pendingItems, failedItems, deleteFailedItem, retryFailedItem, retryAllFailed } = useSyncManager();

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

  // ─── Check which surveys are already cached + cari pertanyaan unique_id ──────
  useEffect(() => {
    async function checkCached() {
      const cached = new Set();
      const qidMap = {};
      for (const s of surveys) {
        try {
          const data = await getCachedSurvey(s.id);
          if (data && data.questions && data.questions.length > 0) {
            cached.add(s.id);
            const uq = data.questions.find((q) => q.type === 'unique_id');
            if (uq) qidMap[s.id] = uq.id;
          }
        } catch {
          // Storage tidak tersedia (mis. lingkungan test) — abaikan
        }
      }
      setDownloadedSurveys(cached);
      setUniqueQidMap(qidMap);
    }
    if (surveys.length > 0) checkCached();
  }, [surveys]);

  // ─── Kumpulkan nomor kuesioner yang tersimpan offline (pending & failed) ─────
  const offlineNumbersBySurvey = useMemo(() => {
    const map = {};
    const add = (surveyId, num, status) => {
      if (num == null) return;
      if (!map[surveyId]) map[surveyId] = { pending: new Set(), failed: new Set() };
      map[surveyId][status].add(num);
    };
    for (const e of pendingItems || []) {
      add(e.survey_id, extractQuestionnaireNumber(e, uniqueQidMap[e.survey_id]), 'pending');
    }
    for (const e of failedItems || []) {
      add(e.survey_id, extractQuestionnaireNumber(e, uniqueQidMap[e.survey_id]), 'failed');
    }
    return map;
  }, [pendingItems, failedItems, uniqueQidMap]);

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
  const allDownloaded = surveys.length > 0 && downloadedSurveys.size === surveys.length;

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
  // preselectedNumber (opsional): jika TPD mengetuk sebuah nomor kuesioner,
  // form langsung memilih nomor itu dan lompat ke pertanyaan setelahnya.
  const handleStartSurvey = (surveyId, preselectedNumber = null) => {
    navigate(
      `/surveyor/survey/${surveyId}`,
      preselectedNumber != null ? { state: { preselectedNumber } } : undefined
    );
  };

  // ─── Cek apakah kuota survei sudah terpenuhi (untuk pengurutan) ──────────────
  const isTargetMet = useCallback((survey) => {
    const q = quotaMap[survey.id];
    return !!(q && q.quota != null && q.quota > 0 && (q.filled ?? 0) >= q.quota);
  }, [quotaMap]);

  // Survei yang kuotanya sudah terpenuhi diturunkan ke bawah daftar
  const sortedSurveys = useMemo(() => {
    return [...surveys].sort((a, b) => Number(isTargetMet(a)) - Number(isTargetMet(b)));
  }, [surveys, isTargetMet]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
        <div className="max-w-3xl mx-auto px-screen py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-3">
              <div
                className="shrink-0 w-9 h-9 rounded-full bg-accent-100 text-accent-700 font-medium flex items-center justify-center text-sm"
                aria-hidden="true"
              >
                {(user?.name || user?.email || '?').trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold font-serif text-gray-900 leading-snug">Daftar Survei</h1>
                {user && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    Halo, <span className="font-medium text-gray-700">{user.name || user.email}</span>
                    <span className="text-gray-300"> · </span>
                    Diisi sesi ini: <span className="font-semibold text-accent-700">{sessionCount}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <OfflineStatusBar isOnline={isOnline} isSyncing={isSyncing} pendingCount={pendingCount} />
              <button
                onClick={handleLogoutClick}
                aria-label="Keluar"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl px-3 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>

          {/* ── Baris status offline + tombol unduh (ringkas) ── */}
          {surveys.length > 0 && (
            <div className={`mt-3 flex items-center gap-2 rounded-xl p-2.5 border ${
              allDownloaded ? 'bg-green-50 border-green-200' : 'bg-accent-50 border-accent-200'
            }`}>
              {allDownloaded ? (
                <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75l1.5 1.5 3-3.75M7 18a4 4 0 01-.88-7.903A5 5 0 1115.9 8.616 3.5 3.5 0 0117 15.5H7z" /></svg>
              ) : (
                <svg className="w-5 h-5 text-accent-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 17v-6m0 6l-2.5-2.5M12 17l2.5-2.5M7 18a4 4 0 01-.88-7.903A5 5 0 1115.9 8.616 3.5 3.5 0 0117 15.5" /></svg>
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${allDownloaded ? 'text-green-800' : 'text-accent-800'}`}>
                  {allDownloaded
                    ? 'Semua survei siap dipakai offline'
                    : `${downloadedSurveys.size}/${surveys.length} survei siap offline`}
                </p>
                {lastDownload && (
                  <p className="text-[11px] text-gray-400 truncate">
                    Terakhir diunduh: {new Date(lastDownload).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                )}
              </div>
              <button
                onClick={handleDownloadAll}
                disabled={downloading}
                className="min-h-[44px] shrink-0 inline-flex items-center gap-1.5 px-4 text-sm font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {downloading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    {downloadProgress.current}/{downloadProgress.total}
                  </>
                ) : (
                  <>
                    {allDownloaded ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    )}
                    {allDownloaded ? 'Perbarui' : 'Unduh'}
                  </>
                )}
              </button>
            </div>
          )}

          {/* Upload pending indicator */}
          {pendingCount > 0 && (
            <div className="mt-2 flex items-center gap-2 bg-accent-50 border border-accent-200 rounded-xl px-3 py-2">
              <svg className="animate-spin h-4 w-4 text-accent-600 shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-xs text-accent-700 font-medium">
                {isSyncing ? 'Mengunggah data...' : `${pendingCount} data menunggu diunggah`}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-screen py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-600" />
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
            {sortedSurveys.map((survey) => {
              const quotaInfo = quotaMap[survey.id];
              const hasQuota = quotaInfo && quotaInfo.quota != null && quotaInfo.quota > 0;
              const filled = quotaInfo?.filled ?? 0;
              const quota = hasQuota ? quotaInfo.quota : null;
              const targetMet = hasQuota && filled >= quota;
              const temporal = getSurveyTemporalStatus(survey.start_date, survey.end_date);
              const isOfflineReady = downloadedSurveys.has(survey.id);

              // Nomor kuesioner: ditugaskan (server), terkirim (server), + offline (perangkat)
              const assignedNumbers = quotaInfo?.assigned_numbers || null;
              const submittedSet = new Set((quotaInfo?.submitted_numbers || []).map(String));
              const offlineInfo = offlineNumbersBySurvey[survey.id] || { pending: new Set(), failed: new Set() };
              const pendingSet = offlineInfo.pending;
              const failedSet = offlineInfo.failed;

              // Tentukan status sebuah nomor kuesioner
              const numStatus = (num) => {
                const n = String(num);
                if (submittedSet.has(n)) return 'synced';
                if (failedSet.has(n)) return 'failed';
                if (pendingSet.has(n)) return isSyncing ? 'uploading' : 'pending';
                if (isOfflineReady) return 'ready';
                return 'not_downloaded';
              };

              // Daftar nomor yang akan dirender:
              // - jika ada penugasan → seluruh assignedNumbers
              // - jika tidak → gabungan nomor yang sudah punya data (terkirim/menunggu/gagal)
              const numbersToShow = assignedNumbers && assignedNumbers.length > 0
                ? assignedNumbers.map(String)
                : Array.from(new Set([
                    ...submittedSet,
                    ...pendingSet,
                    ...failedSet,
                  ]));

              const syncedCount = numbersToShow.filter((n) => numStatus(n) === 'synced').length;
              const localPendingCount = numbersToShow.filter((n) => ['pending', 'uploading'].includes(numStatus(n))).length;
              const localFailedCount = numbersToShow.filter((n) => numStatus(n) === 'failed').length;
              const filledNumCount = syncedCount + localPendingCount + localFailedCount;

              // Warna pita status di sisi kiri kartu
              const stripeColor = targetMet
                ? 'bg-green-500'
                : !temporal.canStart
                  ? 'bg-gray-300'
                  : isOfflineReady
                    ? 'bg-accent-500'
                    : 'bg-accent-400';

              return (
                <div
                  key={survey.id}
                  className={`bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex ${targetMet ? 'opacity-70' : ''}`}
                >
                  {/* Pita status warna */}
                  <div className={`w-1.5 shrink-0 ${stripeColor}`} aria-hidden="true" />

                  <div className="flex-1 min-w-0 p-4 sm:p-5">
                    {/* Judul + badge unduh */}
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-lg font-bold font-serif text-gray-900 leading-snug">{survey.title}</h2>
                      <span
                        title={isOfflineReady ? 'Tersimpan' : 'Belum diunduh'}
                        className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold ${
                          isOfflineReady
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-gray-100 text-gray-500 border border-gray-200'
                        }`}
                      >
                        {isOfflineReady ? (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75l1.5 1.5 3-3.75M7 18a4 4 0 01-.88-7.903A5 5 0 1115.9 8.616 3.5 3.5 0 0117 15.5H7z" /></svg>
                            Tersimpan
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 17v-6m0 6l-2.5-2.5M12 17l2.5-2.5M7 18a4 4 0 01-.88-7.903A5 5 0 1115.9 8.616 3.5 3.5 0 0117 15.5" /></svg>
                            Belum diunduh
                          </>
                        )}
                      </span>
                    </div>
                    {survey.description && (
                      <p className="text-sm text-gray-500 mt-1">{survey.description}</p>
                    )}
                    {temporal.label && (
                      <p className={`text-xs mt-1 font-medium inline-flex items-center gap-1 ${temporal.isUrgent ? 'text-red-600' : 'text-gray-500'}`}>
                        {temporal.isUrgent && (
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        )}
                        {temporal.label}
                      </p>
                    )}

                    {/* Progres kuota — Requirements 14.3, 14.4, 14.5, 14.8 */}
                    <div className="mt-3">
                      {hasQuota ? (
                        <>
                          <p className="text-xs text-gray-500 mb-1">Progres kuota</p>
                          <QuotaProgress filled={filled} quota={quota} />
                        </>
                      ) : (
                        <p className="text-xs text-gray-400 italic">Tidak ada target</p>
                      )}
                    </div>

                    {/* Peringatan belum diunduh */}
                    {!isOfflineReady && temporal.canStart && !targetMet && (
                      <p className="mt-3 text-xs text-accent-700 bg-accent-50 border border-accent-200 rounded-xl px-3 py-2 flex items-center gap-1.5">
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.26 16A2 2 0 005 19z" /></svg>
                        Unduh dulu agar bisa diisi tanpa internet
                      </p>
                    )}

                    {/* Daftar nomor kuesioner (collapsible) */}
                    {numbersToShow.length > 0 && (
                      <details className="mt-3 group">
                        <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-sm text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl px-3 py-3 min-h-[48px] transition-colors">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-medium">Nomor kuesioner</span>
                            <span className="text-gray-500">{filledNumCount}/{numbersToShow.length} terisi</span>
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            {/* Ringkasan status sekilas */}
                            {localPendingCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-700 bg-accent-100 rounded-full px-2 py-0.5">
                                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                {localPendingCount}
                              </span>
                            )}
                            {localFailedCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-100 rounded-full px-2 py-0.5">
                                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                {localFailedCount}
                              </span>
                            )}
                            <svg className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </span>
                        </summary>

                        <div className="mt-3">
                          {/* Progress bar mini */}
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3 overflow-hidden flex">
                            {syncedCount > 0 && <div className="h-1.5 bg-green-500" style={{ width: `${(syncedCount / numbersToShow.length) * 100}%` }} />}
                            {localPendingCount > 0 && <div className="h-1.5 bg-accent-400" style={{ width: `${(localPendingCount / numbersToShow.length) * 100}%` }} />}
                            {localFailedCount > 0 && <div className="h-1.5 bg-red-400" style={{ width: `${(localFailedCount / numbersToShow.length) * 100}%` }} />}
                          </div>

                          {/* Daftar nomor vertikal — tiap baris menampilkan status,
                              baris "belum diisi" dapat diketuk untuk langsung mengisi. */}
                          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                            {numbersToShow.map((num) => {
                              const status = numStatus(num);
                              const iconSvg = {
                                synced: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
                                uploading: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11l7-7 7 7M12 4v16" /></svg>,
                                pending: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                                failed: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
                                ready: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" strokeWidth={2} /></svg>,
                                not_downloaded: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" strokeWidth={2} /></svg>,
                              }[status];
                              const map = {
                                synced: { row: 'bg-green-50', badge: 'bg-green-100 text-green-800', iconCls: 'text-green-600', label: 'Sudah terkirim' },
                                uploading: { row: 'bg-accent-50', badge: 'bg-accent-100 text-accent-800', iconCls: 'text-accent-600 animate-pulse', label: 'Sedang mengunggah data' },
                                pending: { row: 'bg-accent-50/60', badge: 'bg-accent-100 text-accent-800', iconCls: 'text-accent-600', label: 'Menunggu upload' },
                                failed: { row: 'bg-red-50', badge: 'bg-red-100 text-red-800', iconCls: 'text-red-600', label: 'Gagal upload — perlu ditinjau' },
                                ready: { row: 'bg-white hover:bg-accent-50', badge: 'bg-accent-100 text-accent-700', iconCls: 'text-accent-500', label: 'Belum diisi — ketuk untuk mengisi' },
                                not_downloaded: { row: 'bg-white', badge: 'bg-gray-100 text-gray-500', iconCls: 'text-gray-400', label: 'Belum diisi' },
                              }[status];
                              const clickable = (status === 'ready' || status === 'not_downloaded') && temporal.canStart && !targetMet;
                              const RowTag = clickable ? 'button' : 'div';
                              return (
                                <li key={num}>
                                  <RowTag
                                    {...(clickable
                                      ? {
                                          type: 'button',
                                          onClick: () => handleStartSurvey(survey.id, num),
                                          'aria-label': `Isi kuesioner nomor ${num} (${map.label})`,
                                        }
                                      : {})}
                                    className={`w-full min-h-[48px] flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${map.row} ${clickable ? 'cursor-pointer' : ''}`}
                                  >
                                    <span className={`leading-none w-5 flex items-center justify-center shrink-0 ${map.iconCls}`} aria-hidden="true">{iconSvg}</span>
                                    <span className="flex-1 min-w-0">
                                      <span className="block text-sm font-semibold text-gray-800">Kuesioner No. {num}</span>
                                      <span className="block text-xs text-gray-500">{map.label}</span>
                                    </span>
                                    <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 ${map.badge}`}>
                                      {{ synced: 'Terkirim', uploading: 'Mengunggah', pending: 'Menunggu', failed: 'Gagal', ready: 'Isi', not_downloaded: 'Belum' }[status]}
                                    </span>
                                    {clickable && (
                                      <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                    )}
                                  </RowTag>
                                </li>
                              );
                            })}
                          </ul>

                          {/* Keterangan ringkas */}
                          <p className="mt-2 text-[11px] text-gray-400">
                            Ketuk nomor yang masih "Belum diisi" untuk langsung membuka pertanyaannya.
                          </p>
                        </div>
                      </details>
                    )}

                    {/* Tombol aksi utama — Requirements 6.2, 9.6, 14.6 */}
                    <button
                      onClick={() => handleStartSurvey(survey.id)}
                      disabled={!temporal.canStart || targetMet}
                      className={`mt-4 w-full min-h-[48px] text-base font-semibold px-5 rounded-xl transition-colors ${
                        temporal.canStart && !targetMet
                          ? 'bg-accent-600 hover:bg-accent-700 text-white shadow-sm'
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
                      {targetMet ? 'Kuota Tercapai' : (filledNumCount > 0 ? 'Lanjutkan Mengisi' : 'Mulai Isi')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Failed sync items — Requirement 6.2, 6.3 */}
        {failedItems.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3 gap-2">
              <h2 className="text-sm font-semibold text-red-700 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
                Respons Gagal Tersinkron ({failedItems.length})
              </h2>
              <button
                onClick={retryAllFailed}
                disabled={!isOnline || isSyncing}
                className="flex-shrink-0 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded px-3 py-1.5 transition-colors"
              >
                {isSyncing ? 'Menyinkron…' : 'Coba Lagi Semua'}
              </button>
            </div>
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
                  <div className="flex-shrink-0 flex flex-col gap-1">
                    <button
                      onClick={() => retryFailedItem(item.localId)}
                      disabled={!isOnline || isSyncing}
                      className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded px-2 py-1 transition-colors"
                      aria-label={`Coba sinkron ulang respons untuk survei ${item.survey_id}`}
                    >
                      Coba Lagi
                    </button>
                    <button
                      onClick={() => deleteFailedItem(item.localId)}
                      className="text-xs font-medium text-red-700 hover:text-red-900 border border-red-300 hover:border-red-500 rounded px-2 py-1 transition-colors"
                      aria-label={`Hapus respons gagal untuk survei ${item.survey_id}`}
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── Bottom Sheet Konfirmasi Logout ───────────────────────────────────── */}
      <ConfirmSheet
        open={showLogoutConfirm}
        iconType="warning"
        title="Keluar ke Halaman Login?"
        description={pendingCount === 0 && failedItems.length === 0
          ? 'Anda akan keluar dan kembali ke halaman login.'
          : undefined}
        confirmLabel="Keluar"
        cancelLabel="Batal"
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
      >
        {pendingCount > 0 && (
          <p className="text-sm text-accent-700 bg-accent-50 border border-accent-200 rounded-xl px-3 py-2 flex items-start gap-2">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.26 16A2 2 0 005 19z" /></svg>
            <span>Ada <strong>{pendingCount} data</strong> yang belum tersinkron ke server. Data akan tetap tersimpan di perangkat dan otomatis diunggah saat Anda login kembali.</span>
          </p>
        )}
        {failedItems.length > 0 && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-start gap-2">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.26 16A2 2 0 005 19z" /></svg>
            <span>Ada <strong>{failedItems.length} data gagal</strong> yang perlu ditinjau sebelum keluar.</span>
          </p>
        )}
      </ConfirmSheet>
    </div>
  );
}

export default SurveyList;
