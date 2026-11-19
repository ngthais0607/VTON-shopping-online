# Kế hoạch: Thử đồ theo số đo (người mẫu theo dáng + gợi ý size)

Ngày: 2026-11-19. Trạng thái: **bản thiết kế chờ duyệt**, chưa có code. Gộp từ `KE_HOACH_SIZE_BMI.md` và `KE_HOACH_HINH_NHAN_VTON.md` (hai bản đó đã bị thay thế bằng tài liệu này).

## 1. Ý tưởng một câu

Khách nhập giới tính, chiều cao, cân nặng (số đo ngực/eo/hông là tùy chọn). Từ **một lần nhập** hệ thống cho ra hai thứ độc lập:

1. **Ảnh thử đồ:** nếu khách có ảnh cá nhân thì dùng ảnh đó (luồng hiện tại); nếu không thì dùng **người mẫu dựng sẵn có dáng gần nhất** mặc món đồ đang xem, ghi rõ là ảnh minh họa.
2. **Gợi ý size:** so số của khách với `Product.size_chart` và trả lời kiểu "Size M, hơi rộng ở eo" kèm độ tin cậy. Chỉ là gợi ý, không phải đo chính xác.

```
Nhập giới tính / cao / nặng (+ ngực, eo, mông nếu có)
   │
   ├─► ẢNH THỬ ĐỒ
   │     ├─ có ảnh cá nhân → dùng ảnh đó (cần đồng ý riêng tư như hiện tại)
   │     └─ không có ảnh   → người mẫu gần dáng nhất (1 trong 24) mặc đồ đang xem
   │
   └─► GỢI Ý SIZE: số của khách  vs  size_chart của sản phẩm
         → "Size M – hơi rộng ở eo; size L nếu thích mặc rộng"
```

**Gợi ý size không phụ thuộc ảnh.** Ảnh thử đồ không đổi theo size (FASHN và các VTON diffusion không có tham số size), nên độ vừa được nói bằng chữ cạnh ảnh.

## 2. Mục tiêu và không mục tiêu

| Có | Không |
|---|---|
| Khách không cần tải ảnh vẫn thử đồ được và biết nên mua size nào | Đo cơ thể chính xác như thợ may (sai số ước lượng ±3–5 cm, nói rõ với khách) |
| Gợi ý size < 100 ms, chạy CPU, giải thích từng vùng bằng chữ | Làm ảnh try-on *thay đổi* theo size |
| Dùng đúng `Product.size_chart` shop đã nhập | Huấn luyện model ML (chưa có dữ liệu mua/đổi trả) |
| Ảnh người mẫu có cache, trả nhanh, chi phí FASHN có kiểm soát | Tạo thân hình riêng cho từng khách bằng AI mỗi lần (xem 4.1) |
| Khách xóa được số đo bất kỳ lúc nào | Lưu ảnh khách để đo cơ thể (để giai đoạn sau, tùy chọn) |

## 3. Hiện trạng trong code (đã kiểm tra)

- `Product.size_chart` là JSON tự do dạng `{ "S": {chest, waist, hip, length}, ... }` (xem `size-chart-modal.tsx`, cm). Chưa có validate chuẩn.
- `ProductVariant.size` có tồn kho theo size; trang sản phẩm đã có `fit_feedback` (đánh giá vừa/chật/rộng của người mua cũ).
- **Chưa có** chiều cao/cân nặng ở `users` hay `vton_tasks`.
- VTON (`features/vton`, `vton_lab`): có kiểm tra sản phẩm hỗ trợ try-on và `cloth_type` (upper/lower/overall). Ảnh người được chuẩn hóa bởi `service._prepare_person_photo` (bỏ EXIF, JPEG q92), bắt buộc ảnh dọc, ≤ 5 MB.
- Cache: `CachedVtonEngine` (`app/integrations/vton_engine.py`) khóa theo sha256 của (ảnh người, ảnh áo, cloth_type), lưu ở `vton/cache/{hash}.png`. Chỉ `scripts/prewarm_vton.py` được ghi (`write=True`) để không bao giờ lưu ảnh khách.

## 4. Các cách làm đã cân nhắc

### 4.1 Ảnh người mẫu: "tạo" bằng cách nào

