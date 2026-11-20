# Nghiên cứu VTON 2D (thử đồ bằng AI) — kỹ thuật, thuật toán, vận hành

> Tài liệu giải thích cho giảng viên: **dùng API/model gì, thuật toán giải quyết từng bài toán thế nào, hệ thống vận hành từ lúc bấm nút đến lúc ra ảnh ra sao**. Mọi khẳng định đều có dẫn chứng `file:dòng` để kiểm chứng.
>
> Phạm vi: thử đồ **2D bằng AI** (người dùng tải ảnh của mình, hệ thống ghép áo lên ảnh). Phần thử đồ **3D** (ma-nơ-canh, hình học thuần) nằm ở file riêng `docs/NGHIEN_CUU_3D_TRY_ON.md`. Cấu hình/engine chi tiết nằm ở `docs/VTON_ENGINES.md`; file này bổ sung phần *vì sao* và *vận hành*, không lặp lại.

---

## 0. Tóm tắt để trình bày

### 0.1. Trả lời trong 30 giây

> "VTON 2D là **AI thật**, khác với 3D (hình học thuần). Người dùng tải ảnh chân dung, hệ thống đưa việc vào **hàng đợi** (ARQ/Redis) để một **worker riêng** xử lý. Worker gọi một **engine** có thể thay được: (1) **FASHN API** — model diffusion chạy trên đám mây, ~12–18 s/ảnh; (2) **DM-VTON** — mạng warp + generator nhỏ chạy **CPU tại chỗ**, ~2–8 s/ảnh, ảnh không rời máy chủ; (3) CatVTON (rất nặng, chỉ làm 'thầy'). Các engine nối thành chuỗi **fallback**: API lỗi thì rơi xuống local. Trước và sau model có các bước **xử lý ảnh cổ điển** (tìm người, cắt từ đầu đến hông, tách nền áo, chỉ dán lại vùng áo bị đổi) để kết quả giữ nguyên độ nét của ảnh gốc. Giao diện **polling mỗi 2 giây** để lấy kết quả."

**Điều phải nói thật (không được nói quá):**

- Cấu hình mặc định `VTON_ENGINE=mock` **không phải AI**: chỉ dán áo lên và đóng dấu "DEMO PREVIEW" (`backend/app/core/config.py:68`, `backend/app/integrations/vton_engine.py:40-111`). AI thật chỉ chạy khi đặt `VTON_ENGINE=lab` + file khai báo engine + checkpoint/khóa API.
- Trọng số DM-VTON **không nằm trong repo**; tốc độ đã đo bằng trọng số ngẫu nhiên, **chất lượng trên trọng số thật chưa được đo** (`docs/VTON_ENGINES.md:36, 75`).
- Engine FASHN và Gradio **gửi ảnh người dùng ra bên thứ ba** (cờ `sends_images_off_host`).

### 0.2. Dùng API / model nào (bảng dẫn chứng)

| Thành phần | Loại | Vai trò | Dẫn chứng |
|---|---|---|---|
| **FASHN API** `/v1/run` + `/v1/status/{id}` | API ngoài, model diffusion (`tryon-v1.6` / `tryon-max`) | Engine chính khi có mạng, ~12–18 s, ≈ $0.075/ảnh | `vton_lab/engines/fashn_api.py:1-13, 36, 92-127`; `docs/VTON_ENGINES.md:40` |
| **DM-VTON** (student: warp + generator nhỏ) | Model học sâu chạy **CPU local** (PyTorch) | Engine dự phòng/riêng tư, chỉ áo trên (`upper`) | `vton_lab/engines/dmvton_cpu.py:84-130` |
| **SCHP** (human parsing, nhãn ATR) | Model phân đoạn người | Giới hạn vùng được sửa vào áo/tay/cổ (hết quầng màu ở nền) | `vton_lab/engines/parsing.py:17, 53` |
| **CatVTON** qua HTTP | Model diffusion chạy local, ~45 phút/ảnh trên CPU | Chỉ làm "thầy" để chưng cất, không dùng cho khách | `vton_lab/engines/catvton_http.py:17-33`; `docs/VTON_ENGINES.md:37` |
| **Gradio Space** | App Hugging Face bất kỳ | Thử nghiệm nhanh, chỉ ảnh test | `vton_lab/engines/gradio_space.py:33-35` |
| **Mock** | Không AI | CI/dev/demo, có dấu "DEMO PREVIEW" | `vton_lab/engines/mock.py:19-31`; `integrations/vton_engine.py:40` |
| **ARQ + Redis** | Hàng đợi tác vụ nền | Tách việc nặng khỏi API | `app/vton_worker.py:89-102`; `features/vton/service.py:305-311` |
| **MinIO** | Object storage riêng tư | Lưu ảnh người, ảnh kết quả | `features/vton/service.py:269-272`; `jobs/vton.py:94-97` |
| **PostgreSQL** (bảng `vton_tasks`) | CSDL | Trạng thái tác vụ, hạn mức, idempotency | `features/vton/model.py:20-52` |

### 0.3. Vận hành theo thứ tự thời gian (từ lúc bấm nút)

