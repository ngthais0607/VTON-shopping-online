# KẾ HOẠCH DEMO THỬ ÁO 3D THÂN TRÊN — SO SÁNH HAI CÁCH DỰNG

**Ngày:** 19/11/2026
**Dựa trên:** `PLAN_DEMO_TRUELOOK_THU_AO_3D_THAN_TREN.md` (v2.0), chỉnh lại cho khớp repo TrueLook hiện tại
**Trạng thái:** đề xuất, **chưa triển khai**

> Mục tiêu giữ nguyên như plan gốc: khách nhập số đo thân trên → ma-nơ-canh 3D (cổ → hông trên) biến dạng theo → mặc áo thun S/M/L → xem 4 góc 0°/45°/90°/180° và xoay 360°. Đây là demo bảo vệ luận án, không phải tính năng thương mại.

Tài liệu này so sánh hai cách làm phần **ma-nơ-canh + áo**:

- **Phương án A (đề xuất):** dựng ma-nơ-canh và áo **bằng code** Three.js từ các vòng mặt cắt theo cm.
- **Phương án B (plan gốc):** dựng mesh trong **Blender**, dùng Shape Keys, xuất GLB.

Các phần còn lại (route, giao diện, 4 góc, ảnh sản phẩm, kiểm thử) **dùng chung** cho cả hai phương án, xem mục 1.

---

## 0. Tóm tắt nhanh

| Tiêu chí | A — Dựng bằng code | B — Blender + GLB |
|---|---|---|
| Cần cài thêm phần mềm | Không | Blender (máy hiện **chưa có**) |
| Ma-nơ-canh đổi theo cm | **Chính xác theo công thức**, kiểm bằng unit test | Xấp xỉ, phải tự đo trên mesh để hiệu chuẩn |
| Áo mặc lên thân đã biến dạng | Áo được **tính lại** từ thân, luôn bọc ngoài | Áo cần **cùng bộ Shape Keys** với thân, gán cùng giá trị |
| Nguy cơ áo xuyên thân | **Không có** (áo ≥ thân theo công thức) | Có, phải kiểm từng tổ hợp và sửa tay |
| S/M/L khác nhau thật | Có, lấy từ bảng size (cm) | Có, nhưng phải dựng 3 mesh |
| Chỉ ra chỗ "chật/rộng" | Có sẵn (so chu vi thân với áo) | Phải làm thêm |
| Độ đẹp, chi tiết | Cách điệu, mượt, **không có nếp vải** | Đẹp hơn: cổ áo, đường may, nếp tĩnh |
| Số file asset | 0 file 3D | 4 GLB (thân + 3 áo) |
| Thời gian ước tính | **~5–7 ngày** | ~2–3 tuần (nếu chưa quen Blender) |
| Rủi ro khi bảo vệ | Thấp | Trung bình (lỗi asset, xuyên thân) |

**Đề xuất:** chọn **Phương án A** cho demo bảo vệ. Phương án B nên ghi vào phần "hướng phát triển" của luận án.

---

## 1. Phần dùng chung cho cả hai phương án

### 1.1 Điều chỉnh so với plan gốc để khớp repo

| Plan gốc | Điều chỉnh theo repo | Lý do |
|---|---|---|
| Route `app/demo/try-on-upper` | **`app/store/try-on-3d/page.tsx`** | `components/layout-client-wrapper.tsx` coi mọi route ngoài `/`, `/login`, `/register`, `/store/*` là **trang admin**, nên `/demo/...` sẽ bị chuyển sang đăng nhập |
| `npx create-next-app ...` | **Bỏ** | Repo đã có Next.js 16.2.6 |
| `npm install three @react-three/fiber @react-three/drei` | **`pnpm add three @react-three/fiber@^9 @react-three/drei@^10`** | Repo dùng pnpm 10; React 19 cần R3F v9 và drei v10 |
| `npm install -D @types/three` | **`pnpm add -D @types/three`** | như trên |
| `npm run dev` | `pnpm dev` | như trên |
| 4 canvas hoặc thumbnail chụp tuần tự | **1 Canvas + `<View>` của drei** | 4 viewport chung một WebGL context, luôn đồng bộ, nhẹ cho máy 16 GB |
| — | Canvas load bằng `next/dynamic(..., { ssr: false })` | Three.js không chạy khi render phía server |

