# Báo cáo sửa lỗi MVP hardening — 15–16/10/2026

Nhánh: `fix/mvp-hardening`; điểm bắt đầu: `9751f1d`. Đã xử lý cả mục logout tùy chọn. Các quyết định nghiệp vụ mặc định trong yêu cầu được giữ nguyên. File review có sẵn `docs/reviews/PROMPT_fix_all_except_vton.md` không được sửa hoặc đưa vào commit.

## 1. Kho lệch bị che giấu

- **Nguyên nhân:** code chọn sold/reserved theo tổng kho của variant, có thể lấy nhầm phần của đơn khác; một số nhánh thiếu xử lý khi kho không đủ.
- **Sửa:** xác định phần kho của đơn từ status + paid_at; thiếu kho hoặc vượt giới hạn thì báo `inventory_state_inconsistent`. Kiểm tra mọi dòng trước khi thay đổi kho; cộng dồn khi nhiều OrderItem cùng variant. COD đã thu tiền rồi chuyển lại PAID sau giao hàng không chuyển kho lần hai và không đổi paid_at gốc.
- **File:** `backend/app/features/orders/domain.py`, `backend/app/features/products/variant_model.py`, `backend/requirements-dev.txt`, migration `e6f7a8b9c0d1_guard_variant_inventory.py`, `tests/test_inventory_invariants.py`, `tests/test_inventory_migration.py`, `tests/integration/test_inventory_migration.py`, `tests/test_dashboard.py`.
- **Đỏ → xanh:** lượt đầu 11 failed/3 passed; sau sửa, 15 test kho/migration SQLite pass. Review độc lập phát hiện thêm trường hợp nhiều dòng cùng variant: 3 test đỏ, đã sửa và chạy lại toàn bộ backend: 484 passed/24 skipped ở trạng thái tích lũy lúc đó. Hypothesis chạy 150 ví dụ, mỗi chuỗi tối đa 45 transition cho cả hai payment method; kiểm tra cả phần kho thuộc các đơn khác.
- **Migration:** head cũ được `alembic heads` xác nhận là `d4e5f6a7b8c9`. Migration mới kiểm tra dữ liệu trước DDL, báo rõ các ID mẫu nếu vi phạm và không tự sửa dữ liệu. CHECK tương thích SQLite; test riêng kiểm tra preflight, upgrade/downgrade/upgrade. Test toàn chuỗi trên MariaDB tạo DB trống riêng rồi xóa sau khi chạy.
- **Test cũ sửa:** hai test dashboard từng chèn stock=1, sold=2. Bỏ fixture bất hợp lệ và điều chỉnh số sản phẩm; việc từ chối kho vượt stock được kiểm tra trực tiếp ở DB thay vì cho phép dashboard lưu dữ liệu sai.
- **Còn lại:** chưa chạy constraint và toàn chuỗi migration trên MariaDB vì thiếu `TEST_DATABASE_URL`; dữ liệu kho sai có sẵn sẽ chủ động chặn migration để được đối soát riêng.

## 2. Race giữa hủy đơn và thanh toán

- **Nguyên nhân:** quyền hủy theo status được kiểm tra trước khi lấy lock.
- **Sửa:** `change_order_status` nhận `allowed_from`, kiểm tra sau khi khóa variant theo ID tăng dần rồi refresh/khóa Order. Giữ kiểm tra sở hữu; admin dùng bảng transition thay vì giới hạn của khách.
- **File:** order service, `tests/test_customer_cancel_locking.py`, `tests/integration/test_customer_cancel_concurrency.py`.
- **Đỏ → xanh:** test mô phỏng webhook thắng giữa lần đọc đầu và lúc khóa thất bại vì không raise; sau sửa toàn bộ backend đạt 473 passed/24 skipped. Test từ chối đơn đã PAID cũng được giữ. Test MariaDB mới dùng hai thread/hai session, lặp 30 lần, kiểm tra kết quả paid + Payment hoặc cancelled + late_payment và các bộ đếm kho tương ứng.
- **Còn lại:** test race MariaDB chưa chạy; regression stale-read xác định được đã pass.

## 3. Một đường ghi nhận đã thanh toán

- **Nguyên nhân:** admin chỉ đổi trạng thái; chỉ webhook tạo Payment.
- **Sửa:** `_record_paid` áp transition và tạo receipt trong cùng transaction đã khóa. Provider là `vietqr`, `manual` cho admin VietQR, `cod` cho COD. Webhook đến sau thanh toán thủ công được ghi duplicate_payment cả khi đơn đã SHIPPED/DELIVERED, giữ nguyên kho và vòng đời giao hàng.
- **File:** order service, `tests/test_payment_recording.py`.
- **Đỏ → xanh:** 7 failed/1 passed trước sửa; toàn bộ backend sau sửa đạt 481 passed/24 skipped. Bao phủ webhook, admin VietQR, COD confirmed/shipped/delivered, và webhook thật sau admin PAID ở ba giai đoạn giao hàng.
- **Còn lại:** chưa xác minh tranh chấp live MariaDB; không tự backfill lịch sử paid_at/Payment cũ.

