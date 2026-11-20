# Nghiên cứu tính năng thử áo 3D (3D Try-On) — cách dùng, thuật toán, kỹ thuật

> Tài liệu mô tả tính năng `/store/try-on-3d` trên branch `feat/tryon-3d-upper`: người dùng nhập 4 số đo cơ thể, hệ thống dựng một **manơcanh 3D tham số** và mặc lên đó **chiếc áo đúng kích thước theo bảng size** của sản phẩm.
> Đây là **bản xem trước trực quan** về độ vừa, không phải công cụ chọn size chính xác. Mọi con số, tên hàm và hằng số trong tài liệu được đối chiếu với mã nguồn trong `frontend/lib/demo-upper/` và `frontend/components/demo-upper/`.

---

## 0. Tóm tắt để trình bày (đọc phần này trước)

### 0.1 Trả lời trong 30 giây

> Khách nhập 4 số đo cơ thể. Trình duyệt **tự dựng một manơcanh 3D bằng công thức toán** (không dùng AI, không dùng mô hình 3D có sẵn), rồi mặc lên đó **chiếc áo có đúng kích thước trong bảng size** của sản phẩm. Hệ thống so bán kính áo với bán kính cơ thể ở từng điểm: áo nhỏ hơn người thì tô đỏ và báo "chật", áo lớn hơn thì báo độ rộng. **Backend chỉ cấp dữ liệu** (thông tin sản phẩm, bảng size, ảnh); **toàn bộ tính toán và dựng hình chạy ở trình duyệt.**

Ba điểm cần nhấn mạnh:

| Điểm | Nội dung |
|---|---|
| Không dùng AI/ML | Mọi bước là thuật toán hình học và xử lý ảnh kinh điển, kết quả xác định (cùng input luôn cho cùng hình). |
| Không thêm API mới | Dùng lại các endpoint sẵn có của module sản phẩm (mục 0.2). |
| Trung thực về giới hạn | Đây là **bản xem trước trực quan**, không phải công cụ chọn size chính xác; các giả định được ghi rõ ở mục 10. |

### 0.2 API được sử dụng

**Không có API AI, không có dịch vụ 3D bên ngoài.** Tính năng chỉ gọi 4 nhóm sau, đều là API của chính dự án:

| # | Endpoint | Ai gọi | Gọi ở đâu (mã nguồn) | Dùng để làm gì |
|---|---|---|---|---|
| 1 | `GET /products/by-slug/{slug}` | Khách (không cần đăng nhập; admin nhận bản đầy đủ hơn) | Frontend: `TryOn3DPage.tsx:36-41` (`apiGet<Product>`). Backend: `products/router.py:192-196` (`get_product_by_slug`, dùng `get_current_user_optional`) | Lấy **bảng size** (`size_chart`), **danh sách variant** (màu, size còn bán), **ảnh** (`images`) và **giới tính** (`gender`) của sản phẩm cần thử |
| 2 | `POST /products/{id}/upload-image` | Admin | `components/admin/angle-slots.tsx:38-42` (`apiUpload`, gửi kèm `kind` và `sort_order`) | Tải lên 4 ảnh góc nhìn (trước / 45° / bên / sau) của áo |
| 3 | `DELETE /products/{id}/images/{image_id}` | Admin | `angle-slots.tsx:49`, `:68` (`apiDelete`) | Thay hoặc xoá ảnh góc nhìn |
| 4 | `GET /products/size-chart-presets` và `GET /products/size-chart-preset` | Admin | `components/admin/size-chart-editor.tsx:80`, `:97-99` | Gợi ý bảng size mẫu theo loại đồ/giới tính khi nhập sản phẩm, để sản phẩm có sẵn dữ liệu cho 3D |

Kèm theo là **một cơ chế không phải API**: ảnh nằm trong MinIO (khác origin) nên canvas của trình duyệt sẽ bị "tainted" và không đọc được pixel. `toSameOriginImage` (`productFit.ts:113`) đổi URL sang `/storage/<bucket>/...`, và Next.js chuyển tiếp (rewrite) về MinIO (`next.config.mjs:46-48`), nhờ đó ảnh cùng origin và đọc pixel hợp lệ.

Bảo vệ dữ liệu phía backend (liên quan trực tiếp tới 3D):

- `validate_size_chart` (`products/schemas.py:98-116`): tối đa 30 size, mỗi size tối đa 20 số đo, tên size 1–20 ký tự, mỗi số đo phải là số **dương** và ≤ `MAX_SIZE_CHART_VALUE` (1000); từ chối cả giá trị boolean.
- Ảnh góc `vton_garment` phải có cạnh nhỏ nhất ≥ 256 px (`products/images.py:22`, `:181`); các ô góc được nhận diện bằng cặp `(sort_order, kind)` (`images.py:25`, khớp `ANGLE_SLOTS` ở `productFit.ts:133`).

### 0.3 Vận hành từng bước (từ lúc khách bấm đến lúc thấy hình)

```
① Khách bấm "3D fit check" ở trang sản phẩm
     → mở /store/try-on-3d?product=<slug>&color=<màu>&size=<size>
       (app/store/products/[slug]/page.tsx:510)

② Trang 3D gọi API #1 lấy sản phẩm                      (TryOn3DPage.tsx:36)
     Hiện "Loading" cho tới khi có dữ liệu; lỗi → rơi về áo mẫu

③ Chuẩn hoá dữ liệu sản phẩm → ProductFit                (productFit.ts: resolveProductFit)
     parseSizeChart / rowToGarment : size_chart JSON → kích thước áo (cm)
     fitSizeOptions                : size nào đang bán theo màu đã chọn
     pickColorPhotos               : chọn ảnh 4 góc theo màu

④ Tải ảnh qua /storage/... và xử lý pixel (client)       (components/demo-upper/useGarmentPhotos.ts)
     thu nhỏ ≤ 1024 px → getImageData → garmentMask (tách nền)
     → classifyViews (đoán góc nếu chưa đặt đúng ô) → texture

⑤ Khách nhập 4 số đo                                      (measurementValidation.ts)
     kiểm tra / ép khoảng → luôn ra số hợp lệ

⑥ Dựng cơ thể                                              (bodyGeometry.ts → bodyField.ts → surfaceNets.ts)
     mặt cắt superellipse → PCHIP → trường ẩn → mesh

⑦ Dựng áo và so với cơ thể                                (garmentGeometry.ts, fitHints.ts)
     áo theo bảng size → áp lực = bán kính thân − bán kính áo
     → tô đỏ chỗ chật + chữ gợi ý

⑧ Vẽ ảnh sản phẩm lên áo                                  (photoRegistration.ts, photoMaterial.ts)
     căn ảnh từng hàng → shader trộn 4 ảnh theo hướng nhìn

⑨ Hiển thị                                                 (UpperBodyScene.tsx)
     three.js / React Three Fiber, 1 canvas chung cho 5 khung nhìn
     đang gõ số: lưới thô 1.2 cm → sau 250 ms mới dựng lưới mịn 0.85 cm
```

**Điều quan trọng cần nói:** sau bước ②, **không còn request nào lên server nữa** (trừ việc tải ảnh). Gõ số đo hay xoay hình đều xử lý hoàn toàn ở máy khách, nên phản hồi tức thì và không tốn tài nguyên backend.

### 0.4 Mỗi vấn đề được giải bằng thuật toán nào

