"""
main.py — Layanan HTTP (FastAPI) pembungkus sampling_engine.py.

Bagian dari dashboard Survei Populi Center (menu "Random Sampling"). Engine
metodologi (alokasi proporsional + largest-remainder + stratifikasi + PPS)
DIPERTAHANKAN apa adanya dari aplikasi Streamlit — layanan ini hanya menyajikan
antarmuka HTTP JSON agar dipanggil frontend React lewat proxy backend Node.

Keamanan: TIDAK ada auth di sini. Layanan HANYA boleh diakses dari jaringan
internal Docker (backend Node yang menegakkan JWT + role). JANGAN ekspos port
ke internet.
"""
from __future__ import annotations

import base64
import io

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

import sampling_engine as E

app = FastAPI(title="Populi Sampling Service", version="1.0.0")

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB — MFD 38 provinsi ~3 MB, beri ruang


# ── Excel helpers (disalin dari app.py Streamlit agar identik) ────────────────
def _pick_excel_engine() -> str:
    try:
        import xlsxwriter  # noqa: F401
        return "xlsxwriter"
    except Exception:
        return "openpyxl"


def _sheets_to_excel(sheets: dict) -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine=_pick_excel_engine()) as xw:
        for name, d in sheets.items():
            d.to_excel(xw, sheet_name=name[:31], index=False)
    return buf.getvalue()


def _df_records(df: pd.DataFrame) -> list:
    """DataFrame → list-of-dict JSON-aman (NaN → None, angka numpy → python)."""
    if df is None or len(df) == 0:
        return []
    safe = df.where(pd.notnull(df), None)
    return safe.astype(object).where(pd.notnull(safe), None).to_dict(orient="records")


async def _read_upload(f: UploadFile | None) -> bytes | None:
    if f is None:
        return None
    data = await f.read()
    if not data:
        return None
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Berkas terlalu besar (maks 25 MB).")
    return data


def _default_reference() -> "pd.DataFrame | None":
    """Referensi DPT/Penduduk bawaan (data/referensi_provinsi.csv)."""
    try:
        return pd.read_csv("data/referensi_provinsi.csv")
    except Exception:  # noqa: BLE001
        return None


def _load(mfd_bytes: bytes, ref_bytes: bytes | None, ref_name: str | None):
    """Muat MFD + lampirkan referensi. Prioritas: unggahan > bawaan (sama seperti
    aplikasi Streamlit). Referensi memberi kolom PENDUDUK/DPT per provinsi —
    tanpa itu, basis alokasi Penduduk/DPT & rekap Kerangka tak bermakna."""
    if not mfd_bytes:
        raise HTTPException(status_code=422, detail="File MFD (.xlsx) wajib diunggah.")
    try:
        df, info = E.load_mfd(io.BytesIO(mfd_bytes))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Gagal membaca MFD: {exc}") from exc
    ref = None
    if ref_bytes:
        try:
            ref = E.read_reference(ref_bytes, ref_name or "ref.xlsx")
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=422, detail=f"Gagal membaca referensi: {exc}") from exc
    else:
        ref = _default_reference()
    if ref is not None:
        try:
            df, _ = E.attach_reference(df, ref)
        except Exception:  # noqa: BLE001
            pass  # referensi tak cocok → lanjut tanpa PENDUDUK/DPT
    has_pop = "PENDUDUK" in df.columns and df["PENDUDUK"].notna().any()
    has_dpt = "DPT" in df.columns and df["DPT"].notna().any()
    return df, info, has_pop, has_dpt


def _parse_config(raw: str) -> dict:
    import json

    try:
        return json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Config JSON tidak valid: {exc}") from exc


