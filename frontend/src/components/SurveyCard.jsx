import React from 'react';
import { SurveyStatusBadge, TemporalBadge } from './SurveyBadges';
import IconButton from './IconButton';

/**
 * Komponen kartu untuk menampilkan satu survei dalam mode grid.
 *
 * @param {{
 *   survey: object,
 *   onBuilder: (survey) => void,
 *   onClone: (survey) => void,
 *   onActivate: (survey) => void,
 *   cloningId: string | null,
 *   onConfirmDelete: (id) => void,
 *   onConfirmDeactivate: (id) => void,
 *   formatDate: (dateStr) => string,
 * }} props
 */
function SurveyCard({
  survey,
  onBuilder,
  onClone,
  onActivate,
  cloningId,
  onConfirmDelete,
  onConfirmDeactivate,
  formatDate,
}) {
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
      <div className="flex items-center gap-1.5 pt-3 border-t border-gray-100">
        {/* Builder */}
        <IconButton
          icon="builder"
          variant="primary"
          label={`Buka builder survei ${survey.title}`}
          onClick={() => onBuilder(survey)}
        />

        {/* Duplikasi */}
        <IconButton
          icon="duplicate"
          variant="accent"
          label={cloningId === survey.id ? `Menduplikasi ${survey.title}…` : `Duplikasi survei ${survey.title}`}
          onClick={() => onClone(survey)}
          disabled={cloningId === survey.id}
        />

        {/* Aktifkan (draft atau inactive) */}
        {(survey.status === 'draft' || survey.status === 'inactive') && (
          <IconButton
            icon="activate"
            variant="success"
            label={`Aktifkan survei ${survey.title}`}
            onClick={() => onActivate(survey)}
          />
        )}

        {/* Nonaktifkan (active) */}
        {survey.status === 'active' && (
          <IconButton
            icon="deactivate"
            variant="warning"
            label={`Nonaktifkan survei ${survey.title}`}
            onClick={() => onConfirmDeactivate(survey.id)}
          />
        )}

        {/* Hapus (draft tanpa responden) */}
        {canDelete && (
          <IconButton
            icon="trash"
            variant="danger"
            label={`Hapus survei ${survey.title}`}
            onClick={() => onConfirmDelete(survey.id)}
          />
        )}
      </div>
    </div>
  );
}

export default SurveyCard;
