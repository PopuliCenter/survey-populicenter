/**
 * AudioRecorderPanel.jsx
 *
 * Sticky panel for audio recording controls displayed on SurveyForm.
 * Shows record/pause/resume/stop buttons based on recorder status.
 * Displays duration timer and status indicator.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9, 6.1, 6.4, 6.5
 */

import React, { useEffect } from 'react';

/**
 * Format seconds into MM:SS display.
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * @param {{
 *   audioRecorder: import('../hooks/useAudioRecorder').default,
 *   onAudioReady?: (blob: Blob) => void,
 * }} props
 */
function AudioRecorderPanel({ audioRecorder, onAudioReady }) {
  const {
    isSupported,
    permissionDenied,
    status,
    duration,
    audioBlob,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  } = audioRecorder;

  // Notify parent when audio blob is ready
  useEffect(() => {
    if (audioBlob && onAudioReady) {
      onAudioReady(audioBlob);
    }
  }, [audioBlob, onAudioReady]);

  // Requirement 1.8: browser does not support MediaRecorder
  if (!isSupported) {
    return (
      <div
        className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-700"
        role="status"
        aria-live="polite"
      >
        Perekaman audio tidak didukung pada perangkat ini
      </div>
    );
  }

  // Requirement 1.9: permission denied
  if (permissionDenied) {
    return (
      <div
        className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"
        role="alert"
        aria-live="assertive"
      >
        Izin mikrofon diperlukan untuk merekam audio
      </div>
    );
  }

  const isIdle = status === 'idle';
  const isRecording = status === 'recording';
  const isPaused = status === 'paused';
  const isStopped = status === 'stopped';

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap"
      role="region"
      aria-label="Kontrol perekaman audio"
    >
      {/* Status indicator */}
      {(isRecording || isPaused) && (
        <div className="flex items-center gap-2" aria-live="polite">
          <span
            className={`inline-block w-3 h-3 rounded-full ${
              isRecording ? 'bg-red-500 animate-pulse' : 'bg-yellow-500'
            }`}
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-gray-700">
            {isRecording ? 'Merekam' : 'Dijeda'}
          </span>
          <span className="text-sm font-mono text-gray-500" aria-label={`Durasi ${formatDuration(duration)}`}>
            {formatDuration(duration)}
          </span>
        </div>
      )}

      {/* Stopped indicator */}
      {isStopped && (
        <div className="flex items-center gap-2" aria-live="polite">
          <span className="text-sm font-medium text-green-700">Rekaman selesai</span>
          <span className="text-sm font-mono text-gray-500">{formatDuration(duration)}</span>
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Start button — visible when idle or stopped */}
        {(isIdle || isStopped) && (
          <button
            type="button"
            onClick={startRecording}
            className="min-w-[44px] min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
            aria-label="Mulai rekam audio"
          >
            Mulai Rekam
          </button>
        )}

        {/* Pause button — visible when recording */}
        {isRecording && (
          <button
            type="button"
            onClick={pauseRecording}
            className="min-w-[44px] min-h-[44px] px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium rounded-lg transition-colors"
            aria-label="Jeda rekaman"
          >
            Jeda
          </button>
        )}

        {/* Resume button — visible when paused */}
        {isPaused && (
          <button
            type="button"
            onClick={resumeRecording}
            className="min-w-[44px] min-h-[44px] px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
            aria-label="Lanjutkan rekaman"
          >
            Lanjutkan
          </button>
        )}

        {/* Stop button — visible when recording or paused */}
        {(isRecording || isPaused) && (
          <button
            type="button"
            onClick={stopRecording}
            className="min-w-[44px] min-h-[44px] px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
            aria-label="Berhenti merekam"
          >
            Berhenti
          </button>
        )}
      </div>
    </div>
  );
}

export default AudioRecorderPanel;