| Cách | Ưu | Nhược | Quyết định |
|---|---|---|---|
| (a) Tạo riêng cho từng khách bằng `model-create` rồi VTON | Cảm giác cá nhân hóa nhất | 2 lần gọi API/khách, thêm 10–55 s, không cache được, thân hình sinh ra không đảm bảo đúng BMI (endpoint không có tham số body type, chỉ điều khiển bằng chữ) | Không |
| **(b) 24 ảnh dựng sẵn, chọn ảnh gần nhất** | Cache được, tức thì, chi phí cố định, kiểm soát chất lượng bằng mắt | Dáng chỉ gần đúng (chia khoảng) | **Chọn (đề xuất, chờ bạn xác nhận)** |

Với (b), giao diện hiển thị số đo của hình nhân ("Nam 168 cm, BMI ≈ 20.5") và cho đổi sang hình khác, nên khách vẫn thấy như "người mẫu của mình".

### 4.2 Gợi ý size

| Cách | Ưu | Nhược | Quyết định |
|---|---|---|---|
| **A. Luật + hồi quy nhân trắc từ chiều cao/cân nặng, so với `size_chart`** | Nhanh, tất định, test được, không cần ảnh, riêng tư | Sai số 3–5 cm, không thấy dáng người | **Chọn** |
| B. Đo từ ảnh (pose keypoint + chiều cao làm thước) | Chính xác hơn | Cần ảnh toàn thân đứng thẳng, nặng, nhạy cảm; ảnh người dùng thường chỉ nửa thân hoặc nền lộn xộn | Giai đoạn sau, tùy chọn |
| C. ML học từ lịch sử mua/đổi trả | Thích nghi theo shop | Chưa có dữ liệu | Bỏ |

## 5. Đầu vào chung

Một form, dùng cho cả hai chức năng:

| Trường | Bắt buộc | Dùng cho |
|---|---|---|
| Giới tính | Có (hoặc xem cả hai bộ người mẫu) | chọn người mẫu, hệ số ước lượng |
| Chiều cao (cm), cân nặng (kg) | Có | cả hai |
| Ngực / eo / mông (cm) | Không | chỉ gợi ý size (thay giá trị ước lượng bằng số thật, tăng độ tin cậy) |
| Kiểu mặc: ôm / vừa / rộng | Không (mặc định vừa) | chỉ gợi ý size |

Lưu hay không: có tick đồng ý thì lưu vào hồ sơ (`body_profiles`), không thì chỉ tính tức thời. Số đo coi là dữ liệu nhạy cảm: không ghi log, **không gửi cho FASHN** (FASHN chỉ nhận ảnh người/người mẫu và ảnh áo).

## 6. Phần A: Thuật toán gợi ý size

```
Input: height_cm, weight_kg, gender?, fit_pref (slim|regular|loose),
       số đo thật (chest/waist/hip)?, size_chart
1. BMI = kg / (m^2)
2. Số đo cơ thể (cm): dùng số khách nhập nếu có; nếu thiếu thì ước lượng
   chest = a0 + a1*height + a2*BMI  (hệ số riêng theo giới tính, hiệu chỉnh
   trên bảng size thực của shop; hệ số cần kiểm chứng, ghi nguồn trong code)
3. Với mỗi size S trong size_chart, mỗi vùng r:
      ease(S,r) = số đo áo(S,r) - số đo người(r)
4. Nhãn vùng theo ease và kiểu mặc:
      < 0 chật | 0–4 vừa sát | 4–10 vừa | > 10 rộng  (ngưỡng đổi theo fit_pref, loại áo)
5. Điểm size = tổng phạt lệch khỏi ease mục tiêu (ngực/vai nặng hơn eo/hông)
   → chọn size điểm tốt nhất; hai size sát nhau thì nêu cả hai.
6. Độ tin cậy thấp nếu BMI < 16 hoặc > 35, chiều cao ngoài 140–200 cm,
   hoặc size_chart thiếu vùng → hiện cảnh báo, không kết luận chắc chắn.
   Có số đo thật của khách thì độ tin cậy tăng.
Output: {recommended_size, alt_size?, per_region:[{region,label,ease_cm}],
         confidence, in_stock}
```

