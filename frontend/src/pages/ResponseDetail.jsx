import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import ReviewStatusBadge from '../components/ReviewStatusBadge';
import api from '../services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format an ISO timestamp string to local id-ID locale string.
 *
 * @param {string|null} isoStr
 * @returns {string}
 */
function formatTimestamp(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString('id-ID');
}

/**
 * Format duration in seconds to mm:ss string.
 *
 * @param {number|null} seconds
 * @returns {string}
 */
function formatDurationMmSs(seconds) {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Metadata Row ─────────────────────────────────────────────────────────────
/**
 * A single label/value row in the metadata section.
 *
 * @param {{ label: string, value: React.ReactNode }} props
 */
function MetaRow({ label, value }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-0">
      <dt className="w-full sm:w-48 text-sm font-medium text-gray-500 shrink-0">
        {label}
      </dt>
      <dd className="text-sm text-gray-800">{value ?? '—'}</dd>
    </div>
  );
}

// ─── Answer Card ──────────────────────────────────────────────────────────────
/**
 * Renders a single answer with question text, type, and value.
 *
 * @param {{ answer: object, index: number }} props
 */
function AnswerCard({ answer, index }) {
  // Resolve media URL — gunakan server URL dari localStorage (Capacitor) atau relative path (web)
  function resolveMediaUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    // Di Capacitor native, perlu absolute URL
    const serverUrl = localStorage.getItem('api_server_url');
    if (serverUrl) return `${serverUrl}/${path.replace(/^\//, '')}`;
    // Di web, relative path via nginx
    return `/${path.replace(/^\//, '')}`;
  }

  function renderValue() {
    if (answer.question_type === 'photo') {
      if (!answer.photo_path) return <span className="text-gray-400 italic">Tidak ada foto</span>;
      const src = resolveMediaUrl(answer.photo_path);
      return (
        <a href={src} target="_blank" rel="noopener noreferrer">
          <img
            src={src}
            alt={`Foto jawaban pertanyaan ${index + 1}`}
            className="max-w-[200px] rounded-lg border border-gray-200 mt-1 hover:border-primary-400 transition-colors"
            loading="lazy"
          />
        </a>
      );
    }

    if (answer.question_type === 'multiple_choice') {
      if (answer.answer_json) {
        try {
          const parsed = Array.isArray(answer.answer_json)
            ? answer.answer_json
            : JSON.parse(answer.answer_json);
          return (
            <span className="text-gray-800">
              {Array.isArray(parsed) ? parsed.map((v) => v.startsWith('__other__:') ? v.replace('__other__:', '') : v).join(', ') : String(parsed)}
            </span>
          );
        } catch {
          // fall through to answer_value
        }
      }
      return <span className="text-gray-800">{answer.answer_value ?? '—'}</span>;
    }

    if (answer.question_type === 'rating_scale') {
      if (!answer.answer_value) return <span className="text-gray-400 italic">—</span>;
      const numVal = parseInt(answer.answer_value, 10);
      const config = answer.question_options || {};
      const { max = 5, display = 'stars', labels = {} } = config;

      if (display === 'stars') {
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              {Array.from({ length: max }, (_, i) => i + 1).map((i) => (
                <span
                  key={i}
                  className={`text-xl ${i <= numVal ? 'text-amber-400' : 'text-gray-200'}`}
                  aria-hidden="true"
                >
                  ★
                </span>
              ))}
              <span className="ml-2 text-sm font-semibold text-gray-700">
                {numVal}/{max}
              </span>
            </div>
            {(labels.min || labels.max) && (
              <div className="flex justify-between text-xs text-gray-400 max-w-xs">
                <span>{labels.min || ''}</span>
                <span>{labels.max || ''}</span>
              </div>
            )}
          </div>
        );
      }

      // display === 'numbers'
      return (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary-600 text-white text-sm font-bold">
            {numVal}
          </span>
          <span className="text-sm text-gray-500">dari {max}</span>
          {(labels.min || labels.max) && (
            <span className="text-xs text-gray-400">
              ({labels.min || ''} – {labels.max || ''})
            </span>
          )}
        </div>
      );
    }

    if (answer.question_type === 'time') {
      return <span className="text-gray-800">{answer.answer_value ?? '—'}</span>;
    }

    if (answer.question_type === 'matrix') {
      const matrixAnswer = answer.answer_json;
      const options = answer.question_options || {};
      const rows = options.rows || [];
      const columns = options.columns || [];

      if (!matrixAnswer || (typeof matrixAnswer === 'object' && Object.keys(matrixAnswer).length === 0)) {
        return <span className="text-gray-400 italic">Tidak ada jawaban</span>;
      }

      return (
        <div className="overflow-x-auto mt-1">
          <table className="min-w-full border border-gray-200 rounded-lg text-sm" role="grid" aria-label="Jawaban matrix">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-600" scope="col">
                  Aspek
                </th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="border border-gray-200 px-3 py-2 text-center font-medium text-gray-600"
                    scope="col"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row} className="hover:bg-gray-50">
                  <td className="border border-gray-200 px-3 py-2 font-medium text-gray-700" scope="row">
                    {row}
                  </td>
                  {columns.map((col) => {
                    const isSelected = matrixAnswer[row] === col;
                    return (
                      <td
                        key={col}
                        className={`border border-gray-200 px-3 py-2 text-center ${
                          isSelected ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-gray-300'
                        }`}
                      >
                        {isSelected ? '✓' : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (answer.question_type === 'indonesia_region') {
      const v = answer.answer_json;
      if (!v || typeof v !== 'object' || !v.province_id) {
        return <span className="text-gray-400 italic">Tidak ada jawaban</span>;
      }
      const parts = [
        v.province_name && { label: 'Provinsi', value: v.province_name },
        v.regency_name && { label: 'Kabupaten/Kota', value: v.regency_name },
        v.district_name && { label: 'Kecamatan', value: v.district_name },
        v.village_name && { label: 'Desa/Kelurahan', value: v.village_name },
      ].filter(Boolean);
      return (
        <div className="space-y-1 mt-1">
          {parts.map((p) => (
            <div key={p.label} className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 w-32 shrink-0">{p.label}:</span>
              <span className="text-gray-800 font-medium">{p.value}</span>
            </div>
          ))}
        </div>
      );
    }

    return <span className="text-gray-800">{answer.answer_value && answer.answer_value.startsWith('__other__:') ? answer.answer_value.replace('__other__:', '') : (answer.answer_value ?? '—')}</span>;
  }

  const typeLabel = {
    single_choice: 'Pilihan Tunggal',
    multiple_choice: 'Pilihan Ganda',
    short_text: 'Teks Pendek',
    long_text: 'Teks Panjang',
    numeric_scale: 'Skala Numerik',
    date: 'Tanggal',
    photo: 'Upload Foto',
    rating_scale: 'Rating Scale',
    phone_number: 'Nomor Telepon',
    unique_id: 'Nomor Kuesioner (Unik)',
    time: 'Waktu',
    matrix: 'Matrix/Grid',
    indonesia_region: 'Wilayah Indonesia',
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-800">
          <span className="text-gray-400 mr-2">{index + 1}.</span>
          {answer.question_text || '(Pertanyaan tidak tersedia)'}
        </p>
        <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
          {typeLabel[answer.question_type] || answer.question_type}
        </span>
      </div>
      <div className="pl-5">{renderValue()}</div>
    </div>
  );
}

// ─── ResponseDetail Page ──────────────────────────────────────────────────────
/**
 * Response detail page for admin.
 *
 * Route: /responses/:id
 *
 * Displays:
 * - Metadata: questionnaire number, TPD, survey title, timestamps,
 *             duration, geo status, lat/lng
 * - All answers: question text, type, value (photo thumbnail for photo type)
 *
 * Requirements: 11.1, 11.7, 13.5, 15.5, 15.7, 16.6
 */
function ResponseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  // ── Current user (for role-based visibility) ──────────────────────────────
  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();
  const userRole = currentUser.role || '';
  const canEditReview = ['admin', 'supervisor', 'asisten_supervisor'].includes(userRole);
  const canViewReview = canEditReview || ['viewer', 'partner_lokal'].includes(userRole);

  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // ── Review panel state ────────────────────────────────────────────────────
  const [reviewStatus, setReviewStatus] = useState('unreviewed');
  const [reviewNote, setReviewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function loadResponse() {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await api.get(`/responses/${id}`);
        setResponse(res.data);
        // Populate review panel state from loaded data
        if (res.data.review_status) setReviewStatus(res.data.review_status);
        if (res.data.review_note != null) setReviewNote(res.data.review_note || '');
      } catch (err) {
        setFetchError(
          err.response?.data?.message ||
            err.message ||
            'Gagal memuat detail responden.'
        );
      } finally {
        setLoading(false);
      }
    }
    loadResponse();
  }, [id]);

  // ── Save review ───────────────────────────────────────────────────────────
  async function handleSaveReview() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = await api.patch(`/responses/${id}/review`, {
        review_status: reviewStatus,
        review_note: reviewNote || null,
      });
      // Update local response state with new review data
      setResponse((prev) => ({
        ...prev,
        review_status: res.data.review_status,
        review_note: res.data.review_note,
        reviewed_by: res.data.reviewed_by,
        reviewed_at: res.data.reviewed_at,
        reviewer_name: res.data.reviewer_name,
      }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(
        err.response?.data?.error ||
          err.message ||
          'Gagal menyimpan review.'
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-5 max-w-4xl">
        {/* Back button */}
        <button
          onClick={() => navigate('/responses')}
          className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-800 transition-colors focus:outline-none focus:underline"
          aria-label="Kembali ke daftar responden"
        >
          <span aria-hidden="true">←</span> Kembali ke Daftar Responden
        </button>

        {loading ? (
          <div
            className="flex items-center justify-center h-48 text-gray-400 text-sm"
            role="status"
            aria-live="polite"
          >
            Memuat detail responden…
          </div>
        ) : fetchError ? (
          <div
            className="flex flex-col items-center justify-center h-48 gap-3"
            role="alert"
          >
            <p className="text-red-600 text-sm">{fetchError}</p>
            <button
              onClick={() => navigate('/responses')}
              className="text-sm text-primary-600 underline hover:text-primary-800"
            >
              Kembali ke daftar
            </button>
          </div>
        ) : response ? (
          <>
            {/* Page header */}
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                Detail Responden
              </h1>
              {response.questionnaire_number && (
                <p className="text-sm text-gray-500 mt-0.5 font-mono">
                  {response.questionnaire_number}
                </p>
              )}
            </div>

            {/* Metadata card */}
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-base font-semibold text-gray-700 mb-4">
                Informasi Metadata
              </h2>
              <dl className="space-y-3">
                <MetaRow
                  label="Nomor Kuesioner"
                  value={
                    <span className="font-mono">
                      {response.questionnaire_number || '—'}
                    </span>
                  }
                />
                <MetaRow label="Nama TPD" value={response.surveyor_name} />
                <MetaRow label="Judul Survei" value={response.survey_title} />
                <MetaRow
                  label="Waktu Mulai"
                  value={formatTimestamp(response.start_time)}
                />
                <MetaRow
                  label="Waktu Selesai"
                  value={formatTimestamp(response.end_time)}
                />
                <MetaRow
                  label="Durasi Pengisian"
                  value={
                    response.duration_seconds != null ? (
                      <span>
                        {response.duration_seconds} detik{' '}
                        <span className="text-gray-400">
                          ({formatDurationMmSs(response.duration_seconds)})
                        </span>
                      </span>
                    ) : (
                      '—'
                    )
                  }
                />
                <MetaRow
                  label="Status Geolokasi"
                  value={
                    <span>
                      {response.geo_status === 'available'
                        ? '✅ Tersedia'
                        : response.geo_status === 'lokasi_tidak_tersedia'
                        ? '⚠️ Ditolak'
                        : response.geo_status === 'tidak_didukung'
                        ? '❌ Tidak Didukung'
                        : response.geo_status === 'timeout'
                        ? '⏱️ Timeout'
                        : response.geo_status || '—'}
                    </span>
                  }
                />
                {response.geo_status === 'available' && (
                  <>
                    <MetaRow
                      label="Latitude"
                      value={
                        response.latitude != null
                          ? Number(response.latitude).toFixed(6)
                          : '—'
                      }
                    />
                    <MetaRow
                      label="Longitude"
                      value={
                        response.longitude != null
                          ? Number(response.longitude).toFixed(6)
                          : '—'
                      }
                    />
                  </>
                )}
              </dl>
            </div>

            {/* ── Media Attachments (Audio, Signature, Photos) ── */}
            {(response.audio_path || response.signature_path || (response.photo_paths && response.photo_paths.length > 0)) && (() => {
              // Helper untuk resolve URL media
              function mediaUrl(path) {
                if (!path) return null;
                if (path.startsWith('http')) return path;
                const serverUrl = localStorage.getItem('api_server_url');
                if (serverUrl) return `${serverUrl}/${path.replace(/^\//, '')}`;
                return `/${path.replace(/^\//, '')}`;
              }

              return (
                <div className="bg-white rounded-xl shadow p-6 space-y-5">
                  <h2 className="text-base font-semibold text-gray-700">Lampiran Media</h2>

                  {/* Audio Recording */}
                  {response.audio_path && (
                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-2">🎙️ Rekaman Audio</p>
                      <audio controls preload="metadata" className="w-full max-w-md" src={mediaUrl(response.audio_path)}>
                        Browser Anda tidak mendukung pemutar audio.
                      </audio>
                      <p className="text-xs text-gray-400 mt-1">Klik play untuk mendengarkan rekaman wawancara</p>
                    </div>
                  )}

                  {/* Signature Image */}
                  {response.signature_path && (
                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-2">✍️ Tanda Tangan</p>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 inline-block">
                        <img src={mediaUrl(response.signature_path)} alt="Tanda tangan responden"
                          className="max-w-xs max-h-32 object-contain" loading="lazy" />
                      </div>
                    </div>
                  )}

                  {/* Photos */}
                  {response.photo_paths && response.photo_paths.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-2">📷 Foto Dokumentasi ({response.photo_paths.length})</p>
                      <div className="flex flex-wrap gap-3">
                        {response.photo_paths.map((path, idx) => (
                          <a key={idx} href={mediaUrl(path)} target="_blank" rel="noopener noreferrer" className="block">
                            <img src={mediaUrl(path)} alt={`Foto dokumentasi ${idx + 1}`}
                              className="w-32 h-32 object-cover rounded-lg border border-gray-200 hover:border-primary-400 transition-colors" loading="lazy" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Review panel — visible for admin, supervisor, viewer; hidden for TPD */}
            {canViewReview && (
              <div className="bg-white rounded-xl shadow p-6">
                <h2 className="text-base font-semibold text-gray-700 mb-4">
                  Review Respons
                </h2>

                {canEditReview ? (
                  /* Editable panel for admin/supervisor */
                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor="review-status"
                        className="block text-sm font-medium text-gray-600 mb-1"
                      >
                        Status Review
                      </label>
                      <select
                        id="review-status"
                        value={reviewStatus}
                        onChange={(e) => setReviewStatus(e.target.value)}
                        className="w-full sm:w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                      >
                        <option value="unreviewed">Unreviewed</option>
                        <option value="flagged">Flagged</option>
                        <option value="verified">Verified</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="review-note"
                        className="block text-sm font-medium text-gray-600 mb-1"
                      >
                        Catatan Review
                      </label>
                      <textarea
                        id="review-note"
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        rows={3}
                        placeholder="Tambahkan catatan review (opsional)"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-y"
                      />
                    </div>

                    {/* Reviewer info */}
                    {response.reviewer_name && (
                      <div className="text-xs text-gray-400">
                        Terakhir direview oleh{' '}
                        <span className="font-medium text-gray-600">
                          {response.reviewer_name}
                        </span>{' '}
                        pada {formatTimestamp(response.reviewed_at)}
                      </div>
                    )}

                    {/* Save button and notifications */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleSaveReview}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saving ? 'Menyimpan…' : 'Simpan Review'}
                      </button>

                      {saveSuccess && (
                        <span className="text-sm text-green-600 font-medium">
                          ✓ Review berhasil disimpan
                        </span>
                      )}

                      {saveError && (
                        <span className="text-sm text-red-600">
                          {saveError}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Read-only panel for viewer */
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-500">Status:</span>
                      <ReviewStatusBadge status={response.review_status} />
                    </div>

                    {response.review_note && (
                      <div>
                        <span className="text-sm font-medium text-gray-500">Catatan:</span>
                        <p className="text-sm text-gray-800 mt-1">{response.review_note}</p>
                      </div>
                    )}

                    {response.reviewer_name && (
                      <div className="text-xs text-gray-400">
                        Direview oleh{' '}
                        <span className="font-medium text-gray-600">
                          {response.reviewer_name}
                        </span>{' '}
                        pada {formatTimestamp(response.reviewed_at)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Answers section */}
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-base font-semibold text-gray-700 mb-4">
                Jawaban Responden
                {Array.isArray(response.answers) && (
                  <span className="ml-2 text-sm font-normal text-gray-400">
                    ({response.answers.length} pertanyaan)
                  </span>
                )}
              </h2>

              {!Array.isArray(response.answers) ||
              response.answers.length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  Tidak ada jawaban tersedia.
                </p>
              ) : (
                <div className="space-y-3">
                  {response.answers.map((answer, idx) => (
                    <AnswerCard
                      key={idx}
                      answer={answer}
                      index={idx}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </Layout>
  );
}

export default ResponseDetail;