Lệnh cài (chạy trong thư mục `frontend`):

```powershell
pnpm add three @react-three/fiber@^9 @react-three/drei@^10
```

```powershell
pnpm add -D @types/three
```

```powershell
pnpm dev
```

Trang demo: `http://localhost:3000/store/try-on-3d`

### 1.2 Không đụng tới VTON 2D

- VTON hiện tại (`backend/app/integrations/vton_engine.py`) nhận **ảnh người + ảnh áo** và trả **một ảnh 2D**. Engine này không có đầu ra 3D và không có tham số size.
- Demo 3D là **luồng riêng, chỉ chạy ở frontend**: không gọi backend, không cần database hay tài khoản.
- Khi bảo vệ, trình bày hai luồng **bổ sung cho nhau**:
  - VTON 2D: thử bằng ảnh thật của khách.
  - 3D theo số đo: xem form và size từ nhiều góc.

### 1.3 Cấu trúc thư mục chung

```text
frontend/
├── app/store/try-on-3d/page.tsx          # route public
├── components/demo-upper/
│   ├── TryOn3DPage.tsx                   # layout 3 cột (client)
│   ├── MeasurementsPanel.tsx             # slider + ô số: cao/ngực/eo/vai
│   ├── BodyPresetButtons.tsx             # Nhỏ / Vừa / Rộng
│   ├── SizeSwitcher.tsx                  # S / M / L
│   ├── UpperBodyScene.tsx                # Canvas + 4 <View>
│   ├── Mannequin.tsx                     # (A: mesh từ code | B: GLB + morph)
│   ├── Tshirt.tsx                        # (A: mesh từ code | B: GLB S/M/L)
│   ├── FourViewsPanel.tsx                # 0° / 45° / 90° / 180°
│   ├── FitHints.tsx                      # "chật ở ngực", "rộng ở eo" (A có sẵn)
│   └── ThreeProductImages.tsx            # 3 ảnh trước / sau / bên
├── lib/demo-upper/
│   ├── types.ts
│   ├── measurementValidation.ts          # min/max, clamp
│   ├── demoPresets.ts
│   ├── demoCatalog.ts                    # bảng size + đường dẫn ảnh
│   └── cameraAngles.ts
├── tests/demo-upper/                     # vitest
└── public/demo-upper-tryon/
    └── images/{tshirt_front,tshirt_back,tshirt_side}.jpg
```

### 1.4 State chung

```ts
type UpperBodyMeasurements = {
  heightCm: number;    // 150–195
  chestCm: number;     // 78–120
  waistCm: number;     // 62–110
  shoulderCm: number;  // 36–50
};

type UpperTryOnState = {
  body: UpperBodyMeasurements;
  size: 'S' | 'M' | 'L';
  activeAngle: 0 | 45 | 90 | 180;
  mannequinVisible: boolean;
  mannequinOpacity: number;  // 0.15–1
};
```

Dải min/max ở trên là **dải demo**, không phải chuẩn cơ thể. Giá trị nằm ngoài dải sẽ bị clamp và UI hiện thông báo.

### 1.5 Bảng size demo (giả định)

| Size | Chu vi ngực áo | Rộng vai áo | Dài áo |
|---|---|---|---|
| S | 96 cm | 42 cm | 65 cm |
| M | 102 cm | 44 cm | 68 cm |
| L | 108 cm | 46 cm | 71 cm |

> Số liệu hoàn toàn giả định để trình diễn. `chest` là chu vi **thành phẩm áo**, không phải số đo cơ thể.

### 1.6 Bốn góc nhìn

- Dùng **một** `<Canvas>`, bên trong có 1 `<View>` lớn (viewer chính, có OrbitControls) và 4 `<View>` nhỏ (camera cố định ở 0°/45°/90°/180°).
- Cả 5 view cùng dùng **một scene**, nên luôn cùng số đo và cùng size, không bao giờ lệch nhau.
- Bấm vào ô nhỏ thì camera viewer chính quay tới góc đó. Có nút **Reset** để về 0°.

