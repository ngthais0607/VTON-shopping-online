# Review nhánh `fix/fashion-review-fixes` – danh sách lỗi để chốt MVP trước khi thêm VTON

## Đã kiểm chứng thực tế (không chỉ đọc code)
| Hạng mục | Kết quả |
|---|---|
| Backend pytest (SQLite) | 313 pass, 15 skip |
| Backend pytest trên MariaDB 10.11 thật (kể cả integration/concurrency/migration) | **328 pass** |
| Alembic upgrade → downgrade base → upgrade head | OK (head = `c3d4e5f6a7b8`) |
| ruff check | OK. `ruff format --check`: **28 file chưa format** |
| Frontend tsc / eslint / vitest (86) / next build | Tất cả OK |

=> Test xanh nhưng **các lỗi dưới đây test không phủ**. Các mục đánh dấu 🔬 là mình đã reproduce bằng script.

Chưa kiểm chứng được: chạy trình duyệt thật, MinIO thật, SMTP, worker/ARQ, dashboard & categories (chỉ lướt).

---

## P0 – Phải sửa trước khi gọi là MVP (sai dữ liệu / sai tiền / sập)

**P0-1 🔬 Sửa sản phẩm trong admin làm phình tồn kho.**
`app/products/page.tsx` PATCH gửi kèm `stock_quantity` (= tổng các variant); `products/service.py::update_product` ghi giá trị đó vào **variant đầu tiên**, không qua audit. Repro: 3 variant × 10, chỉ đổi tên → tổng kho 30 → 50.
Fix: bỏ `stock_quantity` khỏi `ProductPatch`/`ProductCreate` + nhánh legacy trong `update_product`; bỏ field kho khỏi form admin (kho chỉ chỉnh qua `adjust-stock`).

**P0-2 🔬 Webhook VietQR có race → ghi `sold_quantity` gấp đôi, 2 Payment "paid".**
`process_vietqr_webhook` đọc `Order` không khóa, rồi mới khóa variant; không `populate_existing` + `FOR UPDATE` order để re-check status. Repro (ép timing, 2 transaction_id khác nhau): đơn qty 2 → `sold=4`, 2 payment paid. Kịch bản thực tế: admin bấm "Paid" đúng lúc webhook về, hoặc bank gửi lại với id khác.
Fix: sau khi khóa variant, `SELECT … FOR UPDATE` các order theo id tăng dần (populate_existing), kiểm tra lại status; bắt `IntegrityError` trên unique Payment → trả `already_processed`; nếu order đã PAID mà txn mới → ghi `late_payment`/duplicate thay vì bỏ qua.

**P0-3 Hiển thị giá VND bằng ký hiệu `$`.**
`CartDrawer`, `checkout`, `QuickViewModal`, `FeaturedProducts`, `orders/[id]`, `VietQRModal` ("$150,000 (150,000 VND)"), dashboard revenue. Chỉ trang chi tiết sản phẩm dùng `formatCurrency`. Khách sẽ thấy "$150,000" ngay lúc chuyển khoản.
Fix: dùng `formatCurrency(amount, currency)` ở mọi nơi.

**P0-4 🔬 Datetime trả về không có timezone → lệch 7 giờ ở Việt Nam.**
API trả `2026-10-14T07:04:54` (naive UTC). `new Date()` / `displayDate` hiểu là giờ local → sai 7h (cả `expires_at`, giờ đặt hàng).
Fix: serialize UTC có hậu tố `Z` (custom `PlainSerializer`/base schema), hoặc FE ép `+'Z'`. Thêm test.

**P0-5 🔬 Redis chết → register, login, webhook thanh toán đều 500.**
`rate_limiter.py`: `try/except` quanh `Limiter()` vô tác dụng vì lỗi xảy ra lúc request. README nói Redis chỉ cần cho email.
Fix: `Limiter(..., swallow_errors=True, in_memory_fallback_enabled=True)`; test với Redis URL chết.