| Vấn đề cần giải | Thuật toán / kỹ thuật | Vì sao chọn | Mã nguồn |
|---|---|---|---|
| Từ vòng ngực 92 cm, dựng mặt cắt có **chu vi đúng 92 cm** | **Superellipse** + giải chu vi dạng đóng (chu vi tỉ lệ tuyến tính với bán trục) | Ra nghiệm chính xác bằng **một phép chia**, không cần tìm nghiệm lặp | `ellipse.ts:41-53` |
| Nối các mặt cắt (vai → ngực → eo → hông) thành thân liền mạch | **PCHIP** (Fritsch–Butland), nội suy bậc ba đơn điệu | Không phình, không lõm giả, không "bậc thang" như nội suy tuyến tính | `ringInterpolation.ts:8-13` |
| Nối thân, tay, vai thành **một khối** không lộ đường ghép | **Trường ẩn** (implicit field) + **smooth-min** | Gộp hình bằng phép toán trên hàm nên chỗ nối tự mượt | `bodyField.ts:27-29`, `:144` |
| Biến hàm toán thành **lưới tam giác** để vẽ | **Naive Surface Nets** + xử lý yên ngựa + chiếu Newton | Cho lưới kín, ít đỉnh, pháp tuyến mượt; dễ tăng tốc bằng bỏ qua vùng xa | `surfaceNets.ts:36-67` (yên ngựa), `:90` (`surfaceNets`), `:182-198` (chiếu Newton) |
| Kiểm chứng số đo trên **chính hình đang hiển thị** | **Ray casting** 180 tia + chia đôi tìm bề mặt + tính chu vi polygon | Đo như thợ may dùng thước dây, không tin công thức | `bodyField.ts:192` (`measureGirth`) |
| Xác định áo **chật hay rộng** ở từng điểm | **Áp lực** = bán kính thân − bán kính áo (cm) | Đại lượng vật lý rõ nghĩa, kiểm chứng được | `garmentGeometry.ts:140-143` |
| Áo nhỏ hơn người bị chìm vào thân, nhấp nháy | **pushOut**: đẩy bề mặt áo ra 0.3 cm, **chỉ để hiển thị** | Số liệu chật/rộng vẫn tính từ cỡ thật, không bị làm đẹp | `garmentGeometry.ts:91-102`, `:11` |
| Phân loại "chật / vừa / rộng" | Ngưỡng chênh lệch (< 0, < 4, ≤ 12, > 12 cm) | Quy tắc đơn giản, giải thích được | `fitHints.ts:22-25` |
| **Tách nền** ảnh áo, không dùng AI | **Flood fill** từ viền + vá khe + **bào mòn viền** | Ảnh sản phẩm thường nền trơn nên cách này đủ, nhẹ, chạy ngay ở trình duyệt | `garmentPhotos.ts:30-74` (`garmentMask`, `erodeMask` ở dòng 81) |
| Đoán ảnh là góc nào khi admin chưa đặt đúng ô | **Heuristic** theo tỉ lệ khung và độ đối xứng gương của hình bóng | Không cần nhãn, không cần mô hình | `garmentPhotos.ts:183` |
| Ảnh phẳng không khớp hình 3D | **Căn ảnh từng hàng ngang** (128 hàng) giữa viền ảnh và viền mesh | Chiếu thẳng sẽ lệch tay áo và thân | `photoRegistration.ts` (`registerPhoto`) |
| Vẽ nhiều ảnh lên áo, hoạ tiết **đứng yên khi xoay** | **Shader** trộn 4 ảnh theo hướng pháp tuyến, trọng số `pow(facing, 9)` | Mỗi điểm giữ trọng số riêng, không phụ thuộc camera | `photoMaterial.ts:54-55` |
| Gõ số mà hình không giật | Lưới thô → lưới mịn sau 250 ms, `useDeferredValue`, bỏ qua khối xa | Giữ giao diện mượt trên máy yếu | `UpperBodyScene.tsx:85-87`, `TryOn3DPage.tsx:72` |

### 0.5 Ví dụ có số liệu cụ thể

**Ví dụ 1: dựng mặt cắt ngực.** Người dùng nhập vòng ngực **92 cm**. Tỉ lệ sâu/rộng của mặt cắt ngực là 0,76 và độ "vuông" `n = 2,3` (`BODY_EXPONENT`, `bodyGeometry.ts:10`). Với 96 điểm mẫu, chu vi polygon của hình đơn vị `a = 1` là ≈ **5,697**. Suy ra:

```
a = 92 / 5,697 ≈ 16,15 cm   (nửa bề rộng ngực  → rộng ≈ 32,3 cm)
b = a × 0,76  ≈ 12,27 cm   (nửa bề sâu ngực    → sâu  ≈ 24,5 cm)
chu vi polygon kiểm lại = 92,000 cm
```

Không có bước thử-sai nào: một phép chia cho đúng đáp án.

**Ví dụ 2: đọc độ vừa.** Người nhập ngực 92 cm; số đo áo bên dưới là ví dụ minh hoạ, bảng size thật do admin nhập cho từng sản phẩm.

| Áo chọn | Vòng ngực áo | Chênh lệch (áo − người) | Kết quả hiển thị |
|---|---|---|---|
| Size S (giả định), ngực 88 cm | 88 | **−4 cm** | "Tight for your measurements"; áp lực +4 cm; ≥ 3 cm nên đỏ đạt mức tối đa (hoà 62 %) |
| Size M (giả định), ngực 96 cm | 96 | **+4 cm** | "Regular fit" |
| Size L (giả định), ngực 106 cm | 106 | **+14 cm** | "Relaxed fit" |

Nếu giảng viên hỏi "con số đó ở đâu ra": ngưỡng nằm ở `fitHints.ts:22-25`, phép giải chu vi ở `ellipse.ts:41-53`; test tương ứng là `tests/demo-upper/fitHints.test.ts` và `ellipse.test.ts`.

### 0.6 Cách chứng minh khi bảo vệ

- **Chứng minh không dùng AI/API ngoài:** mở DevTools → tab Network tại `/store/try-on-3d?product=<slug>`. Chỉ thấy `GET /products/by-slug/...` và các ảnh `/storage/...`; gõ số đo thì **không phát sinh request nào**.
- **Chứng minh thuật toán đúng:** chạy lệnh dưới (trong `frontend/`). Bộ `tests/demo-upper` gồm 8 file, **193 test đều đạt** (đã chạy), phủ: chu vi giải đóng, ngưỡng độ vừa, tách nền, bảng size, kiểm tra số đo đầu vào và các ca đầu vào xấu (`abuse-3d.test.ts`).

  ```powershell
  npx vitest run tests/demo-upper
  ```

---

## 1. Tổng quan

### 1.1 Bài toán

Khách mua áo online không biết áo size M "ôm" hay "rộng" trên người mình. Tính năng này trả lời bằng hình ảnh:

1. Người dùng nhập **chiều cao, vòng ngực, vòng eo, rộng vai**.
2. Hệ thống dựng manơcanh khớp số đo.
3. Áo của size đang chọn được mặc lên **với đúng kích thước trên bảng size** (không co giãn cho vừa).
4. Chỗ nào áo nhỏ hơn cơ thể được **tô đỏ** và liệt kê bằng chữ; chỗ nào rộng thì hiện độ dư.

### 1.2 Nguyên tắc thiết kế

| Nguyên tắc | Ý nghĩa |
|---|---|
| **Kích thước áo là bất biến** | `GarmentSize` lấy từ bảng size, không bao giờ bị ghi đè theo thân người. Áo nhỏ hơn người → báo "chật", không kéo giãn. |
| **Mọi thứ đo trên lưới thật** | Vòng ngực/eo/hông của manơcanh được đo lại từ mesh đang hiển thị (`measureBody`), không tin vào công thức. |
| **Không có dữ liệu bịa** | Hint chỉ là chữ (Tight/Close/Regular/Relaxed), không có phần trăm tin cậy. Trường nhập sai → "Not enough data". |
| **Không crash khi nhập bậy** | Mọi input được ép vào khoảng hợp lệ, số vô hạn/NaN không bao giờ tới renderer. |
| **Thuần hàm, dễ test** | Phần hình học và xử lý ảnh là hàm thuần (không cần canvas/WebGL) → test bằng vitest. |

### 1.3 Công nghệ

- **three.js** + **React Three Fiber** + **drei** (`View`, `OrbitControls`, `PerspectiveCamera`).
- **Next.js** (App Router), route `/store/try-on-3d` (`app/store/try-on-3d/page.tsx`).
- **vitest** cho test; không có thư viện vật lý vải, không có mô hình ML — toàn bộ là hình học tính toán.
- Không đụng backend: sản phẩm được đọc qua `GET /products/by-slug/{slug}` (có sẵn), không có endpoint mới.

