# Review `VTON-shopping-online` (branch `fix/mvp-hardening`): lỗi và hướng fix

Ngày review: 2026-10-19

## Kết quả kiểm tra

| Hạng mục | Kết quả |
|---|---|
| Backend pytest | 536 pass, 24 skip (test MariaDB cần `TEST_DATABASE_URL`) |
| Backend ruff check / format | Sạch |
| Frontend `tsc --noEmit` | Sạch |
| Frontend `eslint --max-warnings=0` | Sạch |
| Frontend vitest | 122 test pass |

**Kết luận:** code ứng dụng khá chắc, nhưng cấu hình Docker đang hỏng nên `docker compose up` không chạy được.

**Chưa kiểm tra:**
- `pnpm build`
- Chạy Docker thật (các kết luận về compose dựa trên giả lập env của từng service)
- 24 test cần MariaDB
- Luồng trên trình duyệt và gửi SMTP thật

---

## Bảng tổng hợp

| # | Mức | Lỗi | Công sức |
|---|---|---|---|
| 1 | P0 | `migrate` / `arq_worker` thiếu biến bắt buộc, compose không lên | Nhỏ |
| 2 | P0 | Healthcheck gọi `/health` (404), frontend không start | Nhỏ |
| 3 | P0 | Ảnh sản phẩm vỡ trong Docker | Nhỏ |
| 4 | P1 | Hạ tầng lộ ra ngoài (Redis không mật khẩu, DB root) | Nhỏ–vừa |
| 5 | P1 | `seed.py` guard production sai nguồn, admin mật khẩu mặc định | Nhỏ |
| 6 | P1 | Webhook lệch số tiền không để lại bản ghi | Vừa |
| 7 | P1 | Refresh token xoay theo user, nhiều tab/thiết bị đá nhau | Nhỏ (nhanh) / Lớn (tối ưu) |
| 8 | P1 | Số tài khoản ngân hàng thật nằm trong repo | Nhỏ |
| 9 | P2 | CI không bắt được lỗi cấu hình Docker | Nhỏ |
| 10 | P2 | Dependency backend không pin | Vừa |
| 11–15 | P3 | Các lỗi nhỏ (xem cuối file) | Nhỏ |

---

## P0: Chặn chạy Docker (làm trước)

### 1. `migrate` và `arq_worker` thiếu biến bắt buộc

**Lỗi:** `Settings` bắt buộc `VIETQR_BANK_ID`, `VIETQR_ACCOUNT_NO`, `MINIO_*` (không có default). Nhưng:
- `migrate` chỉ nhận `DATABASE_URL` và `SECRET_KEY`.
- `arq_worker` thiếu `VIETQR_*`.

Giả lập đúng env từng service đều báo `Field required`. Vì `api` và `worker` phụ thuộc `migrate`, cả stack không lên.

**Fix tối ưu:** gom env dùng chung bằng YAML anchor, mỗi service chỉ ghi thêm phần riêng. Cách này sửa luôn mục 3 và 4.

```yaml
x-backend-env: &backend-env
  DATABASE_URL: mysql+pymysql://${MARIADB_USER:-app}:${MARIADB_PASSWORD}@mariadb:3306/${MARIADB_DATABASE:-fastapi_founder}
  REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0
  SECRET_KEY: ${SECRET_KEY:?required}
  MINIO_ENDPOINT: minio:9000
  MINIO_ACCESS_KEY: ${MINIO_ACCESS_KEY:-${MINIO_ROOT_USER}}
  MINIO_SECRET_KEY: ${MINIO_SECRET_KEY:-${MINIO_ROOT_PASSWORD}}
  MINIO_EXTERNAL_URL: ${MINIO_EXTERNAL_URL:-http://localhost:9000}
  VIETQR_BANK_ID: ${VIETQR_BANK_ID:?required}
  VIETQR_ACCOUNT_NO: ${VIETQR_ACCOUNT_NO:?required}
  VIETQR_ACCOUNT_NAME: ${VIETQR_ACCOUNT_NAME:-TRUELOOK}
  VIETQR_WEBHOOK_SECRET: ${VIETQR_WEBHOOK_SECRET:-}
  CORS_ORIGINS: ${CORS_ORIGINS:-http://localhost:3000}
  REFRESH_COOKIE_SECURE: ${REFRESH_COOKIE_SECURE:-true}
  EMAILS_ENABLED: ${EMAILS_ENABLED:-true}
  EMAILS_CONSOLE_LOG: ${EMAILS_CONSOLE_LOG:-true}
  SMTP_HOST: ${SMTP_HOST:-}
  SMTP_USER: ${SMTP_USER:-}
  SMTP_PASSWORD: ${SMTP_PASSWORD:-}

services:
  migrate:    { environment: *backend-env, ... }
  api:        { environment: { <<: *backend-env, FORWARDED_ALLOW_IPS: "${FORWARDED_ALLOW_IPS:-}" }, ... }
  arq_worker: { environment: *backend-env, ... }
```