**P0-6 Dữ liệu giả hiển thị như thật ở storefront.**
`FeaturedProducts.tsx`: rating = `(id%5)*0.1+4.5`, số review = `id*17+23`, badge "Sale/Best Seller" theo `id % n`, giá gạch ngang = `price*1.25`. Đây là giảm giá + đánh giá bịa (rủi ro pháp lý/tin cậy), trong khi API review thật đã có.
Fix: bỏ toàn bộ; chỉ hiển thị rating/review từ API, badge chỉ khi có dữ liệu thật.

**P0-7 Checkout/đặt hàng chạy trong `async def` nhưng dùng DB đồng bộ + `FOR UPDATE`.**
`checkout_cart`, `change_order_status`, `register_user` là `async` → block event loop khi chờ lock (tới 50s lock-wait) → toàn server đứng.
Fix: chuyển endpoint thành `def` (threadpool) và enqueue email qua `BackgroundTasks`/`anyio.from_thread`, hoặc chạy phần DB bằng `run_in_threadpool`.

---

## P1 – Nên sửa trong cùng đợt

1. 🔬 **Review spam**: một user gửi nhiều review cho 1 sản phẩm (3 review OK), không cần đã mua (`is_verified_purchase=False` vẫn đăng). Fix: unique `(user_id, product_id)` + migration; cho phép chỉ người đã mua (hoặc ẩn rating chưa verified); phân trang `GET reviews`.
2. 🔬 **Tracking công khai lộ PII**: `/orders/track/{public_code}` trả `customer_name`, `customer_phone`, `shipping_address`, `user_id`. Fix: schema riêng cho public (che SĐT, bỏ user_id/địa chỉ chi tiết).
3. 🔬 **Backend không validate SĐT/tên**: `customer_phone="x"`, `customer_name=" "` vẫn tạo đơn 201 (chỉ FE có zod). Fix: validator (strip, regex SĐT VN) trong `CheckoutCommand`.
4. **Memo VietQR dùng `TRUELOOK_<id>`**: nhiều ngân hàng loại bỏ ký tự `_`/khoảng trắng → webhook không khớp. Fix: memo chỉ chữ+số (vd `TL12`), regex parse chịu được `TRUELOOK 12`, `TL-12`.
5. **State machine COD**: `PENDING→CONFIRMED` giải phóng `reserved` mà không cộng `sold` → hở overselling nếu có đơn COD pending (hiện checkout tạo thẳng CONFIRMED nên tiềm ẩn). Fix: chỉ giảm `reserved` khi sang PAID/CANCELLED/EXPIRED; hoặc bỏ transition đó.
6. **Bootstrap admin qua email đăng ký** (`bootstrap_admin_email`): ai đăng ký trước với email đó (không verify) thành admin; không có trong `.env.example`, README lại nói "không có đường nâng quyền". Fix: dùng lệnh CLI/seed tạo admin, bỏ logic trong `_create_user`.
7. **Admin có thể xóa chính mình / admin cuối cùng**; user bị xóa mềm vẫn giữ unique email/username → không đăng ký lại được.
8. **Sort/lọc giá dùng `Product.price`** trong khi hiển thị `price_min/max` theo variant → kết quả lọc sai khi variant có giá riêng.
9. **Thiếu vòng đời giao hàng**: chỉ có pending/confirmed/paid/cancelled/expired; không có shipped/delivered; khách không tự hủy đơn được; timeline tracking hard-code "Delivered" luôn `completed=False`. Tối thiểu cho MVP: thêm `shipped`, `delivered` hoặc đổi nhãn cho đúng.
10. **Không có phí ship/giảm giá** (`shippingFee = 0` hard-code) – chấp nhận được nếu ghi rõ miễn phí vận chuyển.
11. **Tạo sản phẩm**: form admin có ô tồn kho nhưng backend bỏ qua; sản phẩm tạo ra `is_active=False` nếu chưa có variant, không báo lý do. Fix: ẩn ô kho, hiển thị hướng dẫn "thêm biến thể rồi kích hoạt" hoặc bắt buộc nhập ≥1 variant khi tạo.
12. **MinIO `secure=False` cứng** → không dùng được S3/R2 hay HTTPS. Thêm `MINIO_SECURE`.
13. **Cookie refresh**: `samesite` cấu hình được nhưng `logout` hard-code `lax`; fallback API base FE là `127.0.0.1` trong khi origin thường `localhost` → refresh không gửi cookie (khác site) nếu thiếu `.env.local`. Logout không thu hồi refresh token (đã ghi nhận là quyết định, nên ghi rõ).
14. **Rate limit login 5/phút theo IP**: sau reverse proxy mọi người chung IP. Cần `--proxy-headers`/key func đọc `X-Forwarded-For` đáng tin.
15. **N+1 và không phân trang**: `list_orders` (items/payments lazy), `list_user_orders` trả toàn bộ, reviews `.all()`. Dùng `selectinload` + phân trang.
16. **Code test lọt vào production**: `get_current_user_optional` kiểm tra `dependency_overrides`; có 2 hàm optional-user trùng nhau (`get_optional_user`). Gộp lại.