### 1.7 Ảnh sản phẩm

- Cần **đúng 3 ảnh** của cùng một áo thun: trước, sau, bên. Repo hiện **chưa có**, phải tự chụp.
- Nhãn trên UI: **"Ảnh sản phẩm tham chiếu"**, tách khỏi **"Kết quả dựng 3D"**.

---

## 2. Phương án A — Dựng ma-nơ-canh và áo bằng code (đề xuất)

### 2.1 Ý tưởng

Thân trên được mô tả bằng chồng **vòng mặt cắt hình elip**. Mỗi vòng có độ cao `y`, bán trục ngang `a` (trái–phải) và bán trục sâu `b` (trước–sau). Nối các vòng lại sẽ thành mesh thân. Hai cánh tay là hai ống được dựng theo cùng cách.

```text
vòng       đặt theo số đo
──────────────────────────────────────
cổ         cố định (chu vi ~ 36–40)
vai        a = shoulderCm / 2
nách       nội suy vai → ngực
ngực       chu vi elip = chestCm
eo         chu vi elip = waistCm
hông trên  nội suy từ eo (+ hệ số)
──────────────────────────────────────
khoảng cách cổ → hông = f(heightCm)  (tỷ lệ giả định)
```

Từ một chu vi `C` cần đạt và tỷ lệ sâu/ngang `r = b/a` cố định cho từng vòng, ta giải ra `a` và `b` bằng công thức Ramanujan cho chu vi elip. Nhờ vậy **chu vi mesh khớp chính xác với số cm khách nhập**.

### 2.2 Mặc áo lên ma-nơ-canh

Áo là **lớp vỏ bọc ngoài thân**, được tính lại mỗi khi số đo hoặc size thay đổi:

```text
chu vi áo tại vòng i = max( chu vi thân tại vòng i + độ hở tối thiểu (≈1 cm),
                            chu vi áo theo bảng size tại vòng i )
```

- **Khách nhỏ hơn áo:** áo giữ đúng kích thước size, nhìn rộng.
- **Khách lớn hơn áo:** áo bị đẩy ra ôm sát thân, UI hiện **"Size S chật ở ngực"**.
- Áo **luôn ≥ thân**, nên **không bao giờ xuyên thân**.
- Thân áo dưới ngực thả gần thẳng xuống gấu (áo thun không ôm eo). Gấu áo cắt tại `y` tương ứng với chiều dài áo.
- Tay áo là ống bọc ngoài bắp tay, độ dài theo size.

```ts
type Ring = { y: number; a: number; b: number };

function buildShirtRings(body: Ring[], chart: GarmentSize): Ring[] {
  return body
    .filter(r => r.y >= hemY(chart.lengthCm))
    .map(r => {
      const bodyC = ellipseCircumference(r.a, r.b);
      const targetC = Math.max(bodyC + MIN_EASE_CM, garmentCircAt(r.y, chart));
      const k = targetC / bodyC;
      return { y: r.y, a: r.a * k, b: r.b * k };
    });
}
```

### 2.3 Hiển thị

- **Thân:** `MeshPhysicalMaterial` kính mờ (`transmission` thấp, `roughness` cao) hoặc `MeshStandardMaterial` trong suốt. Có thanh chỉnh opacity và nút ẩn/hiện.
- **Áo:** vật liệu đục, màu tím, `side: DoubleSide`. Có viền dày ở cổ, gấu và cổ tay áo để nhìn rõ mép.
- **Mặt sau:** cùng mesh, có thể đặt một decal hoặc logo nhỏ để phân biệt trước/sau khi xem góc 180°.
- **Mép cắt** ở cổ và hông được bịt bằng nắp phẳng để không trông "cụt".

### 2.4 File riêng của phương án A

```text
lib/demo-upper/
├── bodyRings.ts          # số đo → các vòng thân (cm)
├── shirtRings.ts         # vòng thân + size → các vòng áo
├── ellipse.ts            # chu vi elip, giải a/b từ chu vi
├── ringsToGeometry.ts    # vòng → BufferGeometry (thân, ống tay)
└── fitHints.ts           # so chu vi → "chật / vừa / rộng" theo vùng
tests/demo-upper/
├── ellipse.test.ts
├── bodyRings.test.ts     # chu vi ngực/eo trên mesh = số nhập (±0.5 cm)
└── shirtRings.test.ts    # áo luôn ≥ thân; S < M < L
```