### 1.4 Kiến trúc tổng thể

```
Số đo (4 trường) ──► validateMeasurements ──► buildBodyModel ──► BodyModel (key rings + 2 tay)
                                                     │
                                                     ▼
                                  createBodyField  (trường khoảng cách ẩn, SDF-like)
                                     │                      │
                       surfaceNets ◄─┘                      └─► pushOut / pressure / measureGirth
                           │                                          │
                     Mannequin mesh                 Bảng size ─► buildGarmentModel ─► buildGarmentDisplay
                                                                                         │
                                          Ảnh sản phẩm ─► garmentMask ─► registerPhoto ──┤
                                                                                         ▼
                                                              buildGarmentGeometry + photoMaterial (shader)
                                                                                         │
                                                              UpperBodyScene: 1 canvas, 5 viewport (1 chính + 4 góc)
```

Các file chính:

| Nhóm | File (`frontend/lib/demo-upper/`) | Vai trò |
|---|---|---|
| Số đo | `measurementValidation.ts`, `demoPresets.ts` | Kiểm tra / ép khoảng giá trị, preset thân hình |
| Cơ thể | `bodySections.ts`, `bodyGeometry.ts`, `bodyField.ts`, `ellipse.ts`, `ringInterpolation.ts` | Mô hình tham số, trường ẩn, đo vòng |
| Lưới | `surfaceNets.ts`, `ringsToGeometry.ts`, `geometryDiagnostics.ts` | Dựng mesh, kiểm tra mesh |
| Áo | `garmentGeometry.ts`, `fitHints.ts` | Áo theo bảng size, áp lực, màu cảnh báo, gợi ý chữ |
| Sản phẩm | `productFit.ts`, `demoCatalog.ts` | Đọc size chart / ảnh / màu của sản phẩm thật |
| Ảnh → vải | `garmentPhotos.ts`, `photoRegistration.ts`, `photoMaterial.ts` | Tách nền, căn ảnh lên áo, shader trộn ảnh |
| Camera | `cameraAngles.ts` | 4 góc nhìn cố định |

UI nằm ở `frontend/components/demo-upper/` (`TryOn3DPage`, `UpperBodyScene`, `Mannequin`, `Tshirt`, `MeasurementsPanel`, `SizeSwitcher`, `FitHints`, `FourViewsPanel`, `BodyPresetButtons`, `useGarmentPhotos`).

---

## 2. Hướng dẫn sử dụng

### 2.1 Vào tính năng

- Menu **3D Try-On** trên header → `/store/try-on-3d`: hiển thị **áo mẫu** (Essential Crew-Neck Tee, size S/M/L).
- Từ trang chi tiết sản phẩm, nút **3D fit check** → `/store/try-on-3d?product=<slug>&color=<màu>&size=<size>`: mặc **đúng sản phẩm đó**, đúng màu và size đang chọn.

### 2.2 Nhập số đo

| Trường | Khoảng cho phép | Mặc định |
|---|---|---|
| Chiều cao | 150 – 195 cm | 170 |
| Vòng ngực | 78 – 120 cm | 92 |
| Vòng eo | 62 – 110 cm | 76 |
| Rộng vai | 36 – 50 cm | 42 |

- Chấp nhận dấu phẩy thập phân (`92,5`). Ô trống / không phải số / ngoài khoảng → hiện thông báo lỗi tại ô đó.
- Khi giá trị không hợp lệ, hình **giữ nguyên số hợp lệ gần nhất** (không nhảy về 0, không vỡ hình).
- Có 3 **preset** (Small / Medium / Broad; với nữ: Small / Medium / Large) và nút **Reset**.
- Dưới các ô có dòng "đo lại trên mesh": ngực / eo / hông đo từ chính manơcanh đang hiển thị. Chúng **gần bằng nhưng không trùng tuyệt đối** với số nhập (xem mục 4.3).

### 2.3 Chọn dáng người, màu, size

- **Mannequin form** (Women / Men): chỉ chọn được khi chưa gắn sản phẩm hoặc sản phẩm `unisex`; sản phẩm nam/nữ tự cố định dáng tương ứng. Mỗi dáng nhớ số đo riêng.
- **Màu**: chọn theo biến thể sản phẩm; áo lấy ảnh đúng màu đó (hoặc ảnh màu khác rồi nhuộm lại, xem 6.5).
- **Size**: `SizeSwitcher` liệt kê các size còn bật của màu đang chọn; size nào không có số đo trong bảng thì không chọn được.
- **Collar style**: *From product photos* / *Crew neck* / *Polo* (tự đoán polo từ tên, mô tả, danh mục hoặc hình dáng cổ trong ảnh).

### 2.4 Xem 3D

- **Khung chính**: kéo để xoay (OrbitControls, không pan, zoom giới hạn 1.1 – 3.4).
- **4 góc cố định** ở dải bên dưới: Front 0°, Angle 45°, Side 90°, Back 180°; bấm để đưa góc đó lên khung chính.
- **Show mannequin / Show tee** và hai thanh **opacity** (0.15 – 1): làm áo trong suốt để thấy áo ôm sát cỡ nào.

### 2.5 Đọc kết quả độ vừa

Panel **Fit guide** gồm:

- **Chest / Waist** — chênh lệch `vòng áo − vòng người` (cm):

  | Chênh lệch | Nhãn |
  |---|---|
  | < 0 | Tight for your measurements |
  | 0 – < 4 | Close fit |
  | 4 – 12 | Regular fit |
  | > 12 | Relaxed fit |

- **Shoulder** — `vai áo − vai người`: < −1 *Shoulders narrower than yours*; −1…3 *Shoulders fit*; > 3 *Drop shoulder*.
- **Cảnh báo chữ** khi chật, ví dụ "Size S is 6 cm smaller than your chest…".
- **Vùng chật** (shoulder / chest / waist / hem / sleeve) và **tô đỏ trên áo** — màu đỏ đậm dần theo độ chật, đạt tối đa khi chật ≥ 3 cm.

### 2.6 Chuẩn bị dữ liệu sản phẩm (cho admin)

Để áo hiển thị đúng ảnh thật, mỗi **màu** cần tối đa 4 ảnh "chỉ có áo" (không người, không bảng size). Cách đặt vào 4 ô góc nhìn dùng các `kind` sẵn có của backend:

| Ô góc nhìn | `kind` | `sort_order` |
|---|---|---|
| Front | `vton_garment` | 900 |
| 45° | `flat_lay` | 901 |
| Side | `catalog` | 902 |
| Back | `catalog` | 903 |

- Ảnh không nằm trong ô nào (sản phẩm cũ) → hệ thống **đoán góc từ hình bóng** (mục 6.3). Tối đa 3 ảnh đoán.
- Ảnh trong các ô này **bị ẩn khỏi carousel cửa hàng** (`storefrontGallery`) để không lẫn ảnh dựng hình với ảnh bán hàng.
- Bảng size (`size_chart`) nhận 2 dạng: `{unit, measurements:[{size, chest,…}]}` hoặc `{S:{chest:92,…}}`; đơn vị `cm` hoặc `inch`; ô có thể là số, `"96 cm"`, `"94-98"` (lấy trung bình). Sản phẩm chưa có bảng size → dùng bảng mẫu và hiện thông báo.

---

## 3. Thuật toán dựng cơ thể

### 3.1 Từ 4 số đo đến "mặt cắt khoá" (key rings)

`buildBodyModel(measurements, form)` tạo thân người từ các **mặt cắt ngang** tại những độ cao giải phẫu. Độ cao tính theo tỉ lệ so với chiều cao `H`, gốc y = 0 tại điểm cổ-vai (HSP), y giảm dần xuống dưới (`bodySections.ts`):

