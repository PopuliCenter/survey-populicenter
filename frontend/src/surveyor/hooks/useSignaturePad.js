/**
 * useSignaturePad.js
 *
 * React hook that manages a canvas-based signature pad.
 * Stores strokes as arrays of points for undo support.
 * Uses Pointer Events API for cross-device compatibility.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * Render all strokes onto the canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<Array<{x: number, y: number}>>} strokes
 * @param {number} width
 * @param {number} height
 */
function renderStrokes(ctx, strokes, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
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
 * Get pointer coordinates relative to the canvas element.
 * @param {PointerEvent} e
 * @param {HTMLCanvasElement} canvas
 * @returns {{ x: number, y: number }}
 */
function getPointerPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

/**
 * useSignaturePad
 *
 * @returns {{
 *   canvasRef: React.RefObject<HTMLCanvasElement>,
 *   isEmpty: boolean,
 *   strokeCount: number,
 *   clear: () => void,
 *   undo: () => void,
 *   toBlob: () => Promise<Blob | null>,
 *   toPngDataUrl: () => string | null,
 * }}
 */
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

  // Attach pointer event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handlePointerDown = (e) => {
      isDrawingRef.current = true;
      const pos = getPointerPos(e, canvas);
      currentStrokeRef.current = [pos];
      canvas.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      const pos = getPointerPos(e, canvas);
      currentStrokeRef.current.push(pos);

      // Draw the current stroke in progress
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderStrokes(ctx, strokesRef.current, canvas.width, canvas.height);

      // Draw the in-progress stroke
      const stroke = currentStrokeRef.current;
      if (stroke.length >= 2) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo(stroke[i].x, stroke[i].y);
        }
        ctx.stroke();
      }
    };

    const handlePointerUp = () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      if (currentStrokeRef.current && currentStrokeRef.current.length >= 2) {
        strokesRef.current = [...strokesRef.current, currentStrokeRef.current];
      }
      currentStrokeRef.current = null;
      // Use a microtask to batch state updates after the event
      Promise.resolve().then(() => {
        syncState();
        redraw();
      });
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
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
      if (!canvas || strokesRef.current.length === 0) {
        resolve(null);
        return;
      }
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }, []);

  const toPngDataUrl = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) return null;
    return canvas.toDataURL('image/png');
  }, []);

  return {
    canvasRef,
    isEmpty,
    strokeCount,
    clear,
    undo,
    toBlob,
    toPngDataUrl,
  };
}

export default useSignaturePad;