def _config_from(payload: dict) -> "E.SamplingConfig":
    w = payload.get("weights") or {}
    method = str(payload.get("method", "proportional")).lower()
    if method not in ("proportional", "sqrt", "pps_systematic"):
        raise HTTPException(
            status_code=422,
            detail="method harus salah satu dari: proportional, sqrt, pps_systematic",
        )
    return E.SamplingConfig(
        method=method,
        scope=str(payload.get("scope", "NASIONAL")).upper(),
        scope_filter=list(payload.get("scope_filter") or []),
        unit=str(payload.get("unit", "DESA")).upper(),
        n_total=int(payload.get("n_total", 1200)),
        cluster_size=int(payload.get("cluster_size", 10)),
        weights={
            "PENDUDUK": float(w.get("PENDUDUK", 0) or 0),
            "DPT": float(w.get("DPT", 0) or 0),
            "MFD": float(w.get("MFD", 0) or 0),
        },
        stratify_ur=bool(payload.get("stratify_ur", True)),
        min_per_unit=int(payload.get("min_per_unit", 1)),
        pps=bool(payload.get("pps", False)),
        seed=int(payload.get("seed", 2024)),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/inspect")
async def inspect(mfd: UploadFile = File(...), reference: UploadFile | None = File(None)):
    """Unggah MFD → metadata + daftar provinsi & kab/kota (untuk mengisi form)."""
    mfd_bytes = await _read_upload(mfd)
    ref_bytes = await _read_upload(reference)
    df, info, has_pop, has_dpt = _load(mfd_bytes, ref_bytes, reference.filename if reference else None)

    provinces = sorted(df["NMPROP"].dropna().unique().tolist())
    kab_by_prov = {
        prov: sorted(df[df["NMPROP"] == prov]["NMKAB"].dropna().unique().tolist())
        for prov in provinces
    }
    return {
        "provinces": provinces,
        "kabupatenByProvince": kab_by_prov,
        "hasPenduduk": bool(has_pop),
        "hasDpt": bool(has_dpt),
        "rows": int(len(df)),
        "info": {k: (v if isinstance(v, (int, float, str, list)) else str(v)) for k, v in (info or {}).items()},
    }


@app.post("/preview")
async def preview(
    mfd: UploadFile = File(...),
    config: str = Form(...),
    reference: UploadFile | None = File(None),
):
    """Pratinjau alokasi titik per wilayah TANPA seleksi acak (cepat, tanpa Excel).

    Alokasi bersifat deterministik — angka di sini PERSIS sama dengan hasil saat
    sampling dijalankan; yang berbeda hanya desa mana yang terpilih (butuh seed).
    """
    payload = _parse_config(config)
    mfd_bytes = await _read_upload(mfd)
    ref_bytes = await _read_upload(reference)
    df, _info, _hp, _hd = _load(mfd_bytes, ref_bytes, reference.filename if reference else None)
    cfg = _config_from(payload)

    try:
        prev = E.preview_allocation(df, cfg)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Gagal menghitung alokasi: {exc}") from exc

    if not len(prev):
        raise HTTPException(status_code=422, detail="Data kosong setelah filter wilayah. Periksa pilihan cakupan.")

    rows = _df_records(prev)
    # Baris terakhir adalah TOTAL (dari engine) — pisahkan agar UI mudah menyajikan.
    body, total = rows[:-1], (rows[-1] if rows else {})

    # Peringatan diturunkan dari tabel pratinjau itu sendiri (bukan menyalin ulang
    # logika engine), sehingga tak bisa menyimpang dari perhitungan sebenarnya.
    warns: list[str] = []
    alloc_col = "Total_Titik" if "Total_Titik" in prev.columns else (
        "Kab_Dialokasikan" if "Kab_Dialokasikan" in prev.columns else None)
    if alloc_col:
        kosong = [r for r in body if not r.get(alloc_col)]
        if kosong:
            warns.append(
                f"{len(kosong)} wilayah tidak kebagian alokasi — perbesar target responden, "
                f"perkecil responden per titik, atau naikkan minimum per wilayah."
            )
    return {
        "preview": body,
        "total": total,
        "wilayah": len(body),
        "warnings": warns,
    }


@app.post("/run")
async def run(
    mfd: UploadFile = File(...),
    config: str = Form(...),
    reference: UploadFile | None = File(None),
):
    """Jalankan sampling. Kembalikan ringkasan + tabel + 2 Excel (base64)."""
    payload = _parse_config(config)

    mfd_bytes = await _read_upload(mfd)
    ref_bytes = await _read_upload(reference)
    df, _info, _hp, _hd = _load(mfd_bytes, ref_bytes, reference.filename if reference else None)
    cfg = _config_from(payload)

    try:
        preview = E.preview_allocation(df, cfg)
    except Exception:  # noqa: BLE001
        preview = pd.DataFrame()

    try:
        res = E.run_sampling(df, cfg)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Gagal sampling: {exc}") from exc

    warns = list(res.warnings or [])
    # Rekap Kerangka bergantung pada referensi DPT/Penduduk — bila gagal, jangan
    # gagalkan seluruh run; kembalikan sampel + alokasi tetap utuh.
    try:
        recap = E.build_kerangka_recap(df, res, cfg)
    except Exception as exc:  # noqa: BLE001
        recap = pd.DataFrame()
        warns.append(f"Rekap Kerangka tidak dibuat: {exc}")
    hasil_xlsx = _sheets_to_excel({"Ringkasan": res.ringkasan, "Sampel": res.sample, "Alokasi": res.alokasi})
    kerangka_sheets = {"Ringkasan": res.ringkasan}
    if len(recap):
        kerangka_sheets = {"Kerangka": recap, "Ringkasan": res.ringkasan}
    kerangka_xlsx = _sheets_to_excel(kerangka_sheets)

    return JSONResponse({
        "ringkasan": _df_records(res.ringkasan),
        "sample": _df_records(res.sample),
        "sampleTotal": int(len(res.sample)),
        "alokasi": _df_records(res.alokasi),
        "kerangka": _df_records(recap),
        "preview": _df_records(preview),
        "coverage": res.coverage or {},
        "warnings": warns,
        "files": {
            "hasil": base64.b64encode(hasil_xlsx).decode("ascii"),
            "kerangka": base64.b64encode(kerangka_xlsx).decode("ascii"),
        },
    })


def _xlsx_response(data: bytes, filename: str) -> Response:
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/template/mfd")
def template_mfd():
    return _xlsx_response(_sheets_to_excel(E.build_template()), "template_mfd.xlsx")


@app.get("/template/reference")
def template_reference():
    """Template referensi DPT/Penduduk (memakai referensi default bawaan bila ada)."""
    ref = None
    try:
        ref = pd.read_csv("data/referensi_provinsi.csv")
    except Exception:  # noqa: BLE001
        ref = None
    return _xlsx_response(_sheets_to_excel(E.build_reference_template(ref)), "template_referensi.xlsx")
