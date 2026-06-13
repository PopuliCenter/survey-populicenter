import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import publicApi from '../services/publicApi';
import { lookupCentroid } from '../data/provinceCentroids';

// Palet warna konsisten untuk batang & lingkaran peta.
const COLORS = ['#2563eb', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#10b981'];

// ─── Peta sebaran: proporsional-simbol di centroid provinsi ───────────────────
function ProvinceBubbleMap({ regions }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [-2.5, 118],
      zoom: 4,
      scrollWheelZoom: false,
      attributionControl: true,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 12,
    }).addTo(map);

    const max = regions.reduce((m, r) => Math.max(m, r.count), 0) || 1;
    const bounds = [];
    for (const r of regions) {
      const c = lookupCentroid(r.name);
      if (!c) continue;
      // Radius proporsional ke akar jumlah (agar luas ~ jumlah), 6–34 px.
      const radius = 6 + Math.sqrt(r.count / max) * 28;
      L.circleMarker([c.lat, c.lng], {
        radius,
        color: '#1d4ed8',
        weight: 1,
        fillColor: '#3b82f6',
        fillOpacity: 0.5,
      })
        .bindTooltip(`${r.name}: ${r.count.toLocaleString('id-ID')} responden`, { direction: 'top' })
        .addTo(map);
      bounds.push([c.lat, c.lng]);
    }
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 7 });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [regions]);

  return <div ref={containerRef} style={{ height: 360, width: '100%', borderRadius: 12 }} />;
}

// ─── Satu blok pertanyaan: bar chart distribusi ───────────────────────────────
function DistributionChart({ data }) {
  const height = Math.max(120, data.length * 38 + 20);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={160}
          tick={{ fontSize: 12, fill: '#374151' }}
          interval={0}
        />
        <Tooltip
          formatter={(v, _n, p) => [`${v.toLocaleString('id-ID')} (${p.payload.pct}%)`, 'Jumlah']}
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
          <LabelList
            dataKey="pct"
            position="right"
            formatter={(v) => `${v}%`}
            style={{ fontSize: 11, fill: '#6b7280' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function QuestionBlock({ q, index }) {
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-1">
        {index}. {q.text}
      </h3>
      <p className="text-xs text-gray-400 mb-3">
        {q.total_answered?.toLocaleString('id-ID') || 0} responden menjawab
        {q.average != null && (
          <span className="ml-2 text-gray-600">· Rata-rata: <b>{q.average}</b></span>
        )}
      </p>

      {/* Matriks: distribusi per baris */}
      {q.type === 'matrix' && Array.isArray(q.rows) ? (
        <div className="space-y-4">
          {q.rows.map((row, i) => (
            <div key={i}>
              <p className="text-xs font-medium text-gray-600 mb-1">{row.row}</p>
              {row.distribution?.length > 0 ? (
                <DistributionChart data={row.distribution} />
              ) : (
                <p className="text-xs text-gray-400">Belum ada data</p>
              )}
            </div>
          ))}
        </div>
      ) : q.distribution?.length > 0 ? (
        <DistributionChart data={q.distribution} />
      ) : (
        <p className="text-xs text-gray-400">Belum ada data</p>
      )}
    </section>
  );
}

// ─── Halaman embed publik ─────────────────────────────────────────────────────
/**
 * PublicResults — halaman hasil survei AGREGAT untuk disematkan (iframe) di
 * website populicenter.org. Publik, tanpa login. Membaca /public/results/:slug.
 */
function PublicResults() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ok | notfound | error

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    publicApi
      .get(`/public/results/${slug}`)
      .then((res) => {
        if (!alive) return;
        setData(res.data);
        setStatus('ok');
      })
      .catch((err) => {
        if (!alive) return;
        setStatus(err.response?.status === 404 ? 'notfound' : 'error');
      });
    return () => { alive = false; };
  }, [slug]);

  // Beritahu parent (WordPress) tinggi konten agar iframe bisa auto-resize.
  useEffect(() => {
    if (status !== 'ok') return;
    const notify = () => {
      try {
        window.parent?.postMessage(
          { type: 'populi-embed-height', slug, height: document.body.scrollHeight },
          '*'
        );
      } catch { /* ignore */ }
    };
    notify();
    window.addEventListener('resize', notify);
    return () => window.removeEventListener('resize', notify);
  }, [status, slug, data]);

  if (status === 'loading') {
    return (
      <div className="min-h-[200px] flex items-center justify-center text-gray-400 text-sm">
        Memuat hasil…
      </div>
    );
  }
  if (status === 'notfound') {
    return (
      <div className="min-h-[200px] flex items-center justify-center text-gray-400 text-sm">
        Hasil survei tidak ditemukan atau belum dipublikasikan.
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="min-h-[200px] flex items-center justify-center text-red-400 text-sm">
        Gagal memuat hasil. Coba muat ulang.
      </div>
    );
  }

  const questions = data.questions || [];

  return (
    <div className="bg-transparent p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <header>
        <h2 className="text-xl font-bold text-gray-900">{data.title}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {data.response_count?.toLocaleString('id-ID') || 0} responden
          {data.published_at && (
            <span> · Dipublikasikan {new Date(data.published_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          )}
        </p>
        {data.summary && (
          <p className="text-sm text-gray-700 mt-3 leading-relaxed whitespace-pre-line">{data.summary}</p>
        )}
      </header>

      {/* Peta sebaran */}
      {data.map?.regions?.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Sebaran Responden per Provinsi</h3>
          <ProvinceBubbleMap regions={data.map.regions} />
        </section>
      )}

      {/* Pertanyaan */}
      {questions.length > 0 ? (
        questions.map((q, i) => <QuestionBlock key={q.id} q={q} index={i + 1} />)
      ) : (
        <p className="text-sm text-gray-400">Belum ada pertanyaan yang bisa ditampilkan.</p>
      )}

      <footer className="text-center text-xs text-gray-300 pt-2">
        Sumber data: Populi Center
      </footer>
    </div>
  );
}

export default PublicResults;
