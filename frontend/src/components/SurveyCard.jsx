import React from 'react';
import { SurveyStatusBadge, TemporalBadge } from './SurveyBadges';

/**
 * Komponen kartu untuk menampilkan satu survei dalam mode grid.
 *
 * @param {{
 *   survey: object,
 *   onBuilder: (survey) => void,
 *   onClone: (survey) => void,
 *   onActivate: (survey) => void,
 *   onDeactivate: (survey) => void,
 *   onDelete: (survey) => void,
 *   cloningId: string | null,
 *   confirmDeleteId: string | null,
 *   onConfirmDelete: (id) => void,
 *   onCancelDelete: () => void,
 *   confirmDeactivateId: string | null,
 *   onConfirmDeactivate: (id) => void,
 *   onCancelDeactivate: () => void,
 *   formatDate: (dateStr) => string,
 * }} props
 */
function SurveyCard({
  survey,
  onBuilder,
  onClone,
  onActivate,
  onDeactivate,
  onDelete,
  cloningId,
  confirmDeleteId,
  onConfirmDelete,
  onCancelDelete,
  confirmDeactivateId,
  onConfirmDeactivate,
  onCancelDeactivate,
  formatDate,
}) {
  const isConfirmingDelete = confirmDeleteId === survey.id;
  const isConfirmingDeactivate = confirmDeactivateId === survey.id;
  const canDelete =
    survey.status === 'draft' && (survey.response_count ?? 0) === 0;

  return (
    <div className="bg-white rounded-xl shadow border border-gray-100 hover:shadow-md transition-shadow p-5 flex flex-col">
      {/* Header: Judul + Badges */}
      <div className="mb-3">
        <h3
          className="text-sm font-semibold text-gray-800 truncate"
          title={survey.title}
        >
          {survey.title}
        </h3>
        <div className="flex items-center gap-1.5 mt-1.5">
          <SurveyStatusBadge status={survey.status} />
          <TemporalBadge startDate={survey.start_date} endDate={survey.end_date} />
        </div>
      </div>

      {/* Body: Metadata */}
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-4 flex-1">
        <div>
          <span className="block text-gray-400">Pertanyaan</span>
          <span className="font-medium text-gray-700">{survey.question_count ?? 0}</span>
        </div>
        <div>
          <span className="block text-gray-400">Responden</span>
          <span className="font-medium text-gray-700">{survey.response_count ?? 0}</span>
        </div>
        <div className="col-span-2">
          <span className="block text-gray-400">Dibuat</span>
          <span className="font-medium text-gray-700">{formatDate(survey.created_at)}</span>
        </div>
      </div>

      {/* Footer: Tombol Aksi */}
      <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-gray-100">
        {/* Builder */}
        <button
          onClick={() => onBuilder(survey)}
          className="px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary-300"
          aria-label={`Buka builder untuk survei ${survey.title}`}
        >
          Builder
        </button>

        {/* Duplikasi */}
        <button
          onClick={() => onClone(survey)}
          disabled={cloningId === survey.id}
          className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-60 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-purple-300"
          aria-label={`Duplikasi survei ${survey.title}`}
        >
          {cloningId === survey.id ? 'Menduplikasi…' : 'Duplikasi'}
        </button>

        {/* Aktifkan (draft atau inactive) */}
        {(survey.status === 'draft' || survey.status === 'inactive') && (
          <button
            onClick={() => onActivate(survey)}
            className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-300"
            aria-label={`Aktifkan survei ${survey.title}`}
          >
            Aktifkan
          </button>
        )}

        {/* Nonaktifkan (active) */}
        {survey.status === 'active' && (
          <>
            {isConfirmingDeactivate ? (
              <span className="flex items-center gap-1.5">
                <span className="text-xs text-gray-600">Nonaktifkan?</span>
                <button
                  onClick={() => onDeactivate(survey)}
                  className="px-2.5 py-1 text-xs font-medium text-white bg-yellow-500 hover:bg-yellow-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-300"
                  aria-label={`Konfirmasi nonaktifkan ${survey.title}`}
                >
                  Ya
                </button>
                <button
                  onClick={onCancelDeactivate}
                  className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
                  aria-label="Batal nonaktifkan"
                >
                  Batal
                </button>
              </span>
            ) : (
              <button
                onClick={() => onConfirmDeactivate(survey.id)}
                className="px-3 py-1.5 text-xs font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-300"
                aria-label={`Nonaktifkan survei ${survey.title}`}
              >
                Nonaktifkan
              </button>
            )}
          </>
        )}

        {/* Hapus (draft tanpa responden) */}
        {canDelete && (
          <>
            {isConfirmingDelete ? (
              <span className="flex items-center gap-1.5">
                <span className="text-xs text-gray-600">Hapus?</span>
                <button
                  onClick={() => onDelete(survey)}
                  className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                  aria-label={`Konfirmasi hapus ${survey.title}`}
                >
                  Ya
                </button>
                <button
                  onClick={onCancelDelete}
                  className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
                  aria-label="Batal hapus"
                >
                  Batal
                </button>
              </span>
            ) : (
              <button
                onClick={() => onConfirmDelete(survey.id)}
                className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                aria-label={`Hapus survei ${survey.title}`}
              >
                Hapus
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default SurveyCard;