| Bước | Ở đâu | Chuyện gì xảy ra | Dẫn chứng |
|---|---|---|---|
| 1 | Trình duyệt | Kiểm tra ảnh (≤5 MB, cạnh ngắn ≥256 px), tích đồng ý, tạo `Idempotency-Key` (UUID) | `frontend/components/store/try-on-modal.tsx:269-317`, `frontend/lib/vton.ts:9, 51-55` |
| 2 | API `POST /api/v1/vton/tasks` (202) | Giới hạn 10 request/phút | `features/vton/router.py:64-68` |
| 3 | `create_task` | Đồng ý → idempotency → biến thể → đủ điều kiện → 1 tác vụ đang chạy/người → hạn mức 24h | `features/vton/service.py:195-265` |
| 4 | `_prepare_person_photo` | Kiểm magic-byte + đuôi + content-type, bỏ EXIF/GPS bằng cách mã hóa lại JPEG q92, chỉ nhận ảnh dọc | `features/vton/service.py:145-181` |
| 5 | Lưu trữ + DB | Ảnh vào MinIO `vton/people/{uuid}.jpg`; hàng `VtonTask` trạng thái `queued` | `features/vton/service.py:267-292` |
| 6 | Hàng đợi | `enqueue("process_vton_task", id, queue "vton", job_id=id)`; nếu lỗi enqueue thì cron cứu | `features/vton/service.py:305-316` |
| 7 | Worker | `_claim`: chuyển `queued→processing` nguyên tử (UPDATE có điều kiện), tăng `attempts` | `jobs/vton.py:35-51` |
| 8 | Worker | Đọc ảnh người + ảnh áo từ MinIO | `jobs/vton.py:77-88` |
| 9 | Worker → engine | `CachedVtonEngine` tra cache (băm nội dung) → engine `mock` hoặc `lab` | `app/vton_worker.py:22-30`; `integrations/vton_engine.py:121-148` |
| 10 | Engine | Chuỗi fallback: FASHN → DM-VTON (xem mục 3) | `vton_lab/engines/fallback.py:46-63` |
| 11 | Worker | Kiểm PNG hợp lệ, lưu `vton/results/{id}.png`, đặt `succeeded` | `jobs/vton.py:90-134` |
| 12 | Trình duyệt | Polling `GET /vton/tasks/{id}` mỗi 2 s → khi xong tải ảnh kết quả (blob) | `try-on-modal.tsx:181-210`, `lib/vton.ts:4` |
| 13 | Cron | Mỗi 30 s cứu tác vụ kẹt; phút thứ 7 mỗi giờ xóa ảnh quá 24 h | `app/vton_worker.py:92-95`; `jobs/vton.py:137-184` |

### 0.4. Bài toán → thuật toán/model → vì sao → file

| Bài toán | Giải pháp | Vì sao chọn | File |
|---|---|---|---|
| Ghép áo lên người thật, giữ tư thế, nếp vải | **Model học sâu** (FASHN diffusion / DM-VTON warp+generator) | Dán ảnh phẳng không biến dạng theo cơ thể — phải học cách *warp* áo theo dáng người | `fashn_api.py`, `dmvton_cpu.py` |
| Tìm người trong ảnh, không cần model | **Ngưỡng màu so với nền** (nền = trung vị viền ảnh), ảnh thu nhỏ 160 px, đếm cột/hàng | Rẻ, chạy vài ms, đủ cho ảnh nền đơn giản | `vton_lab/images.py:101-153` |
| Cắt đúng vùng đầu→hông, tỉ lệ 3:4 | `upper_body_box` | Model được huấn luyện với khung này | `vton_lab/images.py:156-171` |
| Tách áo khỏi nền trắng | Ngưỡng 235 trên kênh tối nhất + đóng/mở hình thái (Max/Min filter) | Ảnh sản phẩm nền trắng; lấp lỗ in trắng, bỏ đốm | `vton_lab/images.py:85-92` |
| Chạy model CPU dù mã gốc cần CUDA | Viết lại lớp tương quan 7×7 (`cost_volume`) bằng PyTorch thuần | Mã gốc dùng `cupy` (chỉ GPU) | `dmvton_cpu.py:54-81` |
| Model hay sai (còn áo cũ, vẽ nửa áo) | Thử tối đa 5 biến thể crop/lề, **chấm điểm** bằng giao histogram màu 64 bin × độ phủ | Chọn bản kết quả có màu giống áo nhất | `dmvton_cpu.py:212-252` |
| Kết quả mờ vì model chạy 256×192 | **Chỉ dán lại vùng bị đổi** lên ảnh gốc độ phân giải cao (mặt nạ từ chênh lệch) | Phần ngoài áo giữ nguyên điểm ảnh gốc | `dmvton_cpu.py:271-300` |
| Quầng màu ở nền | Parsing SCHP: chỉ cho sửa nhãn áo/tay/cổ | Chặn nhiễu của model | `parsing.py:17-77` |
| API ngoài sập/mất mạng | `FallbackEngine`: thử lần lượt, trừ lỗi nghiệp vụ | Luôn có đường lui local | `fallback.py:46-63` |
| Việc nặng làm treo API | Hàng đợi + worker riêng (`max_jobs=1`) | Suy luận mất giây→phút | `app/vton_worker.py:98` |
| Mất job khi crash | Cron cứu + `job_id` chống trùng | Hàng DB là nguồn sự thật | `jobs/vton.py:137-164` |
| Lạm dụng/chi phí | Hạn mức 10/24h, 1 tác vụ/người, 10 req/phút | Chi phí API ≈ $0.075/ảnh | `service.py:127-139, 248-265`; `router.py:67` |
| Riêng tư ảnh cá nhân | Đồng ý bắt buộc, bỏ EXIF, ảnh riêng tư no-store, xóa sau 24 h, nút xóa | Ảnh khuôn mặt/cơ thể là dữ liệu nhạy cảm | `service.py:145-181, 391`; `jobs/vton.py:167-184` |

### 0.5. Ví dụ số (kiểm chứng được)

