'use strict';

/**
 * buildReportPptx — bangun deck laporan survei (PPTX) meniru template Populi:
 *   - Ukuran slide A4 on-screen 10.833 x 7.5" (rasio ~1.44, seperti template)
 *   - Cover bermerek (logo Populi), divider per-section, metodologi
 *   - Slide per-pertanyaan: header section + judul + GRAFIK KIRI + NARASI KANAN
 *   - Logo Populi di pojok tiap slide konten; penutup bermerek
 *
 * Konfigurasi via options: { methodology, narratives:{qid}, demographics:[qid],
 * sections:{qid:label}, confidential }.
 */

const path = require('path');
const fs = require('fs');
const PptxGenJS = require('pptxgenjs');
const { narrateQuestion } = require('./reportNarrative');

// ── Brand & layout ──────────────────────────────────────────────────────────
const SLIDE_W = 10.833;
const SLIDE_H = 7.5;
const NAVY = '1F3864';
const ORANGE = 'FF9300'; // oranye deck Populi (dari kotak nomor halaman di master)
const BLUE = '2E75B6';
const INK = '262626';
const GRAY = '595959';
const LIGHT = 'F2F2F2';

const LOGO = path.join(__dirname, '../assets/report/populi-logo.png');     // ratio 2.339
const LOGO_RATIO = 2.339;
const hasLogo = (() => { try { return fs.existsSync(LOGO); } catch { return false; } })();

function fmtDate(d) {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return null; }
}
function periodLabel(survey) {
  const s = fmtDate(survey.start_date); const e = fmtDate(survey.end_date);
  if (s && e) return `${s} – ${e}`;
  if (e) return `s.d. ${e}`;
  return null;
}
function chunk(arr, n) { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; }

