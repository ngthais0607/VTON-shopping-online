# Review độ ổn định — 2026-10-26

Phạm vi review ban đầu: source gồm các thay đổi chưa commit; backend, frontend, migration/concurrency và demo Docker `truelook-demo`. Sau review, người dùng yêu cầu sửa lỗi và cập nhật README. Phần phát hiện dưới đây giữ bằng chứng trước sửa; trạng thái khắc phục được ghi ở cuối. Không tag stable. Module mới chưa được xác định; VTON chỉ là bối cảnh đã có trong repo.

## Phát hiện trước sửa

### P2 — Quick Buy chuyển đến checkout nhưng không thêm hàng

`frontend/app/store/components/FeaturedProducts.tsx:68` gọi addToCart(product.source, qty) không có variant_id, rồi luôn chuyển sang checkout ở dòng 70. Product DTO của API danh sách không có variants (`backend/app/features/products/schemas.py`, ProductPublicResponse). CartContext bỏ qua khi không suy ra được variantId (`frontend/app/store/context/CartContext.tsx`). Modal không cho chọn size/màu.

Đã tái hiện bằng Chromium trên demo: đăng nhập khách với browser context mới → Quick Buy → Purchase → `/store/checkout`; localStorage `truelook_cart_v2` là `[]`, trang hiển thị “Your cart is empty”. Không tạo đơn trong phép thử này. Nếu giỏ đã có hàng, luồng này có thể đưa khách đến checkout các món cũ mà thiếu món vừa chọn.

Hướng sửa: chuyển Quick Buy đến trang chi tiết để chọn variant, hoặc tải detail và buộc chọn size/màu trong modal. Chỉ chuyển checkout sau khi thêm variant thành công. Bổ sung test cho nút trên catalog; walkthrough hiện có chỉ kiểm tra mua qua trang chi tiết nên vẫn pass.

### P2 — Validation upload cho qua ảnh hỏng có header đúng

`backend/app/features/products/images.py:46` chỉ kiểm tra magic bytes; dòng 104 chỉ truyền 16 byte đầu, rồi dòng 125 lưu toàn bộ payload mà không giải mã/verify. `backend/tests/test_product_images.py:21` dùng PNG signature cộng 32 byte zero làm VALID_PNG_BYTES; đây không phải PNG có cấu trúc hợp lệ nhưng test upload draft chấp nhận nó.

Ảnh catalog có thể lưu thành công nhưng không hiển thị; module xử lý ảnh sau này nhận input hỏng. Cần verify/decode ảnh, giới hạn kích thước/pixel và test bằng ảnh thật cùng payload truncated/header giả. Giới hạn 5MB hiện có không thay thế kiểm tra nội dung ảnh.

### P3 — Analytics bật cho mọi production deployment

`frontend/app/layout.tsx:44` render Vercel Analytics theo NODE_ENV production, gồm cả Docker tự host. Đã kiểm tra mới trong phiên: GET `http://localhost:13000/_vercel/insights/script.js` trả HTTP 404. Chưa có điều kiện theo cấu hình deployment; có thể bật qua cấu hình riêng khi cần Analytics. Đây là request lỗi phụ, không chặn mua hàng.

## Phạm vi tính năng

| Nhóm | Đánh giá |
|---|---|
| Auth/session, phân quyền | Có test đăng nhập/refresh/logout, nhiều thiết bị và kiểm tra quyền |
| Danh mục, sản phẩm, variant, ảnh | CRUD admin E2E pass; validation nội dung ảnh còn thiếu |
| Catalog, giỏ, checkout | Luồng chọn variant ở trang chi tiết pass; Quick Buy lỗi đã tái hiện |
| Đơn, thanh toán, tồn kho | Có regression và MariaDB concurrency; VietQR là webhook riêng, chưa có adapter ngân hàng/provider |
| Dashboard | E2E walkthrough pass; có regression đọc đơn giỏ hàng |
| Wishlist/contact | Wishlist chỉ lưu browser; contact chưa gửi; đây là giới hạn đã công bố |
| Vận hành | Demo healthy, migration head đúng, ARQ health pass; chưa đo tải hoặc kiểm chứng SMTP thật |

## Kết quả kiểm chứng

| Kiểm tra | Kết quả mới trong phiên |
|---|---|
| Backend unit/regression | 566/566 pass; SQLite riêng, Redis memory, email tắt; 302,23 giây |
| MariaDB integration | 29/29 pass; database/container dùng một lần, script tự dọn; 338,43 giây |
| Frontend Vitest | 152/152 pass, 36/36 file |
| TypeScript và ESLint | Pass, exit 0; ESLint --max-warnings=0 |
| Ruff check và format | Pass; 149 file đúng format |
| Production build | Pass, exit 0; compile, TypeScript, tạo trang và build traces hoàn tất |
| Playwright demo | 2/2 pass: admin catalog CRUD và shop walkthrough |
| Quick Buy riêng | Tái hiện checkout giỏ trống; script exit 0 vì đây là phép quan sát |
| Demo runtime | API/frontend/MariaDB/Redis/MinIO healthy; worker check pass; migration f8a1b2c3d4e5 (head) |