## P2 – Dọn dẹp / tài liệu

- README ghi `alembic current` = `8f4c2d1a7b90`, thực tế head `c3d4e5f6a7b8`.
- `MIGRATION_NOTES`/docs ghi endpoint `POST /products/variants/{id}/stock`; thực tế là `POST /variants/{id}/adjust-stock`.
- Docs nói expiration job "không bao giờ block checkout" nhưng nó khóa variant bằng `FOR UPDATE` thường (chỉ order mới `SKIP LOCKED`).
- `ruff format` 28 file; `pyproject` target `py313` nhưng CI Python 3.12; docs ghi `back_view` nhưng `VALID_IMAGE_KINDS` không có.
- Path `/track/{code}`: `code.isdigit()` coi mã hex toàn chữ số là ID (xác suất ~3e-7, nên dùng route `{order_id:int}` riêng).
- `payment_status` của đơn đã hủy hiển thị "pending".
- `docker-compose.yml` chưa có service `api`/`frontend`; `bulk_create_variants` im lặng bỏ qua nếu chỉ có `sizes` hoặc chỉ có `colors`; `create_product` nạp toàn bộ slug/SKU vào RAM mỗi lần.
- Ảnh unsplash hard-code ở Hero/Blog/Auth – thay bằng ảnh của shop trước khi chạy thật.

---

## Chuẩn bị riêng cho VTON (làm sau khi P0/P1 xong)
1. Bắt buộc ≥1 ảnh `flat_lay` theo màu cho sản phẩm trước khi bật nút thử đồ; chặn/ẩn nút nếu thiếu.
2. Thêm map `category → upper/lower/dresses` thành dữ liệu (cột hoặc bảng), không suy ra từ tên.
3. Bucket riêng, **private** cho ảnh người dùng (bucket hiện tại public-read cho `products/*`); presigned URL ngắn hạn; TTL xóa ảnh.
4. Consent riêng + chính sách lưu trữ ảnh (Nghị định 13/2023) trước khi nhận upload.
5. Bảng `vton_tasks` + job ARQ + rate limit theo user; test fail-open khi Redis/GPU lỗi (liên quan P0-5).
6. Dùng chung `variant_id` từ giỏ hàng (đã đúng) để nút "Thử đồ" → "Thêm vào giỏ" giữ nguyên size/màu.

## Thứ tự làm đề xuất (1 lượt, tránh lỗi đẻ lỗi)
1. **Dữ liệu/tiền**: P0-1, P0-2, P1-5, P1-4 → viết test regression (cả MariaDB integration cho webhook race).
2. **Hạ tầng**: P0-5, P0-7, P1-12, P1-14.
3. **Hiển thị**: P0-3, P0-4, P0-6 (test: render VND, parse ISO `Z`).
4. **Chính sách/bảo mật**: P1-1, 2, 3, 6, 7, 16.
5. **Luồng sản phẩm**: P1-8, 9, 11.
6. Cập nhật docs (P2) và `ruff format`.
