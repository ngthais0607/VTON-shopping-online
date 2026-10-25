# TrueLook — shop quần áo thời trang

## Yêu cầu

Docker Desktop đang chạy Linux containers và Docker Compose v2. Python 3.11+ để chạy smoke script. Cần internet cho lần build đầu; ảnh catalog được đóng gói trong repo và upload lên MinIO khi seed. Dùng cơ sở dữ liệu demo riêng.

## Bốn lệnh chạy

Chạy từ thư mục gốc trong PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up --build -d --wait
docker compose exec api python -m app.seed
python .github/scripts/compose_smoke.py
```

`.env.example` ở gốc là cấu hình chuẩn cho Compose/backend; `frontend/.env.example` chỉ chứa hai biến public khi chạy frontend riêng. Compose tự chạy migration trước API/worker; `docker compose exec api alembic current` phải báo `f8a1b2c3d4e5 (head)`.

Mở [shop](http://localhost:3000/store), [admin](http://localhost:3000/login), [API](http://localhost:8000/docs) và [MinIO](http://localhost:9001). Nếu máy có stack dùng các cổng này, đặt các biến `*_PORT`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_IMAGE_HOST`, `MINIO_EXTERNAL_URL`, `CORS_ORIGINS` trong `.env` cho cùng bộ cổng trước khi build.

## Tài khoản demo

| Vai trò | Email | Mật khẩu trong cấu hình demo |
|---|---|---|
| Admin | admin@example.com | `DemoAdmin!482` |
| Khách | user@example.com | `DemoCustomer!482` |

Chỉ dùng cho demo local. Seed giữ nguyên mật khẩu tài khoản đã tồn tại. Nếu bỏ các biến `SEED_*_PASSWORD`, seed sinh và in mật khẩu lúc tạo tài khoản. Không seed vào production.

## Kịch bản demo

1. Đăng nhập bằng tài khoản khách, mở catalog 12 sản phẩm quần áo (áo, quần, váy/đầm, áo khoác); xem ảnh và chọn size/màu còn hàng.
2. Thêm hai variant vào giỏ, sửa số lượng và checkout. **COD được chọn mặc định**; dùng tên khách, số `0912345678`, địa chỉ `72 Le Thanh Ton, Quan 1, TP Ho Chi Minh`.
3. Kiểm tra các đơn vừa tạo ở lịch sử/chi tiết đơn. Thử hủy một đơn COD chưa giao; kiểm tra tồn kho được trả lại.
4. Đăng nhập admin, xem dashboard có ba đơn seed: COD confirmed, COD delivered và VietQR paid. Mở đơn COD còn lại, chuyển shipped → delivered → paid; kiểm tra trạng thái và doanh thu.
5. Nếu demo VietQR, tạo đơn riêng và chỉ xác nhận sau khi mô phỏng webhook theo [hướng dẫn thanh toán](docs/DEMO_PAYMENTS.md). Không chuyển tiền thật. Đóng modal QR không đồng nghĩa đã thanh toán.
6. Đăng xuất rồi tải lại trang tài khoản. Logout thu hồi refresh session của thiết bị hiện tại; access token đã cấp vẫn có hiệu lực đến khi hết hạn. Đổi mật khẩu thu hồi mọi refresh session.

Wishlist chỉ lưu trong trình duyệt, không đồng bộ tài khoản. Contact chưa gửi tin nhắn. Ảnh seed là minh họa flat-lay tự chuẩn bị, không phải ảnh sản phẩm thật và chưa chứng minh chất lượng VTON.

Xem [bằng chứng chạy và phần còn thiếu](docs/DEMO_VERIFICATION.md), [sao lưu và khôi phục demo](docs/DEMO_BACKUP.md). Báo cáo review cũ nằm ở `docs/archive/`. Chỉ tag `v0.1-shop-stable` và tạo `feature/vton` sau khi hoàn tất kiểm chứng runtime, UI, seed, thanh toán, tài liệu và bản dự phòng.

## Cấu hình ổn định shop

Upload admin nhận PNG/JPEG/WebP giải mã được, tối đa 5 MiB, 8192 pixel mỗi chiều và 24 triệu pixel; không nhận ảnh động. Ảnh bị từ chối không thay cover hiện có. Ảnh SVG seed nội bộ không đi qua API upload raster này.

`NEXT_PUBLIC_ANALYTICS_ENABLED=false` là mặc định cho Docker tự host. Chỉ đặt `true` khi deployment hỗ trợ Vercel Analytics; đây là biến build, phải rebuild frontend sau khi đổi.

Với project demo hiện tại dùng cổng riêng: `RUN_ADMIN_CRUD_E2E=1`, `RUN_DEMO_WALKTHROUGH=1`, `E2E_BASE_URL=http://localhost:13000`, `E2E_API_URL=http://localhost:18000/api/v1`. Dùng origin localhost đúng CORS cấu hình, không trộn với 127.0.0.1. Các cổng mặc định trong phần chạy nhanh là cấu hình khác.

Sao lưu DB **và ảnh catalog** theo [hướng dẫn backup/restore](docs/DEMO_BACKUP.md); không dùng việc seed lại làm bằng chứng khôi phục ảnh admin.