Quần/váy dùng eo + hông + dài; áo dùng ngực + vai + dài; đầm dùng ngực + eo + hông (lấy từ `cloth_type`). Sản phẩm thiếu `size_chart` thì **không đưa gợi ý** và nói rõ.

## 7. Phần B: 24 người mẫu

### 7.1 Chỉ số vô hạn, ảnh hữu hạn

Chiều cao và BMI là số liên tục, nên **chia khoảng**: mỗi ô (giới × cao × BMI) có một ảnh đại diện. Chỉ hai trục này chọn ảnh (lựa chọn của tôi, kiểm bằng mắt ở GĐ0): chúng đổi hình dáng bên ngoài rõ nhất và khách luôn biết. Số đo ngực/eo/hông **không** chọn ảnh, chỉ dùng cho phần A (kho ảnh không thể phủ độc lập 3 vòng).

Lưới: 2 giới × 3 chiều cao × 4 dáng = **24**.

| Trục | Khoảng | Ảnh đại diện |
|---|---|---|
| Giới tính | nam, nữ | |
| Chiều cao nam (cm) | thấp < 163, vừa 163–172, cao > 172 | 160 / 168 / 176 |
| Chiều cao nữ (cm) | thấp < 152, vừa 152–160, cao > 160 | 150 / 157 / 164 |
| BMI | gầy < 18.5, cân đối 18.5–22.9, đầy đặn 23–26.9, lớn ≥ 27 | 17.5 / 20.5 / 25 / 30 |

Ngưỡng BMI theo mốc châu Á phổ biến (18.5 / 23 / 27.5, làm tròn 27); ngưỡng chiều cao theo ước tính chung cho người Việt. **Cả hai là đề xuất, cần đối chiếu nguồn chính thống và chỉnh theo khách thật của shop.** Thân hình cực đoan (BMI rất thấp/cao) vốn khó ước lượng liên tục (xem nguồn ở mục 13), thêm một lý do để chia nhóm.

Mã ảnh `{giới}_{cao}_{dáng}`, ví dụ `m_mid_regular`, `f_tall_large`.

### 7.2 Chọn ảnh

```
1. Lọc ảnh cùng giới.
2. d(a) = sqrt( ((h - h_a)/6)^2 + ((BMI - BMI_a)/2.5)^2 )   (6 cm, 2.5 BMI: chỉnh sau khi xem ảnh thật)
3. Ảnh chính = d nhỏ nhất; ảnh phụ = 2 ảnh kế tiếp (để khách tự đổi).
4. d(ảnh chính) > 2.0 (BMI > 35, cao < 145 cm...) → báo "chưa có người mẫu sát dáng bạn",
   gợi ý tải ảnh riêng.
```

Thêm ảnh (36, 48...) chỉ cần sửa manifest, không sửa code.

### 7.3 Chuẩn bị 24 ảnh

| Yêu cầu | Lý do |
|---|---|
| Toàn thân, đứng thẳng, nhìn thẳng, tay hơi tách thân, tỉ lệ dọc ~2:3 | Quần/đầm cần thấy chân; tay tách thân để vùng áo rõ |
| Đồ nền ôm sát, màu trơn | Đồ rộng làm sai dáng người |
| Nền đơn giản, ánh sáng đều | FASHN ghi nền phức tạp làm mất chi tiết nhỏ |
| Cùng tư thế ở cả 24 ảnh | So sánh công bằng, dễ kiểm |
| Độ phân giải không thấp hơn ngưỡng ảnh người dùng | Dùng chung bước chuẩn hóa của `features/vton` |
| Nhãn theo dáng thật của ảnh, không theo prompt | Để khoảng cách ở 7.2 có nghĩa |

**Nguồn ảnh (cần bạn quyết):**

| Cách | Được | Mất |
|---|---|---|
| **AI sinh (vd. `model-create` của FASHN, Experimental) + chọn tay** | Nhanh, rẻ, đủ 24 dáng, không dính quyền hình ảnh người thật | Điều khiển dáng bằng chữ lỏng: sinh nhiều rồi chọn bằng mắt; phải đọc điều khoản dùng ảnh sinh ra (trang tài liệu không nói); ghi rõ người mẫu AI |
| Chụp người thật có giấy đồng ý | Chân thực | Khó đủ 24 dáng; cần quyền sử dụng |
| Ảnh stock bản quyền | Nhiều lựa chọn | Tốn phí; khó đồng nhất tư thế |