| Mốc | Tỉ lệ × H |
|---|---|
| Vai (shoulder) | −0.03 |
| Nách (armpit) | −0.075 |
| Ngực (chest) | −0.105 |
| Dưới ngực (underbust) | −0.17 |
| Eo (waist) | −0.25 |
| Hông (hip) | −0.31 |
| Đáy (base) | −(0.31 + 0.035) |

Dáng nữ dùng bộ mốc riêng (ngực −0.116H, eo −0.232H, đáy −0.36H để hông nở ra như thật).

Vòng hông **không nhập**, được suy ra: `hip = 0.55·ngực + 0.5·eo` (+14 cm với dáng nữ). Bán kính tay và chiều dài tay cũng suy ra: `armRadius = clamp(4.1 + (ngực−92)·0.035, 3.4, 5.4)`, `armLength = 0.3·H`.

> **Giả định rõ ràng:** các tỉ lệ này là giá trị trung bình giả định, không phải quét cơ thể. Hai người cùng 4 số đo có thể có thân hình khác nhau.

### 3.2 Mặt cắt superellipse với chu vi giải đóng

Mỗi mặt cắt là **superellipse**: `|x/a|ⁿ + |z/b|ⁿ = 1`, bán kính cực tại góc θ:

```
r(θ) = ( (|cosθ|/a)ⁿ + (|sinθ|/b)ⁿ )^(−1/n)
```

- `n = 2` là ellipse; thân dùng `n = 2.3` (`BODY_EXPONENT`) cho dáng tự nhiên, không "tròn như ống", áo dùng `n = 2.6` (`TORSO_EXPONENT`).
- Mỗi mặt cắt lấy mẫu **96 điểm** (`RING_SEGMENTS`) — đủ để sai số chu vi polygon ≪ 0.5 cm.
- Tỉ lệ sâu/rộng (`b/a`) cố định theo mặt cắt: nách 0.72, ngực 0.76, dưới ngực 0.75, eo 0.75, hông 0.72.

**Giải chu vi mà không cần lặp.** Cần tìm bán trục `a` để chu vi polygon bằng đúng số đo. Vì tỉ lệ `b/a` cố định, polygon co giãn đồng dạng khi `a` đổi, nên chu vi **tỉ lệ tuyến tính với `a`**:

```
a = perimeterCm / polygonPerimeter(superellipseRadii(1, depthRatio, n))
```

→ nghiệm đóng, sai số chỉ còn sai số dấu phẩy động (`solveSuperellipse`). Chu vi là chu vi **polygon thật** (`polygonPerimeter`, tổng độ dài các cạnh), không phải công thức xấp xỉ Ramanujan — vì thứ được kiểm tra chính là thứ được vẽ.

### 3.3 Hiệu chỉnh ngực: bust lobe

Mặt cắt ngực được nhân thêm hệ số ở phía trước (`sinθ > 0`) với một **lobe Gauss** quanh hai điểm ngực (`|cosθ| ≈ 0.5`); dáng nữ đầy hơn nam (0.05 + 0.29·lobe so với 0.025 + 0.08·lobe). Sau đó mặt cắt được **chia lại tỉ lệ** để chu vi vẫn đúng bằng số ngực người dùng nhập:

```
scale = chestCm / polygonPerimeter(shaped);   radii = shaped · scale
```

### 3.4 Nội suy giữa các mặt cắt: PCHIP

Giữa các mặt cắt khoá, bán kính theo từng góc được nội suy bằng **PCHIP** (Fritsch–Butland, `ringInterpolation.ts`):

- Nội suy Hermite bậc ba với độ dốc tại nút `m = (w1 + w2) / (w1/d0 + w2/d1)` (trung bình điều hoà có trọng số), bằng 0 tại cực trị cục bộ.
- **Đơn điệu và không overshoot**: bán kính ở giữa không bao giờ vượt hai nút kề. So với smoothstep từng đoạn, PCHIP không tạo "bậc thang" tại mỗi mặt cắt nên cổ → vai → ngực → eo chảy liền mạch.
- Ngoài khoảng, trả về mặt cắt biên.

### 3.5 Hiệu chỉnh nhỏ cho tự nhiên

- `torsoShapeFactor`: ngực đầy hơn ở phía trước (+3.5 % Gauss quanh mức ngực), lưng trên phẳng hơn (−2.5 % quanh nách). Hệ số là hàm lẻ theo `sinθ` nên chu vi chỉ đổi bậc hai (< 0.3 %).
- `torsoCenterZ`: trục thân dịch về phía trước (cổ nghiêng ~1.2 cm, eo cong +0.9, lưng dưới −0.6).
- Tay: **tư thế A-pose** 15° (dáng nữ +6°), bán kính theo `ARM_PROFILE` (cơ delta → bắp tay → khuỷu → cẳng tay → cổ tay) nội suy smoothstep, hai đầu tay bo tròn.
- Với ngực to, vai hẹp, gốc tay được đẩy ra vừa đủ để tay không lún vào lồng ngực.

---

## 4. Trường khoảng cách ẩn (implicit field) và dựng lưới

### 4.1 Vì sao dùng trường ẩn thay vì ghép ống

Nếu mỗi bộ phận (thân, tay, vai) là một mesh riêng cắm vào nhau, chỗ nối vai/nách/cổ sẽ lộ đường giao cắt. Thay vào đó, toàn bộ manơcanh là **một hàm vô hướng** `full(x, y, z)` — âm bên trong, dương bên ngoài, gần với **khoảng cách có dấu** (SDF) — rồi dựng mesh **một lần** từ hàm đó. Các bộ phận hoà vào nhau bằng phép toán trên trường nên chỗ nối liền mạch.

### 4.2 Thành phần của trường (`bodyField.ts`)

1. **Thân (`torso`)**: tra bảng. Với mỗi độ cao, bảng `table[row × 96 góc]` chứa bán kính đã nhân `torsoShapeFactor`; bước hàng 0.25 cm; có thêm bảng độ dốc `slope`. Khoảng cách xấp xỉ:
   ```
   d = (ρ − R(θ, y)) / √(1 + R'(y)²)
   ```
   Chia cho `√(1+R'²)` để giá trị gần khoảng cách thật ở vùng vai dốc. Hai đầu cắt bằng `smax` bo tròn (cổ 1.4 cm, đáy 5 cm).
2. **Tay (`armDistance`)**: khoảng cách tới một đường trục có bán kính thay đổi, thêm độ cong nhẹ ở cẳng tay (`bend`) và **bàn tay** gồm lòng bàn tay, ngón, ngón cái (3 ellipsoid ghép bằng `smin`).
3. **Vai**: một ellipsoid ở gốc tay, làm tròn mỏm vai.
4. **Rãnh đáy (`notch`)**: một khe nông để đế hông đọc được từ hai bên.

**Smooth-min đa thức:**

```
smin(a, b, k) = min(a, b) − h²·k/4,   h = max(k − |a − b|, 0) / k
```

Bằng `min(a, b)` khi `|a − b| ≥ k`, nên chỉ làm trơn ở vùng giao — dùng để hoà tay vào thân (`ARM_BLEND_CM = 1.8`) và lấp nách. `smax(a, b, k) = −smin(−a, −b, k)` dùng để bo mép cắt.

Trường còn xuất ra hai biến thể cho phần áo: `torsoSurface` (thân + chỗ hoà vai/nách) và `armSurface(arm)` (một tay) — đây là các bề mặt mà thân áo / tay áo phải "né".

### 4.3 Đo vòng trên mesh thật (`measureGirth`)

Để kiểm chứng số đo, hệ thống đo như thợ may dùng thước dây:

- Bắn **180 tia** từ trục thân ra ngoài ở độ cao `y`; mỗi tia tiến từng 0.5 cm tới khi trường dương rồi **chia đôi 30 lần** để tìm bề mặt;
- Nối các bán kính thành polygon → `polygonPerimeter`.

`measureBody` trả `chestCm / waistCm / hipCm` đo từ chính hình đang hiển thị. Vì có tô trơn, hiệu chỉnh ngực và hoà tay, giá trị này **gần bằng nhưng không bằng tuyệt đối** số nhập — và giao diện nói rõ điều đó.

