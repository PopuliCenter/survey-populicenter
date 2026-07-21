import React from 'react';

/**
 * Tabel breakdown progress per TPD dalam satu survei.
 * Menerima data melalui props, tidak melakukan fetch API.
 *
 * @param {{ surveyors: Array<{
 *   surveyorId: string,
 *   surveyorName: string,
 *   quota: number,
 *   collected: number,
 *   percentage: number,
 *   remaining: number,
 * }> }} props
 */
function SurveyorProgressTable({ surveyors = [] }) {
  if (surveyors.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-8">
        Belum ada TPD yang ditugaskan untuk survei ini.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left" role="table">
        <thead>
          <tr className="border-b border-gray-100">
            <th scope="col" className="pb-2 pr-4 font-medium text-gray-500 w-8">No</th>
            <th scope="col" className="pb-2 pr-4 font-medium text-gray-500">Nama TPD</th>
            <th scope="col" className="pb-2 pr-4 font-medium text-gray-500 text-right">Kuota</th>
            <th scope="col" className="pb-2 pr-4 font-medium text-gray-500 text-right">Terkumpul</th>
            <th scope="col" className="pb-2 pr-4 font-medium text-gray-500 text-right">Persentase</th>
            <th scope="col" className="pb-2 font-medium text-gray-500 text-right">Sisa</th>
          </tr>
        </thead>
        <tbody>
          {surveyors.map((s, index) => (
            <tr key={s.surveyorId} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <td className="py-2.5 pr-4 text-gray-500 font-medium">{index + 1}</td>
              <td className="py-2.5 pr-4 text-gray-800 font-medium">{s.surveyorName}</td>
              <td className="py-2.5 pr-4 text-right text-gray-600">{s.quota}</td>
              <td className="py-2.5 pr-4 text-right text-gray-600">{s.collected}</td>
              <td className="py-2.5 pr-4 text-right">
                {s.percentage >= 100 ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                    Selesai
                  </span>
                ) : (
                  <span className={s.percentage < 50 ? 'text-red-600 font-medium' : 'text-gray-700'}>
                    {s.percentage}%
                  </span>
                )}
              </td>
              <td className="py-2.5 text-right text-gray-600">{s.remaining}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SurveyorProgressTable;