- **Hạn mức**: `limit=10`; đã tạo 7 tác vụ trong 24 h gần nhất (tính cả tác vụ lỗi/đã xóa ảnh) → `remaining = max(0, 10 − 7) = 3` (`service.py:127-139`).
- **Ảnh hợp lệ**: 1000×1500 px, JPEG, 2 MB → qua; 200×300 → `person_image_too_small` (cạnh ngắn < 256); 1500×1000 (ngang) → `person_image_not_portrait`; 6 MB → `image_too_large` (`service.py:145-178`).
- **Thử lại**: `vton_max_attempts = 2`; engine lỗi tạm thời lần 1 → tác vụ về `queued` (cron nhặt lại trong ≤30 s); lần 2 lỗi nữa → `failed` với `error_code` (`jobs/vton.py:98-119`, `config.py:76`).
- **Quá hạn**: tác vụ `processing` quá 75 phút (`vton_stale_processing_minutes`) → cron đặt `failed/engine_timeout` nếu đã hết số lần thử, ngược lại cho chạy lại (`jobs/vton.py:137-152`). Ngưỡng 75 phút phải lớn hơn timeout dịch vụ 3600 s (60 phút) để cron không "giết nhầm" tác vụ còn đang chạy (`config.py:69-77`).
- **Thời gian**: FASHN ≈ 12–15 s (`performance`), 13–18 s (`balanced`); DM-VTON ≈ 2.1 s ở 256×192, 7.7 s ở 512×384 (trọng số ngẫu nhiên), +0.6 s nếu bật SCHP, +~2 s cho mỗi biến thể thêm; CatVTON ≈ 45 phút (`docs/VTON_ENGINES.md:36-40`, `dmvton_cpu.py:25-26`).
- **Chi phí**: 100 lần thử qua FASHN ≈ 100 × $0.075 = $7.5 (`docs/VTON_ENGINES.md:40`).

### 0.6. Cách chứng minh (khi giảng viên muốn xem)

| Muốn chứng minh | Cách làm |
|---|---|
| Luồng hàng đợi hoạt động | Chạy `pytest -k vton` (79 test pass, 2 skip) — gồm tạo tác vụ, claim, retry, recover, purge |
| Giao diện polling/khôi phục | `npx vitest run tests/try-on-modal.test.tsx tests/try-on-status.test.tsx` (18 test pass) |
| Đang dùng mock hay AI thật | `GET /api/v1/vton/products/{id}/eligibility` trả trường `engine`; UI hiện banner "Demo mode" khi `engine === "mock"` (`try-on-modal.tsx:350, 386-391`) |
| Engine nào đang nạp | Admin: `GET /api/v1/vton-lab/engines` (`vton_lab/router.py`) |
| Chạy thử một engine độc lập | Admin: `POST /api/v1/vton-lab/try-on` (`person`, `garment`, `cloth_type`, `engine`, `seed`) |

---

## 1. Kiến trúc tổng thể

```
Trình duyệt (React modal)
   │  POST /api/v1/vton/tasks  (multipart + Idempotency-Key)
   ▼
FastAPI  features/vton/router.py → service.create_task
   │  ① kiểm luật  ② lưu ảnh người vào MinIO  ③ ghi VtonTask(status=queued)
   │  ④ enqueue ARQ (queue "vton", job_id = task.id)
   ▼
Redis (ARQ) ───────────────►  vton_worker  (container riêng, max_jobs=1)
                                 │ claim queued→processing
                                 ▼
                         CachedVtonEngine  ──hit──► ảnh đã prewarm
                                 │ miss
                                 ▼
                    MockVtonEngine  |  LabVtonEngine (adapter)
                                          │
                                          ▼
                                   EngineRegistry (khóa tuần tự)
                                          │
                       FallbackEngine: FASHN API ──lỗi──► DM-VTON CPU (+SCHP)
                                 │
                                 ▼
                    MinIO vton/results/{id}.png  +  DB status=succeeded
   ▲
   └── Trình duyệt polling GET /vton/tasks/{id} mỗi 2 s → tải ảnh kết quả
```

**Vì sao thiết kế như vậy:**

1. **Hàng đợi + worker riêng**: suy luận mất vài giây đến vài chục phút; nếu chạy trong tiến trình API sẽ chặn mọi request khác. Docstring worker nói rõ: "Long inference must never share a worker with order e-mails or expiry" (`app/vton_worker.py:1-5`).
2. **DB là nguồn sự thật, Redis chỉ là lối đi**: nếu enqueue thất bại hoặc worker sập, hàng `queued` vẫn còn và cron enqueue lại (`service.py:312-316`, `jobs/vton.py:154-164`).
3. **`max_jobs = 1`, `max_tries = 1`, `keep_result = 0`**: mỗi worker chỉ chạy một việc (CPU-bound); thử lại do **tầng ứng dụng** quyết định bằng cột `attempts`, không phải ARQ; không giữ kết quả để tác vụ được cứu có thể dùng lại `job_id` (`app/vton_worker.py:98-101`).
4. **`job_timeout = vton_service_timeout_seconds + 60`**: job ARQ sống lâu hơn timeout engine (`app/vton_worker.py:102`).

---

## 2. Lớp API và các luật nghiệp vụ

### 2.1. Các endpoint (`features/vton/router.py`, tiền tố `/api/v1/vton`)

| Method + đường dẫn | Dòng | Ý nghĩa |
|---|---|---|
| `GET /products/{product_id}/eligibility` | 42 | Sản phẩm có thử được không, loại áo, engine đang dùng |
| `GET /quota` | 53 | Còn bao nhiêu lượt trong 24 h |
| `POST /tasks` | 64-68 | Tạo tác vụ, trả 202, giới hạn `10/minute` |
| `GET /tasks`, `GET /tasks/{id}` | 100, 111 | Danh sách/chi tiết (để polling) |
| `GET /tasks/{id}/person`, `/result` | 120, 136 | Tải ảnh (header riêng tư, no-store) |
| `DELETE /tasks/{id}` | 153-163 | Xóa ảnh (204), giữ hàng để tính hạn mức |

Schema trả về **không bao giờ lộ khóa đối tượng nội bộ**: `person_object`, `result_object` bị `exclude=True`, chỉ có cờ `has_result`, `has_person_image` (`features/vton/schemas.py:31-45`).

### 2.2. Đủ điều kiện thử đồ (`_eligibility_for`, `service.py:69-95`)

Thứ tự kiểm tra: `disabled_by_admin` → `category_unsupported` → `cloth_type_disabled` → `garment_image_missing`.