**Cải thiện thêm (tuỳ chọn):** tách `DatabaseSettings` cho `database.py` để alembic và worker không phải validate toàn bộ `Settings`. Khi đó thiếu biến VietQR sẽ không làm hỏng migration.

### 2. Healthcheck gọi sai đường dẫn

**Lỗi:** `docker-compose.yml` (dòng 98) và `backend/Dockerfile` gọi `/health`, nhưng route thật là `/api/v1/health` (đã test: `/health` trả 404). Hậu quả: `api` luôn unhealthy, `frontend` (`depends_on: api: service_healthy`) không bao giờ start.

Ngoài ra endpoint trả 200 kể cả khi DB `unhealthy`, và in nguyên nội dung exception ra response (không cần đăng nhập).

**Fix tối ưu:**
1. Đổi URL trong compose, và xoá `HEALTHCHECK` trùng lặp trong Dockerfile (hoặc đổi cả hai cho khớp).
2. Trả 503 khi DB lỗi, log chi tiết ở server, không đưa chi tiết vào response.

```python
@router.get("", response_model=HealthResponse)
def health_check(response: Response, db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db_status = "healthy"
    except Exception:
        logger.exception("Health check: database unreachable")
        db_status = "unhealthy"
        response.status_code = 503
    ...  # redis degraded vẫn trả 200, không đưa chi tiết lỗi
```

### 3. Ảnh sản phẩm vỡ trong Docker

**Lỗi:** `MINIO_EXTERNAL_URL` không được set nên URL ảnh derive thành `http://minio:9000/...` (hostname nội bộ, trình duyệt không resolve được). `next.config.mjs` chỉ cho phép `localhost:9000`, và `NEXT_PUBLIC_IMAGE_HOST` không được truyền vào build.

**Fix tối ưu:**
- Đặt `MINIO_EXTERNAL_URL` là URL trình duyệt truy cập được (đã có trong anchor ở mục 1).
- Thêm `ARG` / `ENV NEXT_PUBLIC_IMAGE_HOST` vào `frontend/Dockerfile` và `build.args` của compose. `remotePatterns` được đóng gói lúc build nên phải truyền ở build time.

---

## P1: Bảo mật và đúng đắn nghiệp vụ

### 4. Hạ tầng lộ ra ngoài

**Lỗi:** Redis không mật khẩu; MariaDB, Redis, MinIO bind `0.0.0.0`; app dùng user `root` của DB.

**Fix tối ưu:**
- Dev: bind localhost, ví dụ `"127.0.0.1:6379:6379"` (tương tự 3307, 9000, 9001). Prod: bỏ `ports` hẳn.
- Redis: `command: redis-server --requirepass ${REDIS_PASSWORD}`.
- Tạo user DB riêng qua `MARIADB_USER` / `MARIADB_PASSWORD`, chỉ cấp quyền trên DB của app.

### 5. `seed.py` kiểm tra production sai nguồn

