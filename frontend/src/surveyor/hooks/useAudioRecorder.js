/**
 * useAudioRecorder.js
 *
 * React hook that manages audio recording via the browser MediaRecorder API.
 * Implements a state machine: idle → recording → paused → stopped.
 *
 * MIME type fallback order:
 *   audio/webm;codecs=opus → audio/mp4 → audio/webm
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9
 */

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Detect the best supported MIME type for audio recording.
 * @returns {string|null} The first supported MIME type, or null if none.
 */
function getSupportedMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/webm',
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return null;
}

/**
 * useAudioRecorder
 *
 * @returns {{
 *   isSupported: boolean,
 *   permissionDenied: boolean,
 *   status: 'idle' | 'recording' | 'paused' | 'stopped',
 *   duration: number,
 *   audioBlob: Blob | null,
 *   startRecording: () => Promise<void>,
 *   pauseRecording: () => void,
 *   resumeRecording: () => void,
 *   stopRecording: () => void,
 *   resetRecording: () => void,
 * }}
 */
function useAudioRecorder() {
  const isSupported = typeof MediaRecorder !== 'undefined';

  const [permissionDenied, setPermissionDenied] = useState(false);
  const [status, setStatus] = useState('idle');
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const autoStopRef = useRef(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (autoStopRef.current) {
        clearTimeout(autoStopRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
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
      // Constraint suara: mono + peredam bising → lebih jernih untuk wawancara
      // sekaligus memperkecil ukuran file.
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
      // Kompres di sumbernya: ~32 kbps cukup jelas untuk rekaman suara wawancara,
      // namun jauh lebih kecil (≈1 MB untuk 5 menit) sehingga unggah cepat dan
      // tidak membebani bandwidth/penyimpanan server.
      const options = {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 32000,
      };
      const recorder = new MediaRecorder(stream, options);

      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || 'audio/webm',
        });
        setAudioBlob(blob);
        // Stop all tracks to release the microphone
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      };

      mediaRecorderRef.current = recorder;
      // Collect data every 1 second for smaller chunks
      recorder.start(1000);
      setStatus('recording');
      setDuration(0);
      setAudioBlob(null);
      startTimer();

      // Auto-stop after 5 minutes to prevent oversized files
      autoStopRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
          setStatus('stopped');
          stopTimer();
        }
      }, 5 * 60 * 1000);
    } catch {
      // Permission denied or other error
      setPermissionDenied(true);
    }
  }, [status, isSupported, startTimer, stopTimer]);

  const pauseRecording = useCallback(() => {
    if (status !== 'recording') return;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.pause();
      setStatus('paused');
      stopTimer();
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
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, [status, stopTimer]);

  const resetRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setStatus('idle');
    setDuration(0);
    setAudioBlob(null);
    setPermissionDenied(false);
  }, []);

  return {
    isSupported,
    permissionDenied,
    status,
    duration,
    audioBlob,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
  };
}

export default useAudioRecorder;
