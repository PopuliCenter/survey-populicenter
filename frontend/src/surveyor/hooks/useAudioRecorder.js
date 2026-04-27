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

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setPermissionDenied(false);

      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : {};
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
      recorder.start();
      setStatus('recording');
      setDuration(0);
      setAudioBlob(null);
      startTimer();
    } catch {
      // Permission denied or other error
      setPermissionDenied(true);
    }
  }, [status, isSupported, startTimer]);

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
  }, [status, stopTimer]);

  const resetRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
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