**Lỗi:** guard đọc `os.getenv("APP_ENV")`, nhưng `.env` không đi vào `os.environ` (pydantic-settings không export). Khi chạy `--force` ở production, admin vẫn được tạo với mật khẩu `Admin@123456`, chỉ che phần in ra.

**Fix tối ưu:**
- Dùng `get_settings().app_env`.
- Production: không seed user demo, hướng dẫn dùng `python -m app.cli create-admin`.
- Dev: lấy mật khẩu từ `SEED_ADMIN_PASSWORD` hoặc sinh ngẫu nhiên rồi in một lần.

### 6. Webhook lệch số tiền không để lại bản ghi

**Lỗi:** `amount_mismatch` chỉ log rồi trả lỗi. Khách đã chuyển tiền nhưng DB không có dấu vết để đối soát, và provider có thể retry mãi. `amount` trong payload cũng đang là `float`.

**Fix tối ưu:**
- Ghi `Payment` với `status="amount_mismatch"` (unique theo `transaction_id` nên retry vẫn idempotent), trả 200 kèm `status: "amount_mismatch"`, giữ đơn ở `pending`.
- Mở rộng `list_late_payments` để admin thấy cả loại này.
- Đổi `amount: float` thành `Decimal`.
- Cần kiểm tra `Payment.status` là `String` hay enum/constraint (chưa kiểm tra). Nếu là `String` thì không cần migration.

### 7. Refresh token xoay theo user, nhiều tab/thiết bị đá nhau

**Lỗi:** một `refresh_version` cho cả user. Hai tab refresh cùng lúc thì một tab bị 401 và đăng xuất. Frontend chỉ chia sẻ một lần refresh trong cùng một tab.

**Fix nhanh (frontend):** bọc `refreshSession()` bằng `navigator.locks.request('truelook-refresh', ...)`. Sau khi lấy được lock, kiểm tra tab khác đã renew chưa. Đã có sẵn `BroadcastChannel` nên có thể broadcast access token mới.

**Fix tối ưu (backend):** bảng `user_sessions(id, user_id, refresh_version, expires_at, revoked_at)`.
- Refresh token mang `sid`, xoay theo từng `sid`.
- Logout chỉ revoke `sid` đó.
- Đổi mật khẩu thì revoke toàn bộ session của user.
- Cần migration và là thay đổi hợp đồng token.

### 8. Số tài khoản ngân hàng thật nằm trong repo

**Lỗi:** `0382912048` xuất hiện trong `.env.example`, `docker-compose.yml` (default) và CI workflow (ngoài ra có trong test).

**Fix tối ưu:** thay bằng giá trị giả (`0000000000`), bỏ default trong compose và dùng `:?required`.

**Lưu ý:** history git vẫn còn số cũ, đổi giá trị không xoá được dấu vết đã commit.

---

## P2: CI và độ tin cậy

### 9. CI không bắt được lỗi cấu hình Docker

**Lỗi:** không có job nào chạy compose; CI cũng không chạy eslint và `ruff format --check`.

**Fix tối ưu:** thêm job smoke test.

```yaml
compose-smoke:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: |
        cat > .env <<EOF
        MARIADB_ROOT_PASSWORD=ci-pass
        SECRET_KEY=$(openssl rand -hex 32)
        MINIO_ROOT_USER=ciadmin
        MINIO_ROOT_PASSWORD=ci-minio-pass-123
        VIETQR_BANK_ID=MB
        VIETQR_ACCOUNT_NO=0000000000
        EOF
    - run: docker compose up -d --build --wait --wait-timeout 180
    - run: curl -fsS http://localhost:8000/api/v1/health
    - if: failure()
      run: docker compose logs --tail=100
```

Thêm vào job hiện có:
- Frontend: `pnpm exec eslint . --max-warnings=0`
- Backend: `ruff format --check app tests`

### 10. Dependency backend không pin

**Lỗi:** `requirements.txt` chỉ pin `bcrypt`.

**Fix tối ưu:** dùng `uv pip compile` hoặc `pip-tools` để sinh lockfile có hash; Dockerfile và CI cài từ lockfile.

---

