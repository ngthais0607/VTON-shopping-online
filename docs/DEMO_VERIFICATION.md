# TrueLook clothing demo — 2026-10-23 (Asia/Bangkok)

## Nghiệm thu bản Docker cuối — 2026-10-25

- Đã khởi động frontend image cuối tại 13000; frontend, API, MariaDB, MinIO và Redis healthy.
- Playwright trên bản production: **2/2 pass** (48,9 giây). CRUD admin gồm danh mục, sản phẩm draft, sáu size, upload/thay/xóa ảnh, sửa giá, kích hoạt và xóa; walkthrough gồm mua COD, hủy đơn, logout khách/login admin, dashboard và Security/Contact.
- `python .github/scripts/admin_crud_smoke.py`: **pass** sau cập nhật; tự dọn dữ liệu kiểm tra.
- Video cuối: `demo-backups/admin-catalog-2026-10-25.webm` và `demo-backups/shop-walkthrough-2026-10-25.webm`. Ảnh Categories/gallery cùng thư mục và ngày.
- Backend cuối **566 tests pass**; frontend **152 tests pass**, phần login/bootstrap/logout kiểm tra lại **6/6 pass** sau sửa điều hướng. Không chạy lại toàn bộ bộ integration MariaDB.
- Chưa tag stable/tạo nhánh VTON; giữ cổng nghiệm thu và giới hạn ảnh seed nêu bên dưới.

## Cập nhật admin — 2026-10-24

- Sửa lỗi upload/xóa ảnh của sản phẩm bản nháp bị 404: thao tác admin nay đọc được sản phẩm inactive.
- Ảnh chính được sắp trước trong API, bảng/grid/form dùng cùng ảnh bìa; sau khi xóa ảnh bìa, thứ tự dự phòng khớp server.
- Form quản lý gallery cho phép thay ảnh và xóa từng ảnh có xác nhận, giữ lỗi để thử lại; khóa lưu/đóng form khi đang upload. Giới hạn PNG/JPEG/WebP 5MB khớp backend.
- Edit/View tải dữ liệu sản phẩm chi tiết, tránh báo nhầm chưa có biến thể vì DTO danh sách không có trường variants. Preset size giày đã bỏ.
- Categories có bốn nhóm quần áo, lọc/tìm kiếm, cột nhóm cha và form chọn nhóm cha từ toàn bộ dữ liệu; giữ cấu trúc hai cấp.
- Sửa race khi khôi phục phiên trên trang admin mở trực tiếp: chờ silent refresh trước khi quyết định chuyển về login.
- `python .github/scripts/admin_crud_smoke.py`: **pass** với MariaDB/MinIO thật, gồm category CRUD, product draft/edit/variants/activate/delete và upload/read/delete ảnh; tự dọn dữ liệu của lượt kiểm tra.
- Frontend: **152 tests pass / 36 files**. Backend: **565 tests pass**, `--ignore=tests/integration`, `REDIS_URL=memory://`, `EMAILS_ENABLED=false`. TypeScript và lint các file admin đã sửa: pass.
- Review độc lập phát hiện lệch ảnh bìa sau nhiều lần thay/xóa; đã thêm test fail trước sửa, pass sau sửa. Không refactor file Products hoặc orders/service.py.
- Các lượt browser đầu dùng PNG 1×1: ảnh hiển thị và HTTP 200, nhưng phép đo naturalWidth bị làm tròn về 0 bởi responsive density. Đã thay fixture PNG 32×32; không thay logic phục vụ ảnh vì kết quả này.
- `RUN_ADMIN_CRUD_E2E=1` với Playwright: **pass** trên frontend dev 13001/API 18000. Luồng UI tạo/sửa/xóa danh mục, tạo sản phẩm draft kèm ảnh, sinh sáu size, thay cover, xóa ảnh cũ, sửa giá/kích hoạt, kiểm tra dữ liệu lưu rồi xóa sản phẩm/danh mục. Video: `demo-backups/admin-catalog-2026-10-24.webm`; ảnh Categories và gallery cùng thư mục.
- Build Docker production thành công, các service healthy; kiểm tra CRUD API/MinIO lặp lại **pass**. Luồng browser admin trên **13000 pass** (18,5 giây). Font fallback hiển thị đúng trên bản production. Local production còn request analytics Vercel 404; không ảnh hưởng CRUD.
- Walkthrough đầy đủ phát hiện hai lỗi tiếp theo: `router.refresh()` gọi ngay sau push gây tranh chấp điều hướng đăng nhập admin; đã bỏ refresh dư thừa. Dashboard recent-orders trả 500 với đơn checkout giỏ hàng có legacy summary null; truy vấn đọc nay lấy tên/quantity từ snapshot OrderItem khi cần, vẫn một SELECT và giữ đơn legacy. Test hồi quy fail trước sửa; cả bảy test dashboard và sáu test login/bootstrap/logout pass sau sửa. Review độc lập không có phát hiện mới.
- Walkthrough đầy đủ sau sửa: **pass** trên dev 13001/API Docker 18000 (43,7 giây): chọn hai sản phẩm, COD, hủy đơn, kiểm tra wishlist browser-only, logout khách/login admin, dashboard, Security và Contact. Video hoàn tất: `demo-backups/shop-walkthrough-2026-10-24.webm`.
- Backend cuối sau sửa dashboard: **566 tests pass**, cùng cấu hình unit test nêu trên; Ruff, TypeScript và lint phần sửa cuối pass.

