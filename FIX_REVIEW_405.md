# Fix: Error 405 pada Review Response

## Problem
Request `PATCH /responses/:id/review` gagal dengan error **405 Method Not Allowed** ketika mencoba menyimpan catatan review.

## Root Cause
Nginx config tidak memetakan route `/responses/:id/review` ke backend. Pattern yang ada:
```nginx
location ~ ^/responses/[0-9a-f-]+$ { ... }  # hanya match /responses/uuid
```

Pattern di atas **tidak mencocokkan** `/responses/uuid/review` karena ada `/review` di akhir. Request jatuh ke location `/` (SPA fallback) yang hanya mendukung GET method → 405.

## Solution
Tambahkan location block spesifik untuk review route **sebelum** route generic `/responses/:id`:

```nginx
location ~ ^/responses/[0-9a-f-]+/review$ {
    proxy_pass http://backend:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $http_cf_connecting_ip;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
}
```

## Deployment Steps

### 1. Push code ke VPS
```bash
git add nginx.conf
git commit -m "fix: add nginx location for PATCH /responses/:id/review"
git push origin main
```

### 2. Di VPS, pull latest code
```bash
cd /path/to/app
git pull origin main
```

### 3. Reload nginx (TANPA restart container)
```bash
# Test config dulu
docker compose exec nginx nginx -t

# Kalau valid, reload
docker compose exec nginx nginx -s reload

# Atau gunakan script:
chmod +x scripts/reload-nginx.sh
./scripts/reload-nginx.sh
```

### 4. Clear Cloudflare cache (jika ada)
Cloudflare mungkin meng-cache response 405. Opsi:
- **Purge Everything** di Cloudflare dashboard
- **Development Mode** ON selama testing (15 menit)
- **Bypass cache** via curl:
  ```bash
  curl -X PATCH https://risetcenter.com/responses/SAMPLE-UUID/review \
    -H "Cache-Control: no-cache" \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"review_status":"verified","review_note":"test"}'
  ```

### 5. Test di browser
- Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
- Atau buka incognito window
- Test save review note

## Verification
Setelah reload, request `PATCH /responses/:id/review` seharusnya:
1. ✅ Diterima oleh nginx location `~ ^/responses/[0-9a-f-]+/review$`
2. ✅ Di-proxy ke backend:3000
3. ✅ Diterima oleh Express route `router.patch('/:id/review', ...)`
4. ✅ Response 200 dengan data review yang ter-update

## Troubleshooting

### Masih 405 setelah reload?
1. **Cek nginx container pakai config yang benar:**
   ```bash
   docker compose exec nginx cat /etc/nginx/conf.d/default.conf | grep -A5 "review"
   ```
   Harus ada location block untuk review.

2. **Cek nginx process sudah reload:**
   ```bash
   docker compose exec nginx nginx -s reload
   docker compose logs nginx --tail=50
   ```

3. **Cek request sampai ke backend:**
   ```bash
   docker compose logs backend --tail=100 -f
   ```
   Sambil test dari browser, lihat apakah ada log request PATCH.

4. **Bypass Cloudflare:**
   Edit `/etc/hosts` (Linux/Mac) atau `C:\Windows\System32\drivers\etc\hosts` (Windows):
   ```
   VPS_IP_ADDRESS  risetcenter.com
   ```
   Test langsung ke VPS tanpa lewat Cloudflare.

### Nginx reload gagal?
```bash
# Cek error detail
docker compose exec nginx nginx -T

# Kalau benar-benar rusak, restart container
docker compose restart nginx
```

## Files Changed
- `nginx.conf` — added location block for `/responses/:id/review`
- `scripts/reload-nginx.sh` — script untuk reload nginx (new file)

## Related Backend Route
```javascript
// backend/src/routes/responses.js line ~842
router.patch('/:id/review', 
  authMiddleware, 
  requireRole(['admin', 'supervisor']), 
  async (req, res, next) => {
    // Update review_status and review_note
  }
);
```

## Related Frontend Component
```javascript
// frontend/src/pages/ResponseDetail.jsx line ~329
async function handleSaveReview() {
  const res = await api.patch(`/responses/${id}/review`, {
    review_status: reviewStatus,
    review_note: reviewNote || null,
  });
}
```