## 4. Đồng bộ quyền hủy và README

- **Nguyên nhân:** service có bản sao quyền hủy, README chưa phân biệt payment method.
- **Sửa:** `CUSTOMER_CANCELLABLE` trong domain là nguồn dùng chung: VietQR PENDING, COD CONFIRMED. README và route summary mô tả đúng; admin theo bảng transition.
- **File:** domain, service, router của orders, README, `tests/test_customer_cancel_policy.py`.
- **Đỏ → xanh:** khi đã khai báo hằng số nhưng service còn dùng bản sao, test kiểm tra service tiêu thụ policy bị đỏ (1 failed/14 passed). Sau nối service vào hằng số: toàn bộ backend 499 passed/24 skipped. Matrix kiểm tra API đủ 14 cặp payment_method/status và đối chiếu thêm với hai cặp nghiệp vụ viết độc lập.
- **Còn lại:** nếu đổi policy sau này, vẫn phải cập nhật mô tả README cho người đọc.

## 5. Làm tròn VND thống nhất

- **Nguyên nhân:** webhook dùng banker's rounding qua float, QR dùng ROUND_HALF_UP.
- **Sửa:** `to_vnd_amount(Decimal | float | int | str)` dùng Decimal(str(value)); QR và webhook cùng gọi, so sánh int với int.
- **File:** `backend/app/integrations/vietqr.py`, order service, `tests/test_vnd_rounding.py`.
- **Đỏ → xanh:** 20 failed/3 passed trước sửa, gồm ba lỗi so khớp QR/webhook thực và các test helper khi helper chưa tồn tại. Sau sửa toàn bộ backend 522 passed/24 skipped. Bao phủ .49/.50/.51, 0.5/1.5/2.5 và các kiểu đầu vào.
- **Còn lại:** field amount của payload vẫn giữ kiểu float để tương thích schema công khai; không dùng phép tính float trong bước làm tròn/so sánh mới.

## 6. Frontend dùng session in-memory

- **Nguyên nhân:** checkout/tracking kiểm tra token trong localStorage dù token chỉ được giữ in-memory.
- **Sửa:** dùng `useSession`; checkout prefill user và phản ứng với đăng nhập sau khi mount, không ghi đè tên người dùng đã nhập. Sidebar dùng logout chung. ESLint chặn đọc token ở app/components/hooks/lib, kể cả window.localStorage và getItem dạng computed; vẫn cho phép lưu giỏ hàng.
- **File:** checkout/page.tsx, orders/[id]/page.tsx, components/sidebar.tsx, eslint.config.mjs, tests/checkout-flows.test.tsx, tests/checkout-session.test.tsx, tests/auth-storage-lint.test.ts.
- **Đỏ → xanh:** 6 failed/2 passed ban đầu (hai ca session và bốn ca ESLint thực). Sau sửa: 22 targeted tests pass; test guard được mở rộng sang cả bốn thư mục. Toàn bộ frontend 122 passed; backend 522 passed/24 skipped. Test cũ được sửa fixture auth sang `setAccessToken` và cô lập cache SWR, thay vì giả lập token localStorage sai với kiến trúc hiện có. `rg` không còn tìm thấy localStorage token/auth trong source bốn thư mục trên.
- **Còn lại:** đã kiểm tra render, session, lint và production build; chưa tuyên bố đã thử checkout thủ công trên trình duyệt.

## 7. Rate limit refresh

- **Nguyên nhân:** refresh thiếu decorator limiter vốn có ở login/register.
- **Sửa:** thêm `@limiter.limit("30/minute")`, dùng Request hiện có, không đổi frontend refresh dedupe.
- **File:** users/router.py, tests/test_auth_rate_limits.py.
- **Đỏ → xanh:** test kiểm tra limiter trên refresh và request thứ 31 đều đỏ; login/register đã pass. Sau sửa toàn bộ backend 526 passed/24 skipped. Test thực xác nhận 30 lần thiếu token nhận 401, lần 31 nhận 429, rồi reset limiter. Frontend session/dedupe tests vẫn pass trong suite.
- **Còn lại:** chưa chạy rate-limit nhiều instance với Redis live.

## 9. Webhook kiểm tra tài khoản nhận

