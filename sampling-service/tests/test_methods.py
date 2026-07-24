"""Tes metode sampling: proporsional+bobot, √N, PPS sistematik.

Jalankan langsung (tanpa pytest):  python tests/test_methods.py
Kompatibel pytest juga:            pytest tests/test_methods.py
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import sampling_engine as E  # noqa: E402


def buat_mfd(dpt_desa: bool = False) -> pd.DataFrame:
    """Kerangka sintetis 3 provinsi (besar/sedang/kecil) meniru keluaran load_mfd."""
    rows = []
    # Jumlah desa SENGAJA tidak proporsional dgn penduduk (A padat, C lengang)
    # agar koreksi bobot fallback benar-benar teruji ≠ 1, dan C punya cukup
    # desa utk menampung titik hasil jaminan minimum.
    spec = [
        ("PROV A", 100, 120_000_000),
        ("PROV B", 45, 25_000_000),
        ("PROV C", 30, 5_000_000),
    ]
    for prov, n_desa, pop in spec:
        for i in range(n_desa):
            rows.append({
                "NMPROP": prov,
                "NMKAB": f"{prov}-KAB{i % 3}",
                "NMKEC": f"{prov}-KEC{i % 5}",
                "NMDESA": f"{prov}-DESA{i:03d}",
                "UR": 1 if i % 4 == 0 else 2,
                "PENDUDUK": pop,          # per-provinsi (hasil attach_reference)
                "DPT": pop * 0.7,
                # per-desa: desa pertama tiap provinsi dibuat SANGAT besar
                "DPT_DESA": (pop / n_desa * (20 if i == 0 else 1)) if dpt_desa else pd.NA,
                "PENDUDUK_DESA": pd.NA,
            })
    df = pd.DataFrame(rows)
    df["URLABEL"] = df["UR"].map(E.UR_LABEL)
    df.insert(0, "ID", np.arange(1, len(df) + 1))
    return df


def cfg(**over):
    base = dict(scope="NASIONAL", unit="DESA", n_total=1200, cluster_size=10,
                weights={"PENDUDUK": 1.0, "DPT": 0.0, "MFD": 0.0},
                stratify_ur=True, min_per_unit=10, seed=2024)
    base.update(over)
    return E.SamplingConfig(**base)


def test_sqrt_allocation_mengangkat_provinsi_kecil():
    sizes = {"A": 100.0, "B": 25.0}
    assert E.allocate(E.allocation_sizes(sizes, "sqrt"), 8, 0) == {"A": 5, "B": 3}
    assert E.allocate(E.allocation_sizes(sizes, "proportional"), 8, 0) == {"A": 6, "B": 2}


def test_bobot_desain_memulihkan_estimasi_nasional():
    """Replikasi contoh diskusi: minimum keras membiaskan rata-rata mentah;
    rata-rata TERTIMBANG BOBOT_DESAIN memulihkan nilai sebenarnya."""
    res = E.run_sampling(buat_mfd(), cfg(method="proportional", min_per_unit=10))
    s = res.sample
    assert "BOBOT_DESAIN" in s.columns

    titik = s.groupby("NMPROP")["ID"].count()
    assert titik["PROV C"] >= 10  # minimum menggigit → C over-sampled

    # Nilai sintetis per provinsi (dukungan kandidat): A 50, B 50, C 20.
    nilai = s["NMPROP"].map({"PROV A": 50.0, "PROV B": 50.0, "PROV C": 20.0})
    benar = (120 * 50 + 25 * 50 + 5 * 20) / 150  # 49.0
    mentah = nilai.mean()
    tertimbang = float(np.average(nilai, weights=s["BOBOT_DESAIN"]))
    assert abs(tertimbang - benar) < 0.15, (mentah, tertimbang)
    assert abs(mentah - benar) > abs(tertimbang - benar)  # bobot memperbaiki


def test_pps_sistematik_self_weighting():
    res = E.run_sampling(buat_mfd(dpt_desa=True), cfg(method="pps_systematic"))
    s = res.sample
    assert int(s["RESPONDEN"].sum()) == 1200
    assert int(s["TITIK"].sum()) == 120
    assert (s["BOBOT_DESAIN"] == 1.0).all()  # self-weighting
    # Ringkasan menyebut metode & ukuran yang dipakai
    ring = dict(zip(res.ringkasan["Keterangan"], res.ringkasan["Nilai"]))
    assert "PPS" in ring["Metode sampling"]
    assert "DPT per desa" in ring["Ukuran PPS"]
    # Desa raksasa (ukuran 20x rata-rata; > interval) PASTI terpilih di tiap provinsi besar
    assert "PROV A-DESA000" in set(s["NMDESA"])
    # Alokasi emergent ≈ proporsional ukuran: share titik PROV A mendekati share DPT-desa-nya
    dfm = buat_mfd(dpt_desa=True)
    share_ukuran = dfm.groupby("NMPROP")["DPT_DESA"].sum() / dfm["DPT_DESA"].sum()
    share_titik = s.groupby("NMPROP")["TITIK"].sum() / 120
    assert abs(float(share_ukuran["PROV A"]) - float(share_titik.get("PROV A", 0))) < 0.02


def test_pps_fallback_tanpa_ukuran_desa():
    res = E.run_sampling(buat_mfd(dpt_desa=False), cfg(method="pps_systematic"))
    s = res.sample
    assert int(s["RESPONDEN"].sum()) == 1200
    assert any("TANPA ukuran per desa" in w for w in res.warnings)
    # Bukan self-weighting: bobot dihitung di tingkat provinsi & tak semua = 1
    # (share desa MFD ≠ share penduduk → koreksi harus muncul).
    assert not (s["BOBOT_DESAIN"] == 1.0).all()
    # Rata-rata tertimbang bobot ≈ 1 (ternormalisasi)
    rerata = float(np.average(s["BOBOT_DESAIN"], weights=s["TITIK"]))
    assert abs(rerata - 1.0) < 0.05


def test_preview_konsisten_per_metode():
    dfm = buat_mfd(dpt_desa=True)
    for m in ("proportional", "sqrt", "pps_systematic"):
        prev = E.preview_allocation(dfm, cfg(method=m))
        assert len(prev) == 4  # 3 provinsi + TOTAL
        total = prev.iloc[-1]
        assert int(total["Total_Titik"]) == 120


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  OK  {name}")
            except AssertionError as exc:
                fails += 1
                print(f"GAGAL {name}: {exc}")
    print("SEMUA LULUS" if fails == 0 else f"{fails} TES GAGAL")
    sys.exit(1 if fails else 0)
