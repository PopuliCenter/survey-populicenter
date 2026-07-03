/**
 * useAudioRecorder.js
 *
 * React hook that manages audio recording via the browser MediaRecorder API.
 * State machine: idle → recording → paused → stopped.
 *
 * Fitur:
 *  - Cap durasi total berbasis durasi TEREKAM (sadar-jeda), default 3 menit.
 *  - stopAndGetBlob(): hentikan lalu resolve dengan Blob final (untuk auto-stop
 *    saat submit tanpa menunggu state async).
 *
 * MIME fallback: audio/webm;codecs=opus → audio/mp4 → audio/webm
 */

import { useState, useRef, useCallback, useEffect } from 'react';

/** MIME type terbaik yang didukung, atau null. */
function getSupportedMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return null;
}

/**
 * @param {{ maxDurationSec?: number }} [options]
 * @returns {{
 *   isSupported: boolean, permissionDenied: boolean,
 *   status: 'idle'|'recording'|'paused'|'stopped', duration: number,
 *   audioBlob: Blob|null, maxDurationSec: number,
 *   startRecording: () => Promise<void>, pauseRecording: () => void,
 *   resumeRecording: () => void, stopRecording: () => void,
 *   stopAndGetBlob: () => Promise<Blob|null>, resetRecording: () => void,
 * }}
 */
function useAudioRecorder(options = {}) {
  const maxDurationSec = options.maxDurationSec || 180; // 3 menit default

  const isSupported = typeof MediaRecorder !== 'undefined';

  const [permissionDenied, setPermissionDenied] = useState(false);
  const [status, setStatus] = useState('idle');
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const audioBlobRef = useRef(null);          // blob final (sinkron) untuk stopAndGetBlob
  const pendingStopResolveRef = useRef(null); // resolver Promise stopAndGetBlob
  const mimeTypeRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (status !== 'idle') return;
    if (!isSupported) return;

    try {
      // Mono + peredam bising/echo + AGC → suara wawancara lebih jernih.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      setPermissionDenied(false);

      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;
      // 64 kbps: lebih jernih dari 32k namun tetap kecil (~1,4 MB untuk 3 menit).
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 64000,
      });

      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'audio/webm' });
        audioBlobRef.current = blob;
        setAudioBlob(blob);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        // Selesaikan Promise stopAndGetBlob yang menunggu (bila ada).
        if (pendingStopResolveRef.current) {
          pendingStopResolveRef.current(blob);
          pendingStopResolveRef.current = null;
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000); // chunk tiap 1 detik
      setStatus('recording');
      setDuration(0);
      setAudioBlob(null);
      audioBlobRef.current = null;
      startTimer();
    } catch {
      setPermissionDenied(true);
    }
  }, [status, isSupported, startTimer]);

  const pauseRecording = useCallback(() => {
    if (status !== 'recording') return;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.pause();
      setStatus('paused');
      stopTimer(); // durasi terekam berhenti bertambah saat dijeda
    }
  }, [status, stopTimer]);

  const resumeRecording = useCallback(() => {
    if (status !== 'paused') return;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'paused') {
      recorder.resume();
      setStatus('recording');
      startTimer();
    }
  }, [status, startTimer]);

  const stopRecording = useCallback(() => {
    if (status !== 'recording' && status !== 'paused') return;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      setStatus('stopped');
      stopTimer();
    }
  }, [status, stopTimer]);

  /**
   * Hentikan rekaman dan resolve dengan Blob final. Untuk auto-stop saat submit:
   * pemanggil bisa `await` blob tanpa bergantung pada state React yang async.
   * @returns {Promise<Blob|null>}
   */
  const stopAndGetBlob = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return Promise.resolve(audioBlobRef.current);
    }
    return new Promise((resolve) => {
      pendingStopResolveRef.current = resolve;
      recorder.stop();
      setStatus('stopped');
      stopTimer();
    });
  }, [stopTimer]);

  const resetRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    audioBlobRef.current = null;
    pendingStopResolveRef.current = null;
    setStatus('idle');
    setDuration(0);
    setAudioBlob(null);
    setPermissionDenied(false);
  }, []);

  // Cap durasi TOTAL terekam (sadar-jeda): hentikan otomatis saat mencapai batas.
  useEffect(() => {
    if (status === 'recording' && duration >= maxDurationSec) {
      stopRecording();
    }
  }, [duration, status, maxDurationSec, stopRecording]);

  return {
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
    stopAndGetBlob,
    resetRecording,
  };
}

export default useAudioRecorder;