## Phạm vi

Chỉ bán quần áo: 12 sản phẩm thuộc Áo, Quần, Váy & Đầm, Áo khoác; có size/màu, tồn kho và ba đơn mẫu cố định. Giày/túi/phụ kiện cũ được ẩn khỏi catalog, giữ lịch sử. Không thêm hardening, không sửa logic thanh toán, không refactor hai file lớn đang đóng băng.

## Môi trường thật

Docker Engine 29.8.2, Linux containers trên Docker Desktop Windows. Project `truelook-demo` riêng, không dùng volumes của hai project đã có trước đó.

- Shop: http://localhost:13000/store; API: http://localhost:18000/docs; MinIO: http://localhost:19001.
- MariaDB 13307, Redis 16379, MinIO API 19000.
- Alembic runtime: `f8a1b2c3d4e5 (head)`.

## Bằng chứng

- `docker compose up --build -d --wait`: build thành công và các dịch vụ healthy.
- `python .github/scripts/compose_smoke.py`: **pass**, project cô lập `vton-smoke-01af5f50f9`; tự dọn volumes của chính nó. Readiness và worker xác thực pass; không bật `SMOKE_BROWSER_TESTS` trong lượt này.
- `python .github/scripts/demo_api_check.py`: **pass** trên catalog quần áo. Ảnh MinIO HTTP 200; COD confirmed; hủy COD trả tồn kho; shipped → delivered → paid; webhook thiếu secret trả 401; webhook hợp lệ chuyển paid; replay transaction không thanh toán thêm.
- Frontend Vitest: **141 tests pass / 33 files** sau thay đổi UI và sửa tồn kho/hủy COD.
- TypeScript, ESLint các file sửa và Ruff các file Python sửa: pass.
- Backend lượt đầu: 560 pass, 3 lỗi test seed/login chưa mock MinIO. Đã thêm fake storage cho test_users; lượt đầy đủ cuối: **563 pass**, với `--ignore=tests/integration`, `REDIS_URL=memory://`, `EMAILS_ENABLED=false`.
- Backup sạch `demo-backups/clothing-seeded.sql`: **39,284 bytes**, từ DB mới `truelook_clothing_seed` với 12 sản phẩm quần áo + 3 đơn. Restore thành công vào `truelook_clothing_restore_check`.

## Lỗi thực tế đã sửa

1. Catalog báo Sold Out dù API trả available_stock=75: DTO danh sách thiếu inventory counters cũ. Helper nay đọc tồn khả dụng từ DTO; test hồi quy fail trước sửa, pass sau sửa.
2. UI không cho khách hủy COD confirmed dù backend cho phép. Điều kiện nay khớp backend; test và API thật xác nhận trả tồn kho.
3. Store preferences chỉ lưu localStorage nhưng báo thành công: bỏ phần này và panel Notifications không có cấu hình thật. Giữ hồ sơ/đổi mật khẩu.
4. Contact báo đã gửi dù không gửi: bỏ form. Sáu trang thông tin dùng nội dung ngắn trung thực; footer bỏ phương thức thanh toán và địa chỉ liên hệ không có thật.
5. Bỏ giá giảm/badge catalog, thống kê khách hàng/testimonial dựng sẵn trên trang chủ. Auth chỉ giới thiệu quần áo, bỏ voucher và thẻ giày.
6. Login có callback chuyển trang trễ 800 ms tồn tại sau khi form unmount; callback kéo admin từ Settings về Dashboard. Đã bỏ hai timeout đăng nhập, giữ nguyên role/return-path; test fail trước sửa và pass sau sửa. Reviewer độc lập xác nhận nguyên nhân và cách sửa.

## Các lần kiểm tra chưa đạt

- Sandbox Windows từ chối Docker pipe/socket; chạy Docker và HTTP/TestClient ngoài sandbox. Unit tests dùng SQLite riêng và REDIS_URL=memory://.
- Script API ban đầu đọc variants từ endpoint tóm tắt; sửa kịch bản dùng by-slug. Mã từ chối webhook thực tế là 401, đã sửa tài liệu; backend giữ nguyên.
- Một lượt HTTP bị đóng trong lúc Compose tái tạo API; chạy lại sau healthy đã pass.
- Video thử ban đầu dừng ở chuyển tài khoản/điều hướng settings: cần logout khách từ Header của shop; một lượt trùng rebuild, các lượt tiếp theo bộc lộ callback login trễ đã sửa ở trên. Chỉ công nhận video của lượt hoàn tất.

## Giới hạn và cổng VTON

Ảnh seed là minh họa SVG flat-lay tự chuẩn bị, không phải ảnh vải thật; chưa kiểm chứng định dạng/chất lượng với model VTON. Wishlist chỉ trên trình duyệt; Contact chưa gửi; không có ngân hàng/giao hàng thật. SMTP thật chưa kiểm chứng.

Không tuyên bố đã chạy toàn bộ MariaDB concurrency/migration integration suite; smoke/API là bằng chứng runtime riêng. Chưa tag stable hoặc tạo nhánh VTON: còn nghiệm thu của người demo và ảnh sản phẩm phù hợp VTON; workspace có thay đổi chưa commit từ trước.
