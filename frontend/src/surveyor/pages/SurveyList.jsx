import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api';
import QuotaProgress from '../../components/QuotaProgress';
import useSyncManager from '../hooks/useSyncManager';
import { cacheSurveyList, getCachedSurveyList } from '../../utils/offlineDB';
import OfflineStatusBar from '../../components/OfflineStatusBar';

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
 * SurveyList page for Surveyor role.
 *
 * Displays:
 * - Logged-in surveyor name (from localStorage `user`)
 * - Session counter: number of responses submitted in the current session
 * - List of active surveys with quota progress per survey
 * - Logout button
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 14.3, 14.4, 14.5, 14.6, 14.8
 */
function SurveyList() {
  const navigate = useNavigate();
  const location = useLocation();

  // ─── Surveyor identity ──────────────────────────────────────────────────────
  const [user, setUser] = useState(null);

  // ─── Session counter (persisted in sessionStorage) ──────────────────────────
  const [sessionCount, setSessionCount] = useState(() => {
    const stored = sessionStorage.getItem('session_response_count');
    return stored ? parseInt(stored, 10) : 0;
  });

  // ─── Surveys & quota data ───────────────────────────────────────────────────
  const [surveys, setSurveys] = useState([]);
  const [quotaMap, setQuotaMap] = useState({}); // { [survey_id]: { quota, filled } }
  const [questionnaireMap, setQuestionnaireMap] = useState({}); // { [survey_id]: string[] }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      if (isOnline) {
        // Online: fetch from API and cache the result
        const surveysRes = await api.get('/surveys');
        const activeSurveys = surveysRes.data || [];
        setSurveys(activeSurveys);

        // Cache survey list for offline use
        try {
          await cacheSurveyList(activeSurveys);
        } catch {
          // Caching failure is non-fatal
        }

        // Fetch quota info for current surveyor
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const surveyorId = storedUser.id;
        if (surveyorId) {
          try {
            const quotaRes = await api.get(`/surveyors/${surveyorId}/quota`);
            const quotaData = quotaRes.data || [];
            const map = {};
            quotaData.forEach((item) => {
              map[item.survey_id] = { quota: item.quota, filled: item.filled };
            });
            setQuotaMap(map);
          } catch {
            setQuotaMap({});
          }

          // Fetch questionnaire numbers for this surveyor
          try {
            const qnRes = await api.get(`/surveyors/${surveyorId}/questionnaire-numbers`);
            setQuestionnaireMap(qnRes.data || {});
          } catch {
            setQuestionnaireMap({});
          }
        }
      } else {
        // Offline: load from IndexedDB cache
        const cached = await getCachedSurveyList();
        if (cached && cached.length > 0) {
          setSurveys(cached);
          setQuotaMap({});
        } else {
          setSurveys([]);
          setError('Data survei belum tersedia offline. Hubungkan ke internet untuk mengunduh data survei terlebih dahulu.');
        }
      }
    } catch (err) {
      if (!isOnline) {
        // If we're offline and the API call somehow ran and failed
        try {
          const cached = await getCachedSurveyList();
          if (cached && cached.length > 0) {
            setSurveys(cached);
            setQuotaMap({});
            setError(null);
          } else {
            setError('Data survei belum tersedia offline. Hubungkan ke internet untuk mengunduh data survei terlebih dahulu.');
          }
        } catch {
          setError('Data survei belum tersedia offline. Hubungkan ke internet untuk mengunduh data survei terlebih dahulu.');
        }
      } else {
        setError(err.response?.data?.error || err.response?.data?.message || 'Gagal memuat daftar survei.');
      }
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  // ─── Logout ─────────────────────────────────────────────────────────────────
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

  // ─── Navigate to survey form ─────────────────────────────────────────────────
  const handleStartSurvey = (surveyId) => {
    navigate(`/surveyor/survey/${surveyId}`);
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-800">Daftar Survei</h1>
            {user && (
              <p className="text-sm text-gray-500 mt-0.5">
                Halo, <span className="font-medium text-gray-700">{user.name || user.email}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Session counter — Requirement 9.4 */}
            <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
              Responden diisi sesi ini:{' '}
              <span className="font-semibold text-blue-700">{sessionCount}</span>
            </div>

            {/* Offline status indicator */}
            <OfflineStatusBar
              isOnline={isOnline}
              isSyncing={isSyncing}
              pendingCount={pendingCount}
            />

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="text-sm text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 rounded-lg px-3 py-1.5 transition-colors"
            >
              Keluar
            </button>
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

              return (
                <div
                  key={survey.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
                >
                  {/* Survey title & description */}
                  <div className="mb-3">
                    <h2 className="text-base font-semibold text-gray-800">{survey.title}</h2>
                    {survey.description && (
                      <p className="text-sm text-gray-500 mt-1">{survey.description}</p>
                    )}
                    {/* Informasi sisa hari — Requirements 9.1, 9.2, 9.3, 9.4, 9.5 */}
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

                  {/* Questionnaire numbers already submitted */}
                  {questionnaireMap[survey.id] && questionnaireMap[survey.id].length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-gray-500 mb-2">
                        Nomor kuesioner tersimpan ({questionnaireMap[survey.id].length}):
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {questionnaireMap[survey.id].map((qn) => (
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
    </div>
  );
}

export default SurveyList;
