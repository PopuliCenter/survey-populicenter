import React from 'react';
import Icon from './Icon';
import { analyzeQuestionSkipLogic } from '../utils/skipLogicHints';

/**
 * Badge + tooltip (hover/fokus) untuk pertanyaan yang punya skip logic.
 * Menampilkan ringkasan tiap aturan percabangan dan peringatan bila ada
 * konfigurasi bermasalah (lompatan mundur, tujuan kosong, dll).
 *
 * @param {{ question: object, questions: Array }} props
 */
function SkipLogicHint({ question, questions = [] }) {
  const analysis = analyzeQuestionSkipLogic(question, questions);
  if (!analysis.hasBranching) return null;

  const hasWarning = analysis.warnings.length > 0;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {/* Badge bercabang + tooltip rincian */}
      <span className="relative group inline-flex">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-600 cursor-help focus:outline-none focus:ring-2 focus:ring-indigo-300"
          tabIndex={0}
          role="button"
          aria-label={`Bercabang: ${analysis.ruleCount} aturan skip logic. Arahkan kursor untuk rincian.`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 3v6a3 3 0 003 3h6m3-3l-3 3 3 3M6 12v9" />
          </svg>
          Bercabang · {analysis.ruleCount} aturan
        </span>

        {/* Tooltip */}
        <span className="pointer-events-none absolute left-0 top-full mt-1 z-30 hidden group-hover:block group-focus-within:block w-72 max-w-[18rem] rounded-lg bg-gray-900 text-white text-xs shadow-lg p-3 space-y-1.5">
          <span className="block font-semibold text-indigo-200">Aturan percabangan</span>
          {analysis.rules.map((r, i) => (
            <span key={i} className="block leading-snug">
              <span className="text-gray-300">{i + 1}.</span> {r.summary}
              {r.warning && (
                <span className="block text-amber-300 mt-0.5"><Icon name="alert" className="w-3 h-3 inline shrink-0" /> {r.warning}</span>
              )}
            </span>
          ))}
          <span className="block border-t border-gray-700 pt-1.5 mt-1 text-gray-500">
            Pertanyaan <strong className="text-gray-200">wajib</strong> pada cabang yang dilewati otomatis tidak diwajibkan.
            Susun blok cabang secara <strong className="text-gray-200">berurutan</strong>.
          </span>
        </span>
      </span>

      {/* Badge peringatan bila ada masalah */}
      {hasWarning && (
        <span className="relative group inline-flex">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 cursor-help focus:outline-none focus:ring-2 focus:ring-amber-300"
            tabIndex={0}
            role="button"
            aria-label={`Perlu dicek: ${analysis.warnings.length} masalah pada skip logic.`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.48 14.7A1.5 1.5 0 003.1 21h17.8a1.5 1.5 0 001.29-2.44l-8.48-14.7a1.5 1.5 0 00-2.42 0z" />
            </svg>
            Perlu dicek
          </span>
          <span className="pointer-events-none absolute left-0 top-full mt-1 z-30 hidden group-hover:block group-focus-within:block w-72 max-w-[18rem] rounded-lg bg-gray-900 text-white text-xs shadow-lg p-3 space-y-1">
            {analysis.warnings.map((w, i) => (
              <span key={i} className="block leading-snug text-amber-200"><Icon name="alert" className="w-3 h-3 inline shrink-0" /> {w}</span>
            ))}
          </span>
        </span>
      )}
    </div>
  );
}

export default SkipLogicHint;
