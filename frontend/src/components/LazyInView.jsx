import React, { useEffect, useRef, useState } from 'react';

/**
 * LazyInView — tunda render (dan fetch) anak sampai elemen masuk viewport.
 * Dipakai untuk widget dashboard yang berat agar tidak query saat halaman
 * dibuka — baru jalan ketika di-scroll mendekati layar.
 *
 * @param {{ children: React.ReactNode, minHeight?: number, rootMargin?: string }} props
 */
function LazyInView({ children, minHeight = 240, rootMargin = '250px' }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    // Lingkungan tanpa IntersectionObserver (mis. test) → langsung render.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView, rootMargin]);

  return (
    <div ref={ref} style={inView ? undefined : { minHeight }}>
      {inView ? children : null}
    </div>
  );
}

export default LazyInView;