### 2.5 Các giai đoạn

| GĐ | Việc | Xong khi | Ước tính |
|---|---|---|---|
| A0 | Cài thư viện, route `/store/try-on-3d`, layout 3 cột, Canvas trống | Trang mở được, không cần đăng nhập | 0.5 ngày |
| A1 | `ellipse.ts`, `bodyRings.ts`, `ringsToGeometry.ts` + test; hiện thân + tay, xoay được | Ma-nơ-canh hiện đủ, chu vi khớp test | 1.5 ngày |
| A2 | Slider/ô số, validate, 3 preset, reset | Kéo ngực/eo/vai thấy đổi đúng vùng | 1 ngày |
| A3 | `shirtRings.ts` + test, áo S/M/L, gợi ý chật/rộng | Đổi size thì áo đổi, thân giữ nguyên, không xuyên thân | 1.5 ngày |
| A4 | 4 `<View>`, click để đổi góc, reset camera | 4 góc cùng một mesh, mặt sau đúng | 0.5 ngày |
| A5 | Gallery 3 ảnh, chú thích giới hạn, xử lý lỗi WebGL, chỉnh cho máy chiếu | Người lạ hiểu được luồng demo | 1 ngày |
| A6 | Test 3 preset × 3 size × 4 góc, chạy offline, quay video dự phòng | Ổn định trên máy bảo vệ | 0.5–1 ngày |

**Tổng: khoảng 5–7 ngày làm việc.**

### 2.6 Rủi ro và cách xử lý

| Rủi ro | Xử lý |
|---|---|
| Ma-nơ-canh trông "ống", thiếu cơ ngực/xương bả vai | Thêm hệ số nhô ngực và lõm lưng theo góc trên từng vòng (biến dạng theo góc quanh trục) |
| Vùng nách nối thân với tay bị gãy | Dùng nắp cầu ở vai, cho tay hơi dang ra (tư thế chữ A) để giấu chỗ nối |
| Áo nhìn quá "trơn" | Thêm viền cổ, gấu, tay áo, một chút độ phồng ngẫu nhiên nhỏ cố định; chấp nhận không có nếp vải |

---

## 3. Phương án B — Blender + Shape Keys + GLB (plan gốc)

### 3.1 Ý tưởng

- Dựng (hoặc lấy từ MPFB) **một mesh thân trên** trong Blender, rồi tạo các Shape Key: `ChestPlus/Minus`, `WaistPlus/Minus`, `ShoulderPlus/Minus`.
- Dựng áo thun size M ôm theo thân, sau đó tạo S và L.
- Xuất ra `upper_mannequin.glb` và `tshirt_{s,m,l}.glb`.
- Trên web, chuyển số đo cm sang hệ số morph bằng **bảng hiệu chuẩn** đo trên mesh.

### 3.2 Mặc áo lên ma-nơ-canh đã biến dạng

Đây là phần khó nhất của phương án B. Áo **không tự đi theo thân**, nên phải:

1. Chuyển các Shape Key của thân sang áo (modifier *Surface Deform* hoặc *Data Transfer*, rồi lưu thành Shape Key của áo).
2. Làm việc này cho **cả 3 áo** S/M/L.
3. Trên web, gán **cùng giá trị `morphTargetInfluences`** cho thân và áo mỗi khi số đo đổi.
4. Kiểm tra bằng mắt **9 tổ hợp** (3 preset × 3 size) ở cả 4 góc. Chỗ nào xuyên thân thì sửa mesh hoặc thu hẹp dải slider.

Nếu thân lớn hơn áo, áo sẽ **bị xuyên** chứ không tự ôm sát ra. Muốn hiện "chật" phải làm thêm logic riêng.

### 3.3 Chuẩn bị

- Cài Blender 4.x (máy hiện chưa có).
- Nếu dùng MPFB hoặc asset tải về: kiểm tra giấy phép.
- Đặt file vào:

```text
public/demo-upper-tryon/
├── avatars/upper_mannequin.glb
└── garments/tshirt_{s,m,l}.glb
```

