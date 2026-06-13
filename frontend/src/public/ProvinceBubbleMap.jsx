import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { lookupCentroid } from '../data/provinceCentroids';

/**
 * ProvinceBubbleMap — peta proporsional-simbol: lingkaran di centroid provinsi
 * dengan radius ~ akar jumlah. Dipakai embed hasil & monitoring.
 *
 * @param {{ regions: Array<{ name: string, count: number }> }} props
 */
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

export default ProvinceBubbleMap;
