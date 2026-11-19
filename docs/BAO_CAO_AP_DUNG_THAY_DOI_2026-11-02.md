# Báo cáo áp dụng thay đổi — 02/11/2026

## Phạm vi

Áp dụng nội dung `thay-doi.patch`, đối chiếu `TONG_HOP_THAY_DOI.md`, vào mã nguồn hiện tại tại `D:\fastapi-founder`. Các đề xuất xây module VTON ở cuối tài liệu là công việc giai đoạn sau, không thuộc bản vá này.

Kho mã đã có nhiều thay đổi chưa commit. Patch không áp dụng nguyên khối được; các phần xung đột được ghép theo mã hiện tại, giữ giao diện và cấu hình riêng của TrueLook.

## Thay đổi đã thực hiện

- Đồng bộ `ProductImageKind` với backend: `model_photo`, `flat_lay`, `detail`, `size_chart`, `catalog`.
- Uploader gửi `kind`, `color_name` và `is_primary`. Mặc định giữ hành vi tải model photo làm ảnh bìa.
- Admin chọn loại ảnh và màu từ variant; gallery hiển thị loại/màu. Upload ảnh không phải model photo không hạ cờ ảnh bìa hiện có.
- Thêm hai test upload: flat lay có màu giữ nguyên ảnh bìa; upload mặc định vẫn là model photo/primary và không gắn màu.
- Gỡ `backend/app/seed.py`, 12 SVG và README đi kèm; hai file test seed; hai script smoke/demo và hai bài Playwright phụ thuộc seed theo patch.
- Bỏ setting và biến môi trường mẫu `SEED_ADMIN_PASSWORD`, `SEED_CUSTOMER_PASSWORD`. Test đăng nhập/refresh tự tạo admin thay vì chạy seed.
- Cập nhật README, hướng dẫn backup và VTON readiness. README hướng dẫn tạo admin bằng CLI; giữ tên Compose `truelook`, các cổng và hướng dẫn phục hồi hiện có.
- `docs/DEMO_VERIFICATION.md` đã vắng mặt trước lượt này nên không cần xóa lại.

## Kiểm chứng

| Kiểm tra | Kết quả |
|---|---|
| `ruff check backend` | Đạt |
| `pnpm exec tsc --noEmit` | Đạt, exit 0 |
| `pnpm exec eslint . --max-warnings=0` | Đạt, exit 0 |
| Test quản lý ảnh | 5/5 đạt |
| Vitest lần đầu, worker mặc định | 163 đạt, 2 timeout ở giới hạn 15 giây |
| Chạy riêng hai file từng timeout, `--maxWorkers=1` | 17/17 đạt, không sửa mã hoặc tăng timeout |
| Vitest toàn bộ, `--maxWorkers=2` | 165/165 đạt, 42/42 file, exit 0 |
| Backend ngoài integration, `REDIS_URL=memory://` | 579/579 đạt, 29 integration deselected, exit 0 |
| `git diff --check` | Đạt |
| Rà soát độc lập các phần ghép so với bản sao trước sửa | Không phát hiện lỗi cần sửa |

Lượt backend trong sandbox bị treo ở `socket.accept` trong `socket._fallback_socketpair`, khi Windows asyncio tạo event loop cho TestClient. Phép kiểm tra riêng xác nhận tạo event loop thành công ngoài sandbox. Bộ pytest được chạy lại ngoài sandbox với `REDIS_URL=memory://`; conftest sử dụng SQLite `test.db`. Bước thu thập xác nhận 579 test ngoài integration và 29 test integration bị loại khỏi lượt chạy. Không thay cấu hình kiểm thử của kho mã để né lỗi môi trường.

Pytest còn một cảnh báo của Hypothesis về `norecursedirs` bỏ qua thư mục `.hypothesis`; không có test thất bại. Số test của kho mã hiện tại khác bản ZIP dùng trong tài liệu đầu vào, vì vậy báo cáo sử dụng số liệu vừa chạy lại trên workspace này.

## Giới hạn và vận hành

- Đã build và deploy lại các dịch vụ ứng dụng Docker theo yêu cầu tiếp theo của người dùng; xem kết quả bên dưới.
- Không xóa hay chỉnh sửa database hiện tại, tài khoản, sản phẩm, đơn hàng hoặc object MinIO. Chỉ database mới không có dữ liệu ban đầu; database cũ giữ nguyên dữ liệu.
- Không tạo admin vào database hiện tại vì chưa có thông tin tài khoản cần tạo. Khi cần, dùng `docker compose exec api python -m app.cli create-admin --email admin@your-domain.test --username shopadmin` và nhập mật khẩu tương tác.
- Chưa chạy integration MariaDB, Docker Compose smoke hoặc Playwright; hai bài e2e phụ thuộc seed được gỡ đúng patch, cần viết lại với setup dữ liệu độc lập ở công việc sau.
- Chưa triển khai inference VTON, storage private, queue riêng, consent hoặc quota.
- Bản sao các file trước khi ghép và log kiểm tra nằm trong thư mục local được Git bỏ qua `demo-backups/patch-20261102-before/` và `demo-backups/patch-20261102-*.log`. Bản sao test quản lý ảnh được chụp sau khi thêm hai test của patch.
- Các thay đổi chưa được commit.

## Deploy Docker — 02/11/2026

Đã build lại `api`, `arq_worker`, `migrate`, `frontend` và triển khai vào project `truelook` bằng `docker compose up -d --no-build --wait --wait-timeout 180 api arq_worker frontend` (exit 0).

- Migration kết thúc với exit 0. API, frontend, MariaDB, Redis và MinIO đạt health check; kiểm tra heartbeat ARQ worker thành công.
- API health, danh sách sản phẩm, storefront, trang đăng nhập, chi tiết sản phẩm, ảnh sản phẩm và MinIO readiness đều trả HTTP 200.
- Số bản ghi của toàn bộ 12 bảng trước/sau giống nhau: 30 sản phẩm, 148 variant, 40 danh mục, 14 ảnh, 33 đơn, 46 dòng đơn, 10 payment, 2 user, 59 session; các bảng còn lại cũng không thay đổi.
- Giữ nguyên các volume `truelook_mariadb_data`, `truelook_minio_data`, `truelook_redis_data`. Xác nhận trong container API mới không còn `app/seed.py` hoặc setting `seed_admin_password`.
- SQL trước deploy: `demo-backups/deploy-20261102/before-20261102T140113.sql` (76.950 byte). Image rollback: `truelook-rollback-{api,frontend,arq_worker,migrate}:before-patch-20261102`.
- Log build/deploy, số bản ghi trước/sau và kết quả HTTP lưu cục bộ trong `demo-backups/deploy-20261102/`, được Git bỏ qua.

Truy cập cửa hàng: <http://localhost:3000/store>. Đăng nhập admin: <http://localhost:3000/login>.
