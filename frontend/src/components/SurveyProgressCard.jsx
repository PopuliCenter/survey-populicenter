import React from 'react';

/**
 * Card progress untuk satu survei aktif.
 * Menerima data progress melalui props, tidak melakukan fetch API.
 *
 * @param {{
 *   surveyTitle: string,
 *   totalQuota: number,
 *   totalCollected: number,
 *   completionPercentage: number,
 *   onClick?: () => void,
 * }} props
 */
function SurveyProgressCard({ surveyTitle, totalQuota, totalCollected, completionPercentage, onClick }) {
  // Tentukan warna progress bar
  let barColor = 'bg-red-500';       // < 50%
  if (completionPercentage >= 100) {
    barColor = 'bg-green-500';        // 100%
  } else if (completionPercentage >= 50) {
    barColor = 'bg-yellow-500';       // 50-99%
  }

  const widthPercent = Math.min(100, completionPercentage);

  return (
    <div
      className="bg-white rounded-lg shadow p-5 cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
      aria-label={`Progress survei ${surveyTitle}: ${completionPercentage}%`}
    >
      <h3 className="text-sm font-semibold text-gray-800 mb-2 truncate">{surveyTitle}</h3>
      <div
        className="w-full bg-gray-200 rounded-full h-3 overflow-hidden"
        role="progressbar"
        aria-valuenow={completionPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progres: ${completionPercentage}%`}
      >
        <div
          className={`h-3 rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${widthPercent}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-500">
          {totalCollected} dari {totalQuota} responden
        </span>
        <span className={`text-xs font-semibold ${
          completionPercentage >= 100 ? 'text-green-600' :
          completionPercentage >= 50 ? 'text-yellow-600' : 'text-red-600'
        }`}>
          {completionPercentage}%
        </span>
      </div>
    </div>
  );
}

export default SurveyProgressCard;
