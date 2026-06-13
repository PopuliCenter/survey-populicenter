'use strict';

/**
 * buildReportPptx — bangun deck laporan survei (PPTX) dari data agregat,
 * meniru pola deck Populi: cover → metodologi → (peta sebaran) → divider →
 * slide per-pertanyaan (grafik + narasi) → penutup.
 *
 * Memakai pptxgenjs (native PPTX + grafik). Narasi default dari reportNarrative,
 * dapat ditimpa via options.narratives[questionId].
 */

const PptxGenJS = require('pptxgenjs');
const { narrateQuestion } = require('./reportNarrative');

// Palet selaras tema Office pada template.
const NAVY = '1F497D';
const BAR = '4F81BD';
const GRAY = '595959';
const LIGHT = 'F2F2F2';

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

/**
 * @param {{ survey: object, snapshot: object, options?: { confidential?: boolean, narratives?: object, methodology?: string } }} input
 * @returns {Promise<Buffer>}
 */
async function buildReportPptx({ survey, snapshot, options = {} }) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 inci
  pptx.author = 'Populi Center';
  pptx.company = 'Populi Center';

  const W = 13.333;
  const questions = (snapshot.questions || []);
  const period = periodLabel(survey);
  const footer = `POPULI CENTER: ${survey.title || 'Survei'}${period ? ` (${fmtDate(survey.start_date) || ''} – ${fmtDate(survey.end_date) || ''})` : ''}`;

  function addFooter(slide, pageNo) {
    slide.addText(footer, { x: 0.4, y: 7.05, w: W - 1.5, h: 0.35, fontFace: 'Calibri', fontSize: 9, color: GRAY });
    if (pageNo != null) {
      slide.addText(String(pageNo), { x: W - 0.9, y: 7.05, w: 0.5, h: 0.35, fontFace: 'Calibri', fontSize: 9, color: GRAY, align: 'right' });
    }
  }

  // ── 1) Cover ────────────────────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    slide.background = { color: NAVY };
    slide.addText((survey.title || 'LAPORAN SURVEI').toUpperCase(), {
      x: 0.8, y: 2.4, w: W - 1.6, h: 1.8, fontFace: 'Calibri', fontSize: 40, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle',
    });
    if (period) {
      slide.addText(period, { x: 0.8, y: 4.3, w: W - 1.6, h: 0.6, fontFace: 'Calibri', fontSize: 18, color: 'D9E1F2', align: 'center' });
    }
    if (options.confidential !== false) {
      slide.addText('CONFIDENTIAL — TIDAK UNTUK PUBLIKASI', {
        x: 0.8, y: 6.4, w: W - 1.6, h: 0.5, fontFace: 'Calibri', fontSize: 12, color: 'B0B7C3', align: 'center',
      });
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
      ? options.methodology.split('\n').map((t) => ({ text: t, options: { bullet: true } }))
      : [
          { text: `Survei dilakukan dengan wawancara menggunakan aplikasi survei Populi Center.`, options: { bullet: true } },
          { text: `Jumlah responden terkumpul: ${achieved.toLocaleString('id-ID')}${n ? ` dari target ${n.toLocaleString('id-ID')}` : ''}.`, options: { bullet: true } },
          period ? { text: period.replace('Periode survei: ', 'Periode lapangan: '), options: { bullet: true } } : null,
          provinces ? { text: `Cakupan wilayah: ${provinces} provinsi (berdasarkan data terkumpul).`, options: { bullet: true } } : null,
          { text: `Metode penarikan sampel dan margin of error: [lengkapi sesuai desain survei].`, options: { bullet: true, color: GRAY } },
        ].filter(Boolean);

    slide.addText(lines, { x: 0.7, y: 1.4, w: W - 1.4, h: 4.8, fontFace: 'Calibri', fontSize: 16, color: '262626', lineSpacingMultiple: 1.2, valign: 'top' });
    addFooter(slide, 2);
  }

  // ── 3) Peta/sebaran provinsi (bila ada) ──────────────────────────────────
  if (snapshot.map && Array.isArray(snapshot.map.regions) && snapshot.map.regions.length > 0) {
    const slide = pptx.addSlide();
    slide.addText('SEBARAN RESPONDEN PER PROVINSI', { x: 0.5, y: 0.4, w: W - 1, h: 0.7, fontFace: 'Calibri', fontSize: 22, bold: true, color: NAVY });
    const top = snapshot.map.regions.slice(0, 15);
    const chartData = [{ name: 'Responden', labels: top.map((r) => r.name), values: top.map((r) => r.count) }];
    slide.addChart(pptx.ChartType.bar, chartData, {
      x: 0.6, y: 1.3, w: W - 1.2, h: 5.4, barDir: 'bar', chartColors: [BAR], showValue: true,
      dataLabelFontSize: 9, catAxisLabelFontSize: 10, valAxisHidden: true, showLegend: false,
    });
    addFooter(slide, 3);
  }

  // ── 4) Divider ────────────────────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    slide.background = { color: LIGHT };
    slide.addText('HASIL SURVEI', { x: 0.8, y: 3.0, w: W - 1.6, h: 1.2, fontFace: 'Calibri', fontSize: 32, bold: true, color: NAVY, align: 'center', valign: 'middle' });
  }

  // ── 5) Slide per pertanyaan ───────────────────────────────────────────────
  let page = 5;
  for (const q of questions) {
    const slide = pptx.addSlide();
    slide.addText(q.text || 'Pertanyaan', {
      x: 0.5, y: 0.35, w: W - 1, h: 0.95, fontFace: 'Calibri', fontSize: 16, bold: true, color: NAVY, valign: 'top',
    });

    const isMatrix = q.type === 'matrix';
    const dist = Array.isArray(q.distribution) ? q.distribution.slice(0, 12) : [];

    if (!isMatrix && dist.length > 0) {
      const useValue = dist.some((d) => d.pct != null);
      const chartData = [{
        name: useValue ? 'Persentase' : 'Jumlah',
        labels: dist.map((d) => d.label),
        values: dist.map((d) => (useValue ? d.pct : d.count)),
      }];
      slide.addChart(pptx.ChartType.bar, chartData, {
        x: 0.6, y: 1.4, w: W - 1.2, h: 3.8, barDir: 'bar', chartColors: [BAR], showValue: true,
        dataLabelFontSize: 10, catAxisLabelFontSize: 11, valAxisHidden: true, showLegend: false,
      });
    } else {
      slide.addText(isMatrix ? '(Pertanyaan matriks — lihat ringkasan di bawah)' : '(Belum ada data jawaban)', {
        x: 0.6, y: 2.6, w: W - 1.2, h: 1.0, fontFace: 'Calibri', fontSize: 12, italic: true, color: GRAY, align: 'center',
      });
    }

    const narrative = (options.narratives && options.narratives[q.id]) || narrateQuestion(q);
    slide.addText(narrative, {
      x: 0.6, y: 5.4, w: W - 1.2, h: 1.5, fontFace: 'Calibri', fontSize: 13, color: '262626', valign: 'top', lineSpacingMultiple: 1.1,
    });
    addFooter(slide, page);
    page += 1;
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
