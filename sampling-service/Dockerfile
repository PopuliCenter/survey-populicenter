# Layanan Random Sampling (FastAPI + engine metodologi).
# Hanya diakses dari jaringan internal Docker oleh backend Node (JWT+role).
FROM python:3.12-slim

WORKDIR /app

# Dependensi dulu (lapisan cache) — build ulang cepat saat kode berubah.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY sampling_engine.py main.py ./
COPY data ./data

# Non-root
RUN useradd -m appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

# 1 worker cukup — pemakaian sporadis (bukan trafik tinggi). Timeout longgar
# untuk MFD besar + pembuatan Excel.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--timeout-keep-alive", "120"]
