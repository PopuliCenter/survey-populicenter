/**
 * AudioRecorderPanel.jsx
 *
 * Panel kontrol rekaman audio di SurveyForm. Menampilkan indikator status +
 * durasi. Tombol manual (Mulai/Jeda/Lanjut/Berhenti) bisa disembunyikan
 * (hideControlsDefault) untuk mode otomatis (Android) — tetap ada toggle
 * "Kontrol manual" bila diperlukan.
 */

import React, { useEffect, useState } from 'react';

/** Format detik → MM:SS. */
function formatDuration(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * @param {{
 *   audioRecorder: import('../hooks/useAudioRecorder').default,
 *   onAudioReady?: (blob: Blob) => void,
 *   hideControlsDefault?: boolean,
 * }} props
 */
function AudioRecorderPanel({ audioRecorder, onAudioReady, hideControlsDefault = false }) {
  const {
    isSupported,
    permissionDenied,
    status,
    duration,
    audioBlob,
    maxDurationSec,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  } = audioRecorder;

  const [showControls, setShowControls] = useState(!hideControlsDefault);

  // Beri tahu parent saat blob siap
  useEffect(() => {
    if (audioBlob && onAudioReady) onAudioReady(audioBlob);
  }, [audioBlob, onAudioReady]);

  if (!isSupported) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-700" role="status" aria-live="polite">
        Perekaman audio tidak didukung pada perangkat ini
      </div>
    );
  }

  if (permissionDenied) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700" role="alert" aria-live="assertive">
        <p className="font-medium">Izin mikrofon diperlukan untuk merekam audio.</p>
        <p className="mt-1 text-xs text-red-600">
          Jika sebelumnya ditolak, aktifkan izin Mikrofon untuk aplikasi ini di Pengaturan HP, lalu coba lagi.
        </p>
        <button type="button" onClick={startRecording} className="mt-2 min-h-[40px] px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors">
          Coba Lagi
        </button>
      </div>
    );
  }

  const isIdle = status === 'idle';
  const isRecording = status === 'recording';
  const isPaused = status === 'paused';
  const isStopped = status === 'stopped';

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap" role="region" aria-label="Kontrol perekaman audio">
      {/* Status */}
      {(isRecording || isPaused) && (
        <div className="flex items-center gap-2" aria-live="polite">
          <span className={`inline-block w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-yellow-500'}`} aria-hidden="true" />
          <span className="text-sm font-medium text-gray-700">{isRecording ? 'Merekam otomatis' : 'Dijeda'}</span>
          <span className="text-sm font-mono text-gray-500" aria-label={`Durasi ${formatDuration(duration)}`}>
            {formatDuration(duration)}{maxDurationSec ? ` / ${formatDuration(maxDurationSec)}` : ''}
          </span>
        </div>
      )}
      {isStopped && (
        <div className="flex items-center gap-2" aria-live="polite">
          <span className="text-sm font-medium text-green-700">Rekaman selesai</span>
          <span className="text-sm font-mono text-gray-500">{formatDuration(duration)}</span>
        </div>
      )}
      {isIdle && hideControlsDefault && !showControls && (
        <span className="text-sm text-gray-500">Rekaman audio otomatis</span>
      )}

      <div className="flex items-center gap-2 ml-auto">
        {/* Toggle kontrol manual (mode tersembunyi) */}
        {hideControlsDefault && (
          <button
            type="button"
            onClick={() => setShowControls((v) => !v)}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            {showControls ? 'Sembunyikan kontrol' : 'Kontrol manual'}
          </button>
        )}

        {showControls && (
          <>
            {(isIdle || isStopped) && (
              <button type="button" onClick={startRecording} className="min-w-[44px] min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors" aria-label="Mulai rekam audio">
                Mulai Rekam
              </button>
            )}
            {isRecording && (
              <button type="button" onClick={pauseRecording} className="min-w-[44px] min-h-[44px] px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium rounded-lg transition-colors" aria-label="Jeda rekaman">
                Jeda
              </button>
            )}
            {isPaused && (
              <button type="button" onClick={resumeRecording} className="min-w-[44px] min-h-[44px] px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors" aria-label="Lanjutkan rekaman">
                Lanjutkan
              </button>
            )}
            {(isRecording || isPaused) && (
              <button type="button" onClick={stopRecording} className="min-w-[44px] min-h-[44px] px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors" aria-label="Berhenti merekam">
                Berhenti
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AudioRecorderPanel;