### 4.4 Dựng lưới: Naive Surface Nets (`surfaceNets.ts`)

Từ trường `full`, mesh được dựng bằng **Naive Surface Nets** trên lưới đều bước `0.85 cm` (`MESH_STEP_CM`; xem trước dùng `1.2 cm`):

1. **Lấy mẫu theo khối + bỏ qua vùng xa.** Chia lưới thành khối 4×4×4. Lấy mẫu tâm khối; nếu `|f(tâm)| > 1.5·B·step·√3/2` thì khối chắc chắn không chứa bề mặt (trường tăng tối đa ~1 cm mỗi cm) → điền cả khối bằng giá trị tâm, **không gọi hàm trường cho từng điểm**. Giảm mạnh số lần tính trường vì phần lớn thể tích là không khí.
2. **Giải yên ngựa (saddle).** Mặt lưới có 4 góc đổi dấu xen kẽ (`+ − + −`) làm hai ô kề nhau nối bằng 4 quad quanh một cạnh (cạnh non-manifold, hay có tam giác lật). Hệ thống xét **tâm song tuyến của mặt**: nếu tâm âm → nối phần trong, ngược lại tách; sau đó đẩy góc yếu nhất của phía thua qua 0 một lượng `1e-4` (dưới 1 mm). Lặp tối đa 4 vòng.
3. **Một đỉnh mỗi ô bị cắt**, đặt ở trung bình các giao điểm trên cạnh (nội suy tuyến tính `t = v0 / (v0 − v1)`).
4. **Một quad mỗi cạnh lưới bị cắt**, thứ tự đỉnh chọn sao cho pháp tuyến hướng ra ngoài (theo hướng trường dương).
5. **Chiếu Newton.** Mỗi đỉnh được dời tối đa 4 bước về mặt `f = 0`: `x ← x − g·f/|g|²`, bước bị kẹp ≤ `0.3·step` và đỉnh không được lệch quá `0.2·step` so với vị trí ô ban đầu (nếp gấp hẹp có thể làm quad kề bị gập nếu đi hết bước Newton).
6. **Pháp tuyến = gradient của trường** (sai phân trung tâm, `eps = 0.05`), nên ánh sáng mượt mà không bị "mặt khối". Gradient của bước Newton cuối được dùng lại làm pháp tuyến để tiết kiệm 6 lần gọi trường.

Kết quả: một mesh kín, có chỉ số, hướng mặt nhất quán, không có đường nối giữa các bộ phận.

### 4.5 Kiểm tra mesh (`geometryDiagnostics.ts`)

`diagnoseGeometry` đếm số đỉnh, số tam giác, **giá trị không hữu hạn** (NaN/∞) và **tam giác suy biến** (diện tích ≤ 1e-10 m²). Test yêu cầu cả hai bằng 0 trên toàn bộ khoảng số đo hợp lệ.

---

## 5. Thuật toán mặc áo

### 5.1 Áo theo bảng size (`buildGarmentModel`)

Áo cũng là chuỗi mặt cắt khoá — **neck, shoulder, armpit, chest, waist, hem** — nhưng bán kính tính từ số đo áo, không phải thân người:

- Ngực áo: `solveSuperellipse(chestCircCm, 0.72)`; eo áo: `waistCircCm` với tỉ lệ 0.76; gấu: `hemCircCm`.
- Vai áo: `shoulderWidthCm / 2`.
- Độ dài áo xác định mức hem: `hemY = −lengthCm`.

Đây là **hình áo danh nghĩa**: đúng cỡ trên bảng, chưa xét cơ thể.

### 5.2 Áp lực vừa vặn (fit pressure)

Tại mỗi độ cao `y` và mỗi góc `i`:

```
pressure[y][i] = bodyRadius[y][i] − garmentRadius[y][i]       (cm)
```

- `> 0`: áo nhỏ hơn thân người → chật; `< 0`: độ dư.
- Áp lực **mờ dần quanh cổ** (`neckFade`): đường viền cổ ôm vào cổ theo thiết kế nên không bị coi là chật.
- Dưới đáy manơcanh (không có thân) → không có áp lực.
- Tỉ lệ điểm chật (`tightVertexFraction`) và các **vùng chật** (`zoneForY` chia theo mốc nách / dưới ngực / hông) được tổng hợp để báo cáo; tay áo có vùng `sleeve` riêng.

### 5.3 `pushOut`: chỉ để hiển thị, không đổi cỡ áo

Nếu áo nhỏ hơn người, bề mặt áo sẽ chìm vào thân và nhấp nháy (z-fighting). `pushOut` đẩy mỗi điểm áo ra theo tia từ trục cho tới khi trường thân đạt **khoảng hở hiển thị 0.3 cm**:

```
r ← r + (clearance − f(r)) + 0.01   (lặp tối đa 60 lần)
```

Bước nhảy bằng đúng "khoảng còn thiếu" nên — vì trường chỉ tăng ≤ ~1 cm mỗi cm — không bao giờ nhảy qua bề mặt. Quan trọng: **áp lực và cỡ áo được tính từ bán kính danh nghĩa, độc lập với bước đẩy này**, nên việc làm đẹp hình không làm sai số liệu.

### 5.4 Rủ vải theo thủ tục (procedural drape)

Vải thừa không phẳng. Với phần áo rộng hơn thân, bán kính được cộng thêm các thành phần điều hoà:

- Độ chùng `slack = min(2.15, (r − bodyR) · 0.68)`.
- Nếp dọc kiểu `cos(6θ + 0.9·sin 2θ + 0.018·y)` tăng dần từ nách xuống gấu (`drop = smooth01((underarmY − y)/16)`) — vải không được đỡ thì buông thành nếp dài.
- Nếp chéo ở khu vực nách, và **bớt phần dư ở vai** (`overhang`) để vai áo không phồng.

Đây là hiệu ứng trang trí xác định (không phải mô phỏng vải): cùng input luôn cho cùng hình.

### 5.5 Nâng điểm tiếp xúc (contact lift)

Áo thun co giãn bắc qua các chỗ lõm nông giữa hai điểm tiếp xúc. Với mỗi điểm đang chạm da, các lân cận được **nâng lên có suy giảm** (`falloff = 0.055·dy² + 0.08·di²`, tối đa 1.65 cm, phía trước nâng nhiều hơn), nhưng **bán kính đã đẩy ra được giữ làm cận dưới** để không xuyên thân.

### 5.6 Cổ áo, gấu, tay

- **Cổ tròn (crew)**: bo gân cổ theo `COLLAR_PROFILE` (6 điểm profile), bám theo đường viền cổ; cổ trước hạ thấp hơn cổ sau bằng công thức `rise = 0.55 − 2.3·front²`.
- **Cổ polo**: một vòng chân cổ (`poloStand`) cộng hai cánh cổ gập (`poloCollar`) tạo lưới riêng 5 hàng; cánh lấy mẫu theo bề mặt áo để tựa lên vai khi số đo thay đổi.
- **Gấu / lai tay**: `HEM_FOLD` gập vào trong 1.6 cm.
- **Tay áo**: một chuỗi vòng dọc trục tay, mở đầu bằng **vòm vai (cap)** 5 vòng chìm trong thân áo để không có "bậc thang" trên đỉnh tay; vị trí bắt đầu `t0 = clamp((vai áo − vai người)/2, −3, 6)` — áo rộng vai thì tay áo trượt xuống (drop shoulder). Bán kính miệng tay `= chestCirc × 0.36 / 2π`, thu nhỏ dần về cổ tay, có nếp nhẹ `sin(4θ + 0.07t)`.
- **Logo lưng**: một mác "TrueLook" đặt giữa vai và ngực phía sau (`backMarker`), cho biết đang nhìn mặt sau.

### 5.7 Màu cảnh báo chật (`pressureColors`)

Áp lực chuyển thành màu đỉnh: hoà từ màu vải sang đỏ `#b13d36`:

```
mix = smooth01(p / 3 cm) · 0.62
```

- Đỏ **tối đa 62 %** — vẫn thấy được vải bên dưới.
- Áp lực được **làm mờ 3×3** (đỉnh kề và hàng kề, trọng số 1-2-1) để không có đốm hay sọc.
- Ngực áo mẫu của gân cổ dùng tông tối hơn 6 %.

---

## 6. Dùng ảnh sản phẩm làm hoạ tiết áo

Mục tiêu: áo 3D có đúng màu, in, đường viền, cúc của sản phẩm thật, từ tối đa 4 ảnh phẳng.

### 6.1 Chọn ảnh (`productFit.pickColorPhotos`)

Thứ tự ưu tiên: ảnh của đúng màu đang chọn → ảnh chung (không gán màu) → ảnh của màu khác. Ảnh mượn từ màu khác sẽ **được nhuộm lại** (6.5). Chỉ lấy ảnh `vton_garment`, `flat_lay`, `catalog` (ảnh chỉ có áo).

### 6.2 Tách nền (`garmentMask`)

Làm trên buffer RGBA thuần, không cần canvas:

1. Màu nền = **trung bình viền ảnh** (`borderColor`).
2. **Flood fill từ viền** (stack): pixel có sai khác kênh lớn nhất ≤ 26 (`BACKGROUND_TOLERANCE`) so với nền, hoặc alpha < 16, là nền. Chi tiết sáng *bên trong* áo vẫn được giữ vì không nối với viền.
3. **Bắc cầu khe** (`bridge`): viền tương phản mỏng chạm nền ở hai đầu có thể bị cắt; các khe ngắn (≤ 1.8 % chiều cao / 1.2 % chiều rộng) giữa hai pixel áo được vá lại.
4. **Bào mòn 2 pixel** (`EDGE_TRIM`): pixel răng cưa viền là nửa nền, nếu giữ sẽ để lại quầng sáng trên áo.

Ảnh được thu nhỏ còn ≤ 1024 px cạnh dài trước khi xử lý. Ảnh quá trống (vùng áo < 5 % diện tích) bị loại.

### 6.3 Đoán góc nhìn từ hình bóng (`classifyViews`)

Khi ảnh không nằm trong ô góc, dựa vào hai số đo từ mask (`photoStats`): **tỉ lệ khung** (`aspect`) và **độ đối xứng gương** (`mirrorSymmetry` — tỉ lệ pixel áo mà điểm đối xứng qua trục giữa cũng là áo):

- **Side**: bóng hẹp nhất, nếu `aspect < 0.62 × aspect ảnh trước` (ảnh nghiêng mất bề rộng hai tay).
- **Back**: ảnh đối xứng nhất trong số còn lại (có hai ứng viên thì chọn đối xứng hơn; chỉ có một thì phải ≥ 0.86).
- **45°**: phần còn lại (một tay bị rút ngắn nên lệch).

Đây là heuristic — thứ tự ô góc do admin đặt luôn thắng.

### 6.4 Căn ảnh lên mesh (`registerPhoto`)

Chiếu thẳng không đủ vì bóng áo 3D không trùng bóng áo trong ảnh. Hệ thống **căn từng hàng ngang**:

1. Với 128 hàng (`ROWS`), đo mép trái–phải của áo trong ảnh (`tracePhotoRows`) và của mesh (quét cạnh tam giác qua từng hàng).
2. **Neo vạt tay** (`cuffRow`): tìm hàng có bề rộng co lại đột ngột (>8 % bề rộng lớn nhất) — đó là cổ tay áo. Cả ảnh và mesh được kéo giãn từng đoạn (trên/dưới vạt tay) cho khớp nhau theo chiều dọc.
3. Với mỗi đỉnh: toạ độ ngang `f` trong hàng mesh được ánh xạ sang cùng phần trăm trong hàng ảnh (`pl + (pr − pl)·f`); **vùng giữa thân** (cúc, cổ) lại pha về ánh xạ tuyến tính để không bị co giãn méo.
4. **Neo cổ tay**: ở góc trước/sau, cả vòng miệng tay được ép về mép dưới tay áo trong ảnh, để sọc/viền ở cổ tay không bị lệch khi đổi size.

Kết quả là các thuộc tính UV `garmentUv0…3` (và `garmentUvLeft45` — bản phản chiếu cho nửa trái góc 45°).

### 6.5 Shader trộn ảnh (`photoMaterial.ts`)

Một `MeshStandardMaterial` được vá bằng `onBeforeCompile`. Mỗi điểm bề mặt **tự giữ trọng số trộn của mình**, không phụ thuộc camera → khi xoay, hoạ tiết đứng yên trên áo, chỉ ánh sáng và phối cảnh đổi.

- Hướng nhìn của điểm (pháp tuyến pha 22 % hướng từ trục ra) được chia thành 4 trọng số: `facing = (z, (x+z)·√½, x, −z)` (trước, 45°, bên, sau), nâng luỹ thừa **9** và nhân với ảnh nào đang có (`uHas`).
- Mặt trước và sau được **độc quyền vùng giữa** (smoothstep 0.58–0.88) để chi tiết nằm ở hai ảnh không bị vẽ hai lần.
- Vùng yoke cổ lấy từ ảnh trước; miệng tay lấy hoà giữa trước/sau (`vCuffBlend`).
- Hướng không có ảnh **mờ dần về màu vải trung bình** (`uFallback`, trọng số 0.003) thay vì in logo mặt trước lên lưng.
- **Cân phơi sáng** mỗi ảnh về độ sáng tham chiếu, kẹp trong 0.8 – 1.25.
- **Nhuộm lại** (`tintPhoto`) khi dùng ảnh màu khác: pixel gần màu áo trung bình lấy màu đích nhưng giữ độ sáng tương đối (giảm 30 % để ảnh tối không ép nát màu sáng); pixel xa (in, viền, logo) được giữ nguyên.
- Màu đỏ cảnh báo chật vẫn đi qua vertex color: `tightMix = (r − g)/(r_tight − g_tight)`; vải được dựng màu trắng nên `r − g` chỉ mang thông tin áp lực, `g` mang độ tối của gân cổ.

### 6.4b Nhận dạng dáng áo từ ảnh

- `hasRaisedCollar`: cổ cao nếu phần trên cùng hẹp rồi nở dần vào vai (dấu hiệu polo).
- `isCompactFittedTee`: tỉ lệ khung ≥ 0.91, vạt tay ở 30–56 % chiều cao, eo < 97 % ngực, gấu > 102.5 % eo → áo thun nữ ôm ngắn; hình xem trước được thu gọn nhẹ (eo −5, gấu −4, dài −8, tay −3 cm). Trong trường hợp này **ẩn màu áp lực** vì hình dáng suy ra từ ảnh, không phải dữ liệu bảng size.

---

## 7. Từ bảng size đến `GarmentSize` (`productFit.ts`)

`rowToGarment` đọc một dòng bảng size, chịu được nhiều kiểu đặt tên (alias tiếng Anh/Việt: `chest/bust/nguc/vong_nguc`, `waist/eo`, `hem/gau`, `shoulder/vai`, `length/dai_ao`, `sleeve/dai_tay`; bỏ dấu, `đ → d`) và các tình huống thực tế:

- **Chiều rộng phẳng thay vì chu vi**: nếu `chest < 70` thì coi là nửa vòng và nhân đôi (cả eo, gấu).
- **Dải giá trị** `"94-98"` → trung bình; `"96 cm"`, dấu phẩy thập phân, inch (×2.54).
- **Số khổng lồ** (chuỗi 400 chữ số parse ra `Infinity`) bị loại — không bao giờ tới renderer.
- Dòng không có ngực hợp lệ (70–180 cm) → bỏ cả dòng.
- Thiếu hoặc vô lý (eo/gấu ngoài 0.6–1.5×ngực, dài ngoài 40–110, tay ngoài 5–40, vai ngoài 30–70) → thay bằng giá trị suy ra từ ngực: `waist = ngực − 2`, `hem = ngực`, `vai = 0.431·ngực`, `dài = 68 + (ngực−102)·0.5`, `tay = 21 + (ngực−102)/6`.
- Size trùng nhau chỉ giữ dòng đầu.

