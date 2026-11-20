# Kế hoạch sửa lỗi tiềm ẩn – VTON 2D

Nguồn: review tĩnh luồng VTON 2D (backend) + bộ test cố tình làm sai
`backend/tests/test_vton_adversarial.py` (36 test: **12 fail = lỗi thật, 24 pass = hệ thống chống đỡ tốt**).
Các test khẳng định hành vi ĐÚNG, nên test đỏ = bug. 59 test cũ (`test_vton.py`, `test_vton_lab_engines.py`) vẫn xanh.
**Trạng thái: ĐÃ SỬA cả 10 lỗi (nhóm A, B, C). 36/36 test adversarial xanh; toàn bộ backend: 1320 passed, 52 skipped.**

Chạy lại: `cd backend; .venv\Scripts\python -m pytest -q -p no:cacheprovider tests/test_vton_adversarial.py`

## Bảng lỗi đã xác nhận (xếp theo mức độ)

| # | Mức | Lỗi | Vị trí | Test chứng minh |
|---|---|---|---|---|
| 1 | Cao (riêng tư) | Purge ghi `NULL` tên object **trước** khi xoá; MinIO lỗi → ảnh người dùng mồ côi vĩnh viễn, không job nào xoá lại được | `features/vton/service.py:391-402` | `test_purge_keeps_row_retryable_when_storage_delete_fails` |
| 2 | Cao (riêng tư) | Task kẹt `queued` quá 24 h (hoặc `processing`) không bao giờ bị purge → ảnh giữ mãi | `jobs/vton.py:167-184` (lọc chỉ `succeeded/failed`) | `test_old_queued_task_photo_is_eventually_purged` |
| 3 | Cao | User xoá/huỷ lúc worker đang chạy → worker vẫn UPDATE `succeeded` + ghi result object: "hồi sinh" task đã xoá, ảnh kết quả tồn tại sau khi user yêu cầu xoá | `jobs/vton.py:125-133` (UPDATE không có điều kiện trạng thái) | `test_late_success_does_not_overwrite_a_cancelled_task` |
| 4 | Cao | Lỗi tạm thời của MinIO khi lưu kết quả bị coi là lỗi vĩnh viễn `internal_error` (không retry) | `jobs/vton.py:90-123` | `test_result_upload_failure_is_retried_not_permanent` |
| 5 | Cao | Engine ném `ValueError/KeyError/TimeoutError` → `internal_error` không retry (chỉ `RuntimeError/MemoryError` được lab bọc) | `jobs/vton.py:120-123`, `vton_lab/service.py:151-171` | `test_unexpected_engine_exception_is_retried_once[*]` |
| 6 | Cao | Không có ràng buộc DB cho "1 task active / user" và quota: check-then-insert không atomic → 2 request song song đều qua (mô phỏng bằng SELECT mù: ra 2 task active) | `features/vton/service.py:248-265` | `test_active_task_check_is_atomic_under_interleaving` |
| 7 | Trung bình | Cache key không chứa tên engine → kết quả engine `mock` ("DEMO PREVIEW") có thể được phục vụ như kết quả engine thật cho cùng cặp ảnh | `integrations/vton_engine.py:114-118` | `test_cache_key_depends_on_engine_name` |
| 8 | Trung bình | `EngineRegistry.run` giữ lock toàn cục trong lúc `generate()`, không timeout: 1 lần treo chặn mọi request sau | `vton_lab/service.py:99-106` | `test_registry_lock_wait_is_bounded` |
| 9 | Trung bình | Idempotency-Key dùng lại với product/payload khác vẫn trả 202 + task cũ (client tưởng đã đặt đúng sản phẩm mới) | `features/vton/service.py:216-219` | `test_idempotency_key_reused_for_other_product_is_not_silently_replayed` |
| 10 | Thấp | Mock engine: ảnh áo nền màu đồng nhất phủ kín khung bị floodfill xoá hết → "no visible garment" | `integrations/vton_engine.py:69-82` | `test_mock_engine_full_frame_garment_is_not_treated_as_empty` |

