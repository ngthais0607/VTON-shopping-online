# Kế hoạch A+ — Demo thử áo thun 3D thân trên (procedural Three.js)

> Thay thế phần lựa chọn trong `KE_HOACH_DEMO_3D_THAN_TREN_SO_SANH.md`. Đây là bản đang triển khai trên branch `feat/tryon-3d-upper`.
> Demo minh hoạ — **không** phải công cụ chọn size chính xác. Không đụng VTON 2D (backend `vton_engine.py`, `lib/vton.ts`, `try-on-modal.tsx`), không DB, không backend.

## 1. Phạm vi

- Route công khai: `/store/try-on-3d` (nằm trong `/store/*` nên không bị auth guard chặn).
- Người dùng nhập chiều cao, vòng ngực, vòng eo, rộng vai → ma-nơ-canh thân trên biến dạng theo số đo.
- Chọn size áo S/M/L → áo thun procedural mặc lên ma-nơ-canh với kích thước **danh nghĩa** của size.
- 1 Canvas, drei `View`: 1 view chính có OrbitControls + 4 view cố định 0°/45°/90°/180°.
- Gợi ý độ vừa bằng chữ (không có % tin cậy). Thiếu dữ liệu → "chưa đủ dữ liệu".

## 2. Quy ước hình học

- Thuật toán tính bằng **cm**, nhân 0.01 ra mét khi dựng geometry. Trục Y lên, X ngang, Z sâu. Gốc là điểm HSP (high shoulder point) ở `y = 0`, thân đi xuống `y < 0`.
- Mặt cắt thân là **superellipse** `|x/a|^n + |z/b|^n = 1`, n ≈ 2.6, rời rạc thành polygon N = 96 điểm.
- Giải `a` bằng **binary search trên chu vi polygon thật** sao cho sai số ≤ 0.5 cm; `b = a · depthRatio`.
- `shoulderCm` **không** phải bán trục ngực: nó là độ rộng "yoke" vai, tay gắn ở hai đầu.
- Hằng số chiều cao (giả định, nhân với H):
  - HSP → ngực ≈ 0.105H, HSP → eo ≈ 0.25H, HSP → hông ≈ 0.31H.
- Tay dạng A-pose nhẹ (~12° so với trục dọc).
- Phần thân dưới hông là "trunk" cách điệu (cắt phẳng, có nhãn), không mô phỏng đùi.

## 3. Áo

- Kích thước áo = số đo danh nghĩa của size (bảng dưới). **Cấm** dùng `max(body + ease, size)`.
- Nếu áo nhỏ hơn thân ở vùng nào: vẫn dựng đúng size, chỉ đẩy ra hiển thị (display-only) +0.3 cm chỗ bị xuyên, tô đỏ vùng chật bằng vertex color, và hiện cảnh báo.
- Áo đổi size không làm đổi thân; thân đổi số đo không làm đổi size.
- Có marker logo nhỏ (plane mesh) ở lưng để nhận ra view 180°.

| Size | Ngực | Eo | Gấu | Vai | Dài | Tay |
|---|---|---|---|---|---|---|
| S | 96 | 94 | 96 | 42 | 65 | 20 |
| M | 102 | 100 | 102 | 44 | 68 | 21 |
| L | 108 | 106 | 108 | 46 | 71 | 22 |

(Bảng size giả định cho demo.)

## 4. Gợi ý độ vừa

- Ngực/eo: `ease = áo − thân`
  - `< 0` → "Chật theo số đo"
  - `0..<4` → "Sát cơ thể"
  - `4..12` → "Độ dư vừa trong demo"
  - `> 12` → "Rộng trong demo"
- Vai: `d = vai áo − vai người`
  - `< −1` → "Vai áo hẹp"
  - `−1..+3` → "Vai vừa"
  - `> +3` → "Vai rơi (drop shoulder)"

## 5. Đầu vào và preset

| Trường | Min | Max | Mặc định |
|---|---|---|---|
| Chiều cao | 150 | 195 | 170 |
| Ngực | 78 | 120 | 92 |
| Eo | 62 | 110 | 76 |
| Vai | 36 | 50 | 42 |
| Độ mờ ma-nơ-canh | 0.15 | 1 | 0.35 |

Preset: **Nhỏ** 160/84/66/38 · **Vừa** 170/92/76/42 · **Rộng** 180/102/90/47 (đã sửa từ 110 để L/M/S lần lượt ra vừa/sát/chật).

## 6. Render

- Áo opaque, vẽ trước (`renderOrder` thấp).
- Ma-nơ-canh trong suốt dùng **2 pass**: pass 1 chỉ ghi depth (`colorWrite: false`), pass 2 vẽ màu kính với `depthWrite: false`. Cách này giấu phần tay/thân chồng nhau bên trong.
- Geometry tính 1 lần ở component cha (`useMemo`), dùng chung cho cả 5 view; khi đổi thì `dispose()` geometry cũ.
- Canvas dùng `eventSource` là container; chỉ view chính có OrbitControls.

## 7. Sáu điểm sửa so với bản A+ gốc

1. Preset "Rộng" đổi ngực 110 → 102, eo → 90.
2. Thân kéo tới gấu áo L (~74 cm dưới HSP) có thể chạm vùng đùi ở người thấp → trunk cách điệu, có nhãn.
3. Thân trong suốt lộ hình học bên trong → render 2 pass depth-prepass.
4. Mặt cắt superellipse giải theo chu vi polygon; yoke vai = `shoulderCm`.
5. Ngưỡng vai: `< −1` hẹp, `−1..+3` vừa, `> +3` rơi vai.
6. Hằng số chiều cao 0.105H / 0.25H / 0.31H.

## 8. Cấu trúc file

```
frontend/app/store/try-on-3d/page.tsx
frontend/components/demo-upper/*.tsx
frontend/lib/demo-upper/*.ts
frontend/tests/demo-upper/*.test.ts
frontend/public/demo-upper-tryon/images/tshirt_{front,back,side}.svg   (ảnh minh hoạ placeholder)
```

## 9. Kiểm thử (T01–T12)

| ID | Nội dung |
|---|---|
| T01 | Chu vi polygon sai ≤ 0.5 cm |
| T02 | Đổi ngực không đổi vòng eo |
| T03 | Đổi eo không đổi vòng ngực |
| T04 | Khoảng cách 2 mốc vai = `shoulderCm` |
| T05 | Chiều cao 150 → 195 không ra NaN |
| T06 | NaN / -1 / 9999 / rỗng được xử lý |
| T07 | Geometry hữu hạn, không tam giác suy biến |
| T08 | S/M/L giữ chu vi danh nghĩa |
| T09 | Ngực 104 + S → ease −8, cảnh báo chật, size không bị ghi đè |
| T10 | Đổi size không đổi thân |
| T11 | Có marker lưng |
| T12 | `dispose()` được gọi khi đổi geometry |