Unit test trong sandbox đứng sau chín test, đã dừng đúng tiến trình và chạy lại ngoài sandbox trên SQLite tạm khác. Build sandbox cũng không tiến triển nên chạy lại ngoài sandbox. Không tính các lượt bị dừng là pass. Integration có warning deprecation TestClient/Alembic; frontend có warning act/chart/jsdom, nhưng các suite kết thúc exit 0.

Runtime Docker không tự chứng minh image chứa mọi thay đổi source. Hai E2E có ghi dữ liệu demo: CRUD tự dọn; walkthrough tạo đơn COD rồi hủy. Không tác động stack khác trên máy.

## Điều kiện mở rộng

Cổng nghiệm thu ban đầu là sửa Quick Buy và validation ảnh, rồi kiểm tra lại luồng bị tác động. Không cần refactor toàn bộ shop. Module mới nên có router/service/schema/model và migration riêng; không trộn xử lý dài với checkout/expire đơn. Với VTON, xem [điều kiện triển khai](../VTON_READINESS.md).

Health endpoint chỉ thử DB/Redis; storage trả “configured”, không phải phép thử MinIO. Worker được kiểm tra riêng. Không dùng HTTP 200 ở health để kết luận toàn bộ hạ tầng có thể xử lý mọi chức năng.

## Dọn tài liệu

Đã bỏ 11 báo cáo lịch sử trong docs/archive, review ngày 25 bị thay thế bởi báo cáo này, fix-list ngày 19 và migration note trùng ở repo root. Bỏ 18 plan/spec lịch sử trong docs/superpowers, không có tham chiếu từ tài liệu vận hành hiện tại. Giữ README, hướng dẫn seed assets, thanh toán, backup và bằng chứng demo; viết lại một migration guide đủ revision và readiness phản ánh code thực tế. README trỏ đến các tài liệu còn dùng.

Không xóa skill/instruction trong .agents hoặc .codex. Các thay đổi source có sẵn được giữ nguyên.

## Khắc phục theo yêu cầu sau review

- Quick Buy mở trang chi tiết để chọn variant cho cả khách và user đã đăng nhập. Bỏ modal cũ không chọn được size/màu và thông báo thành công không dùng.
- Upload verify cấu trúc rồi decode bằng Pillow trước storage; từ chối ảnh giả/truncated, JPEG thiếu end marker, ảnh động và ảnh vượt 8192 pixel mỗi chiều hoặc 16.000.000 pixel tổng. Giữ giới hạn 5 MiB và kiểm tra extension/MIME/header. Fixture thành công nay là ảnh thật.
- Pillow 13.0.0 được pin trong input và cả bốn lockfile; hashes từ metadata phát hành PyPI. Không thay phiên bản dependency khác.
- Vercel Analytics chỉ render với NODE_ENV=production và VERCEL=1. Docker tự host mặc định không tải script.
- README bổ sung tính năng, công nghệ/cấu trúc, chạy Docker/local, cấu hình, thanh toán, upload, session, kiểm thử, vận hành/backup và giới hạn khi thêm module.

Trước sửa đã quan sát 9 regression ảnh và 2 regression Quick Buy fail đúng lỗi. Sau sửa: toàn backend unit/regression 575/575 pass (487,12 giây), image suite 37/37 pass; frontend 154/154 pass, 37 file. TypeScript toàn frontend và ESLint pass; fixture Quick Buy được sửa type để mô tả đúng public DTO và 2/2 test chạy lại pass. Ruff check/format pass. Pip check và pip download --require-hashes trên Windows pass. Các con số trong bảng review phía trên là bằng chứng lượt trước sửa; 29 integration MariaDB là lượt review trước, không chạy lại trong lượt sửa vì không đổi migration hoặc logic transaction.

Compose smoke source mới **pass, exit 0** trên project dùng một lần `vton-smoke-234133c218`: build backend/frontend thành công với hash-locked dependencies, migration/startup và authenticated worker pass. Playwright **3/3 pass** (30,7 giây): session nhiều tab/thiết bị/logout, ảnh MinIO thật qua Next optimization, Quick Buy chọn variant rồi lưu giỏ và không phát request Analytics. Hai spec demo opt-in được skip trong smoke vì stack này không seed bộ demo 12 sản phẩm; không tính là pass. Container/volume smoke đã được script tự dọn. Stack demo hiện có không được rebuild hoặc thay đổi trong lượt sửa này.

Liên kết Markdown và git diff --check đã kiểm tra; thư mục verification tạm đã dọn. Chưa benchmark tải/SMTP thật, chưa tag stable và chưa triển khai module mới.