- Danh mục sản phẩm ánh xạ sang loại áo `upper | lower | overall` (`features/vton/mapping.py`: `CATEGORY_CLOTH_TYPES`, `cloth_type_for_category`). Tên chứa "skirt" mà không có "dress" thì coi là `lower` (`service.py:81-82`).
- Admin bật/tắt loại áo bằng `VTON_CLOTH_TYPES` (mặc định `upper,lower,overall`) (`config.py:79`).
- **Chọn ảnh áo**: `pick_garment_image` chấm theo bộ ba `(điểm màu, điểm loại ảnh, -thứ tự)`; loại ảnh ưu tiên `vton_garment` > `flat_lay` > `catalog` (`mapping.py`, hằng `GARMENT_KINDS`). Khách chọn đúng ảnh nào thì dùng ảnh đó, bỏ qua màu (`service.py:88-90`).

### 2.3. Thứ tự kiểm tra khi tạo tác vụ (`create_task`, `service.py:195-265`)

1. Tính năng bật? (`vton_disabled`, 503)
2. Có đồng ý xử lý ảnh? (`consent_required`)
3. **Idempotency**: cùng người + cùng khóa → trả lại tác vụ cũ, **không tạo mới** (tránh bấm đúp/ mạng chập chờn tạo trùng, tốn tiền API). Ràng buộc duy nhất `uq_vton_tasks_user_idempotency` bảo vệ cả trường hợp hai request đua nhau (`model.py:25-27`, `service.py:292-299`).
4. Biến thể hợp lệ và đang bán?
5. Sản phẩm thử được?
6. **Một tác vụ đang chạy mỗi người** (`queued`/`processing`, chưa quá 75 phút) → `vton_task_in_progress` (409).
7. **Hạn mức 24 h** (mặc định 10) → `vton_quota_exceeded` (429).
8. Kiểm/ làm sạch ảnh (mục 2.4).

Thứ tự này có chủ đích: các kiểm tra rẻ (DB) đứng trước kiểm tra tốn I/O (đọc/giải mã ảnh).

### 2.4. Kiểm tra ảnh người (`_prepare_person_photo`, `service.py:145-181`)

- Đọc tối đa 5 MB + 1 byte để biết có vượt không mà không nạp cả file vô hạn.
- **Ba lớp kiểm**: magic-byte (nhìn 16 byte đầu), đuôi file, content-type — cả ba phải khớp một định dạng PNG/JPEG/WebP; rồi `validate_image_content` giải mã thật.
- Cạnh ngắn ≥ 256 px; chỉ nhận ảnh **dọc** (`height >= width`).
- **Xóa EXIF/GPS**: áp dụng `exif_transpose` (xoay đúng chiều) rồi **mã hóa lại JPEG q92** — dữ liệu vị trí trong EXIF không bao giờ được lưu.

### 2.5. Quyền riêng tư và vòng đời dữ liệu

- Ảnh phục vụ qua endpoint riêng có header `PRIVATE_IMAGE_HEADERS` (no-store), không có URL công khai.
- Lưu **24 giờ** (`vton_retention_hours`); cron mỗi giờ (phút 7) xóa ảnh người + kết quả của tác vụ đã `succeeded/failed` quá hạn, tối đa 200 hàng mỗi lượt; **giữ lại hàng** để hạn mức 24 h không bị lách bằng cách xóa (`jobs/vton.py:167-184`, `service.py:391`).
- Người dùng có thể tự xóa ảnh bất cứ lúc nào (`DELETE /tasks/{id}`, nút "Delete my photo" trong modal: `try-on-modal.tsx:329-340`).
- Engine gửi ảnh ra ngoài khai báo `sends_images_off_host = True` (FASHN, Gradio: `engines/base.py:42`, `gradio_space.py:35`); `FallbackEngine` tự suy ra cờ này nếu **bất kỳ** mắt xích nào gửi ra ngoài (`fallback.py:35`). Khóa API FASHN chỉ đọc từ biến môi trường `FASHN_API_KEY`, không ghi vào file JSON.

---

## 3. Lớp engine: trừu tượng hóa để thay model không đụng luồng

### 3.1. Hai tầng giao diện

| Tầng | Giao diện | Dùng bởi |
|---|---|---|
| Tác vụ (async, bytes→bytes) | `VtonEngine` (Protocol) + `VtonEngineError(code, retryable)` | `jobs/vton.py` (`integrations/vton_engine.py:19-29`) |
| Lab (sync, PIL) | `TryOnEngine` (ABC): `load()`, `generate(request) -> Image` | các engine cụ thể (`vton_lab/engines/base.py:38-60`) |

`LabVtonEngine` là **adapter** nối hai tầng: chạy engine trong `asyncio.to_thread` (không chặn event loop), đổi lỗi lab sang lỗi tác vụ (`vton_lab/adapter.py:26-50`):

| Lỗi lab | Mã lỗi tác vụ | Thử lại? | Ý nghĩa |
|---|---|---|---|
| `VtonConfigError` | `engine_misconfigured` | Không | Cấu hình sai, thử lại vô ích |
| `VtonEngineError` | `engine_error` | **Có** | Lỗi tạm thời (mạng, crash, quá giờ) |
| `ApplicationError` | `invalid_input` | Không | Ảnh hỏng/loại áo không hỗ trợ/bị nhà cung cấp từ chối |

Đăng ký engine bằng decorator `@register_engine("tên")`; cấu hình bằng file JSON `VTON_LAB_ENGINES_FILE`; `build_engine` dựng theo `type` (`base.py`, `vton_lab/service.py:109`). Thêm engine mới = một file + một decorator, không sửa router/worker.

### 3.2. `EngineRegistry`: nạp lười, chạy tuần tự

- Model chỉ được nạp (`load()`) khi dùng lần đầu — khởi động worker không tốn RAM/CPU.
- Có **một khóa toàn cục** quanh `run` vì suy luận CPU-bound: hai ảnh chạy song song chỉ tranh CPU và chậm cả hai (`vton_lab/service.py:66, 84-106`).
- `try_on` giải mã ảnh, kiểm loại áo, và bọc mọi crash bất ngờ của model thành `VtonEngineError` (`vton_lab/service.py:151`).

### 3.3. `FallbackEngine`: API trước, local sau