Về `model-create` (đã đọc tài liệu): tham số `prompt`, `image_reference`, `aspect_ratio` (có 2:3), `seed`, `resolution`, `generation_mode`, `num_images` 1–4; **không có tham số riêng cho thân hình**; 1–5 credit/ảnh; `face_reference` (+3 credit/ảnh) giữ cùng khuôn mặt giữa các ảnh. Đề xuất: AI sinh + chọn tay, ghi `source` trong manifest.

Không dùng SMPL/SMPL-X hay BEDLAM để dựng thân hình: giấy phép chỉ cho nghiên cứu phi thương mại (xem mục 13).

### 7.4 Manifest

`backend/app/assets/mannequins/manifest.json`:

```json
{
  "id": "m_mid_regular",
  "sex": "male",
  "height_cm": 168,
  "bmi": 20.5,
  "label_vi": "Nam 168 cm, dáng cân đối",
  "file": "m_mid_regular.jpg",
  "sha256": "...",
  "source": "ai_generated",
  "notes": "ánh sáng đều, tay hơi tách thân"
}
```

Ảnh được **chuẩn hóa một lần** rồi lưu đúng các byte đó; lúc chạy luôn đọc đúng byte này, **không nén lại**, vì khóa cache là hash nội dung (nén lại bằng Pillow khác có thể đổi byte và làm hỏng cache).

## 8. Phần C: Ghép vào luồng thử đồ

1. Khách mở try-on trên sản phẩm. Hai tab: **"Ảnh của tôi"** (luồng cũ) và **"Dùng người mẫu"**.
2. Tab người mẫu: nhập số đo (form mục 5) → hệ thống chọn ảnh chính + 2 ảnh phụ, hiện số đo của hình nhân → khách bấm thử.
3. Kết quả: ảnh try-on + dòng "Size M – hơi rộng ở eo" (từ phần A) + nhãn "ảnh minh họa theo dáng gần nhất" khi dùng người mẫu.
4. Nếu khách chưa nhập số đo ở tab ảnh cá nhân thì kết quả hiện lời mời nhập để nhận gợi ý size.
5. Trang sản phẩm có thêm nút **"Tìm size của tôi"** dùng được không cần thử đồ; kết quả có nút chọn size đó và thêm vào giỏ (hiện size còn hàng).

## 9. Thiết kế kỹ thuật

| Lớp | Việc |
|---|---|
| DB | Bảng `body_profiles` (user_id unique, height_cm, weight_kg, gender, chest/waist/hip nullable, consent_at, updated_at): **một migration Alembic**, kiểm `downgrade base` rồi `upgrade head`; không thêm cột vào `users`. `vton_tasks` thêm `size` (nullable, nhãn cạnh kết quả) và `mannequin_id` (nullable). Head hiện tại: `b9c8d7e6f5a4`. |
| Backend, thuần | `app/features/sizing/`: `estimator.py`, `recommender.py`, `mannequin.py` (BMI, khoảng cách, ảnh chính + phụ, cờ ngoài vùng phủ). Không I/O, test được. |
| Backend, API | `POST /api/v1/products/{id}/size-recommendation` (ẩn danh được, số đo trong body); `GET/PUT/DELETE /api/v1/users/me/body-profile`; `GET /api/v1/vton/mannequins`; `POST /api/v1/vton/mannequins/match`. `POST /api/v1/vton/tasks` nhận `mannequin_id` thay cho tải ảnh. Rate limit như route công khai. |
| Tác vụ VTON | Có `mannequin_id`: nạp byte ảnh từ storage, **không cần đồng ý lưu ảnh cá nhân**; còn lại giống hiện tại. Engine không đổi. |
| Validate | Chuẩn hóa `size_chart` bằng schema (size → {chest,waist,hip,length,shoulder?,sleeve?} số > 0, cm) ở `ProductCreate/ProductPatch`; dữ liệu cũ sai định dạng thì bỏ qua gợi ý, không lỗi. |
| Cache | Ảnh người mẫu cho phép **ghi khi chạy** (write-through): lần đầu chạy FASHN, sau lấy cache. Hiện chỉ script prewarm được ghi vì không được lưu ảnh khách; ảnh người mẫu không phải dữ liệu cá nhân. Cần xác nhận job dọn `vton_retention_hours` không xóa `vton/cache/*`. |
| Prewarm | Mở rộng `scripts/prewarm_vton.py` thêm `--mannequin` / `--all-mannequins`. |
| Frontend | `components/store/size-finder.tsx`, `lib/sizing.ts`, mục "Số đo của tôi" ở `store/account`, tab "Dùng người mẫu" trong `try-on-modal.tsx`, `components/admin/size-chart-editor.tsx` (bảng hàng = size, cột = ngực/eo/hông/dài/dài tay, kiểm hợp lệ), nối vào `store/products/[slug]/page.tsx`. |
| Riêng tư | Số đo không vào log, không gửi FASHN/bên thứ ba, xóa khi khách bấm "Xóa số đo" hoặc xóa tài khoản. |

