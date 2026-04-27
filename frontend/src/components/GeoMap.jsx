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
 *
 * @param {{ points: Array<{ lat: number, lng: number, surveyor_name: string, questionnaire_number: string|number, end_time: string }> }} props
 */
function GeoMap({ points = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);

  // Initialise map once
  useEffect(() => {
    if (mapRef.current) return; // already initialised

    mapRef.current = L.map(containerRef.current, {
      center: [-2.5, 118],
      zoom: 5,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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

    points.forEach((point) => {
      // Support both { lat, lng } and { latitude, longitude } shapes
      const lat = point.lat ?? point.latitude;
      const lng = point.lng ?? point.longitude;
      if (lat == null || lng == null) return;

      const formattedTime = point.end_time
        ? new Date(point.end_time).toLocaleString('id-ID', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : '-';

      const popupContent = `
        <div style="min-width:180px;font-size:13px;line-height:1.6">
          <strong>Surveyor:</strong> ${point.surveyor_name || '-'}<br/>
          <strong>No. Kuesioner:</strong> ${point.questionnaire_number ?? '-'}<br/>
          <strong>Selesai:</strong> ${formattedTime}
        </div>
      `;

      L.marker([lat, lng])
        .bindPopup(popupContent)
        .addTo(markersLayerRef.current);
    });
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