```
for engine in chuỗi:
    nếu engine không hỗ trợ loại áo → bỏ qua
    thử load() + generate()
    BusinessRuleError  → ném ngay (không đổi engine: ảnh bị từ chối thì engine khác cũng vậy)
    lỗi khác (mạng, timeout, crash) → ghi log, thử engine kế tiếp
hết chuỗi → ném lỗi cuối
```

(`fallback.py:46-63`). Ví dụ cấu hình `auto = [fashn_api (25 s), dmvton_cpu]` ở `docs/VTON_ENGINES.md:44-56`. **Lưu ý trung thực**: DM-VTON chỉ hỗ trợ áo trên; áo dưới/đầm mà FASHN lỗi thì không còn đường lui.

### 3.4. `CachedVtonEngine`: kết quả dựng sẵn

- Khóa cache = SHA-256 của `(ảnh người, ảnh áo, loại áo)` (`integrations/vton_engine.py:114-118`).
- Worker chỉ **đọc** cache (`write=False`): ảnh của khách **không bao giờ** được cache; chỉ script prewarm mới ghi để demo chạy tức thì/ngoại tuyến (`integrations/vton_engine.py:121-148`, `app/vton_worker.py:27-28`, `config.py:81-82`).

---

## 4. Thuật toán chi tiết

### 4.1. FASHN API (engine đám mây)

Luồng **bất đồng bộ kiểu job**: `POST /v1/run` trả `id` → lặp `GET /v1/status/{id}` (mặc định mỗi 1 s) đến khi xong hoặc hết ngân sách `timeout_s` (mặc định 60 s) (`fashn_api.py:92-127`, tùy chọn ở dòng 9-13).

- Đầu vào gửi dạng **data URI** (`_data_uri`, giới hạn cạnh dài).
- `CATEGORIES = {upper: "tops", lower: "bottoms", overall: "one-pieces"}` (`fashn_api.py:36`).
- Chế độ `performance | balanced | quality` đánh đổi tốc độ/chất lượng; `moderation_level` mặc định `permissive`.
- **Phân loại lỗi** (`fashn_api.py:39, 147`): `ContentModerationError`, `InputValidationError`, `ImageLoadError` → lỗi nghiệp vụ `vton_rejected_by_provider` (không fallback, không thử lại); hết credit/mất mạng/quá giờ → `VtonEngineError` (cho phép fallback + thử lại).

Model bên trong FASHN là dịch vụ đóng; ta **không** tự huấn luyện hay can thiệp — ta chỉ gọi API và xử lý lỗi/chi phí/riêng tư xung quanh nó.

### 4.2. DM-VTON CPU (engine tự chạy)

**Nền tảng**: DM-VTON (KiseKloset/DM-VTON, giấy phép học thuật — *không dùng thương mại được nếu chưa xin phép*). Phiên bản "student" gồm hai mạng nhỏ:

1. **Mạng warp**: nhận ảnh người + ảnh áo + mặt nạ áo, ước lượng **trường dịch chuyển** (flow) để uốn áo khớp dáng người. Cốt lõi là **cost volume** — tương quan giữa đặc trưng của người và của áo trong cửa sổ 7×7.
2. **Mạng generator**: trộn áo đã uốn vào ảnh người, tạo ảnh thử đồ (`self._model(person, garment_t, edge)` trả `(tryon, warped)`, `dmvton_cpu.py:200`).

**Điểm kỹ thuật nhóm tự làm — `cost_volume` thuần PyTorch** (`dmvton_cpu.py:54-73`):

```
out[b, k] = mean_c first[b,c,y,x] · second[b,c, y + k//7 − 3, x + k%7 − 3]    (k = 0..48)
```

Mã gốc dùng kernel `cupy` chỉ chạy trên GPU NVIDIA. Ta đệm 3 điểm ảnh quanh `second`, cắt 49 cửa sổ dịch, nhân từng điểm với `first`, cộng theo kênh, chia số kênh, ghép lại → tương đương số học nhưng chạy được trên CPU. Sau đó "cắm" hàm này thay module `models.common.correlation` trước khi import pipeline (`_install_correlation_stub`, dòng 76-81).

**Đường xử lý một ảnh** (`generate` → `_attempt` → `_run_model`, `dmvton_cpu.py:132-208`):

```
ảnh người
 └─ person_bbox  → tìm hộp bao người (heuristic màu nền, không model)
     └─ upper_body_box → khung đầu→hông tỉ lệ 3:4  (đúng khung lúc huấn luyện)
         └─ [tuỳ chọn] SCHP → mặt nạ "được sửa" (áo/tay/cổ)
             └─ với mỗi biến thể (zoom, lề áo) tối đa 5:
                  letterbox người về 192×256 (mặc định)
                  _tight_garment: cắt sát áo + lề → letterbox
                  garment_mask: mặt nạ áo
                  model(person, garment, mask)  → ảnh thử đồ 192×256
                  _match_score → điểm chất lượng
                  _paste_changed_region → ghép lại vào ảnh gốc độ nét cao
             chọn biến thể điểm cao nhất
```

**Từng bước và lý do:**

