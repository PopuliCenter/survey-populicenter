import React, { useState, useMemo } from 'react';
import Icon from './Icon';

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/**
 * Group surveys by year → month based on created_at.
 * Returns: { [year]: { [monthIndex]: survey[] } } sorted descending.
 */
function groupByYearMonth(surveys) {
  const groups = {};
  for (const s of surveys) {
    const d = new Date(s.created_at);
    if (isNaN(d.getTime())) continue;
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-based
    if (!groups[year]) groups[year] = {};
    if (!groups[year][month]) groups[year][month] = [];
    groups[year][month].push(s);
  }
  return groups;
}

/**
 * SurveySelector — survey picker with list (dropdown) and grid (explorer) views.
 * Grid mode shows a file-explorer style: Year folders → Month folders → Survey cards.
 */
function SurveySelector({ surveys = [], value, onChange, label = 'Survei', required = false }) {
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [gridSearch, setGridSearch] = useState('');
  const [openYear, setOpenYear] = useState(null);
  const [openMonth, setOpenMonth] = useState(null);

  const selectedSurvey = surveys.find((s) => s.id === value);

  // Filter surveys for grid search
  const filteredSurveys = gridSearch.trim()
    ? surveys.filter((s) => s.title.toLowerCase().includes(gridSearch.toLowerCase()))
    : surveys;

  // Group by year/month
  const grouped = useMemo(() => groupByYearMonth(filteredSurveys), [filteredSurveys]);
  const sortedYears = useMemo(() => Object.keys(grouped).map(Number).sort((a, b) => b - a), [grouped]);

  // When searching, show flat grid (no folders)
  const isSearching = gridSearch.trim().length > 0;

  function handleYearClick(year) {
    if (openYear === year) {
      setOpenYear(null);
      setOpenMonth(null);
    } else {
      setOpenYear(year);
      setOpenMonth(null);
    }
  }

  function handleMonthClick(month) {
    setOpenMonth(openMonth === month ? null : month);
  }

  function renderSurveyCard(s) {
    const isSelected = s.id === value;
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => onChange(isSelected ? '' : s.id)}
        className={`text-left p-3 rounded-lg border-2 transition-all focus:outline-none focus:ring-2 focus:ring-primary-400 ${
          isSelected
            ? 'border-primary-500 bg-primary-50 shadow-sm'
            : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
        }`}
        aria-pressed={isSelected}
        title={s.title}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 text-sm ${
          isSelected ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-500'
        }`}>
          <Icon name="clipboard" className="w-4 h-4" />
        </div>
        <p className={`text-xs font-medium leading-tight line-clamp-2 ${
          isSelected ? 'text-primary-700' : 'text-gray-700'
        }`}>
          {s.title}
        </p>
        {s.status && (
          <span className={`inline-block mt-1.5 text-2xs px-1.5 py-0.5 rounded-full ${
            s.status === 'published'
              ? 'bg-green-100 text-green-700'
              : s.status === 'draft'
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {s.status === 'published' ? 'Aktif' : s.status === 'draft' ? 'Draft' : s.status}
          </span>
        )}
      </button>
    );
  }

  return (
    <div>
      {/* Label + view toggle */}
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-medium text-gray-600">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`p-1 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-primary-400 ${
              viewMode === 'list' ? 'text-primary-600 bg-primary-50' : 'text-gray-500 hover:text-gray-600'
            }`}
            aria-label="Tampilan list"
            title="Tampilan list"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`p-1 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-primary-400 ${
              viewMode === 'grid' ? 'text-primary-600 bg-primary-50' : 'text-gray-500 hover:text-gray-600'
            }`}
            aria-label="Tampilan grid"
            title="Tampilan grid"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
          </button>
        </div>
      </div>

      {/* List view (dropdown) */}
      {viewMode === 'list' && (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
        >
          <option value="">— Pilih Survei —</option>
          {surveys.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
      )}

      {/* Grid view (explorer) */}
      {viewMode === 'grid' && (
        <div className="space-y-2">
          {/* Search */}
          <input
            type="text"
            value={gridSearch}
            onChange={(e) => setGridSearch(e.target.value)}
            placeholder="Cari survei…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          />

          {/* Selected indicator */}
          {selectedSurvey && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 border border-primary-200 rounded-lg text-xs text-primary-700">
              <span>Terpilih:</span>
              <span className="font-medium truncate">{selectedSurvey.title}</span>
              <button
                type="button"
                onClick={() => onChange('')}
                className="ml-auto text-primary-400 hover:text-primary-600 focus:outline-none"
                aria-label="Hapus pilihan survei"
              >
                <Icon name="close" className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Breadcrumb */}
          {!isSearching && (openYear !== null) && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <button
                type="button"
                onClick={() => { setOpenYear(null); setOpenMonth(null); }}
                className="hover:text-primary-600 focus:outline-none"
              >
                Semua
              </button>
              <span>/</span>
              <button
                type="button"
                onClick={() => setOpenMonth(null)}
                className={`hover:text-primary-600 focus:outline-none ${openMonth === null ? 'text-gray-800 font-medium' : ''}`}
              >
                {openYear}
              </button>
              {openMonth !== null && (
                <>
                  <span>/</span>
                  <span className="text-gray-800 font-medium">{MONTH_NAMES[openMonth]}</span>
                </>
              )}
            </div>
          )}

          {/* Content area */}
          <div className="max-h-72 overflow-y-auto pr-1">
            {filteredSurveys.length === 0 ? (
              <p className="text-center text-xs text-gray-500 py-6">
                {gridSearch ? 'Tidak ada survei yang cocok.' : 'Belum ada survei.'}
              </p>
            ) : isSearching ? (
              /* Flat grid when searching */
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {filteredSurveys.map(renderSurveyCard)}
              </div>
            ) : openYear === null ? (
              /* Year folders */
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {sortedYears.map((year) => {
                  const monthCount = Object.keys(grouped[year]).length;
                  const surveyCount = Object.values(grouped[year]).reduce((sum, arr) => sum + arr.length, 0);
                  return (
                    <button
                      key={year}
                      type="button"
                      onClick={() => handleYearClick(year)}
                      className="text-left p-3 rounded-lg border-2 border-gray-200 bg-white hover:border-amber-300 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 text-sm bg-amber-100 text-amber-600">
                        <Icon name="folder" className="w-4 h-4" />
                      </div>
                      <p className="text-sm font-semibold text-gray-800">{year}</p>
                      <p className="text-2xs text-gray-500 mt-0.5">
                        {surveyCount} survei · {monthCount} bulan
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : openMonth === null ? (
              /* Month folders for selected year */
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {Object.keys(grouped[openYear])
                  .map(Number)
                  .sort((a, b) => b - a)
                  .map((month) => {
                    const surveyCount = grouped[openYear][month].length;
                    return (
                      <button
                        key={month}
                        type="button"
                        onClick={() => handleMonthClick(month)}
                        className="text-left p-3 rounded-lg border-2 border-gray-200 bg-white hover:border-primary-300 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary-400"
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 text-sm bg-primary-100 text-primary-600">
                          <Icon name="folderOpen" className="w-4 h-4" />
                        </div>
                        <p className="text-xs font-semibold text-gray-800">{MONTH_NAMES[month]}</p>
                        <p className="text-2xs text-gray-500 mt-0.5">{surveyCount} survei</p>
                      </button>
                    );
                  })}
              </div>
            ) : (
              /* Survey cards for selected year + month */
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {(grouped[openYear]?.[openMonth] || []).map(renderSurveyCard)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SurveySelector;
