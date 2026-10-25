# Review shop và mức sẵn sàng VTON — 2026-10-25

Phạm vi: trạng thái workspace hiện tại, gồm các thay đổi chưa commit. Chỉ review, kiểm chứng và viết báo cáo; không sửa code sản phẩm, không tạo tag/nhánh stable. Runtime kiểm tra là project `truelook-demo` tại localhost:13000/18000. Các kết quả Docker không tự chứng minh image đang chạy chứa mọi thay đổi trong workspace; kiểm tra source/build được ghi riêng.

Người dùng xác nhận trong phiên: **ổn định shop trước, sau đó mới thêm VTON**. Các mục VTON bên dưới là ghi nhận cho giai đoạn sau; không phải phạm vi triển khai hiện tại.

## Kết quả xác minh trong phiên này

| Kiểm tra | Kết quả |
|---|---|
| Frontend Vitest | 152/152 test, 36/36 file pass |
| TypeScript `tsc --noEmit` | Pass |
| ESLint toàn frontend, `--max-warnings=0` | Pass |
| Backend Ruff check / format | Pass; 149 file đúng format |
| Backend unit/regression | 566/566 pass, 209,16 giây; SQLite, Redis memory, email tắt |
| MariaDB integration | 29/29 pass, 188,65 giây; container/database dùng một lần đã tự dọn, qua `.github/scripts/run_integration.py` |
| Frontend production build từ source | Pass, exit 0; compile, TypeScript, tạo trang và build traces hoàn tất |
| Playwright production demo | 2/2 pass, 45,6 giây |
| Docker demo | Frontend/API/MariaDB/Redis/MinIO healthy; ARQ health check pass |
| Migration demo | `f8a1b2c3d4e5 (head)` |

Browser đã kiểm tra CRUD danh mục; sản phẩm draft, biến thể, upload/thay/xóa ảnh, kích hoạt/xóa; khách đăng nhập, chọn sản phẩm/size, checkout COD, hủy đơn; logout khách/login admin, dashboard, Security và Contact. Kịch bản walkthrough tạo một đơn demo; CRUD tự dọn sản phẩm/danh mục thử. Không đo tải, độ trễ p95 hay GPU.

Lượt Playwright đầu thất bại vì người review truyền API URL thiếu `/api/v1` và dùng `127.0.0.1` khác origin cấu hình. Chạy lại đúng `E2E_BASE_URL=http://localhost:13000`, `E2E_API_URL=http://localhost:18000/api/v1` đã pass. Không tính lỗi cấu hình này là lỗi ứng dụng. Sandbox cũng từ chối Docker pipe/build mkdir và làm TestClient đứng; các bước liên quan được chuyển sang chạy ngoài sandbox.

## Phát hiện ở code hiện tại

### P2 — Upload nhận file hỏng có header giả

Nguồn: `backend/app/features/products/images.py:46`, `:104`, `:125`.

`sniff_image_type` chỉ kiểm tra vài byte đầu. Phép thử trực tiếp gọi `store_product_image` với DB/storage giả đã chấp nhận payload 40 byte gồm PNG signature và byte zero, không có chunk IHDR; storage.put vẫn được gọi. Các fixture `VALID_PNG_BYTES` trong test hiện cũng không phải ảnh PNG giải mã được. Hậu quả là lưu được ảnh không hiển thị và về sau có thể đẩy input hỏng vào VTON.

Hướng cải thiện: giải mã/verify ảnh bằng thư viện ảnh, giới hạn chiều rộng/cao và tổng pixel, chuẩn hóa orientation/metadata; test bằng ảnh thật cùng trường hợp truncated/header giả. Đây là validation ảnh catalog; pipeline ảnh người dùng VTON còn cần quy định đầu vào riêng.

### P2 — Tài liệu readiness khẳng định vượt quá code

Nguồn: `docs/VTON_READINESS.md:11–16`, phần storage và category.

Tài liệu dùng số test cũ và migration head cũ; mô tả presigned URL và mapping category như đã có. Adapter storage hiện chỉ có ensure/put/delete/public_url; Category chỉ có tên/slug/parent, chưa có mapping engine rõ ràng. Các nhãn READY dễ khiến phần tích hợp sau dựa trên khả năng chưa được triển khai.