| Bước | Thuật toán | Vì sao |
|---|---|---|
| `person_bbox` (`images.py:101-154`, gồm `_foreground` + `person_bbox`) | Thu ảnh về cạnh dài 160 px; nền = **trung vị các điểm viền**; điểm "người" = khác nền > 40 (max theo 3 kênh); đóng hình thái Max/Min 5; cột có ≥4% điểm, hàng có ≥2% điểm mới tính; bỏ nếu diện tích < 3% | Không cần model, chạy cực nhanh. **Hạn chế**: hỏng khi nền phức tạp hoặc áo cùng màu nền (docstring ghi "studio-style photo") |
| `upper_body_box` (`images.py:156-171`) | Cao = 60% chiều cao người, rộng = max(cao×3/4, 1.15×bề rộng người); cắt trong biên ảnh; nhích lên 4% để lấy đỉnh đầu | Model huấn luyện trên khung đầu→hông |
| `letterbox` (`images.py:64`) | Co ảnh giữ tỉ lệ, đệm vào khung 192×256 | Mạng cần kích thước cố định, không làm méo người |
| `_tight_garment` (`dmvton_cpu.py:255-268`) | Hộp bao của `garment_mask` + lề (mặc định 6%) | Dữ liệu huấn luyện áo lấp đầy khung; ảnh sản phẩm có nhiều khoảng trắng |
| `garment_mask` (`images.py:85-92`) | Kênh tối nhất < 235 → áo; Max5→Min5 (đóng lỗ), Min3→Max3 (bỏ đốm) | Áo chụp nền trắng; áo có họa tiết trắng vẫn liền khối |
| Biến thể `_VARIANTS` (`dmvton_cpu.py:212`) | 5 cặp (zoom, lề): (1.0,0.06), (1.12,0.06), (1.0,0.16), (1.12,0), (0.92,0.06) | Model nhạy với khung cắt; thử nhiều rồi chọn tốt nhất (mặc định `candidates=1`, mỗi biến thể thêm ~2 s) |
| `_match_score` (`dmvton_cpu.py:234-252`) | Điểm = **giao histogram màu** (64 bin = 4×4×4, dịch bit `>>6`) giữa pixel bị đổi và pixel áo, nhân hệ số độ phủ `min(1, số_điểm_đổi / (0.12·diện tích))` | Bắt hai lỗi điển hình: model **không đổi gì** (còn áo cũ) hoặc **vẽ nửa áo** → điểm thấp |
| `_paste_changed_region` (`dmvton_cpu.py:271-300`) | `|đầu vào − đầu ra|` lấy max 3 kênh → làm mờ Gauss 1.5 → khuếch đại `(v−14)×12` → Max3 + mờ 1.5 → (nhân với mặt nạ SCHP nếu có) → phóng to bicubic → `composite(đầu ra + unsharp, ảnh gốc, mặt nạ)` | Model chỉ 192×256 nên mờ; chỉ vùng áo bị đổi là độ phân giải thấp, **toàn bộ phần còn lại giữ nguyên pixel gốc** |

**Điểm quyết định chất lượng**: hai lớp *giới hạn vùng sửa* — (a) mặt nạ chênh lệch ở bước ghép, (b) mặt nạ SCHP — là thứ làm hết "quầng màu" ở nền mà model gây ra.

### 4.3. SCHP — human parsing (`parsing.py`)

- Mô hình phân đoạn người SCHP với **nhãn ATR**; `EDITABLE_LABELS = (4, 5, 7, 14, 15, 17)` = áo trên, váy, đầm, hai tay, khăn (`parsing.py:17`).
- Cổ/cổ áo bị gán nhãn "mặt" (11): chỉ cho sửa **từ 60% chiều cao vùng mặt trở xuống** (`NECK_FROM = 0.6`), để không bao giờ sửa khuôn mặt (`parsing.py:19-20, 63-69`).
- Mặt nạ nở thêm (`MaxFilter`) rồi mờ nhẹ để mép mượt.
- Chi phí ≈ 0.6 s/ảnh (CPU 4 nhân). Cần clone CatVTON (chỉ lấy `model/SCHP`) + checkpoint `exp-schp-201908301523-atr.pth`.

### 4.4. Mock (không AI)

Có **hai** bản mock cùng tên, dễ nhầm:

| Bản | Vị trí | Dùng khi | Cách làm |
|---|---|---|---|
| `MockVtonEngine` | `integrations/vton_engine.py:40-111` | `VTON_ENGINE=mock` (**mặc định**) | Ảnh người co 768×1024; tách nền áo bằng **floodfill từ góc** (ngưỡng 14); cắt hộp bao; co vào hộp cố định theo loại áo (`upper`: 20–80% ngang, 22–56% dọc); dán; đóng dấu "DEMO PREVIEW - mock engine, not an AI try-on result" |
| `MockEngine` | `vton_lab/engines/mock.py:19-31` | Engine `mock` trong registry lab (CI/so sánh) | Dán áo vào nửa giữa người, đóng dấu "DEMO PREVIEW" |

Cả hai **không ước lượng tư thế, không biến dạng áo** — chỉ để chạy được toàn bộ đường ống (tải ảnh, hàng đợi, lưu trữ, UI) khi không có GPU. Giao diện hiện banner "Demo mode" khi engine là `mock` (`try-on-modal.tsx:386-391`).

---

## 5. Hàng đợi, thử lại và tự phục hồi

### 5.1. Máy trạng thái của `VtonTask`

```
queued ──claim──► processing ──┬─ thành công ──────────► succeeded
   ▲                           ├─ lỗi vĩnh viễn ───────► failed (error_code)
   └── lỗi tạm thời, còn lượt ─┘
   └── cron: processing quá 75 phút (còn lượt) ──┘
```

### 5.2. Các cơ chế an toàn

| Vấn đề | Cơ chế | Dẫn chứng |
|---|---|---|
| Hai worker nhận cùng việc | `UPDATE … WHERE id=? AND status='queued'`; chỉ ai có `rowcount==1` mới chạy, còn lại `skipped` | `jobs/vton.py:35-51` |
| Enqueue thất bại | Vẫn ghi DB; cron mỗi 30 s enqueue lại tác vụ `queued` cũ hơn 30 s | `service.py:312-316`; `jobs/vton.py:21, 154-164` |
| Enqueue trùng | `job_id = task.id` → ARQ bỏ qua job đang chờ/chạy cùng id | `app/vton_worker.py:55-61` |
| Worker chết giữa chừng | Cron đưa `processing` quá hạn về `queued` (hoặc `failed/engine_timeout` nếu hết lượt) | `jobs/vton.py:137-152` |
| Dịch vụ đang khởi động (lần đầu tải trọng số) | Lỗi `engine_unavailable` **không tính lượt thử** (`attempts − 1`) cho đến khi quá hạn | `jobs/vton.py:98-116` |
| Kết quả không phải ảnh | `Image.verify()` trước khi lưu | `jobs/vton.py:92-93` |
| Crash không lường trước | Bắt `Exception` → `failed/internal_error`, ghi log | `jobs/vton.py:120-123` |
| Ảnh bị xóa/mất | `person_image_missing`, `garment_unavailable` | `jobs/vton.py:74-88` |

