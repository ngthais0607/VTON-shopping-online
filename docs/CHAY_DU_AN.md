# Ghi chú lệnh chạy TrueLook (dev + VTON)

## Thứ tự bật

1. Mở Docker Desktop.
2. Hạ tầng (thư mục gốc):
   ```powershell
   docker compose up -d mariadb redis minio arq_worker
   ```
   Docker không còn dịch vụ `vton_worker`; worker try-on chạy trên máy (bước dưới).
3. API (thư mục `backend`):
   ```powershell
   fastapi dev app/main.py
   ```
4. Worker VTON (terminal riêng, thư mục `backend`):
   ```powershell
   .venv\Scripts\python.exe -m arq app.vton_worker.WorkerSettings
   ```
   Worker tự đọc `FASHN_API_KEY` từ biến User của Windows, nên terminal VS Code mở sớm vẫn chạy bình thường.
   Không bật thì task try-on nằm ở "queued" mãi.
5. Frontend (thư mục `frontend`):
   ```powershell
   pnpm run dev
   ```
   Mở http://localhost:3000

## Cấu hình engine VTON

Thêm vào `backend/.env` (API và worker đều đọc file này):

```
VTON_ENGINE=lab
VTON_LAB_ENGINES_FILE=D:/vton-local/engines.json
VTON_LAB_DEFAULT_ENGINE=auto
VTON_CLOTH_TYPES=upper,lower,overall
```

- `FASHN_API_KEY` để trong biến môi trường Windows (User), không ghi vào `.env`.
  Terminal mở mới mới nhận; terminal cũ phải mở lại.
- Chuỗi engine: `fashn_api` (nhanh, đẹp, ~$0,075/ảnh) -> `dmvton_cpu` (local, khi mất mạng/hết credit).
  Khai báo trong `D:/vton-local/engines.json`.

## Kiểm tra nhanh

```powershell
docker ps                                   # mariadb, redis, minio phải healthy
curl http://localhost:8000/api/v1/vton/products/1/eligibility   # engine phải là "lab"
```

## Tắt

- Ctrl+C ở từng terminal (API, worker, frontend).
- `docker compose stop` để tắt hạ tầng.

## Lưu ý

- Mỗi lần try-on tốn khoảng 1 credit FASHN; xem số dư ở dashboard FASHN.
- Mất mạng: tự rơi xuống DM-VTON local (chất lượng thấp hơn, chưa kiểm tra kỹ).
- Chạy toàn bộ bằng `docker compose up -d` chưa có worker try-on (FASHN/dmvton_cpu); worker này chạy trên máy.
- Tài khoản thử: `vtontest@example.com` (nên xóa sau khi demo).
- Chi tiết engine: `docs/VTON_ENGINES.md`.

## Thử áo 3D thân trên (`/store/try-on-3d`)

Chỉ cần frontend; không gọi backend, không tốn credit FASHN.

```powershell
cd frontend
pnpm install
pnpm dev
```

Mở http://localhost:3000/store/try-on-3d, nhập chiều cao / ngực / eo / vai (hoặc chọn preset), chọn size S/M/L.

- Kiểm tra: `pnpm vitest run tests/demo-upper` (lưới kín, đúng chiều mặt, vòng đo trên lưới lệch < 1%, áo không xuyên thân).
- Khi đang đổi số đo, ma-nơ-canh dựng lưới thô (1.6 cm); sau 250 ms đứng yên thì dựng lưới mịn (0.85 cm).
- Áo nhỏ hơn người được giữ đúng size, vùng chật tô đỏ và ghi trong mục gợi ý size.