### 3.4 File riêng của phương án B

```text
lib/demo-upper/
├── morphCalibration.ts   # bảng cm → hệ số morph, nội suy + clamp
└── applyMorphs.ts        # gán cùng influences cho thân và áo
tests/demo-upper/
└── morphCalibration.test.ts
```

### 3.5 Các giai đoạn

| GĐ | Việc | Xong khi | Ước tính |
|---|---|---|---|
| B0 | Cài thư viện, route, layout (giống A0) | Trang mở được | 0.5 ngày |
| B1 | Học/cài Blender, dựng hoặc lấy mesh thân trên, cắt cổ → hông | Mesh sạch, xuất GLB load được | 2–4 ngày |
| B2 | Tạo 6 Shape Key, đo chu vi ở các mức, lập bảng hiệu chuẩn | Morph đổi đúng vùng, bảng cm có số liệu | 2–3 ngày |
| B3 | Dựng áo M, chuyển Shape Key sang áo, tạo S/L | 3 GLB áo có morph, không xuyên ở mức 0 | 3–5 ngày |
| B4 | Slider, preset, `morphCalibration.ts`, gán morph cho thân + áo | Kéo slider thì thân và áo cùng đổi | 1 ngày |
| B5 | Kiểm 9 tổ hợp × 4 góc, sửa xuyên thân, thu hẹp dải | Không xuyên rõ ở trạng thái demo | 1–2 ngày |
| B6 | 4 góc, gallery, chú thích, test offline, video (giống A4–A6) | Ổn định trên máy bảo vệ | 2 ngày |

**Tổng: khoảng 12–18 ngày làm việc** (ít hơn nếu đã quen Blender).

### 3.6 Rủi ro và cách xử lý

| Rủi ro | Xử lý |
|---|---|
| Morph không ra đúng cm | Hiệu chuẩn trên mesh; UI ghi "xấp xỉ" |
| Áo xuyên thân khi số đo lớn | Thu hẹp dải slider; sửa từng mesh áo |
| Shape Key mất sau khi xuất GLB | Kiểm tra trong trình xem glTF sau mỗi lần xuất |
| Tổng số morph quá nhiều làm chậm | Giữ ≤ 8 morph target cho mỗi mesh |
| Lỗi asset sát ngày bảo vệ | Khóa asset sớm, có video dự phòng |

---

## 4. Kết hợp được không?

Được, theo thứ tự:

1. Làm **A** trước để có demo chắc chắn chạy được.
2. Nếu còn thời gian, thay riêng `Mannequin.tsx` bằng GLB đẹp hơn, nhưng **vẫn giữ áo dựng bằng code** bọc theo các vòng đo trên mesh GLB.

Interface `Mannequin` / `Tshirt` nhận cùng `UpperTryOnState`, nên đổi phần dựng không làm ảnh hưởng UI, 4 góc hay test.

---

## 5. Tiêu chí nghiệm thu chung

| Nội dung | Đạt khi |
|---|---|
| Phạm vi | Cổ → hông trên, có tay, không có chân |
| Truy cập | `/store/try-on-3d` mở được khi chưa đăng nhập |
| Input | Số âm hoặc quá lớn bị chặn, clamp, có reset |
| Ngực / eo / vai | Đổi đúng vùng, vùng khác không méo |
| Đổi size | Áo khác kích thước, thân giữ nguyên |
| Không xuyên thân | Ở 3 preset × 3 size (A: luôn đạt theo công thức) |
| 4 góc | 0/45/90/180 cùng một mesh; mặt sau đúng |
| 360° | Xoay, zoom, reset không mất model |
| Ảnh | Đúng 3 ảnh trước/sau/bên, có nhãn tham chiếu |
| Minh bạch | Ghi rõ là mô phỏng minh họa, không đo fit thật, không mô phỏng vải |
| Offline | Chạy được khi tắt mạng sau `pnpm build` + `pnpm start` |
| VTON 2D | Không thay đổi, test cũ vẫn pass |

---

## 6. Trình bày khi bảo vệ (gợi ý cho Phương án A)

