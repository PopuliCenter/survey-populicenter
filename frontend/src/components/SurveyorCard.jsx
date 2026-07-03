import React from 'react';
import { StatusBadge, QuotaPanel } from './SurveyorBadges';
import IconButton from './IconButton';

/**
 * Komponen kartu untuk menampilkan satu TPD dalam mode grid.
 *
 * @param {{
 *   surveyor: object,
 *   currentUser: object,
 *   onEdit: (surveyor) => void,
 *   onActivate: (surveyor) => void,
 *   onConfirmDeactivate: (id) => void,
 *   onConfirmDelete: (id) => void,
 *   expandedQuotaId: string | null,
 *   onToggleQuota: (id) => void,
 *   formatDate: (dateStr) => string,
 * }} props
 */
function SurveyorCard({
  surveyor,
  responseCount,
  currentUser,
  onEdit,
  onActivate,
  onConfirmDeactivate,
  onConfirmDelete,
  surveyContext,
  onUnassign,
  expandedQuotaId,
  onToggleQuota,
  formatDate,
}) {
  const isQuotaExpanded = expandedQuotaId === surveyor.id;

  return (
    <div className="bg-white rounded-xl shadow border border-gray-100 hover:shadow-md transition-shadow p-5 flex flex-col">
      {/* Header: Nama + Badge Status */}
      <div className="mb-3">
        <h3
          className="text-sm font-semibold text-gray-800 truncate"
          title={surveyor.name}
        >
          {surveyor.name}
        </h3>
        <div className="flex items-center gap-1.5 mt-1.5">
          <StatusBadge isActive={surveyor.is_active} />
        </div>
      </div>

      {/* Body: Metadata */}
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-4 flex-1">
        <div className="col-span-2">
          <span className="block text-gray-400">Email</span>
          <span className="font-medium text-gray-700 truncate block" title={surveyor.email}>
            {surveyor.email}
          </span>
        </div>
        <div>
          <span className="block text-gray-400">Responden</span>
          <span className="font-medium text-gray-700">{responseCount ?? surveyor.response_count ?? 0}</span>
        </div>
        <div>
          <span className="block text-gray-400">Bergabung</span>
          <span className="font-medium text-gray-700">{formatDate(surveyor.created_at)}</span>
        </div>
      </div>

      {/* Footer: Tombol Aksi */}
      <div className="flex items-center gap-1.5 pt-3 border-t border-gray-100">
        {/* Lihat Kuota */}
        <IconButton
          icon={isQuotaExpanded ? 'quotaHide' : 'quota'}
          variant="info"
          label={isQuotaExpanded ? `Sembunyikan kuota ${surveyor.name}` : `Lihat kuota ${surveyor.name}`}
          onClick={() => onToggleQuota(surveyor.id)}
          aria-expanded={isQuotaExpanded}
        />

        {/* Edit */}
        <IconButton
          icon="edit"
          variant="primary"
          label={`Edit TPD ${surveyor.name}`}
          onClick={() => onEdit(surveyor)}
        />

        {/* Nonaktifkan / Aktifkan */}
        {surveyor.is_active ? (
          <IconButton
            icon="deactivate"
            variant="danger"
            label={`Nonaktifkan TPD ${surveyor.name}`}
            onClick={() => onConfirmDeactivate(surveyor.id)}
          />
        ) : (
          <IconButton
            icon="activate"
            variant="success"
            label={`Aktifkan kembali TPD ${surveyor.name}`}
            onClick={() => onActivate(surveyor)}
          />
        )}

        {/* Per survei: Lepas dari survei ini. Mode datar: Hapus akun (admin) */}
        {surveyContext ? (
          <IconButton
            icon="unassign"
            variant="warning"
            label={`Lepas ${surveyor.name} dari survei ini`}
            onClick={() => onUnassign(surveyor.id)}
          />
        ) : currentUser.role === 'admin' ? (
          <IconButton
            icon="trash"
            variant="danger"
            label={`Hapus akun TPD ${surveyor.name}`}
            onClick={() => onConfirmDelete(surveyor.id)}
          />
        ) : null}
      </div>

      {/* Expandable Quota Panel */}
      {isQuotaExpanded && (
        <div className="mt-3 -mx-5 -mb-5 rounded-b-xl overflow-hidden">
          <QuotaPanel surveyorId={surveyor.id} />
        </div>
      )}
    </div>
  );
}

export default SurveyorCard;