async function buildReportPptx({ survey, snapshot, options = {} }) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'POPULI_A4', width: SLIDE_W, height: SLIDE_H });
  pptx.layout = 'POPULI_A4';
  pptx.author = 'Populi Center';
  pptx.company = 'Populi Center';

  const questions = snapshot.questions || [];
  const period = periodLabel(survey);
  const narratives = options.narratives || {};
  const demoSet = new Set(Array.isArray(options.demographics) ? options.demographics : []);
  const sections = options.sections && typeof options.sections === 'object' ? options.sections : {};
  const hasSections = Object.keys(sections).length > 0;
  const footerText = `POPULI CENTER: ${(survey.title || 'SURVEI').toUpperCase()}${period ? ` (${period})` : ''}`;
  let page = 1;

  // "CONFIDENTIAL" merah di pojok kanan atas tiap slide (gaya master template).
  function confidential(slide) {
    if (options.confidential === false) return;
    slide.addText('CONFIDENTIAL - TIDAK UNTUK PUBLIKASI', { x: 7.15, y: 0.11, w: 3.18, h: 0.3, fontFace: 'Calibri', fontSize: 11, bold: true, color: 'C00000', align: 'right', valign: 'middle' });
  }
  // Footer: "POPULI CENTER: ..." kiri-bawah + nomor halaman dalam kotak oranye kanan-bawah.
  function footer(slide) {
    slide.addText(footerText, { x: 0.5, y: 7.05, w: 8.9, h: 0.32, fontFace: 'Calibri', fontSize: 9, color: GRAY, valign: 'middle' });
    slide.addShape(pptx.ShapeType.rect, { x: 9.58, y: 6.95, w: 0.71, h: 0.4, fill: { color: ORANGE }, line: { type: 'none' } });
    slide.addText(String(page), { x: 9.58, y: 6.95, w: 0.71, h: 0.4, fontFace: 'Calibri', fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    page += 1;
  }
  // Header section + garis aksen oranye (gaya template).
  function header(slide, label) {
    slide.addText((label || '').toUpperCase(), { x: 0.5, y: 0.42, w: 6.4, h: 0.55, fontFace: 'Calibri', fontSize: 20, bold: true, color: NAVY, valign: 'middle' });
    slide.addShape(pptx.ShapeType.rect, { x: 0.52, y: 1.0, w: 2.1, h: 0.05, fill: { color: ORANGE }, line: { type: 'none' } });
  }
  function barChart(slide, q, box) {
    const dist = Array.isArray(q.distribution) ? q.distribution.slice(0, 12) : [];
    if (q.type === 'matrix' || dist.length === 0) {
      slide.addText(q.type === 'matrix' ? '(matriks — lihat ringkasan)' : '(belum ada data)', { ...box, fontFace: 'Calibri', fontSize: 11, italic: true, color: GRAY, align: 'center', valign: 'middle' });
      return;
    }
    const useValue = dist.some((d) => d.pct != null);
    const data = [{ name: useValue ? 'Persentase' : 'Jumlah', labels: dist.map((d) => d.label), values: dist.map((d) => (useValue ? d.pct : d.count)) }];
    slide.addChart(pptx.ChartType.bar, data, {
      ...box, barDir: 'bar', chartColors: [BLUE], showValue: true,
      dataLabelFontFace: 'Calibri', dataLabelFontSize: 10, dataLabelColor: INK,
      catAxisLabelFontFace: 'Calibri', catAxisLabelFontSize: 10, catAxisLabelColor: INK,
      valAxisHidden: true, showLegend: false, barGapWidthPct: 40,
    });
  }

  // ── Cover (putih, logo besar) ─────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    if (hasLogo) { const w = 4.6, h = w / LOGO_RATIO; slide.addImage({ path: LOGO, x: (SLIDE_W - w) / 2, y: 1.25, w, h }); }
    slide.addText((survey.title || 'LAPORAN SURVEI').toUpperCase(), { x: 0.8, y: 3.5, w: SLIDE_W - 1.6, h: 1.6, fontFace: 'Calibri', fontSize: 30, bold: true, color: NAVY, align: 'center', valign: 'middle' });
    if (period) slide.addText(`PERIODE SURVEI: ${period}`, { x: 0.8, y: 5.2, w: SLIDE_W - 1.6, h: 0.5, fontFace: 'Calibri', fontSize: 15, color: GRAY, align: 'center' });
    if (options.confidential !== false) slide.addText('CONFIDENTIAL — TIDAK UNTUK PUBLIKASI', { x: 0.8, y: 6.15, w: SLIDE_W - 1.6, h: 0.4, fontFace: 'Calibri', fontSize: 12, bold: true, color: 'C00000', align: 'center' });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: SLIDE_H - 0.45, w: SLIDE_W, h: 0.45, fill: { color: ORANGE }, line: { type: 'none' } });
  }

  // ── Metodologi ──────────────────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    confidential(slide); header(slide, 'Pengantar & Metodologi');
    const n = (snapshot.target && snapshot.target.total) || snapshot.response_count || 0;
    const achieved = snapshot.response_count || 0;
    const provinces = snapshot.map && Array.isArray(snapshot.map.regions) ? snapshot.map.regions.length : null;
    const lines = options.methodology
      ? options.methodology.split('\n').filter(Boolean).map((t) => ({ text: t, options: { bullet: true } }))
      : [
          { text: 'Survei dilakukan dengan wawancara menggunakan aplikasi survei Populi Center.', options: { bullet: true } },
          { text: `Jumlah responden terkumpul: ${achieved.toLocaleString('id-ID')}${n ? ` dari target ${n.toLocaleString('id-ID')}` : ''}.`, options: { bullet: true } },
          period ? { text: `Periode lapangan: ${period}.`, options: { bullet: true } } : null,
          provinces ? { text: `Cakupan wilayah: ${provinces} provinsi (berdasarkan data terkumpul).`, options: { bullet: true } } : null,
          { text: 'Metode penarikan sampel dan margin of error: [lengkapi sesuai desain survei].', options: { bullet: true, color: GRAY } },
        ].filter(Boolean);
    slide.addText(lines, { x: 0.7, y: 1.3, w: SLIDE_W - 1.4, h: 5.2, fontFace: 'Calibri', fontSize: 15, color: INK, lineSpacingMultiple: 1.25, valign: 'top' });
    footer(slide);
  }

  // ── Peta/sebaran provinsi ──────────────────────────────────────────────────
  if (snapshot.map && Array.isArray(snapshot.map.regions) && snapshot.map.regions.length > 0) {
    const slide = pptx.addSlide();
    confidential(slide); header(slide, 'Sebaran Responden per Provinsi');
    const top = snapshot.map.regions.slice(0, 15);
    barChart(slide, { type: 'single_choice', distribution: top.map((r) => ({ label: r.name, count: r.count, pct: null })) }, { x: 0.5, y: 1.15, w: SLIDE_W - 1.0, h: 5.6 });
    footer(slide);
  }

  function divider(label) {
    const slide = pptx.addSlide();
    slide.background = { color: NAVY };
    slide.addShape(pptx.ShapeType.rect, { x: (SLIDE_W - 2.2) / 2, y: 4.25, w: 2.2, h: 0.06, fill: { color: ORANGE }, line: { type: 'none' } });
    slide.addText((label || '').toUpperCase(), { x: 0.8, y: 2.9, w: SLIDE_W - 1.6, h: 1.3, fontFace: 'Calibri', fontSize: 30, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
  }

  // ── Profil responden (demografi) ───────────────────────────────────────────
  const demoQs = questions.filter((q) => demoSet.has(q.id));
  if (demoQs.length > 0) {
    divider('Profil Responden');
    for (const group of chunk(demoQs, 4)) {
      const slide = pptx.addSlide();
      confidential(slide); header(slide, 'Profil Responden');
      const boxes = [
        { x: 0.5, y: 1.25, w: 4.85, h: 2.55 }, { x: 5.5, y: 1.25, w: 4.85, h: 2.55 },
        { x: 0.5, y: 4.1, w: 4.85, h: 2.55 }, { x: 5.5, y: 4.1, w: 4.85, h: 2.55 },
      ];
      group.forEach((q, i) => {
        const b = boxes[i];
        slide.addText(q.text || 'Pertanyaan', { x: b.x, y: b.y, w: b.w, h: 0.5, fontFace: 'Calibri', fontSize: 11, bold: true, color: NAVY, valign: 'top' });
        barChart(slide, q, { x: b.x, y: b.y + 0.5, w: b.w, h: b.h - 0.5 });
      });
      footer(slide);
    }
  }

  // ── Slide per pertanyaan: header + chart KIRI + narasi KANAN ───────────────
  const mainQs = questions.filter((q) => !demoSet.has(q.id));
  let currentSection = null;
  let first = true;
  for (const q of mainQs) {
    const sec = sections[q.id];
    if (hasSections) {
      if (sec && sec !== currentSection) { divider(sec); currentSection = sec; }
    } else if (first) {
      divider('Hasil Survei'); currentSection = 'Hasil Survei';
    }
    first = false;

    const slide = pptx.addSlide();
    confidential(slide);
    header(slide, currentSection || 'Hasil Survei');
    slide.addText(q.text || 'Pertanyaan', { x: 0.5, y: 1.12, w: SLIDE_W - 1.0, h: 0.78, fontFace: 'Calibri', fontSize: 15, bold: true, color: INK, valign: 'top' });
    barChart(slide, q, { x: 0.35, y: 1.98, w: 5.45, h: 4.65 });
    // Narasi di kanan, dalam kotak ringan + garis aksen.
    slide.addShape(pptx.ShapeType.rect, { x: 6.0, y: 2.0, w: 0.06, h: 4.3, fill: { color: ORANGE }, line: { type: 'none' } });
    const narrative = narratives[q.id] || narrateQuestion(q);
    slide.addText(narrative, { x: 6.25, y: 2.05, w: 4.25, h: 4.25, fontFace: 'Calibri', fontSize: 13, color: INK, valign: 'top', lineSpacingMultiple: 1.15 });
    footer(slide);
  }

  // ── Penutup ──────────────────────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    slide.background = { color: NAVY };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: SLIDE_W, h: 0.45, fill: { color: ORANGE }, line: { type: 'none' } });
    slide.addText('TERIMA KASIH', { x: 0.8, y: 2.6, w: SLIDE_W - 1.6, h: 1.2, fontFace: 'Calibri', fontSize: 38, bold: true, color: 'FFFFFF', align: 'center' });
    slide.addText('www.populicenter.org   |   info@populicenter.org\nJl. Mampang Prapatan VIII No. 38, Jakarta Selatan', { x: 0.8, y: 4.1, w: SLIDE_W - 1.6, h: 1.4, fontFace: 'Calibri', fontSize: 14, color: 'D9E1F2', align: 'center', lineSpacingMultiple: 1.3 });
  }

  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

module.exports = { buildReportPptx };
