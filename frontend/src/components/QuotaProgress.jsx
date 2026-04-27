import React from 'react';

/**
 * Reusable quota progress indicator component.
 *
 * @param {{
 *   filled: number,
 *   quota: number | null,
 *   showLabel?: boolean,
 * }} props
 *   - filled: number of responses already filled
 *   - quota: target quota (null = no quota set)
 *   - showLabel: whether to show the text label (default true)
 */
function QuotaProgress({ filled = 0, quota = null, showLabel = true }) {
  const hasQuota = quota !== null && quota > 0;
  const percentage = hasQuota ? Math.min(100, Math.round((filled / quota) * 100)) : 0;
  const targetMet = hasQuota && filled >= quota;

  return (
    <div className="space-y-1">
      {/* Label row */}
      {showLabel && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-600">
            {hasQuota ? `${filled} / ${quota}` : `${filled} (tidak ada target)`}
          </span>
          {targetMet && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
              Target Terpenuhi
            </span>
          )}
        </div>
      )}

      {/* Progress bar — only shown when quota is set */}
      {hasQuota && (
        <div
          className="w-full bg-gray-200 rounded-full h-2 overflow-hidden"
          role="progressbar"
          aria-valuenow={filled}
          aria-valuemin={0}
          aria-valuemax={quota}
          aria-label={`Progres kuota: ${filled} dari ${quota}`}
        >
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              targetMet ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default QuotaProgress;