- **Slide kiến trúc:** Số đo (cm) → Vòng mặt cắt thân → Mesh ma-nơ-canh → Vòng áo = max(thân + độ hở, size chart) → Mesh áo → 4 View trong 1 Canvas.
- **Điểm mạnh:** chu vi trên mesh khớp số nhập (có unit test), áo không xuyên thân theo công thức, size khác nhau theo cm thật.
- **Giới hạn:** không có nếp vải hay mô phỏng vật lý; tỷ lệ chiều dài thân theo chiều cao là giả định; ma-nơ-canh gần dáng, không phải bản quét cơ thể.
- **Hướng phát triển:** mesh thân chi tiết hơn (Phương án B / MPFB), mô phỏng vải, kết hợp ảnh VTON 2D.

---

## 7. Phạm vi: có làm / không làm

**Có làm (cả A và B):**

- Nhập số đo bằng slider và ô số: cao, ngực, eo, vai; 3 preset Nhỏ / Vừa / Rộng; nút reset.
- Ma-nơ-canh thân trên (cổ → hông trên, tay tới khoảng khuỷu) biến dạng riêng ở vai, ngực, eo; chiều dài thân ước lượng theo chiều cao.
- Một mẫu áo thun cổ tròn tay ngắn, 3 size S/M/L; đổi size không reset thân.
- Viewer chính xoay 360°, zoom, reset; 4 góc 0°/45°/90°/180° đồng bộ.
- Ẩn/hiện và chỉnh độ trong suốt ma-nơ-canh.
- Gallery đúng 3 ảnh sản phẩm; chú thích giới hạn mô phỏng.
- (A) Gợi ý "chật / vừa / rộng" theo vùng, dựa trên so chu vi.

**Không làm:**

- Ma-nơ-canh toàn thân, đầu/mặt, chân; quần, váy, đầm, hoodie, sơ mi.
- Mô phỏng vải vật lý, nếp vải động, đo độ căng.
- Tự tạo mesh 3D từ 3 ảnh; AI sinh avatar.
- Gợi ý size có độ tin cậy thống kê; nhãn "85% / 95%".
- Admin upload sản phẩm 3D, database, migration, lưu số đo người dùng.
- Sửa backend hoặc luồng VTON 2D.

---