### 5.3. Phía giao diện (`try-on-modal.tsx`, `lib/vton.ts`)

- Polling mỗi **2 s** (`VTON_POLL_INTERVAL_MS`), bỏ cuộc sau **2 giờ**; chịu được **5** lỗi mạng liên tiếp — lỗi mạng/5xx coi là tạm thời, **không làm hỏng tác vụ đang chạy** (`lib/vton.ts:4-8, 44-46`, `try-on-modal.tsx:193-200`).
- **Đóng modal không hủy tác vụ**: mở lại, giao diện tìm tác vụ chưa xong của sản phẩm đó và polling tiếp (`try-on-modal.tsx:115-136`).
- Lịch sử: hiển thị tối đa 6 kết quả thành công gần đây của sản phẩm (`try-on-modal.tsx:80-105`).
- Mọi `ObjectURL` giữ ảnh riêng tư đều được `revokeObjectURL` khi dọn (`try-on-modal.tsx:107-157`).
- Thông báo lỗi ánh xạ từ `error_code` sang câu dễ hiểu (`lib/vton.ts:11-30`).
- Idempotency key: tạo mới sau mỗi lần thất bại hoặc reset, giữ nguyên khi bấm lại cùng lần gửi (`try-on-modal.tsx:307-326`).

---

## 6. Cấu hình quan trọng (`backend/app/core/config.py:66-84`)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `VTON_ENABLED` | `true` | Công tắc tổng |
| `VTON_ENGINE` | `mock` | `mock` hoặc `lab` (validator ở dòng 104-110) |
| `VTON_SERVICE_TIMEOUT_SECONDS` | 3600 | Trần thời gian cho engine chậm |
| `VTON_DAILY_QUOTA` | 10 | Lượt/24 h/người |
| `VTON_RETENTION_HOURS` | 24 | Giữ ảnh bao lâu |
| `VTON_QUEUE_NAME` | `vton` | Tên hàng đợi ARQ |
| `VTON_MAX_ATTEMPTS` | 2 (1–5) | Số lần thử |
| `VTON_STALE_PROCESSING_MINUTES` | 75 | Ngưỡng cứu tác vụ kẹt (phải > timeout) |
| `VTON_CLOTH_TYPES` | `upper,lower,overall` | Loại áo cho khách |
| `VTON_RESULT_CACHE` | `true` | Đọc cache dựng sẵn |
| `VTON_LAB_ENGINES_FILE` / `VTON_LAB_DEFAULT_ENGINE` | `` / `mock` | Khai báo engine lab |
| `FASHN_API_KEY` | (env) | Khóa FASHN, không ghi vào file |

---

## 7. Kiểm thử (đã chạy thật)

| Phạm vi | Lệnh | Kết quả |
|---|---|---|
| Backend VTON | `.venv/Scripts/python -m pytest -q -p no:cacheprovider tests -k vton` | **79 passed, 2 skipped** (gồm `test_vton.py`, `test_vton_lab_engines.py`, `test_rules_vton_images.py`) |
| Frontend modal + trạng thái | `npx vitest run tests/try-on-modal.test.tsx tests/try-on-status.test.tsx` | **18 passed** (14 + 4), có ca "resumes an in-flight task when the modal is reopened" và "keeps polling through a transient network error" |

2 test bị skip là các ca cần tài nguyên ngoài (checkpoint/dịch vụ thật). Chưa có test nào đo **chất lượng ảnh** vì chưa có trọng số thật trong repo.

---

## 8. Hạn chế và việc còn lại (nói thẳng với giảng viên)

1. **Mặc định là demo**: không đặt `VTON_ENGINE=lab` thì khách chỉ thấy ảnh dán + dấu "DEMO PREVIEW". Đây là chủ ý để CI/dev chạy được, nhưng không phải kết quả AI.
2. **Chưa đo chất lượng thật** của DM-VTON: số liệu tốc độ lấy từ trọng số ngẫu nhiên; checkpoint và bộ ảnh đánh giá chưa nằm trong repo (`docs/VTON_ENGINES.md:75`).
3. **DM-VTON chỉ hỗ trợ áo trên** (`dmvton_cpu.py:87`); áo dưới/đầm phụ thuộc hoàn toàn FASHN.
4. **`person_bbox` là heuristic nền đơn giản** — ảnh nền phức tạp hoặc áo trùng màu nền có thể cắt sai khung; đã có `crop: none` làm đường lui, và SCHP giảm phần nào hậu quả.
5. **`_match_score` chỉ so màu**, không hiểu hình dạng; nó lọc được lỗi "không đổi/đổi nửa vời" nhưng không đảm bảo áo vừa vặn.
6. **Quyền riêng tư với API ngoài**: dùng FASHN nghĩa là ảnh khách rời máy chủ (đã có đồng ý bắt buộc và cờ `sends_images_off_host`, nhưng nên nêu rõ trong chính sách quyền riêng tư).
7. **Giấy phép**: DM-VTON là giấy phép học thuật; dùng thương mại cần xin phép hoặc thay model.
8. **Năng lực**: `max_jobs=1` → mỗi worker xử lý tuần tự; muốn nhiều người đồng thời phải thêm worker (và GPU nếu dùng engine nặng).
9. **Hạn mức tính theo `created_at`**, kể cả tác vụ lỗi: người dùng gặp lỗi phía hệ thống vẫn bị trừ lượt (chọn đơn giản để chống lạm dụng; có thể nới nếu cần).
10. **Việc tiếp theo** đã ghi trong tài liệu engine: tải checkpoint và đo chất lượng; module đo size/BMI từ pose; chưng cất từ CatVTON; tối ưu ONNX Runtime (`docs/VTON_ENGINES.md:75`).

---

