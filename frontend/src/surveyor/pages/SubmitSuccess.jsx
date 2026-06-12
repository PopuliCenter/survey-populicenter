/**
 * SubmitSuccess.jsx
 *
 * Displayed after a TPD successfully submits a response.
 * Shows the questionnaire number and provides navigation options.
 *
 * Route: /surveyor/survey/:id/success
 * State (via React Router location.state): { questionnaire_number, survey_id }
 *
 * On mount: increments sessionStorage.session_response_count by 1.
 *
 * Requirements: 9.2, 9.3, 13.3
 */

import React, { useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';

function SubmitSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: paramId } = useParams();

  // State passed from SurveyForm after a successful submit
  const { questionnaire_number, survey_id, offline } = location.state || {};

  // Use survey_id from state if available, otherwise fall back to URL param
  const surveyId = survey_id || paramId;

  // Requirement 9.4 / 9.2: increment session response counter on mount
  useEffect(() => {
    const current = parseInt(sessionStorage.getItem('session_response_count') || '0', 10);
    sessionStorage.setItem('session_response_count', String(current + 1));
  }, []);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  // Navigate back to the same survey form (fresh / empty form)
  const handleNextRespondent = () => {
    navigate(`/surveyor/survey/${surveyId}`);
  };

  // Navigate back to the TPD survey list with refresh flag (Requirement 6.3)
  const handleBackToList = () => {
    navigate('/surveyor', { state: { refreshQuota: true } });
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-screen">
      <div className="bg-white rounded-2xl shadow-md border border-gray-200 max-w-md w-full p-8 text-center">
        {/* Icon — different for offline vs online */}
        {offline ? (
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mx-auto mb-5">
            <svg
              className="w-8 h-8 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        ) : (
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mx-auto mb-5">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}

        {/* Heading & message — different for offline vs online */}
        {offline ? (
          <>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Data tersimpan secara lokal!</h1>
            <p className="text-gray-500 text-sm mb-6">
              Data akan otomatis dikirim saat koneksi internet tersedia.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Data berhasil disimpan!</h1>
            <p className="text-gray-500 text-sm mb-6">
              Data responden telah tersimpan dengan nomor kuesioner berikut:
            </p>
          </>
        )}

        {/* Questionnaire number — only shown for online submissions (Requirement 13.3) */}
        {!offline && (
          questionnaire_number ? (
            <div className="bg-primary-50 border border-primary-200 rounded-xl px-6 py-4 mb-8 inline-block w-full">
              <p className="text-xs text-primary-500 uppercase tracking-wide font-medium mb-1">
                Nomor Kuesioner
              </p>
              <p className="text-2xl font-bold text-primary-700 tracking-wider">
                {questionnaire_number}
              </p>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-6 py-4 mb-8 w-full">
              <p className="text-sm text-gray-400 italic">Nomor kuesioner tidak tersedia</p>
            </div>
          )
        )}

        {/* Offline info box */}
        {offline && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-6 py-4 mb-8 w-full">
            <p className="text-sm text-amber-700">
              Nomor kuesioner akan tersedia setelah data berhasil disinkronkan.
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          {/* Primary: fill next respondent — Requirement 9.2, 9.3 */}
          <button
            onClick={handleNextRespondent}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
          >
            Isi Responden Berikutnya
          </button>

          {/* Secondary: back to survey list */}
          <button
            onClick={handleBackToList}
            className="w-full bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 px-6 rounded-xl border border-gray-300 transition-colors"
          >
            Kembali ke Daftar Survei
          </button>
        </div>
      </div>
    </div>
  );
}

export default SubmitSuccess;
