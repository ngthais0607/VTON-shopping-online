# Bảng size theo loại đồ

Admin chỉ cần chọn **Category** (loại đồ) và **Gender** khi tạo/sửa sản phẩm. Hệ thống tự điền bảng size chuẩn
của loại đó; admin vẫn sửa được từng ô. Muốn dùng bảng của họ khác thì chọn ở ô **Chart type** (nhóm theo Tops / Bottoms / Dresses, tên tiếng Anh). Nguồn dữ liệu: `backend/app/features/products/size_charts.py`.

## Cách hoạt động

| Bước | Hành vi |
|---|---|
| Chọn category / gender trong form | Form gọi `GET /api/v1/products/size-chart-preset?category_id=&gender=` (admin) và điền bảng. |
| Đổi category khi bảng còn nguyên là bảng chuẩn | Bảng được thay bằng bảng chuẩn của loại mới. |
| Ô **Chart type** | Mặc định "Auto — follow the category". Mở danh sách để chọn trực tiếp một họ bảng (mỗi dòng ghi họ nào dùng chung/riêng cho category nào); chọn xong bảng được nạp theo giới tính hiện tại và **ghi đè** bảng đang có. Chọn lại Auto để theo category. Không cần chọn category trước. |
| Admin đã sửa số | Không bị ghi đè khi đổi category. Nút **Use standard chart** nạp lại bảng chuẩn. |
| Tạo sản phẩm không gửi `size_chart` | Backend tự lấy bảng chuẩn theo category + gender (API/import cũng được). |
| Loại không có bảng chuẩn (phụ kiện, `kids`) | Form báo không có bảng, để trống hoặc nhập tay. |
| Danh sách các họ bảng | `GET /api/v1/products/size-chart-presets` (admin), dùng để đổ ô Chart type. |
| Bảng theo họ chọn tay | `GET /api/v1/products/size-chart-preset?preset_key=ao-hoodie&gender=male` (admin); `category_id` hoặc `preset_key` phải có ít nhất một. |

Đơn vị là **cm**, số đo **thành phẩm** của áo/quần (vòng, không phải nửa bản). Dạng lưu:
`{ "M": { "chest": 102, "waist": 100, ... } }`. Trang size guide và thử đồ 3D đều đọc được dạng này.

## Loại nào dùng chung, loại nào dùng riêng

| Họ bảng (`preset_key`) | Dùng | Category slug | Cột số đo | Vì sao |
|---|---|---|---|---|
| `ao-phong` | **Chung** | `ao-thun`, `ao-polo`, `tops` | chest, waist, hem, shoulder, length, sleeve | Cùng form tay ngắn |
| `ao-so-mi` | Riêng | `ao-so-mi` | như trên | Tay dài, dáng ôm hơn |
| `ao-hoodie` | Riêng | `ao-hoodie` | như trên | Form rộng, vai rơi, bo gấu nhỏ hơn thân |
| `ao-khoac` | **Chung** | `ao-khoac-bomber`, `outerwear` | như trên | Dáng ngắn, bo gấu |
| `ao-blazer` | Riêng | `ao-blazer` | như trên | Phom cứng, vai độn, dài hơn |
| `quan-dai` | **Chung** | `quan-jeans`, `quan-tay`, `bottoms` | waist, hip, thigh, length, inseam, leg_opening | Cùng cách đo quần dài |
| `quan-short` | Riêng | `quan-short` | waist, hip, thigh, length, inseam | Ngắn, không có ống dài |
| `chan-vay` | Riêng | `chan-vay-chu-a` | waist, hip, length | Chỉ 3 số đo, một bảng cho mọi giới |
| `dam-xoe` | **Chung** | `dam-dang-xoe`, `dresses-skirts` | bust, waist, hip, length | Đầm xòe, một bảng mọi giới |
| `dam-da-hoi` | Riêng | `dam-da-hoi` | bust, waist, hip, length | Ôm và dài hơn đầm xòe |

### Theo giới tính

Bảng đi theo ô **Gender** của sản phẩm (đổi Gender thì bảng tự nạp lại nếu chưa sửa tay). Dưới ô Chart type, dòng
mô tả cho biết đang dùng bảng nào: "Men's table", "Women's table", "Unisex table (average of men's and women's)" hoặc "One table for all
genders". Muốn xem bảng nữ của một họ thì đặt Gender = female.

- `male`: bảng nam (size S–XXL, riêng short/blazer/hoodie... xem trong file nguồn).
- `female`: bảng nữ (có thêm XS, thường đến XL).
- `unisex`: **không lưu bảng riêng**, tính từ bảng nam và nữ: mỗi size lấy trung bình hai bảng (làm tròn 0.5 cm); size chỉ một bên có (XS nữ, XXL nam) giữ nguyên. Kết quả XS–XXL. Sửa bảng nam/nữ thì unisex đổi theo.
- `kids`: **chưa có bảng chuẩn**, nhập tay.
- `chan-vay`, `dam-xoe`, `dam-da-hoi` chỉ có một bảng, không phân biệt giới.

### Category tự tạo thêm

Category mới không có trong bảng trên được xếp theo thứ tự:

1. Category cha nằm trong bảng (ví dụ con của `ao-so-mi` → bảng `ao-so-mi`).
2. Category cha chung: `ao` → `ao-phong`, `ao-khoac` → `ao-khoac`, `quan` → `quan-dai`.
3. Loại thử đồ của category (`upper` → `ao-phong`, `lower` → `quan-dai`, `overall` → `dam-xoe`).

`vay-dam` (gồm cả váy và đầm) cố ý **không** tự gán: chọn category con (`chan-vay-chu-a`, `dam-dang-xoe`...).

## Thêm hoặc đổi bảng

Sửa `PRESETS` trong `size_charts.py`: thêm `SizeChartPreset` mới với `shared_by` là các slug dùng chung. Mỗi slug
chỉ thuộc một họ (có test kiểm tra). Mỗi slug mà thử đồ đã biết (`vton/mapping.py`) phải có bảng, test cũng kiểm tra.

## Lưu ý

- Số liệu là mức khởi đầu hợp lý cho cỡ phổ thông, **không thay thế số đo thật của nhà sản xuất**. Sản phẩm có số đo
  riêng thì sửa trong form.
- Thử đồ 3D chỉ dùng cho áo thân trên; sơ mi, hoodie... có tay dài nên tay áo trong 3D vẫn lấy theo mẫu.
