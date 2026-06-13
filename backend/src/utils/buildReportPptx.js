'use strict';

/**
 * buildReportPptx — bangun deck laporan survei (PPTX) dari data agregat,
 * meniru pola deck Populi: cover → metodologi → (peta sebaran) →
 * (profil responden/demografi) → divider per-section → slide per-pertanyaan
 * (grafik + narasi) → penutup.
 *
 * Memakai pptxgenjs (native PPTX + grafik). Konfigurasi via options:
 *   - methodology: string  (teks metodologi; override auto)
 *   - narratives: { [qid]: string }  (override narasi per pertanyaan)
 *   - demographics: [qid]  (ditampilkan sebagai slide PROFIL RESPONDEN)
 *   - sections: { [qid]: label }  (sisipkan divider saat label berganti)
 */

const PptxGenJS = require('pptxgenjs');
const { narrateQuestion } = require('./reportNarrative');

const NAVY = '1F497D';
const BAR = '4F81BD';
const GRAY = '595959';
const LIGHT = 'F2F2F2';
const W = 13.333;

function fmtDate(d) {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return null;
  }
}

function periodLabel(survey) {
  const s = fmtDate(survey.start_date);
  const e = fmtDate(survey.end_date);
  if (s && e) return `Periode survei: ${s} – ${e}`;
  if (e) return `Periode survei: s.d. ${e}`;
  return null;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * @param {{ survey: object, snapshot: object, options?: object }} input
 * @returns {Promise<Buffer>}
 */
async function buildReportPptx({ survey, snapshot, options = {} }) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Populi Center';
  pptx.company = 'Populi Center';

  const questions = snapshot.questions || [];
  const period = periodLabel(survey);
  const narratives = options.narratives || {};
  const demoSet = new Set(Array.isArray(options.demographics) ? options.demographics : []);
  const sections = options.sections && typeof options.sections === 'object' ? options.sections : {};
  const hasSections = Object.keys(sections).length > 0;

  const footer = `POPULI CENTER: ${survey.title || 'Survei'}`;
  let page = 1;
  function addFooter(slide) {
    slide.addText(footer, { x: 0.4, y: 7.05, w: W - 1.5, h: 0.35, fontFace: 'Calibri', fontSize: 9, color: GRAY });
    slide.addText(String(page), { x: W - 0.9, y: 7.05, w: 0.5, h: 0.35, fontFace: 'Calibri', fontSize: 9, color: GRAY, align: 'right' });
    page += 1;
  }

  function addDivider(text, dark = false) {
    const slide = pptx.addSlide();
    slide.background = { color: dark ? NAVY : LIGHT };
    slide.addText((text || '').toUpperCase(), {
      x: 0.8, y: 3.0, w: W - 1.6, h: 1.2, fontFace: 'Calibri', fontSize: 30, bold: true,
      color: dark ? 'FFFFFF' : NAVY, align: 'center', valign: 'middle',
    });
  }

  // Grafik bar untuk satu pertanyaan dalam kotak {x,y,w,h}.
  function addQuestionChart(slide, q, box) {
    const dist = Array.isArray(q.distribution) ? q.distribution.slice(0, 12) : [];
    if (q.type === 'matrix' || dist.length === 0) {
      slide.addText(q.type === 'matrix' ? '(matriks — lihat ringkasan)' : '(belum ada data)', {
        ...box, fontFace: 'Calibri', fontSize: 11, italic: true, color: GRAY, align: 'center', valign: 'middle',
      });
      return;
    }
    const useValue = dist.some((d) => d.pct != null);
    const data = [{
      name: useValue ? 'Persentase' : 'Jumlah',
      labels: dist.map((d) => d.label),
      values: dist.map((d) => (useValue ? d.pct : d.count)),
    }];
    slide.addChart(pptx.ChartType.bar, data, {
      ...box, barDir: 'bar', chartColors: [BAR], showValue: true,
      dataLabelFontSize: 9, catAxisLabelFontSize: 10, valAxisHidden: true, showLegend: false,
    });
  }

  // ── 1) Cover ──────────────────────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    slide.background = { color: NAVY };
    slide.addText((survey.title || 'LAPORAN SURVEI').toUpperCase(), {
      x: 0.8, y: 2.4, w: W - 1.6, h: 1.8, fontFace: 'Calibri', fontSize: 40, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle',
    });
    if (period) slide.addText(period, { x: 0.8, y: 4.3, w: W - 1.6, h: 0.6, fontFace: 'Calibri', fontSize: 18, color: 'D9E1F2', align: 'center' });
    if (options.confidential !== false) {
      slide.addText('CONFIDENTIAL — TIDAK UNTUK PUBLIKASI', { x: 0.8, y: 6.4, w: W - 1.6, h: 0.5, fontFace: 'Calibri', fontSize: 12, color: 'B0B7C3', align: 'center' });
    }
  }

  // ── 2) Metodologi ───────────────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    slide.addText('PENGANTAR & METODOLOGI', { x: 0.5, y: 0.4, w: W - 1, h: 0.7, fontFace: 'Calibri', fontSize: 24, bold: true, color: NAVY });
    const n = (snapshot.target && snapshot.target.total) || snapshot.response_count || 0;
    const achieved = snapshot.response_count || 0;
    const provinces = snapshot.map && Array.isArray(snapshot.map.regions) ? snapshot.map.regions.length : null;
    const lines = options.methodology
      ? options.methodology.split('\n').filter(Boolean).map((t) => ({ text: t, options: { bullet: true } }))
      : [
          { text: 'Survei dilakukan dengan wawancara menggunakan aplikasi survei Populi Center.', options: { bullet: true } },
          { text: `Jumlah responden terkumpul: ${achieved.toLocaleString('id-ID')}${n ? ` dari target ${n.toLocaleString('id-ID')}` : ''}.`, options: { bullet: true } },
          period ? { text: period.replace('Periode survei: ', 'Periode lapangan: '), options: { bullet: true } } : null,
          provinces ? { text: `Cakupan wilayah: ${provinces} provinsi (berdasarkan data terkumpul).`, options: { bullet: true } } : null,
          { text: 'Metode penarikan sampel dan margin of error: [lengkapi sesuai desain survei].', options: { bullet: true, color: GRAY } },
        ].filter(Boolean);
    slide.addText(lines, { x: 0.7, y: 1.4, w: W - 1.4, h: 4.8, fontFace: 'Calibri', fontSize: 16, color: '262626', lineSpacingMultiple: 1.2, valign: 'top' });
    addFooter(slide);
  }

  // ── 3) Peta/sebaran provinsi ──────────────────────────────────────────────
  if (snapshot.map && Array.isArray(snapshot.map.regions) && snapshot.map.regions.length > 0) {
    const slide = pptx.addSlide();
    slide.addText('SEBARAN RESPONDEN PER PROVINSI', { x: 0.5, y: 0.4, w: W - 1, h: 0.7, fontFace: 'Calibri', fontSize: 22, bold: true, color: NAVY });
    const top = snapshot.map.regions.slice(0, 15);
    addQuestionChart(slide, { type: 'single_choice', distribution: top.map((r) => ({ label: r.name, count: r.count, pct: null })) }, { x: 0.6, y: 1.3, w: W - 1.2, h: 5.4 });
    addFooter(slide);
  }

  // ── 4) Profil responden (demografi) ───────────────────────────────────────
  const demoQs = questions.filter((q) => demoSet.has(q.id));
  if (demoQs.length > 0) {
    addDivider('Profil Responden');
    for (const group of chunk(demoQs, 4)) {
      const slide = pptx.addSlide();
      slide.addText('PROFIL RESPONDEN', { x: 0.5, y: 0.3, w: W - 1, h: 0.6, fontFace: 'Calibri', fontSize: 18, bold: true, color: NAVY });
      const boxes = [
        { x: 0.5, y: 1.2, w: 6.0, h: 2.5 }, { x: 6.8, y: 1.2, w: 6.0, h: 2.5 },
        { x: 0.5, y: 4.1, w: 6.0, h: 2.5 }, { x: 6.8, y: 4.1, w: 6.0, h: 2.5 },
      ];
      group.forEach((q, i) => {
        const b = boxes[i];
        slide.addText(q.text || 'Pertanyaan', { x: b.x, y: b.y, w: b.w, h: 0.5, fontFace: 'Calibri', fontSize: 11, bold: true, color: '262626', valign: 'top' });
        addQuestionChart(slide, q, { x: b.x, y: b.y + 0.5, w: b.w, h: b.h - 0.5 });
      });
      addFooter(slide);
    }
  }

  // ── 5) Slide per pertanyaan (non-demografi) dgn divider section ────────────
  const mainQs = questions.filter((q) => !demoSet.has(q.id));
  let currentSection = null;
  let first = true;
  for (const q of mainQs) {
    const sec = sections[q.id];
    if (hasSections) {
      if (sec && sec !== currentSection) { addDivider(sec); currentSection = sec; }
    } else if (first) {
      addDivider('Hasil Survei');
    }
    first = false;

    const slide = pptx.addSlide();
    slide.addText(q.text || 'Pertanyaan', { x: 0.5, y: 0.35, w: W - 1, h: 0.95, fontFace: 'Calibri', fontSize: 16, bold: true, color: NAVY, valign: 'top' });
    addQuestionChart(slide, q, { x: 0.6, y: 1.4, w: W - 1.2, h: 3.8 });
    const narrative = narratives[q.id] || narrateQuestion(q);
    slide.addText(narrative, { x: 0.6, y: 5.4, w: W - 1.2, h: 1.5, fontFace: 'Calibri', fontSize: 13, color: '262626', valign: 'top', lineSpacingMultiple: 1.1 });
    addFooter(slide);
  }

  // ── 6) Penutup ──────────────────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    slide.background = { color: NAVY };
    slide.addText('TERIMA KASIH', { x: 0.8, y: 2.6, w: W - 1.6, h: 1.2, fontFace: 'Calibri', fontSize: 40, bold: true, color: 'FFFFFF', align: 'center' });
    slide.addText('www.populicenter.org\ninfo@populicenter.org\nJl. Mampang Prapatan VIII No. 38, Jakarta Selatan', {
      x: 0.8, y: 4.2, w: W - 1.6, h: 1.5, fontFace: 'Calibri', fontSize: 16, color: 'D9E1F2', align: 'center', lineSpacingMultiple: 1.3,
    });
  }

  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

module.exports = { buildReportPptx };