## 9. Câu hỏi thường gặp khi bảo vệ

**H1. VTON 2D có phải AI không?**
Có, nếu chạy `VTON_ENGINE=lab` với FASHN (diffusion, đám mây) hoặc DM-VTON (mạng warp + generator). Nếu để mặc định `mock` thì **không** — chỉ dán ảnh và có dấu "DEMO PREVIEW". Giao diện báo rõ qua banner "Demo mode".

**H2. Em dùng API/model nào?**
FASHN API (`/v1/run`, `/v1/status/{id}`) làm engine chính; DM-VTON (student) chạy CPU làm engine local/dự phòng; SCHP để giới hạn vùng sửa; CatVTON chỉ để làm "thầy" vì quá chậm (~45 phút/ảnh trên CPU). Bảng ở mục 0.2.

**H3. DM-VTON giải bài toán thử đồ thế nào?**
Hai bước: (1) **warp** — ước lượng trường dịch chuyển để uốn ảnh áo phẳng khớp dáng người, dùng *cost volume* (tương quan 7×7 giữa đặc trưng người và áo); (2) **generator** — trộn áo đã uốn vào người, xử lý vùng che khuất/nếp. Mục 4.2.

**H4. Phần nào do nhóm tự làm, phần nào dùng sẵn?**
Dùng sẵn: kiến trúc & trọng số DM-VTON, SCHP, FASHN. Tự làm: `cost_volume` thuần PyTorch để chạy CPU; tiền xử lý (tìm người, cắt khung, tách nền áo); chấm điểm chọn biến thể; ghép lại vùng bị đổi; lớp engine trừu tượng, fallback, hàng đợi, cache, quota, quyền riêng tư.

**H5. Vì sao phải dùng hàng đợi, không gọi thẳng trong API?**
Suy luận mất 2 s–vài chục phút; gọi trong tiến trình API sẽ chặn các request khác và hết thời gian HTTP. Hàng đợi (ARQ/Redis) + worker riêng cho phép trả 202 ngay, thử lại, cứu việc khi sập, và giới hạn 1 việc/lần cho CPU.

**H6. Worker chết giữa chừng thì sao?**
Hàng `VtonTask` trong DB là nguồn sự thật. Cron mỗi 30 s đưa tác vụ `processing` quá 75 phút về `queued` (hoặc `failed` nếu hết lượt) và enqueue lại tác vụ `queued` bị bỏ sót; `job_id = task.id` chống chạy trùng (`jobs/vton.py:137-164`).

**H7. Bấm nút hai lần / mạng chập chờn có tính tiền hai lần không?**
Không. `Idempotency-Key` + ràng buộc duy nhất `(user_id, idempotency_key)` → cùng khóa trả lại tác vụ cũ, kể cả khi hai request đua nhau (`service.py:216-218, 292-299`); thêm giới hạn 1 tác vụ đang chạy/người và 10 lượt/24 h.

**H8. Vì sao có fallback API → local?**
API ngoài có thể mất mạng, hết credit, quá giờ. Chuỗi fallback thử lần lượt để khách vẫn có kết quả. Lỗi *nghiệp vụ* (ảnh bị từ chối kiểm duyệt) thì không đổi engine vì engine nào cũng sẽ từ chối.

**H9. Ảnh của khách có an toàn không?**
Bắt buộc đồng ý; bỏ EXIF/GPS bằng cách mã hóa lại; lưu trong MinIO riêng tư, phục vụ no-store, không URL công khai; xóa tự động sau 24 h hoặc khi khách yêu cầu; kết quả của khách không bao giờ vào cache. **Ngoại lệ phải nêu**: nếu dùng FASHN/Gradio thì ảnh rời máy chủ.

**H10. Kết quả chính xác đến đâu?**
Chưa đo định lượng. Em chỉ đo được tốc độ (DM-VTON ~2–8 s CPU; FASHN ~12–18 s). Chất lượng của DM-VTON phụ thuộc trọng số thật (chưa có trong repo) và ảnh đầu vào (nền đơn giản, ảnh dọc, thấy rõ thân trên). Em có hai lớp bảo vệ chất lượng: chọn biến thể bằng histogram màu và chỉ dán lại vùng áo. Hướng đánh giá tiếp theo: bộ ảnh cố định + chỉ số FID/SSIM, so sánh với FASHN.

**H11. Vì sao DM-VTON chạy được trên CPU còn bản gốc thì không?**
Bản gốc dùng kernel `cupy` (CUDA) cho lớp tương quan. Em viết lại bằng PyTorch thuần: đệm, cắt 49 cửa sổ dịch, nhân-cộng-chia (`cost_volume`, `dmvton_cpu.py:54-73`), chậm hơn GPU nhưng đủ ~2 s ở 256×192.

**H12. Chi phí vận hành?**
FASHN ≈ $0.075/ảnh; hạn mức 10 lượt/người/24 h chặn lạm dụng (tối đa $0.75/người/ngày). Engine local không tốn phí gọi nhưng tốn CPU và chạy tuần tự.

**H13. Sao không chạy CatVTON cho khách?**
~45 phút/ảnh trên CPU — không chấp nhận được cho thương mại điện tử. Chỉ dùng làm "thầy" để chưng cất sang mạng nhỏ (hướng phát triển).

**H14. Làm sao thêm một model mới?**
Tạo `engines/<tên>.py` kế thừa `TryOnEngine`, gắn `@register_engine`, cài `load()` và `generate()`, import trong `engines/__init__.py`, khai báo trong file JSON. Không sửa router/worker/UI (`docs/VTON_ENGINES.md:67-71`).

**H15. Khác gì so với thử đồ 3D?**
3D: hình học thuần (không AI), chạy hoàn toàn trên trình duyệt, so sánh số đo với bảng size để báo "vừa/chật". 2D: AI sinh ảnh, chạy trên server/đám mây, cho **cảm giác thật** (chất vải, ánh sáng, dáng người của chính khách) nhưng chậm và tốn tài nguyên. Hai phần bổ sung nhau.