Hướng cải thiện: dùng báo cáo này làm bằng chứng của lượt review, rồi cập nhật tài liệu readiness theo từng khả năng thực có. Các con số latency, giá GPU và nhận định pháp lý trong tài liệu cũ không được xác minh trong phiên này.

### P3 — Analytics tạo request 404 trên Docker local

Nguồn: `frontend/app/layout.tsx`, điều kiện production render `<Analytics />`.

Hai browser test vẫn pass nhưng log có `/_vercel/insights/script.js` 404. Có thể bật bằng cấu hình deployment khi triển khai Analytics, tránh request lỗi ở bản demo tự host.

## Khoảng trống cần xử lý khi thêm VTON

Đây là chức năng chưa có, không phải lỗi của shop khi chưa cung cấp thử đồ.

1. **Ảnh đúng sản phẩm và màu.** `frontend/components/image-uploader.tsx:58` chỉ gửi file/is_primary; backend có nhận `kind`/`color_name` nhưng UI chưa cho quản lý. Query chỉ đọc trên demo trả 12 sản phẩm active, 24 cặp sản phẩm–màu, 12 ảnh flat_lay đều là SVG, và **0/24 cặp có ảnh flat_lay gắn đúng màu**. Cần dữ liệu ảnh phù hợp model, quy tắc chọn ảnh xác định, và không bật thử đồ cho màu chưa đủ ảnh. Ảnh minh họa SVG hiện tại chưa phải bằng chứng chất lượng VTON.
2. **Storage riêng cho ảnh người dùng.** `backend/app/integrations/storage.py:40` cấp public GET cho `products/*`. Không tái sử dụng đường public này cho ảnh người dùng. Cần storage private, kiểm tra quyền theo chủ sở hữu, URL truy cập tạm thời và xóa dữ liệu theo thời hạn đã thống nhất. Adapter hiện chưa có presign/lifecycle cho VTON.
3. **Job bền vững và worker riêng.** ARQ hiện phục vụ email/expire order (`backend/app/worker.py:78`), timeout 60 giây. `_enqueue_best_effort` trong orders/service.py bắt lỗi và chỉ log; phù hợp email best-effort nhưng không bảo đảm job VTON đã được nhận. Cần bản ghi task, idempotency, trạng thái queued/running/succeeded/failed, timeout/retry và phục hồi task khi enqueue/worker lỗi; tách queue/worker inference để việc thử đồ không làm chậm expire đơn/email.
4. **Mapping loại trang phục.** Category slug có thể chỉnh sửa và có hậu tố tự sinh. Cần mapping cấu hình/metadata rõ ràng sang loại input engine, có trạng thái unsupported; không suy diễn từ tên danh mục khi chạy inference.
5. **Giới hạn tài nguyên và trải nghiệm lỗi.** Cần quota theo user, giới hạn job đồng thời, trạng thái chờ và thử lại, chính sách lưu/xóa ảnh, cùng bộ ảnh kiểm chứng chất lượng. Chưa có benchmark inference; không cam kết số giây hay khả năng mô phỏng độ vừa size.

## Thứ tự đề xuất

1. Ổn định shop: sửa validation ảnh; xử lý Analytics 404 khi tự host; kiểm tra lại đúng các luồng bị tác động.
2. Chốt baseline shop: unit/integration/build và browser đều đã pass trong phiên này; lưu source/bằng chứng demo sau khi người dùng nghiệm thu. Chưa benchmark tải và chưa kiểm chứng SMTP thật.
3. Sau khi shop được chốt mới chuẩn bị ảnh trang phục theo màu, cập nhật readiness doc và chốt phạm vi VTON.
4. Thiết kế task/storage/worker cùng luồng UI, rồi mới lập kế hoạch triển khai module.

Không cần refactor toàn bộ shop để bắt đầu. Nên giữ ranh giới feature VTON riêng, tái sử dụng user/variant và hạ tầng qua adapter. Việc chọn API GPU hay tự host chưa được người dùng quyết định; báo cáo này không phải thiết kế VTON đã được phê duyệt.