## 8. Giao diện

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│ Header store TrueLook                                                          │
├────────────────────────────────────────────────────────────────────────────────┤
│ THỬ ÁO 3D THEO SỐ ĐO                                          Demo minh họa    │
├─────────────────────┬───────────────────────────────┬──────────────────────────┤
│ SỐ ĐO THÂN TRÊN     │          VIEWER 3D            │        4 GÓC NHÌN        │
│                     │                               │  ┌──────────┬──────────┐ │
│ [Nhỏ] [Vừa] [Rộng]  │   ma-nơ-canh + áo thun        │  │ 0° trước │ 45° chéo │ │
│                     │                               │  ├──────────┼──────────┤ │
│ Cao   ──●──  170 cm │   (kéo để xoay, cuộn để zoom) │  │ 90° bên  │ 180° sau │ │
│ Ngực  ──●──   92 cm │                               │  └──────────┴──────────┘ │
│ Eo    ──●──   76 cm │                               │  [Reset góc nhìn]        │
│ Vai   ──●──   42 cm │  Size: [S] [M] [L]            │                          │
│                     │  [Ẩn ma-nơ-canh] Độ trong ──● │  Độ vừa (size M):        │
│ [Đặt lại]           │                               │  Ngực: rộng · Vai: vừa   │
├─────────────────────┴───────────────────────────────┴──────────────────────────┤
│ ẢNH SẢN PHẨM THAM CHIẾU     [Mặt trước]   [Mặt sau]   [Mặt bên]                 │
│ Mô phỏng 3D minh họa; không thay thế phép đo cơ thể hoặc thử áo thật.          │
└────────────────────────────────────────────────────────────────────────────────┘
```

- Màn hình hẹp (< 1024 px): xếp dọc theo thứ tự viewer → số đo → 4 góc → ảnh.
- Khung camera: từ cổ tới dưới gấu áo một đoạn; không cắt ngang thân áo.
- Đang tải: skeleton trong khung viewer. WebGL lỗi: hiện thông báo kèm ảnh chụp 4 góc dự phòng.
- Ô "Độ vừa" chỉ có ở phương án A; phương án B bỏ ô này hoặc ghi "chưa hỗ trợ".

---

## 9. Kịch bản demo khi bảo vệ (khoảng 3 phút)

1. Mở `/store/try-on-3d`. Màn hình có ma-nơ-canh mặc áo tím size M, preset **Vừa** (170 / 92 / 76 / 42).
2. Kéo **ngực** 92 → 104: ngực và lưng rộng ra, eo giữ nguyên. Ô độ vừa đổi từ "rộng" sang "vừa / hơi chật".
3. Kéo **eo** 76 → 88: chỉ vùng bụng/eo thay đổi.
4. Kéo **vai** 42 → 46: vai rộng ra, đường vai áo đi theo.
5. Đổi **chiều cao** 160 ↔ 185: thân trên dài/ngắn hơn theo tỷ lệ ước lượng.
6. Đổi **size S → M → L**: áo đổi kích thước, thân giữ nguyên số đo. Ở S với ngực 104, áo ôm sát và hiện "chật ở ngực".
7. Chỉ vào **4 góc**: cùng một mô hình; bấm ô 180° để viewer quay ra mặt sau.
8. Kéo xoay tự do, zoom, bấm reset; **ẩn ma-nơ-canh** để cho thấy áo là mesh riêng.
9. Chỉ xuống **3 ảnh sản phẩm** và đọc dòng giới hạn.
10. (Tùy chọn) Mở trang sản phẩm có VTON 2D để so sánh hai luồng.

**Dự phòng:** chỉ dùng 3 preset đã kiểm; nếu máy chiếu lỗi WebGL thì mở video demo.

---

## 10. Ưu tiên khi thiếu thời gian

1. Ma-nơ-canh thân trên mặc áo, xoay được.
2. Chỉnh ngực / eo / vai hoạt động.
3. Đổi size S/M/L.
4. 4 góc đồng bộ.
5. Gợi ý độ vừa, gallery, chỉnh giao diện.

Không cắt bỏ mục 1–3 để làm mô phỏng vải hay tạo 3D bằng AI.

---

## 11. Bàn giao

- [ ] Route `/store/try-on-3d` chạy được khi chưa đăng nhập.
- [ ] Phương án A: `bodyRings.ts`, `shirtRings.ts`, `ellipse.ts`, `ringsToGeometry.ts`, `fitHints.ts` + unit test pass.
      Phương án B: `upper_mannequin.glb`, `tshirt_{s,m,l}.glb`, `morphCalibration.ts` + test.
- [ ] Form số đo, 3 preset, 3 nút size, 4 góc, xoay 360°, ẩn/hiện ma-nơ-canh.
- [ ] Đúng 3 ảnh sản phẩm trong `public/demo-upper-tryon/images/`.
- [ ] `pnpm lint`, `pnpm test`, `pnpm build` đều pass; test VTON cũ không đổi.
- [ ] Hướng dẫn chạy trên máy bảo vệ (thêm vào `docs/CHAY_DU_AN.md`).
- [ ] Video demo ngắn + ảnh chụp 4 góc ở 3 preset.
- [ ] 2 slide: kiến trúc (mục 6) và giới hạn mô phỏng.

### Định nghĩa hoàn thành

> Hội đồng thấy rõ: **cùng một ma-nơ-canh thân trên** thay đổi theo số đo nhập; **cùng một áo thun 3D** đổi size và xem được trước / chéo / bên / sau; giao diện ổn định và không mô tả demo như hệ thống đo độ vừa chính xác.

---

## 12. Tài liệu tham khảo

- React Three Fiber: https://r3f.docs.pmnd.rs/
- Drei (`View`, `OrbitControls`): https://drei.docs.pmnd.rs/
- Three.js `BufferGeometry`: https://threejs.org/docs/#api/en/core/BufferGeometry
- Chu vi elip (xấp xỉ Ramanujan): https://en.wikipedia.org/wiki/Ellipse#Circumference
- (Phương án B) Blender glTF export: https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html
- (Phương án B) MPFB: https://extensions.blender.org/add-ons/mpfb/