Danh sách size hiển thị (`fitSizeOptions`) lấy từ **biến thể còn hoạt động của đúng màu đó**, sắp theo `compareSizeLabels`, rồi ghép với số đo trong bảng — tồn kho đổi không làm đổi bảng size đang dùng.

---

## 8. Hiệu năng và dựng hình

| Kỹ thuật | Chỗ dùng | Tác dụng |
|---|---|---|
| Bỏ qua khối xa bề mặt | `surfaceNets` | Giảm số lần gọi trường vì đa số thể tích là không khí |
| Bảng tra thân 0.25 cm × 96 góc | `createBodyField` | Hàm trường là nội suy bảng, không tính lại nội suy PCHIP mỗi mẫu |
| `WeakMap` cache trường theo `BodyModel` | `getBodyField` | Model bất biến → một trường cho mỗi model, tự giải phóng |
| **Xem trước thô → tinh** | `UpperBodyScene` | Khi đang gõ số, dựng lưới `1.2 cm`; sau 250 ms không đổi mới dựng `0.85 cm` |
| `useDeferredValue` | `TryOn3DPage` | Giữ ô nhập mượt khi đang dựng hình nặng |
| `useMemo` ở mọi bước dựng | trang & scene | Tránh dựng lại khi chỉ đổi opacity/góc nhìn |
| **Một Canvas, nhiều viewport** (`drei <View>`) | `UpperBodyScene` | 5 khung (1 chính + 4 góc) chia sẻ một WebGL context và **một bộ geometry** |
| `useDisposableGeometry` | scene | Giải phóng geometry/texture cũ khi đổi → không rò GPU memory |
| Ảnh thu ≤ 1024 px, texture `dispose()` khi bỏ | `useGarmentPhotos` | Giới hạn bộ nhớ |
| Cờ `cancelled` khi đổi ảnh/sản phẩm | `useGarmentPhotos`, `TryOn3DPage` | Kết quả tải/xử lý của lần trước bị bỏ, không ghi đè trạng thái mới |
| Newton dùng lại gradient làm pháp tuyến | `surfaceNets` | Tiết kiệm 6 lần gọi trường mỗi đỉnh |

Camera: mục tiêu `[0, −0.33, 0]`, khoảng cách 2.1, FOV 32; 4 góc 0° / 45° / 90° / 180° (`cameraPosition`).

---

## 9. Độ vững chắc (robustness) và kiểm thử

### 9.1 Chống input bậy

- **Số đo**: `parseMeasurementInput` chỉ nhận `^[-+]?\d*\.?\d+$` sau khi đổi `,`→`.`; từ chối `1e5`, `Infinity`, `0x10`, rỗng. Ngoài khoảng → **ép vào khoảng** (vẫn dựng hình, vẫn báo lỗi). Không hợp lệ → dùng lại giá trị hợp lệ gần nhất, nếu chưa có thì dùng mặc định.
- **Bảng size**: lọc từng ô như mục 7; một bảng hỏng không làm sập trang mà rơi về bảng mẫu.
- **URL**: `product`, `color`, `size` được `encodeURIComponent`; sản phẩm không tải được → thông báo và hiện áo mẫu.
- **Ảnh**: ảnh không tải được/quá trống → áo hiện màu vải thường thay vì lỗi; ảnh từ MinIO được đọc qua rewrite cùng origin (`/storage/...`) để canvas được phép đọc pixel (tránh lỗi tainted canvas).
- **WebGL không có** → `fallback` hiển thị thông báo thay vì trang trắng.

### 9.2 Bộ test (`frontend/tests/demo-upper/`)

| File | Phạm vi |
|---|---|
| `ellipse.test.ts` | Chu vi giải đóng đúng, đồng dạng, ném lỗi khi tham số không dương |
| `bodyGeometry.test.ts` | Mô hình thân, đo vòng trên mesh khớp số nhập (sai số nhỏ) |
| `garmentGeometry.test.ts` | Áp lực, vùng chật, `pushOut`, hình áo, cổ polo |
| `fitHints.test.ts` | Ngưỡng Tight / Close / Regular / Relaxed, ngưỡng vai |
| `measurementValidation.test.ts` | Khoảng, dấu phẩy, giá trị rác |
| `garmentPhotos.test.ts` | Tách nền, bào mòn, đối xứng, phân loại góc, ánh xạ chiếu |
| `productFit.test.ts` | Parse bảng size nhiều dạng, đơn vị, khe ảnh theo màu |
| `abuse-3d.test.ts` | Tấn công: số đo cực đoan, bảng size độc hại, NaN/∞, nhiều tổ hợp ngẫu nhiên; kiểm tra `diagnoseGeometry` luôn sạch |

Chạy (trong `frontend/`):

```powershell
npx vitest run tests/demo-upper
npx tsc --noEmit
npm run lint
```

---

## 10. Hạn chế và giả định

1. **Tỉ lệ giả định, không phải quét 3D.** Chiều cao các mốc, tỉ lệ sâu/rộng, vòng hông (suy ra), chiều dài tay đều là hằng số trung bình. Hai người cùng 4 số đo có thể khác nhau về dáng. Vì vậy trang ghi rõ: *"A visual fit preview, not an exact sizing tool."*
2. **Chỉ thân trên** — mô hình dừng ở hông trên (như bust form cửa hàng), không có chân, không có đầu thật.
3. **Không mô phỏng vải vật lý.** Nếp gấp là hàm giải tích xác định; không có trọng lực, độ giãn vải, ma sát. "Chật" là so sánh bán kính, không phải tính căng vải.
4. **Mọi áo đều mô hình hoá như áo thun/polo tay ngắn.** Áo khoác, váy, quần chưa hỗ trợ; trang chỉ tin các danh mục có tên top/tee/shirt/polo (`isTopCategory`).
5. **Ảnh phẳng ≠ áo 3D.** Việc căn ảnh là phép biến đổi từng hàng; chi tiết sát đường may, miệng tay chỉ gần đúng (trang cũng ghi chú điều này). Ảnh góc 45° được đoán nếu không đặt đúng ô.
6. **Heuristic nhận dạng** (polo, áo ôm ngắn, góc ảnh) có thể sai; người dùng đổi tay được bằng *Collar style*.
7. **Hiệu năng** phụ thuộc thiết bị: dựng lưới chạy trên luồng chính JS (chưa dùng Web Worker). Cơ chế xem trước thô giảm nhưng không loại bỏ khựng trên máy yếu.

### Hướng phát triển gợi ý

- Chuyển `surfaceNets` + `createBodyField` vào Web Worker.
- Thêm số đo tuỳ chọn (hông, dài tay, cổ) để giảm giả định.
- Hỗ trợ thêm loại áo (áo dài tay, hoodie) bằng cách thêm bộ mặt cắt khoá và quy tắc tay áo.
- So sánh nhiều size cạnh nhau (hai áo cùng lúc) để người dùng thấy chênh lệch trực tiếp.
- Hiệu chuẩn tỉ lệ giả định bằng dữ liệu đo thật nếu có.

---

## 11. Thuật ngữ

| Thuật ngữ | Giải thích |
|---|---|
| **HSP** | High Shoulder Point — điểm cổ/vai cao, gốc y = 0 của mọi số đo |
| **Key ring** | Mặt cắt ngang khoá (neck, shoulder, chest…) gồm 96 bán kính theo góc |
| **Superellipse** | Đường cong `|x/a|ⁿ + |z/b|ⁿ = 1`, `n` lớn hơn 2 thì vuông hơn ellipse |
| **PCHIP** | Piecewise Cubic Hermite Interpolating Polynomial — nội suy bậc ba đơn điệu, không overshoot |
| **SDF** | Signed Distance Field — trường khoảng cách có dấu, âm bên trong, dương bên ngoài |
| **smin / smax** | Min / max trơn, dùng để hoà hai hình trong trường |
| **Naive Surface Nets** | Thuật toán dựng mesh từ trường vô hướng: một đỉnh mỗi ô, một quad mỗi cạnh bị cắt |
| **Saddle (yên ngựa)** | Mặt lưới có dấu `+ − + −` xen kẽ, gây mơ hồ về cách nối |
| **Girth** | Chu vi (ngực, eo, hông) |
| **Pressure** | Bán kính thân − bán kính áo (cm); dương = áo chật |
| **Registration** | Căn ảnh phẳng lên bề mặt 3D (tính UV) |
| **Drape** | Độ rủ, nếp của vải |