## 10. Chi phí

Mỗi cặp (người mẫu, sản phẩm) chạy FASHN một lần rồi dùng lại. Theo giá FASHN v1.6 đã tra trước đây (~$0.075/lần, **chưa kiểm ở trang chính thức**):

| Sản phẩm thử đồ được | Số lần chạy (× 24) | Ước tính |
|---|---|---|
| 12 | 288 | ≈ $22 |
| 50 | 1 200 | ≈ $90 |

Chạy theo nhu cầu (write-through) nghĩa là chỉ tốn cho cặp khách thật sự xem; prewarm vài sản phẩm chính cho luận văn. Chi phí sinh 24 ảnh người mẫu: vài chục ảnh ứng viên × 1–3 credit, nhỏ so với bảng trên. Phần gợi ý size không tốn gì.

## 11. Lộ trình và tiêu chí xong

Phần size và phần người mẫu độc lập nên có thể làm song song; làm size trước vì có giá trị ngay và không rủi ro.

| GĐ | Việc | Xong khi |
|---|---|---|
| 0 | **Thử nghiệm bỏ đi (người mẫu):** 4 ảnh ở 4 góc (nam/nữ × gầy/lớn) × 2 áo = 8 lần chạy (≈ $0.6) | Xem bằng mắt: dáng người giữ nguyên, áo tự nhiên trên cả người gầy lẫn người lớn. **Không đạt thì bỏ phần B, giữ phần A.** |
| 1 | `sizing/` thuần (BMI, ease, nhãn, độ tin cậy, thiếu dữ liệu) + unit test | ≥ 25 test pass; bảng ví dụ ra đúng kết quả viết tay |
| 2 | 24 ảnh + manifest + hàm chọn ảnh thuần + test | ≥ 15 test (BMI, khoảng cách, ngoài vùng phủ, giới tính); mỗi ảnh qua checklist 7.3 |
| 3 | Migration + endpoint + validate `size_chart` + `mannequin_id` + cache ghi khi chạy + prewarm | CI xanh, migration round-trip sạch; chạy mock engine và 1 lần thật với FASHN |
| 4 | UI khách (Tìm size, tab người mẫu, Số đo của tôi, nhãn trong try-on) + UI admin sửa bảng size | vitest + chạy tay đủ luồng: ẩn danh, đã đăng nhập, ngoài vùng phủ, sản phẩm thiếu bảng size |
| 5 (tùy chọn) | Thống kê admin (size gợi ý vs size thực mua); đo từ ảnh bằng pose | Đo ảnh: so với 10 người đo thật, sai số trung bình ≤ 3 cm |

Đánh giá cuối phần size: 10–20 ca có số đo thật + size đang mặc; mục tiêu ≥ 75 % trùng size, ≥ 95 % lệch tối đa 1 size.