- **Nguyên nhân:** account_number không được kiểm tra.
- **Sửa:** sau kiểm tra secret, trước tìm transaction/ghi Payment, account_number khác null phải bằng cấu hình; sai hoặc chuỗi rỗng báo `account_mismatch`, không đổi đơn/kho/Payment. Payload thiếu trường hoặc null tiếp tục được coi là không có thông tin tài khoản, phù hợp kiểu optional hiện có.
- **File:** order service, tests/test_webhook_account.py.
- **Đỏ → xanh:** hai ca tài khoản sai/rỗng trước đó được nhận thành paid nên đỏ; sau sửa toàn bộ backend 530 passed/24 skipped. Có cả ca thiếu và ca tài khoản đúng.
- **Còn lại:** so sánh chuỗi chính xác, không tự chuẩn hóa số tài khoản.

## 8. Logout thu hồi server — mục tùy chọn, làm sau các sửa bắt buộc

- **Nguyên nhân:** logout trước đây chỉ xóa cookie.
- **Sửa:** decode refresh cookie; UPDATE tăng refresh_version với điều kiện user/version còn khớp. Cookie cũ không thu hồi nhầm session mới đã rotate. Token thiếu, sai hoặc stale vẫn trả 204 và xóa cookie.
- **File:** users/service.py, users/router.py, tests/test_logout_revocation.py.
- **Đỏ → xanh:** ca logout token hợp lệ bị đỏ vì version không tăng; các ca thiếu/sai/stale đã pass. Sau sửa toàn bộ backend 534 passed/24 skipped; token cũ sau logout nhận 401.
- **Còn lại:** chưa xác minh đồng thời trên MariaDB live.

## 10. Dọn code cuối cùng

- **Căn cứ:** `rg` trên backend/frontend xác nhận track_order và _build_tracking_response không còn caller, kể cả tests. Public tracking theo public_code được giữ. Tất cả caller QR chỉ truyền một đơn.
- **Sửa:** xóa hai hàm tracking chết; _vietqr_response nhận một Order; expiration chỉ query Order.id. `_dispatch_email` chỉ dùng BackgroundTasks, bỏ toàn bộ chuỗi fallback anyio/asyncio. Caller nội bộ và test truyền BackgroundTasks rõ ràng.
- **File:** order service; tests/test_email_dispatch_contract.py; caller trong test_orders.py, test_order_service_locking.py, test_customer_cancel_locking.py, test_final_regressions.py và bốn file integration caller hiện có.
- **Đỏ → xanh:** test thiếu BackgroundTasks đỏ (1 failed/1 passed); sau sửa toàn bộ backend **536 passed/24 skipped**. Test commit-before-enqueue giờ kiểm tra trước khi chạy BackgroundTasks chỉ có commit, sau khi chạy mới có enqueue. Các test lỗi queue vẫn xác nhận đơn đã commit không bị rollback.
- **Còn lại:** Python caller trực tiếp vào order service phải truyền BackgroundTasks. Một số helper integration cũ có asyncio.run quanh hàm sync đã có từ trước; chưa được xác minh live và không được refactor ngoài phạm vi này.

## Tương thích và review

Không đổi field/schema response HTTP hiện có. Thay đổi hành vi có chủ đích: quyền hủy như yêu cầu, lỗi inventory/account được yêu cầu, refresh có 429 theo giới hạn mới, logout thu hồi refresh server. Chữ ký Python nội bộ order service yêu cầu BackgroundTasks; caller đã được cập nhật. Chỉ thêm dependency dev hypothesis (sortedcontainers là dependency bắc cầu do pip cài).

Review độc lập đã đọc phần kho/khóa/payment, policy/rounding, frontend/limiter, account/logout và cleanup. Phát hiện nhiều dòng cùng variant đã được tái hiện đỏ và sửa; lượt review sau không còn phát hiện cần xử lý. Reviewer không chạy suite trên SQLite dùng chung.

## Ma trận kiểm chứng đầy đủ

Các số là kết quả chạy thật ở trạng thái tích lũy khi sửa từng mục; các phần backend/frontend độc lập được chạy chồng thời gian, còn Next build giữ tuần tự.

| Mục | Backend pytest | Frontend Vitest | pnpm lint | pnpm build |
|---|---:|---:|---|---|
| 1 | 471 pass / 23 skip; review bổ sung: 484 / 24 | 102 pass | exit 0 | exit 0 |
| 2 | 473 / 24 | 102 | exit 0 | exit 0 |
| 3 | 481 / 24 | 102 | exit 0 | exit 0 |
| 4 | 499 / 24 | 102 | exit 0 | exit 0 |
| 5 | 522 / 24 | 102 | exit 0 | exit 0 |
| 6 | 522 / 24 | 122 | exit 0 | exit 0 |
| 7 | 526 / 24 | 122 | exit 0 | exit 0 |
| 9 | 530 / 24 | 122 | exit 0 | exit 0 |
| 8 | 534 / 24 | 122 | exit 0 | exit 0 |
| 10 | 536 / 24 | 122 | exit 0 | exit 0 (chạy lại riêng) |

