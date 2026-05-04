import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon issue (broken with bundlers)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/**
 * GeoMap — vanilla Leaflet map wrapper.
 * Auto-zoom ke area yang berisi semua titik.
 *
 * @param {{ points: Array<{ latitude: number, longitude: number, surveyor_name: string, survey_title: string, questionnaire_number: string|number, end_time: string, geo_status: string }> }} props
 */
function GeoMap({ points = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);

  // Initialise map once
  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = L.map(containerRef.current, {
      center: [-2.5, 118], // Indonesia center
      zoom: 5,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current);

    markersLayerRef.current = L.layerGroup().addTo(mapRef.current);

    return () => {
      mapRef.current.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers whenever points change
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();

    const validPoints = [];

    points.forEach((point) => {
      const lat = point.lat ?? point.latitude;
      const lng = point.lng ?? point.longitude;
      if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;
      // Filter koordinat yang jelas invalid (0,0 atau di luar range)
      if (lat === 0 && lng === 0) return;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

      validPoints.push([lat, lng]);

      const formattedTime = point.end_time
        ? new Date(point.end_time).toLocaleString('id-ID', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : '-';

      const popupContent = `
        <div style="min-width:200px;font-size:13px;line-height:1.7">
          <strong>TPD:</strong> ${point.surveyor_name || '-'}<br/>
          ${point.survey_title ? `<strong>Survei:</strong> ${point.survey_title}<br/>` : ''}
          <strong>No. Kuesioner:</strong> ${point.questionnaire_number ?? '-'}<br/>
          <strong>Selesai:</strong> ${formattedTime}<br/>
          <strong>Koordinat:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}
        </div>
      `;

      L.marker([lat, lng])
        .bindPopup(popupContent)
        .addTo(markersLayerRef.current);
    });

    // Auto-zoom ke area yang berisi semua titik
    if (validPoints.length > 0) {
      const bounds = L.latLngBounds(validPoints);
      mapRef.current.fitBounds(bounds, {
        padding: [40, 40],
        maxZoom: 15,
      });
    } else {
      // Reset ke view Indonesia jika tidak ada titik
      mapRef.current.setView([-2.5, 118], 5);
    }
  }, [points]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[500px] rounded-lg border border-gray-200 z-0"
      aria-label="Peta sebaran lokasi wawancara"
    />
  );
}

export default GeoMap;