## P3: Nhỏ, sửa khi tiện

| # | Lỗi | Fix |
|---|---|---|
| 11 | README nói access token ở local storage, code thực tế giữ in-memory | Sửa README |
| 12 | `login_user` bỏ qua hash khi không có user, lộ timing để dò email | `verify_password(pw, user.password_hash if user else _DUMMY_HASH)`, `_DUMMY_HASH` tạo một lần lúc import |
| 13 | `ilike(f"%{search}%")` không escape `%` và `_` | Escape ký tự rồi dùng `.ilike(pattern, escape="\\")` |
| 14 | `delete_product_image` xoá object MinIO trước khi commit DB, lỗi commit thì DB trỏ tới ảnh không còn | Xoá row và commit trước, rồi xoá object best-effort (object mồ côi vô hại hơn row hỏng) |
| 15 | Login chỉ giới hạn 5 lần/phút theo IP, nhiều người chung NAT bị chặn oan | Thêm giới hạn theo `identifier` hoặc lockout ngắn |

---

## Thứ tự làm đề xuất

1. **PR 1:** mục 1, 2, 3, 4 (`docker-compose.yml`, `Dockerfile`, `health/router.py`). Nhỏ, và mở khoá việc chạy được toàn stack.
2. **PR 2:** mục 9, để các lỗi này không tái phát.
3. **PR 3:** mục 5, 6, 8 (bảo mật và thanh toán).
4. **PR 4:** mục 7, tách riêng vì cần thiết kế và migration.
5. Các mục 10–15 làm dần khi tiện.

---

## Phụ lục: Chạy test integration với `TEST_DATABASE_URL`

24 test đang bị skip vì thiếu `TEST_DATABASE_URL`. Biến này không có sẵn ở đâu cả, đây là chuỗi kết nối tới một database MariaDB dùng riêng cho test, do bạn tự tạo:

```
mysql+pymysql://<user>:<password>@<host>:<port>/<tên_db>
```

CI của repo làm đúng như vậy: dựng MariaDB rồi gán `TEST_DATABASE_URL=mysql+pymysql://root:password123@127.0.0.1:3306/fastapi_founder_test`.

### Cách làm local (dùng MariaDB trong docker-compose)

**1. Bật MariaDB** (từ thư mục gốc repo, cần `MARIADB_ROOT_PASSWORD` trong `.env`):

```powershell
docker compose up -d mariadb
```

MariaDB nghe ở `localhost:3307`.

**2. Tạo database test riêng**, để không đụng dữ liệu dev:

```powershell
docker exec -it fastapi_mariadb mariadb -uroot -p -e "CREATE DATABASE fastapi_founder_test;"
```

**3. Đặt biến môi trường và migrate** (trong `backend/`):

```powershell
$env:DATABASE_URL      = "mysql+pymysql://root:<MARIADB_ROOT_PASSWORD>@127.0.0.1:3307/fastapi_founder_test"
$env:TEST_DATABASE_URL = $env:DATABASE_URL
.\.venv\Scripts\alembic.exe upgrade head
```

Linux/macOS: dùng `export DATABASE_URL=...` thay cho `$env:`.

**4. Chạy test:**

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Số test skip sẽ giảm, vì các test trong `tests/integration/` không còn bị bỏ qua.

### Lưu ý

- **Phải dùng database trống và dùng một lần**, tuyệt đối không trỏ vào DB dev hoặc production, vì test ghi và xoá dữ liệu.
- **Tài khoản cần quyền `CREATE` và `DROP` database.** Test migration tự tạo rồi xoá một DB tên `migration_<random>`. User `root` trong compose đã đủ quyền.
- Mật khẩu có ký tự đặc biệt (`@`, `:`, `/`) phải URL-encode, ví dụ `@` thành `%40`.
- Port là `3307` nếu dùng compose của repo, `3306` nếu tự cài MariaDB.
- Nếu làm theo mục 4 (đổi sang user DB riêng thay vì root), nhớ cấp thêm quyền `CREATE`/`DROP` cho user đó khi chạy test.