---

## 12. Câu hỏi thường gặp khi bảo vệ

**Câu 1. Em dùng API gì để làm 3D?**
Không dùng API 3D hay AI bên ngoài. Chỉ có `GET /products/by-slug/{slug}` để lấy bảng size, variant và ảnh của sản phẩm (xem mục 0.2). Ngoài ra là các endpoint admin có sẵn để tải ảnh góc nhìn và gợi ý bảng size. Phần dựng hình dùng thư viện **three.js** qua **React Three Fiber / drei** chạy trong trình duyệt; backend không tính toán gì cho 3D.

**Câu 2. Có dùng AI / machine learning không?**
Không. Mọi bước là thuật toán xác định: hình học giải tích (superellipse, nội suy PCHIP, trường ẩn, Surface Nets) và xử lý ảnh cổ điển (flood fill, bào mòn viền). Cùng số đo, cùng bảng size luôn cho cùng hình. Chức năng thử đồ 2D bằng AI nằm ở module `vton_lab` hoàn toàn riêng và không liên quan tới trang 3D này.

**Câu 3. Vì sao tính ở trình duyệt mà không ở server?**
Người dùng gõ số đo liên tục và xoay hình; gọi server mỗi lần sẽ trễ và tốn tài nguyên. Dữ liệu cần thiết chỉ là bảng size và ảnh (tải một lần). Nhờ đó cũng không có thêm API nào cần bảo mật hay giới hạn tần suất cho tính năng này.

**Câu 4. Vì sao không dùng mô hình 3D có sẵn (GLB) hoặc quét 3D?**
Mô hình có sẵn chỉ có một vóc dáng cố định; muốn đổi theo số đo phải làm lại mô hình. Cách tham số hoá bằng 4 số đo cho ra cơ thể **bất kỳ** trong khoảng cho phép mà không cần tệp 3D hay thiết bị quét, và quan trọng hơn, cho ta các bán kính cụ thể để so với áo.

**Câu 5. Vì sao không mô phỏng vải (cloth simulation)?**
Mô phỏng vật lý tốn rất nhiều tính toán, khó chạy mượt trên điện thoại, và kết quả phụ thuộc thông số vải mà cửa hàng không có. Hệ thống chọn cách so **kích thước bảng size với số đo cơ thể** (đại lượng thật, kiểm chứng được), còn nếp rủ chỉ là hiệu ứng thủ tục để hình trông tự nhiên.

**Câu 6. Làm sao biết áo chật hay rộng?**
Ở mỗi độ cao, lấy bán kính cơ thể trừ bán kính áo (`garmentGeometry.ts:140-143`). Dương nghĩa là áo nhỏ hơn người ⇒ tô đỏ, tối đa khi chật ≥ 3 cm. Với chữ gợi ý, so vòng ngực áo và người: chênh < 0 là Tight, < 4 là Close, 4–12 là Regular, > 12 là Relaxed (`fitHints.ts:22-25`). Riêng vai: chênh < −1 là hẹp, ≤ 3 là vừa, > 3 là rơi vai.

**Câu 7. Độ chính xác thế nào?**
Chu vi ngực/eo/hông của hình dựng khớp số nhập (ví dụ ngực 92 cm cho chu vi polygon đúng 92,000 cm, mục 0.5) và được đo lại trên chính lưới bằng 180 tia (`measureGirth`). Tuy nhiên đây là **bản xem trước trực quan**: dáng người dùng tỉ lệ trung bình (độ sâu/rộng cố định, mục 10), tay ở tư thế A-pose, và không phản ánh độ co giãn của vải. Không nên coi là kết luận chọn size tuyệt đối.

**Câu 8. Nếu sản phẩm chưa có ảnh góc nhìn thì sao?**
Áo vẫn hiển thị bằng màu vải của variant được chọn (`fabricColor`); ảnh chỉ thay phần màu, còn độ chật/rộng vẫn tính từ bảng size.

**Câu 9. Nếu sản phẩm chưa có bảng size hoặc tải lỗi?**
Không có bảng size thì dùng bảng mẫu theo giới tính (`productFit.ts:341-342`, `chartSource: "sample"`). Tải sản phẩm lỗi thì hiện áo mẫu kèm thông báo "This product could not be loaded, so a sample tee is shown" (`TryOn3DPage.tsx:163`), trang không bị sập.

**Câu 10. Người dùng nhập số đo vô lý (âm, chữ, quá lớn) thì sao?**
`measurementValidation.ts` kiểm tra từng ô theo khoảng cho phép (`MEASUREMENT_RANGES`); giá trị không hợp lệ thì giữ lại số hợp lệ gần nhất (`lastValid`), nên hình dựng luôn có đầu vào hợp lệ. Phía backend, `validate_size_chart` chặn bảng size sai (số âm, 0, boolean, quá 1000, quá 30 size). Các ca này đều có test trong `abuse-3d.test.ts`.

**Câu 11. Tại sao gõ số mà hình không bị giật?**
Dựng lưới có chi phí đáng kể nên làm hai tầng: khi số liệu đang đổi thì dựng lưới thô 1,2 cm, nếu 250 ms không đổi nữa mới dựng lưới mịn 0,85 cm (`UpperBodyScene.tsx:85-87`). Thêm `useDeferredValue` để ô nhập không bị chặn (`TryOn3DPage.tsx:72`), và Surface Nets bỏ qua các khối không chứa bề mặt.

**Câu 12. Ảnh ở MinIO sao đọc được pixel? Có rủi ro bảo mật không?**
Canvas bị "tainted" nếu ảnh khác origin, nên URL được đổi sang `/storage/...` và Next.js chuyển tiếp về MinIO (`next.config.mjs:46-48`). Hàm `toSameOriginImage` chỉ đổi URL thuộc bucket `product-images`; URL bucket khác hoặc URL lạ được giữ nguyên, không ném lỗi (test `abuse-3d.test.ts:292-298`). Tên bucket được kiểm tra bằng regex trước khi tạo rewrite.

**Câu 13. Admin tải ảnh sai (sai kích thước, sai góc) thì sao?**
Backend kiểm tra kích thước (ảnh `vton_garment` cạnh nhỏ nhất ≥ 256 px) và giới hạn số điểm ảnh; các ô góc nhìn được cố định theo cặp `(sort_order, kind)` (`images.py:25`). Nếu ảnh không nằm đúng ô, frontend đoán góc bằng tỉ lệ khung và độ đối xứng (`classifyViews`).

**Câu 14. Đã kiểm thử những gì?**
Frontend: `npx vitest run tests/demo-upper` chạy 8 file, **193 test đạt** (đã chạy khi viết tài liệu). Phủ chu vi giải đóng, nội suy, ngưỡng độ vừa, tách nền, bảng size và đầu vào xấu. Backend có test riêng cho `validate_size_chart` và upload ảnh trong `backend/tests`.

**Câu 15. Hạn chế lớn nhất là gì và hướng phát triển?**
Chỉ phần thân trên (áo); dáng người tham số hoá nên không thay thế phép đo thực của từng người; chưa mô phỏng độ co giãn, chất liệu hay nếp gấp thật. Có thể mở rộng thêm các số đo (vòng bụng, độ dài tay), quần/váy, và dùng dữ liệu hoàn trả/đổi size thực tế để hiệu chỉnh ngưỡng.
