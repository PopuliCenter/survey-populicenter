# README Upgrade Architecture — Populi Center Survey Platform

## Overview

Dokumen ini berisi rekomendasi upgrade arsitektur untuk meningkatkan:

- Reliability
- Scalability
- Offline Stability
- High Availability
- Realtime Processing
- Anti Crash Protection

Target sistem:
- Multi wilayah aktif bersamaan
- Ribuan enumerator online
- Quick count / exit poll realtime
- Dashboard analytics live
- Mobile offline-first
- Enterprise-grade survey platform

---

# Target Scalability

## Current Risk

Jika 10 wilayah melakukan survei bersamaan, bottleneck utama biasanya:

- Export Excel/PDF realtime
- Query aggregation berat
- Upload media bersamaan
- Dashboard realtime tanpa cache
- Semua request masuk 1 backend process
- Tidak ada queue isolation
- PostgreSQL overload
- Frontend polling berlebihan

---

# Target Production Capacity

## Minimum Target

| Metric | Target |
|---|---|
| Concurrent Enumerator | 2.000+ |
| Concurrent Dashboard User | 200+ |
| Concurrent Survey Submit | 300 req/sec |
| Realtime Dashboard Delay | < 2 detik |
| Offline Recovery | otomatis |
| Export Async | queue-based |
| Media Upload | object storage |
| Downtime Tolerance | minimal |

---

# Recommended Architecture

```text
Internet
↓
Cloudflare CDN/WAF
↓
Nginx Load Balancer
↓
Frontend (React + Vite)
↓
API Gateway
↓
Backend API Cluster
↓
Redis Queue + Cache
↓
Worker Services
↓
PostgreSQL
↓
Object Storage
```

---

# Recommended Stack Upgrade

## Frontend

### Current
- React
- Vite
- Capacitor
- IndexedDB

### Recommended

| Component | Recommendation |
|---|---|
| State Management | Zustand / Redux Toolkit |
| Offline DB | SQLite |
| Sync Queue | Custom background sync |
| Realtime | Socket.IO |
| PWA | Keep enabled |
| Monitoring | Sentry |

---

# Mobile Offline Architecture

## PRIORITY: HIGH

## Problem

Jika internet hilang:
- data bisa hilang
- submit gagal
- enumerator submit ulang
- duplicate response

---

## Recommended Flow

```text
Input Response
↓
Save to SQLite Local
↓
Insert Pending Queue
↓
Background Sync Service
↓
Retry Failed Request
↓
Server ACK
↓
Mark Synced
```

---

# Recommended SQLite Integration

## Replace:

```text
IndexedDB only
```

## Add:
- Capacitor SQLite

### Benefits
- More stable on Android
- Better crash recovery
- Large data safer
- Faster local query

---

# Backend Architecture Upgrade

## Current
- Express
- Sequelize
- PostgreSQL
- Bull

## Recommended Upgrade

| Current | Upgrade |
|---|---|
| Bull | BullMQ |
| Sequelize | Prisma / Knex |
| Single API | API Cluster |
| No websocket | Socket.IO |
| Multer local | Object Storage |

---

# Queue System (VERY IMPORTANT)

## Every Heavy Task MUST Use Queue

### Queue Jobs

- export excel
- export pdf
- analytics
- wa blast
- ai processing
- realtime aggregation
- notification
- backup

---

# Recommended Queue Architecture

```text
API
↓
Redis Queue
↓
Dedicated Worker
↓
Result Storage
```

---

# PostgreSQL Optimization

## PRIORITY: VERY HIGH

---

# Use JSONB

## Example

```sql
answers JSONB
metadata JSONB
device_info JSONB
gps JSONB
```

---

# Add Indexing

## Required Indexes

```sql
CREATE INDEX idx_response_survey
ON responses(survey_id);

CREATE INDEX idx_response_created
ON responses(created_at);

CREATE INDEX idx_answers_jsonb
ON answers
USING GIN(data);
```

---

# PostgreSQL Extensions

Enable:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

---

# Avoid Heavy Aggregation Query

## Problem

```sql
COUNT(*)
GROUP BY
JOIN answers
```

akan membunuh database jika realtime.

---

# Recommended Solution

## Create Aggregated Tables

Example:

```text
survey_statistics
daily_statistics
regional_statistics
```

---

# Realtime Architecture

## Add WebSocket

### Use:
- Socket.IO
- Redis Pub/Sub

---

# Realtime Features

- live quick count
- live chart
- live map
- live turnout
- live enumerator status

---

# Reliability Upgrade

## Add Retry Mechanism

### Every API Request:
- retry
- exponential backoff
- request timeout

---

# Add Circuit Breaker

Prevent cascading failure.

## Example

If PostgreSQL slow:

```text
dashboard disabled temporarily
core survey still active
```

---

# Recommended Object Storage

## DO NOT STORE FILES INSIDE VPS

### Replace:

```text
local uploads
```

### Use:
- MinIO
- Cloudflare R2

---

# Benefits

- scalable
- cheaper
- backup easier
- CDN-ready

---

# Docker Production Architecture

## Recommended Services

```yaml
frontend
backend-api
worker
scheduler
postgres
redis
nginx
minio
```

---

# Separate Workers

## Example

```text
worker-export
worker-analytics
worker-wa
worker-ai
```

---

# High Availability Strategy

## Recommended

| Component | Recommendation |
|---|---|
| Redis | persistence enabled |
| PostgreSQL | daily backup |
| Nginx | reverse proxy |
| Frontend | CDN |
| Media | object storage |
| Logs | centralized |

---

# Monitoring & Observability

## REQUIRED

---

# Error Tracking

Use:
- Sentry

Tracks:
- frontend crash
- API errors
- sync failure
- mobile issue

---

# Metrics

Use:
- Prometheus
- Grafana

Monitor:
- CPU
- RAM
- DB connection
- Queue size
- API latency
- Redis memory

---

# Security Upgrade

## REQUIRED

### Add:
- refresh token rotation
- device binding
- audit log
- rate limiting
- IP throttling
- JWT expiration
- role-based access

---

# Anti Fraud Metadata

Store:

```json
{
  "gps": {},
  "device_id": "",
  "duration": 120,
  "battery": 80,
  "mock_location": false
}
```

---

# Scalability Strategy for 10 Simultaneous Regions

## Recommended Isolation

### Per Region:
- queue partition
- statistics cache
- websocket room
- dashboard aggregation

---

# Avoid Global Heavy Query

## BAD

```sql
SELECT COUNT(*)
FROM responses;
```

## GOOD

```sql
SELECT total_response
FROM survey_statistics
WHERE survey_id = ?;
```

---

# Recommended Deployment

## VPS Minimum

### Small Production

| Component | Spec |
|---|---|
| CPU | 8 Core |
| RAM | 16 GB |
| Storage | NVMe SSD |
| Redis | dedicated |
| PostgreSQL | dedicated |

---

# Recommended Scaling Path

## Stage 1
Single VPS

## Stage 2
Separate:
- DB server
- App server

## Stage 3
Load Balancer + Multiple API Nodes

## Stage 4
Kubernetes Cluster

---

# CI/CD Recommendation

Use:
- GitHub Actions

Pipeline:

```text
test
↓
build
↓
docker build
↓
deploy
↓
health check
```

---

# Testing Recommendation

## Add E2E Testing

Use:
- Playwright

Test:
- login
- submit survey
- offline sync
- reconnect sync
- dashboard realtime

---

# Recommended Reliability Priority

## PRIORITY 1
Offline Sync Engine

## PRIORITY 2
Realtime Queue Architecture

## PRIORITY 3
Database Optimization

## PRIORITY 4
Aggregated Statistics

## PRIORITY 5
Object Storage

## PRIORITY 6
Monitoring

## PRIORITY 7
HA Deployment

---

# Final Architecture Goal

Target system should be able to:

✅ Multi wilayah simultan  
✅ Ribuan enumerator aktif  
✅ Offline-first stable  
✅ Realtime quick count  
✅ Auto retry sync  
✅ Queue-based processing  
✅ No blocking export  
✅ Crash recovery  
✅ Horizontal scaling  
✅ HA-ready deployment  
✅ Enterprise audit trail  

---

# Long-Term Recommendation

Jika platform terus berkembang:

## Future Upgrade

- microservices
- kubernetes
- kafka
- CQRS
- event sourcing
- AI analytics
- realtime fraud detection

---