/**
 * useSignaturePad.js
 *
 * React hook for canvas-based signature pad.
 * Uses Pointer Events with proper coordinate scaling.
 *
 * Menggunakan callback ref (bukan useEffect + useRef) agar listener & ukuran
 * kanvas terpasang setiap kali elemen <canvas> benar-benar mount — termasuk
 * ketika kanvas baru dirender belakangan (mis. di langkah terakhir wizard).
 */

import { useRef, useState, useCallback } from 'react';

function renderStrokes(ctx, strokes, width, height) {
  // width/height di sini adalah canvas.width/height (DPR-scaled).
  // Karena ctx sudah di-scale(dpr, dpr), clearRect perlu pakai CSS dimensions.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.clearRect(0, 0, width / dpr, height / dpr);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of strokes) {
    if (stroke.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) {
      ctx.lineTo(stroke[i].x, stroke[i].y);
    }
    ctx.stroke();
  }
}

/**
 * Get pointer position relative to canvas in CSS pixels.
 * Setelah ctx.scale(dpr, dpr), kita hanya perlu koordinat CSS — bukan canvas pixel.
 */
function getPointerPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

function useSignaturePad() {
  const canvasNodeRef = useRef(null);   // node <canvas> yang sedang aktif
  const cleanupRef = useRef(null);      // fungsi pelepas listener untuk node aktif
  const strokesRef = useRef([]);
  const currentStrokeRef = useRef(null);
  const isDrawingRef = useRef(false);

  const [isEmpty, setIsEmpty] = useState(true);
  const [strokeCount, setStrokeCount] = useState(0);

  const syncState = useCallback(() => {
    const count = strokesRef.current.length;
    setStrokeCount(count);
    setIsEmpty(count === 0);
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasNodeRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderStrokes(ctx, strokesRef.current, canvas.width, canvas.height);
  }, []);

  // Set ukuran internal kanvas sesuai DPR + redraw strokes yang ada.
  const setSize = useCallback(() => {
    const canvas = canvasNodeRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // belum terlihat
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr); // setelah set width/height, transform ter-reset
      renderStrokes(ctx, strokesRef.current, canvas.width, canvas.height);
    }
  }, []);

  // Callback ref: dipanggil React saat <canvas> mount (node) & unmount (null).
  const canvasRef = useCallback((node) => {
    // Lepas listener dari node sebelumnya (jika ada)
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    canvasNodeRef.current = node;
    if (!node) return; // unmount — selesai

    // ── Penentuan ukuran ──
    setSize();
    // Coba lagi setelah layout settle (kadang width = 0 saat baru mount)
    const sizeTimer = setTimeout(setSize, 50);
    window.addEventListener('resize', setSize);

    // ── Handler menggambar ──
    function handlePointerDown(e) {
      e.preventDefault();
      isDrawingRef.current = true;
      currentStrokeRef.current = [getPointerPos(e, node)];
      try { node.setPointerCapture(e.pointerId); } catch { /* abaikan */ }
    }

    function handlePointerMove(e) {
      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      e.preventDefault();
      currentStrokeRef.current.push(getPointerPos(e, node));

      const ctx = node.getContext('2d');
      if (!ctx) return;

      renderStrokes(ctx, strokesRef.current, node.width, node.height);
      const stroke = currentStrokeRef.current;
      if (stroke.length >= 2) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo(stroke[i].x, stroke[i].y);
        }
        ctx.stroke();
      }
    }

    function handlePointerUp(e) {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      isDrawingRef.current = false;
      if (currentStrokeRef.current && currentStrokeRef.current.length >= 2) {
        strokesRef.current = [...strokesRef.current, currentStrokeRef.current];
      }
      currentStrokeRef.current = null;
      syncState();
      redraw();
    }

    function preventScroll(e) { e.preventDefault(); }

    node.addEventListener('pointerdown', handlePointerDown, { passive: false });
    node.addEventListener('pointermove', handlePointerMove, { passive: false });
    node.addEventListener('pointerup', handlePointerUp, { passive: false });
    node.addEventListener('pointercancel', handlePointerUp, { passive: false });
    node.addEventListener('touchmove', preventScroll, { passive: false });

    cleanupRef.current = () => {
      clearTimeout(sizeTimer);
      window.removeEventListener('resize', setSize);
      node.removeEventListener('pointerdown', handlePointerDown);
      node.removeEventListener('pointermove', handlePointerMove);
      node.removeEventListener('pointerup', handlePointerUp);
      node.removeEventListener('pointercancel', handlePointerUp);
      node.removeEventListener('touchmove', preventScroll);
    };
  }, [setSize, syncState, redraw]);

  const clear = useCallback(() => {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    isDrawingRef.current = false;
    syncState();
    redraw();
  }, [syncState, redraw]);

  const undo = useCallback(() => {
    if (strokesRef.current.length === 0) return;
    strokesRef.current = strokesRef.current.slice(0, -1);
    syncState();
    redraw();
  }, [syncState, redraw]);

  // Ambil salinan strokes (untuk disimpan ke draft saat nomor kuesioner di-pending).
  const getStrokes = useCallback(() => strokesRef.current.map((s) => s.slice()), []);

  // Muat kembali strokes tersimpan (saat draft dilanjutkan) & gambar ulang.
  const loadStrokes = useCallback((strokes) => {
    if (!Array.isArray(strokes) || strokes.length === 0) return;
    strokesRef.current = strokes.map((s) => s.slice());
    syncState();
    redraw();
  }, [syncState, redraw]);

  const toBlob = useCallback(() => {
    return new Promise((resolve) => {
      const canvas = canvasNodeRef.current;
      if (!canvas || strokesRef.current.length === 0) { resolve(null); return; }
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }, []);

  const toPngDataUrl = useCallback(() => {
    const canvas = canvasNodeRef.current;
    if (!canvas || strokesRef.current.length === 0) return null;
    return canvas.toDataURL('image/png');
  }, []);

  return { canvasRef, isEmpty, strokeCount, clear, undo, toBlob, toPngDataUrl, getStrokes, loadStrokes };
}

export default useSignaturePad;
