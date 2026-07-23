/**
 * offlineReadiness.js — checklist pra-lapangan "siap offline" untuk TPD.
 *
 * Pelajaran dari insiden lapangan: TPD merasa siap ("survei sudah kubuka
 * kemarin") padahal satu bahan hilang — dropdown wilayah kosong, tiket undian
 * RT habis, atau cache survei basi sehingga setting baru tak berlaku. Checklist
 * ini membuat kesiapan EKSPLISIT: tiap bahan offline diperiksa satu-satu dan
 * yang kurang disebut beserta cara membereskannya (hampir selalu: tekan
 * Perbarui saat masih di tempat bersinyal).
 *
 * Murni & tanpa efek samping — mudah diuji; pembacaan localStorage diinjeksi.
 */

import { localStore } from './safeStorage';

// Cache basi > 24 jam = peringatan. Server tetap penegak terakhir saat submit,
// tapi setting yang berubah di dashboard baru terasa di perangkat setelah
// Perbarui — sehari adalah umur wajar antara briefing dan turun lapangan.
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

// Sisa tiket undian RT di bawah ini = peringatan (satu kelurahan memakai satu
// tiket; jatah penuh dari server 20 per survei).
export const RT_TICKETS_LOW = 5;

/**
 * Sisa tiket undian RT offline sebuah survei di perangkat ini.
 * @returns {number|null} null = belum ada jatah tersimpan sama sekali.
 */
export function remainingRtTickets(surveyId, store = localStore) {
  try {
    const cache = JSON.parse(store.getItem(`rt_tickets__${surveyId}`) || 'null');
    if (!cache || !Array.isArray(cache.tickets)) return null;
    const pending = JSON.parse(store.getItem(`rt_pending__${surveyId}`) || '[]');
    const usedLocally = new Set((Array.isArray(pending) ? pending : []).map((p) => p.ticket_id));
    return cache.tickets.filter((t) => !t.used_village && !usedLocally.has(t.id)).length;
  } catch {
    return null;
  }
}

function humanizeAge(ms) {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return 'baru saja';
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

/**
 * Bangun checklist siap-offline.
 *
 * @param {object} p
 * @param {Array<{id:string,title:string,field_tools_settings?:object}>} p.surveys
 * @param {Set<string>|Array<string>} p.downloadedIds - survei yang ter-cache di perangkat
 * @param {boolean} p.regionReady - data wilayah siap offline (native: selalu true)
 * @param {string|null} p.lastDownloadIso - waktu Perbarui terakhir (ISO), null = belum pernah
 * @param {number} p.pendingCount - respons menunggu sinkron
 * @param {number} p.failedCount - respons gagal sinkron
 * @param {(surveyId:string)=>number|null} [p.readTickets] - injeksi untuk tes
 * @param {Date} [p.now] - injeksi untuk tes
 * @returns {{ ready: boolean, failCount: number, warnCount: number,
 *   items: Array<{key:string,status:'ok'|'warn'|'fail',label:string,detail:string}> }}
 */
export function buildOfflineChecklist({
  surveys = [],
  downloadedIds = new Set(),
  regionReady = false,
  lastDownloadIso = null,
  pendingCount = 0,
  failedCount = 0,
  readTickets = remainingRtTickets,
  now = new Date(),
}) {
  const downloaded = downloadedIds instanceof Set ? downloadedIds : new Set(downloadedIds);
  const items = [];

  // 1. Survei terunduh — tanpa ini formulir tak bisa dibuka offline sama sekali.
  const nDown = surveys.filter((s) => downloaded.has(s.id)).length;
  items.push(nDown >= surveys.length
    ? { key: 'surveys', status: 'ok', label: 'Survei terunduh', detail: `${nDown}/${surveys.length} survei tersimpan di perangkat.` }
    : { key: 'surveys', status: 'fail', label: 'Survei terunduh', detail: `Baru ${nDown}/${surveys.length} survei — tekan Perbarui saat masih ada sinyal.` });

  // 2. Data wilayah — insiden lama: dropdown provinsi–desa kosong di lapangan.
  items.push(regionReady
    ? { key: 'region', status: 'ok', label: 'Data wilayah', detail: 'Dropdown provinsi–desa siap dipakai tanpa sinyal.' }
    : { key: 'region', status: 'fail', label: 'Data wilayah', detail: 'Belum tersimpan — tekan Perbarui, tanpa ini dropdown wilayah kosong di lapangan.' });

  // 3. Tiket undian RT — hanya untuk survei yang mengaktifkannya.
  const rtSurveys = surveys.filter((s) => s.field_tools_settings?.rt_selection === 'enabled');
  if (rtSurveys.length > 0) {
    let worst = 'ok';
    const parts = [];
    for (const s of rtSurveys) {
      const sisa = readTickets(s.id);
      const judul = String(s.title || '').slice(0, 32);
      if (sisa == null || sisa === 0) {
        worst = 'fail';
        parts.push(`${judul}: ${sisa == null ? 'belum ada jatah tiket' : 'tiket habis'}`);
      } else if (sisa < RT_TICKETS_LOW) {
        if (worst === 'ok') worst = 'warn';
        parts.push(`${judul}: sisa ${sisa} tiket (menipis)`);
      } else {
        parts.push(`${judul}: sisa ${sisa} tiket`);
      }
    }
    items.push({
      key: 'rtTickets',
      status: worst,
      label: 'Tiket undian RT offline',
      detail: `${parts.join(' · ')}${worst !== 'ok' ? ' — tekan Perbarui untuk menambah jatah.' : ''}`,
    });
  }

  // 4. Kebaruan data — setting dashboard baru terasa setelah Perbarui.
  if (!lastDownloadIso) {
    items.push({ key: 'freshness', status: 'warn', label: 'Kebaruan data', detail: 'Belum pernah Perbarui di perangkat ini.' });
  } else {
    const age = now.getTime() - new Date(lastDownloadIso).getTime();
    items.push(age <= STALE_AFTER_MS
      ? { key: 'freshness', status: 'ok', label: 'Kebaruan data', detail: `Diperbarui ${humanizeAge(age)}.` }
      : { key: 'freshness', status: 'warn', label: 'Kebaruan data', detail: `Terakhir diperbarui ${humanizeAge(age)} — tekan Perbarui agar setting survei terbaru ikut terbawa.` });
  }

  // 5. Antrean sinkron — bukan penghalang offline, tapi rawan bila menumpuk.
  if (failedCount > 0) {
    items.push({ key: 'sync', status: 'warn', label: 'Data belum terkirim', detail: `${failedCount} data GAGAL terkirim — coba unggah ulang selagi bersinyal. Jangan hapus/bersihkan aplikasi.` });
  } else if (pendingCount > 0) {
    items.push({ key: 'sync', status: 'warn', label: 'Data belum terkirim', detail: `${pendingCount} data menunggu sinkron — unggah dulu selagi bersinyal. Jangan hapus/bersihkan aplikasi.` });
  } else {
    items.push({ key: 'sync', status: 'ok', label: 'Data belum terkirim', detail: 'Semua data sudah terkirim ke server.' });
  }

  const failCount = items.filter((i) => i.status === 'fail').length;
  const warnCount = items.filter((i) => i.status === 'warn').length;
  return { ready: failCount === 0, failCount, warnCount, items };
}