## 12. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| VTON không giữ dáng người mẫu (mọi người trông cùng cỡ) | GĐ0 kiểm bằng mắt trước khi làm tiếp |
| BMI không nói hết dáng người (cơ bắp, mỡ bụng, vai rộng) | Ghi "ảnh minh họa"; cho đổi ảnh khác; cho tải ảnh riêng |
| Khách không thấy "chính mình" (phản ứng kiểu Taobao với người mẫu chung) | Người mẫu là chế độ phụ, ghi rõ không phải ảnh của khách; tải ảnh vẫn là chính |
| Ảnh AI không đúng dáng đã gán nhãn | Kiểm tay từng ảnh; ghi chiều cao/BMI theo ảnh thật |
| Công thức BMI → số đo sai với dáng khác nhau | Hiển thị là "gợi ý" + độ tin cậy; cho nhập số đo thật; đo trên bộ ca thật ở GĐ cuối |
| Bảng size shop nhập sai/thiếu | Validate + admin editor; thiếu thì ẩn tính năng |
| Khách kỳ vọng ảnh đổi theo size | Ghi rõ: ảnh minh họa kiểu dáng, nhãn chữ mới nói về độ vừa |
| Nén lại ảnh người mẫu hoặc đổi ảnh áo làm mất cache | Lưu byte đã chuẩn hóa một lần; đổi ảnh áo thì chạy lại |
| Chi phí tăng khi thêm sản phẩm | Write-through + chỉ prewarm sản phẩm chính |
| Dữ liệu cơ thể nhạy cảm | Consent riêng, xóa được, không log, không gửi bên thứ ba |

## 13. Nguồn tham khảo

Nhiều con số về chi phí và giấy phép lấy từ trang dự án hoặc bên thứ ba; đọc lại điều khoản trước khi dùng cho sản phẩm thật.

- Điều khiển thân hình khi thử đồ: không paper nào dùng BMI trực tiếp. Có COTTON (ICCV 2023), SV-VTON ([arXiv 2504.00562](https://arxiv.org/abs/2504.00562), mặt nạ nhiều size), FIT/FIT-VTO (Karras và cộng sự, nhận số đo áo + người). VTON diffusion tiêu chuẩn bỏ qua size. Google nêu rõ try-on không phải hướng dẫn chọn size.
- Thân người tham số: [SHAPY](https://arxiv.org/abs/2206.07036) (ánh xạ số đo → SMPL-X); baseline hồi quy chiều cao/cân nặng ([PMC8914647](https://pmc.ncbi.nlm.nih.gov/articles/PMC8914647/)); BMI cực đoan khó ước lượng ([arXiv 2210.05667](https://arxiv.org/abs/2210.05667)).
- Giấy phép: SMPL-X chỉ phi thương mại (thương mại qua Meshcapade; mức giá từ ~1.500 €/năm chưa kiểm chứng). [BEDLAM](https://arxiv.org/abs/2306.16940) (271 dáng người) cũng đăng ký mới tải được, giấy phép nghiên cứu; chưa đọc nội dung điều khoản.
- Sinh ảnh điều khiển dáng (cần GPU, chưa xác minh có code/trọng số): [Buchheim và cộng sự, WACV 2025](https://arxiv.org/abs/2411.04724) (ControlNet + SMPL, huấn luyện trên SURREAL, không có số liệu độ chính xác trong tóm tắt), [PersonaCraft](https://arxiv.org/abs/2411.18068), [Odo / ChangeLing18K](https://arxiv.org/abs/2508.13065), [DiffBody](https://arxiv.org/abs/2401.02804), [DreamBarbie](https://arxiv.org/abs/2408.09126). Chưa tìm thấy bài nhắm riêng vào plus-size.
- FASHN: [model-create](https://docs.fashn.ai/api-reference/model-create).
- Ma-nơ-canh và dữ liệu tổng hợp: [Street TryOn](https://arxiv.org/abs/2311.16094), [Low-Barrier Dataset Collection](https://arxiv.org/abs/2506.10468). Chưa tìm thấy bài về "dùng ma-nơ-canh làm người mẫu cho thử đồ"; đây là cách làm thực dụng, không phải đề tài có sẵn.

## 14. Việc dành cho bạn quyết

1. Xác nhận hướng (b): 24 ảnh dựng sẵn chọn gần nhất, không tạo riêng mỗi khách.
2. Nguồn ảnh: AI sinh + chọn tay (đề xuất), người thật, hay stock?
3. Ngưỡng chiều cao/BMI ở 7.1: dùng đề xuất hay chỉnh theo khách của shop?
4. Có hỗ trợ quần/váy/đầm ngay (ảnh toàn thân) hay chỉ áo ở giai đoạn đầu?
5. Cho lưu số đo và lựa chọn người mẫu theo tài khoản (cần consent) hay chỉ tính tức thời?