(12 test fail ứng với 10 lỗi: #5 có 3 tham số.)

## Đã triển khai

- Nhóm A: `purge_task` (xoá object trước, chỉ NULL con trỏ đã xoá được, chỉ set `purged_at` khi xoá hết; UPDATE có điều kiện trạng thái); cron purge quét cả `queued/processing` quá hạn; worker chỉ ghi `succeeded` khi `status='processing' AND purged_at IS NULL`, nếu không thì xoá result vừa ghi.
- Nhóm B: lưu result lỗi → retry (`engine_error`); exception lạ từ engine → retry tới `vton_max_attempts`; `EngineRegistry.run` có timeout khoá (120 s) → `VtonEngineError`; migration `d2e3f4a5b6c7` thêm partial unique index 1 task active/user + khoá hàng user khi tạo task, IntegrityError → 409 `vton_task_in_progress`.
- Nhóm C: cache key có tên engine (cần chạy lại `scripts/prewarm_vton.py`); Idempotency-Key trùng nhưng khác product/variant → 409 `idempotency_key_conflict`; mock engine dùng cả ảnh khi áo phủ kín khung.
- Lưu ý DB: project chạy **MariaDB 11.2** (không có partial index). Migration `d2e3f4a5b6c7` dùng cột sinh `active_user_id` (NULL khi task đã xong) + UNIQUE index trên MariaDB/MySQL; SQLite/Postgres dùng partial index. Đã kiểm chứng trên MariaDB thật: upgrade với dữ liệu trùng, 8 INSERT đồng thời (đúng 1 thành công), downgrade/upgrade khứ hồi.
- Mã lỗi mới: 503 `vton_erase_failed` khi xoá ảnh trên storage thất bại (user thử lại được).
- Hai test cũ đã chỉnh cho đúng invariant mới (1 task active/user; `cache_key` có tham số engine).

## Cách sửa đề xuất (bản kế hoạch gốc)

Thứ tự làm: nhóm A (riêng tư/toàn vẹn) → B (độ bền) → C (còn lại). Mỗi bước kèm test đã có sẵn; sửa xong test tương ứng phải xanh.

**A. Riêng tư & toàn vẹn dữ liệu (#1, #2, #3)**
1. `purge_task`: xoá object trước, chỉ `NULL` con trỏ của object xoá thành công (từng cái một), chỉ set `purged_at` khi cả hai đã xoá xong; lỗi thì để nguyên để vòng purge sau thử lại. Giữ nguyên quota (row không bị xoá).
2. `purge_expired_vton_data`: mở rộng bộ lọc sang `queued` quá hạn (và `processing` quá `stale`), đánh dấu `failed/expired` rồi purge. Hoặc để cron `recover_vton_tasks` fail các task queued quá ngưỡng trước.
3. UPDATE thành công ở `process_vton_task` thêm điều kiện `status == 'processing' AND purged_at IS NULL`; nếu `rowcount == 0` thì xoá result object vừa ghi và trả `skipped`. Đồng thời `purge_task` nên chặn khi task `processing` ở tầng DB (UPDATE có điều kiện) thay vì chỉ kiểm tra trước khi commit.

**B. Độ bền (#4, #5, #8, #6)**
4. Tách `storage.put` kết quả thành khối riêng, lỗi → coi là retryable (`storage_error`), tái dùng nhánh requeue + `attempts`.
5. `except Exception` cuối: nếu `attempts < vton_max_attempts` thì requeue (log đầy đủ), hết lượt mới `internal_error`. Ở `LabVtonEngine`/`try_on` bọc thêm các exception chung và ánh xạ sang `VtonEngineError(engine_error, retryable=True)`.
6. `EngineRegistry.run`: `self._lock.acquire(timeout=...)`, quá hạn → `BusinessRuleError`/503 `vton_engine_busy` (retryable với worker); cân nhắc chạy `generate` trong executor có timeout.
7. Atomic: thêm partial unique index `(user_id) WHERE status IN ('queued','processing')` (migration Alembic; SQLite/Postgres đều hỗ trợ) và bắt `IntegrityError` → 409 `vton_task_in_progress`. Quota: khoá hàng user (`with_for_update`) quanh khối check+insert, hoặc chấp nhận vượt tối đa 1 và ghi rõ.

**C. Còn lại (#7, #9, #10)**
8. `cache_key(person, garment, cloth_type, engine_name)`; chạy lại script prewarm (cache cũ vô hiệu – chấp nhận được vì chỉ là cache demo).
9. Idempotency: nếu key đã có mà `product_id/variant_id/image_id` khác → 409 `idempotency_key_conflict`; (tuỳ chọn) lưu hash payload.
10. Mock engine: nếu flood-fill xoá >98 % pixel thì dùng toàn bộ ảnh thay vì báo lỗi; hoặc ghi rõ giới hạn "ảnh áo phải nền sạch".

## Đã kiểm chứng là ổn (test pass)
Trùng job không chạy engine 2 lần (`_claim` atomic); xoá khi `queued` → job bị bỏ qua; task đã huỷ không chặn task mới; quota 10/24 h chặn đúng (429) và không tính ảnh bị từ chối; task người khác → 404; path traversal → 404/422; ảnh rỗng/sai đuôi/sai MIME/GIF/quá nhỏ/ngang/JPEG cụt/bom giải nén → 4xx, không 500; engine trả byte rác → task `failed`, không lưu result; cache lỗi storage → vẫn tính toán; mock engine xử lý nền trong suốt, input rác, chạy song song.

## Chưa kiểm chứng (cần làm tiếp nếu muốn)
- FASHN `_image` (`vton_lab/engines/fashn_api.py:160-180`): `outputs[0]` không kiểm tra, tải CDN không giới hạn dung lượng, `b64decode` trần – mới thấy qua đọc code, chưa có test (cần mock HTTP).
- Đua thật sự giữa 2 tiến trình/2 DB connection (test #6 chỉ mô phỏng bằng SELECT mù trên SQLite).
- Body upload lớn: 30 MB trả 400 sạch, nhưng multipart vẫn được spool ra đĩa trước khi cắt; nên có giới hạn ở reverse proxy.
- Frontend (`try-on-modal.tsx`, `lib/vton.ts`) chưa review/test trong đợt này.
- Heuristic `person_bbox`/`upper_body_box` (`vton_lab/images.py`) với ảnh biên (nền không đồng nhất, người sát mép) chưa fuzz.