Lệnh đã chạy:

- Trong backend: `.venv/Scripts/python.exe -m pytest -q`; các lần targeted dùng `tests/test_inventory_invariants.py`, `tests/test_inventory_migration.py`, `tests/test_customer_cancel_locking.py`, `tests/test_payment_recording.py`, `tests/test_customer_cancel_policy.py`, `tests/test_vnd_rounding.py`, nhóm test_auth_rate_limits/test_webhook_account/test_logout_revocation và test_email_dispatch_contract.
- Trong frontend: `pnpm test --maxWorkers=2`, `pnpm lint`, `pnpm build`; targeted chạy checkout-session, auth-storage-lint, checkout-flows. maxWorkers chỉ giới hạn tải máy, vẫn chạy toàn bộ test.
- `alembic heads`: trước sửa d4e5f6a7b8c9; sau sửa e6f7a8b9c0d1, đều là một head.
- `ruff check` trên source backend được sửa, migration và tests: pass; `ruff format --check` trên bảy file source/migration sửa: pass. `git diff --check`: pass.
- `rg` xác nhận caller trước khi xóa, không còn hai hàm tracking chết, không còn fallback trong order service và không còn localStorage auth ở các thư mục source yêu cầu.
- Log đầy đủ và exit summary của các lượt nằm tại `.superpowers/hardening-logs/` (ignored), gồm log đỏ trước sửa. Lệnh chung được chạy qua `.superpowers/verify_hardening.py`.

## Những lượt không hoàn tất và giới hạn môi trường

- `TEST_DATABASE_URL` chưa đặt: **24 integration tests skip ở lượt cuối**. Chưa chạy race 30 lần trên MariaDB, enforcement/preflight MariaDB hoặc toàn chuỗi `alembic upgrade head → downgrade -1 → upgrade head` trên DB MariaDB trống. Test được thêm sẵn và dùng DB test riêng; không seed hay migration lên DB thật.
- Pip trong sandbox bị DNS lỗi; chạy lại với quyền đã duyệt cài hypothesis thành công.
- Lệnh alembic đầu tiên từ repo root sai đường dẫn tương đối; chạy lại trong backend thành công.
- Pytest trong sandbox bị chờ ở socketpair loopback khi asyncio tạo event loop; trace faulthandler xác nhận. Đã dừng và chạy lại toàn bộ ngoài sandbox với quyền đã duyệt.
- Lượt test kho đỏ đầu tiên chạy từ repo root nên fixture dùng SQLite `test.db` ở root. Các lượt sau chạy đúng backend như yêu cầu; không có kết nối MariaDB trong các lượt này.
- Một lượt frontend đầu bị dừng khi chẩn đoán; một build đụng lock do build khác còn chạy và exit 1. Đã chạy lại thành công; các build sau giữ tuần tự.
- Build cleanup đầu bị timeout sau 300 giây ở bước thu thập trace. Lượt chạy lại ghi đủ output nhưng phiên tiến trình hết trước khi lấy được exit code, nên đã chạy lại build riêng lần cuối: exit 0 được lưu trong `10-build-final-exit.txt`, output trong `10-build-final.log`. Không tính lượt timeout là pass.
- Helper ghi log và helper cập nhật caller từng dừng vì encoding cp1252 Windows. Đã sửa UTF-8; lượt test dở bị dừng và chạy lại đầy đủ. Không tính lượt dở là pass.
- Các cảnh báo sẵn có gồm Starlette TestClient deprecation, Hypothesis ignored-directory notice, React act ở test logout cũ, lỗi upload/XHR được mock và chart kích thước 0 trong jsdom. Chúng không bị trình bày thành xác minh live Redis/MinIO/SMTP.

Không còn quyết định nghiệp vụ cần hỏi: đã theo các mặc định bạn cung cấp, gồm COD DELIVERED trước PAID và logout tùy chọn. Việc còn cần ở môi trường vận hành là chạy các test có gate trên MariaDB test riêng và đối soát kho trước migration nếu preflight phát hiện dữ liệu sai.

## Commit cuối cùng

Đã gộp phần sửa nhiều dòng cùng variant vào commit kho. Mỗi lỗi có một commit; cleanup dùng commit chore riêng. Không push hoặc tạo PR.

| Mục | Commit |
|---|---|
| 1 — kho và migration | `abdde2a` |
| 2 — race hủy/thanh toán | `edeed79` |
| 3 — Payment dùng chung | `8a26bfc` |
| 4 — policy và README | `9a93778` |
| 5 — ROUND_HALF_UP | `53f27c4` |
| 6 — session frontend/ESLint | `aff6f72` |
| 7 — refresh limiter | `eca0206` |
| 9 — tài khoản webhook | `153f078` |
| 8 — logout tùy chọn | `5b67556` |
| 10 — cleanup | `46a804d` |