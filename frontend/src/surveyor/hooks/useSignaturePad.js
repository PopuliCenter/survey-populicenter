/**
 * useSignaturePad.js
 *
 * React hook for canvas-based signature pad.
 * Uses Pointer Events with proper coordinate scaling.
 */

import { useRef, useState, useCallback, useEffect } from 'react';

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
  const canvasRef = useRef(null);
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderStrokes(ctx, strokesRef.current, canvas.width, canvas.height);
  }, []);

  // Set canvas internal resolution once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function setSize() {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return; // Not visible yet
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        // Redraw existing strokes after resize
        if (strokesRef.current.length > 0) {
          renderStrokes(ctx, strokesRef.current, canvas.width, canvas.height);
        }
      }
    }

    // Initial sizing with small delay for layout to settle
    const timer = setTimeout(setSize, 50);

    // Re-size when window resizes or orientation changes
    window.addEventListener('resize', setSize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', setSize);
    };
  }, []);

  // Attach pointer event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handlePointerDown(e) {
      e.preventDefault(); // Prevent scroll on touch
      isDrawingRef.current = true;
      const pos = getPointerPos(e, canvas);
      currentStrokeRef.current = [pos];
      canvas.setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e) {
      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      e.preventDefault();
      const pos = getPointerPos(e, canvas);
      currentStrokeRef.current.push(pos);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Redraw all committed strokes + current in-progress stroke
      renderStrokes(ctx, strokesRef.current, canvas.width, canvas.height);
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

    // Use { passive: false } to allow preventDefault on touch
    canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
    canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
    canvas.addEventListener('pointerup', handlePointerUp, { passive: false });
    canvas.addEventListener('pointercancel', handlePointerUp, { passive: false });

    // Also prevent touchmove scroll on the canvas
    function preventScroll(e) { e.preventDefault(); }
    canvas.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      canvas.removeEventListener('touchmove', preventScroll);
    };
  }, [syncState, redraw]);

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

  const toBlob = useCallback(() => {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas || strokesRef.current.length === 0) { resolve(null); return; }
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }, []);

  const toPngDataUrl = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) return null;
    return canvas.toDataURL('image/png');
  }, []);

  return { canvasRef, isEmpty, strokeCount, clear, undo, toBlob, toPngDataUrl };
}

export default useSignaturePad;
