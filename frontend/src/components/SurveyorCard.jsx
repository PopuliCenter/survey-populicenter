import React from 'react';
import { StatusBadge, QuotaPanel } from './SurveyorBadges';

/**
 * Komponen kartu untuk menampilkan satu TPD dalam mode grid.
 *
 * @param {{
 *   surveyor: object,
 *   currentUser: object,
 *   onEdit: (surveyor) => void,
 *   onActivate: (surveyor) => void,
 *   onDeactivate: (surveyor) => void,
 *   onDelete: (surveyor) => void,
 *   confirmDeactivateId: string | null,
 *   onConfirmDeactivate: (id) => void,
 *   onCancelDeactivate: () => void,
 *   confirmDeleteId: string | null,
 *   onConfirmDelete: (id) => void,
 *   onCancelDelete: () => void,
 *   expandedQuotaId: string | null,
 *   onToggleQuota: (id) => void,
 *   formatDate: (dateStr) => string,
 * }} props
 */
function SurveyorCard({
  surveyor,
  currentUser,
  onEdit,
  onActivate,
  onDeactivate,
  onDelete,
  confirmDeactivateId,
  onConfirmDeactivate,
  onCancelDeactivate,
  confirmDeleteId,
  onConfirmDelete,
  onCancelDelete,
  expandedQuotaId,
  onToggleQuota,
  formatDate,
}) {
  const isConfirmingDeactivate = confirmDeactivateId === surveyor.id;
  const isConfirmingDelete = confirmDeleteId === surveyor.id;
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
          <span className="font-medium text-gray-700">{surveyor.response_count ?? 0}</span>
        </div>
        <div>
          <span className="block text-gray-400">Bergabung</span>
          <span className="font-medium text-gray-700">{formatDate(surveyor.created_at)}</span>
        </div>
      </div>

      {/* Footer: Tombol Aksi */}
      <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-gray-100">
        {/* Lihat Kuota */}
        <button
          onClick={() => onToggleQuota(surveyor.id)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
            isQuotaExpanded
              ? 'text-indigo-700 bg-indigo-100 hover:bg-indigo-200'
              : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
          }`}
          aria-expanded={isQuotaExpanded}
          aria-label={`${isQuotaExpanded ? 'Sembunyikan' : 'Lihat'} kuota ${surveyor.name}`}
        >
          {isQuotaExpanded ? 'Sembunyikan Kuota' : 'Lihat Kuota'}
        </button>

        {/* Edit */}
        <button
          onClick={() => onEdit(surveyor)}
          className="px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary-300"
          aria-label={`Edit TPD ${surveyor.name}`}
        >
          Edit
        </button>

        {/* Nonaktifkan / Aktifkan */}
        {surveyor.is_active ? (
          <>
            {isConfirmingDeactivate ? (
              <span className="flex items-center gap-1.5">
                <span className="text-xs text-gray-600">Nonaktifkan?</span>
                <button
                  onClick={() => onDeactivate(surveyor)}
                  className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                  aria-label={`Konfirmasi nonaktifkan ${surveyor.name}`}
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
                onClick={() => onConfirmDeactivate(surveyor.id)}
                className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                aria-label={`Nonaktifkan TPD ${surveyor.name}`}
              >
                Nonaktifkan
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => onActivate(surveyor)}
            className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-300"
            aria-label={`Aktifkan kembali TPD ${surveyor.name}`}
          >
            Aktifkan
          </button>
        )}

        {/* Hapus — admin only */}
        {currentUser.role === 'admin' && (
          <>
            {isConfirmingDelete ? (
              <span className="flex items-center gap-1.5">
                <span className="text-xs text-gray-600">Hapus permanen?</span>
                <button
                  onClick={() => onDelete(surveyor)}
                  className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                  aria-label={`Konfirmasi hapus ${surveyor.name}`}
                >
                  Ya, Hapus
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
                onClick={() => onConfirmDelete(surveyor.id)}
                className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                aria-label={`Hapus TPD ${surveyor.name}`}
              >
                Hapus
              </button>
            )}
          </>
        )}
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
