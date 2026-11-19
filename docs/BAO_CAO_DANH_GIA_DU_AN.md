# BÁO CÁO ĐÁNH GIÁ TỔNG QUÁT DỰ ÁN TRUELOOK

Ngày đánh giá: 02/11/2026. Phạm vi: mã nguồn và cấu hình hiện có trong workspace `D:\fastapi-founder`, bao gồm các thay đổi chưa commit.

## 1. Kết luận đánh giá

TrueLook là ứng dụng thương mại điện tử thời trang full-stack, gồm website dành cho khách hàng, giao diện quản trị và backend API. Dự án đã triển khai các thành phần cốt lõi của một cửa hàng trực tuyến: danh mục và sản phẩm, biến thể size/màu/SKU, giỏ hàng, đặt hàng nhiều sản phẩm, thanh toán COD hoặc hướng dẫn chuyển khoản VietQR, quản lý đơn và tài khoản.

Điểm nổi bật của dự án nằm ở xử lý nghiệp vụ: tồn kho được quản lý theo biến thể; đơn hàng lưu thông tin sản phẩm tại thời điểm mua; các thao tác nhạy cảm sử dụng transaction và khóa dòng; thanh toán có cơ chế chống ghi nhận trùng. Backend được chia theo chức năng và có bộ kiểm thử riêng cho nhiều tình huống lỗi, cạnh tranh dữ liệu và migration.

**Mức độ phù hợp hiện tại:** nền tảng MVP thương mại điện tử có phạm vi chức năng rõ ràng, phù hợp tiếp tục nghiệm thu trên môi trường demo hoặc thử nghiệm có kiểm soát. Chưa đủ căn cứ để xác nhận sẵn sàng vận hành production, chịu tải lớn hoặc xử lý thanh toán ngân hàng tự động đầu cuối.

**Tình trạng AI:** mặc dù tên package và một số thông điệp còn dùng “AI-VTON”, chưa có chức năng thử đồ ảo được triển khai. Không có cơ sở để giới thiệu phiên bản hiện tại là sản phẩm AI thử đồ đã hoạt động. `docs/VTON_READINESS.md` là tài liệu điều kiện triển khai tiếp theo.

## 2. Cơ sở và giới hạn của báo cáo

Báo cáo dựa trên việc đối chiếu README với cấu hình dependency, Docker Compose, GitHub Actions, router, service, domain, model dữ liệu, mã frontend và các bộ test trong repository.

Các nguyên tắc đánh giá:

- “Đã triển khai” nghĩa là đã tìm thấy luồng xử lý tương ứng trong mã nguồn; không đồng nghĩa mọi môi trường triển khai đều đã được nghiệm thu.
- “Có kiểm thử” nghĩa là có mã kiểm thử cho hành vi đó. Kết quả chạy thực tế được trình bày riêng tại mục 9.
- Phiên bản công nghệ dưới đây lấy từ manifest, requirements và Dockerfile của dự án; không phải thông tin xác nhận phiên bản mới nhất trên thị trường.
- Không suy diễn số người dùng, doanh thu, tỷ lệ chuyển đổi, độ chính xác AI, thời gian đáp ứng hay năng lực chịu tải khi chưa có số đo.
- Đây là đánh giá kỹ thuật và phạm vi sản phẩm, không phải kiểm toán bảo mật độc lập hay chứng nhận vận hành production.

## 3. Tổng quan sản phẩm và người sử dụng

### 3.1. Mục tiêu hiện được mã nguồn hỗ trợ

Hệ thống phục vụ quy trình bán quần áo trực tuyến, từ tìm sản phẩm đến chọn biến thể, đặt hàng và theo dõi trạng thái. Phía quản trị hỗ trợ duy trì catalog, điều chỉnh kho, xử lý đơn và xem số liệu tổng hợp.

| Nhóm người dùng | Khả năng chính |
|---|---|
| Khách chưa đăng nhập | Xem cửa hàng, tìm/lọc sản phẩm, xem chi tiết và đánh giá; chuẩn bị giỏ hàng trên trình duyệt |
| Khách hàng đã đăng nhập | Đặt hàng, xem đơn của mình, hủy đơn đủ điều kiện, cập nhật hồ sơ và đổi mật khẩu |
| Quản trị viên | Quản lý sản phẩm, biến thể, ảnh, danh mục, người dùng, đơn hàng và xem các khoản thanh toán cần đối soát |

API checkout hiện yêu cầu xác thực; chưa phải luồng mua hàng không cần tài khoản. API tracking theo mã công khai là một luồng riêng, có che thông tin cá nhân trong phản hồi.

### 3.2. Phạm vi chức năng

| Phân hệ | Nội dung hiện có | Giới hạn cần ghi nhận |
|---|---|---|
| Catalog | Tìm kiếm, lọc theo thuộc tính thời trang, phân trang, chi tiết, album ảnh và bảng size | Dữ liệu seed phục vụ demo; không chứng minh quy mô catalog thực tế |
| Biến thể | Size, màu, SKU, giá riêng tùy chọn, trạng thái hoạt động | Kho gắn với từng biến thể; không nên sửa hợp đồng checkout thành chỉ dùng product_id |
| Giỏ hàng | Lưu trình duyệt, chọn biến thể, cập nhật số lượng, tra lại thông tin giá/kho | Không có giỏ hàng server để đồng bộ xuyên thiết bị |
| Đặt hàng | Một đơn có nhiều dòng hàng, thông tin người nhận, tính giá phía server | Chưa có phí vận chuyển động, coupon hoặc kết nối hãng vận chuyển |
| Thanh toán | COD, tạo thông tin VietQR và webhook xác nhận theo hợp đồng của ứng dụng | Chưa có bằng chứng tích hợp callback tự động với ngân hàng/nhà cung cấp thật |
| Theo dõi đơn | Lịch sử, chi tiết, tracking công khai bằng mã riêng, hủy theo điều kiện | Không phải theo dõi vận đơn trực tiếp từ hãng giao hàng |
| Đánh giá sản phẩm | Điểm sao, nhận xét, phản hồi độ vừa size; kiểm tra người mua đủ điều kiện | Chưa phải hệ thống kiểm duyệt nội dung đánh giá đầy đủ |
| Quản trị | CRUD catalog, quản lý khách hàng và đơn, điều chỉnh kho có lý do | Chưa có cơ sở để gọi là ERP hoặc hệ thống quản trị đa cửa hàng |
| Dashboard | Tổng sản phẩm, sản phẩm hoạt động, tồn thấp, đơn pending, doanh thu, đơn gần đây | Biểu đồ lịch sử doanh thu chưa được cấp dữ liệu; biểu đồ trạng thái chỉ xét đơn gần đây |
| Wishlist | Lưu và hiển thị danh sách trên trình duyệt | Chưa đồng bộ theo tài khoản trên backend |
| Trang nội dung | About, help, chính sách, blog, careers, press, contact | Contact chưa kết nối hộp thư hay dịch vụ gửi tin; các trang nội dung không phải CMS |
| Thử đồ AI | Có tài liệu chuẩn bị | Chưa có engine, API inference hoặc UI thử đồ hoạt động |

## 4. Công nghệ sử dụng và vai trò

### 4.1. Backend

| Công nghệ | Phiên bản/cấu hình trong dự án | Vai trò |
|---|---|---|
| Python | Docker dùng 3.12; lockfile Windows hướng tới 3.13 | Ngôn ngữ backend và worker |
| FastAPI | 0.143.0 trong `requirements.in` | REST API, dependency injection, OpenAPI/Swagger |
| Uvicorn | 0.54.0 | Chạy ứng dụng ASGI |
| Pydantic / pydantic-settings | Settings được khai báo qua pydantic-settings 2.15.0 | Kiểm tra dữ liệu đầu vào/đầu ra và cấu hình môi trường |
| SQLAlchemy | 2.1.4 | ORM, truy vấn, transaction, quan hệ và khóa dữ liệu |
| PyMySQL | 1.2.3 | Driver kết nối MariaDB qua giao thức MySQL |
| Alembic | 1.20.0 | Quản lý thay đổi schema có phiên bản |
| PyJWT | 2.15.1 | Tạo và xác thực JWT |
| Passlib + bcrypt | 1.7.4 và 4.0.1 | Băm và kiểm tra mật khẩu |
| SlowAPI | 0.1.10 | Giới hạn tần suất request cho các endpoint được cấu hình |
| Pillow | 13.0.0 | Kiểm tra cấu trúc và giải mã ảnh upload |
| MinIO Python SDK | 7.2.20 | Lưu, xóa và tạo đường dẫn ảnh sản phẩm |
| Redis client + ARQ | 5.3.1 và 0.28.0 | Cache, hỗ trợ rate limit và hàng đợi tác vụ |
| aiosmtplib + Jinja2 | 5.1.3 và 3.1.6 | Gửi email SMTP và dựng template HTML |

Các số phiên bản trên là dependency trực tiếp được khai báo. Môi trường cài đặt tái lập sử dụng requirements lock có hash, tách giữa Linux và Windows.

**Đặc điểm quan trọng:** SQLAlchemy dùng `create_engine`, `Session` đồng bộ và PyMySQL; MinIO SDK cũng đồng bộ. Việc sử dụng FastAPI không khiến toàn bộ ứng dụng trở thành hệ thống I/O bất đồng bộ. Nhiều endpoint được khai báo `def`, phù hợp cơ chế chạy hàm đồng bộ của framework. Worker khai báo coroutine nhưng vẫn có đoạn truy cập SQL đồng bộ, cần đo riêng khi tăng tải.

### 4.2. Frontend

| Công nghệ | Phiên bản khai báo | Vai trò |
|---|---|---|
| Next.js | 16.2.6 | App Router, routing, build và phục vụ giao diện |
| React / React DOM | `^19` | Thành phần giao diện và quản lý trạng thái |
| TypeScript | 5.7.3 | Kiểu dữ liệu; bật strict và kiểm tra biến/tham số không dùng |
| Tailwind CSS | `^4.2.0` | Styling và responsive layout |
| Radix UI | Theo từng package | Dialog, dropdown, select, tabs và các primitive giao diện |
| Axios | `^1.16.1` | HTTP client và interceptor xử lý xác thực/lỗi |
| SWR | `^2.5.1` | Fetch, cache và làm mới dữ liệu phía client |
| React Hook Form + Zod | `^7.54.1` và `^3.24.1` | Form và validation ở các luồng sử dụng |
| Recharts | 2.15.0 | Biểu đồ dashboard |
| Motion | `^12.40.0` | Animation giao diện |
| Lucide React | `^0.564.0` | Icon |
| Sonner | `^1.7.1` | Thông báo dạng toast |
| date-fns | 4.1.0 | Xử lý ngày giờ |
| pnpm | 10.33.4 | Quản lý package, dùng lockfile để cài tái lập |
| Node.js | Docker/CI dùng 22 | Runtime frontend và công cụ build |

Dấu `^` phản ánh khoảng phiên bản trong manifest; phiên bản cài thực tế được quyết định bởi `pnpm-lock.yaml`. Có package Vercel Analytics, nhưng layout chỉ render khi đồng thời là production và `VERCEL=1`; không thể xem đó là bằng chứng website đã có analytics vận hành.

### 4.3. Dữ liệu, hạ tầng và kiểm thử

| Thành phần | Công nghệ | Sử dụng thực tế |
|---|---|---|
| Database chính | MariaDB 11.2 | Người dùng, sản phẩm, biến thể, đơn và thanh toán |
| Database unit test | SQLite | Chạy test cô lập; không thay thế kiểm chứng khóa dòng trên MariaDB |
| Cache/hàng đợi | Redis 7 Alpine | Cache và backend cho ARQ/rate limiting |
| Object storage | MinIO | Ảnh sản phẩm; release source 2024-01-18 được pin commit trong Dockerfile |
| Triển khai local | Docker, Docker Compose | Các service app và hạ tầng, volume dữ liệu và health check |
| Backend QA | Pytest, Hypothesis, Ruff | Unit/regression, property-based test và lint/format |
| Frontend QA | Vitest, Testing Library, jsdom, ESLint, TypeScript | Logic client, component, lint và type check |
| Browser QA | Playwright | Kịch bản phiên đăng nhập, ảnh, quản trị catalog và walkthrough |
| CI | GitHub Actions | Backend, frontend và smoke test Compose cô lập |

## 5. Kiến trúc hệ thống

### 5.1. Mô hình tổng thể

Đây là backend monolith được tổ chức theo module chức năng, đi cùng một frontend Next.js và worker nền. Các container triển khai tách biệt không có nghĩa backend đã được chia thành microservices nghiệp vụ.

```text
Trình duyệt khách hàng / quản trị viên
                 |
          Next.js frontend
                 | HTTP /api/v1
             FastAPI API
                 |
       Router -> Service -> Domain/ORM
                 |
          MariaDB (giao dịch)

API / Service ---- MinIO (ảnh sản phẩm)
API / Service ---- Redis (cache, rate limit, queue)
                            |
                        ARQ worker
                     /             \
             Hết hạn đơn          Email SMTP

Dịch vụ thanh toán bên ngoài -> webhook của API
(cần tích hợp và xác minh riêng với nhà cung cấp thực tế)
```

### 5.2. Tổ chức backend

- `app/core`: cấu hình, database session, xác thực, lỗi, cache và rate limiting.
- `app/features`: các module users, categories, products, orders, dashboard, health.
- `router.py`: khai báo endpoint, schema, quyền truy cập và chuyển yêu cầu sang service.
- `service.py`: truy vấn và điều phối transaction/nghiệp vụ.
- `orders/domain.py`: quy tắc tồn kho và chuyển trạng thái đơn được tách khỏi thao tác database.
- `app/integrations`: ranh giới tích hợp MinIO, Redis queue, email và VietQR.
- `app/jobs`, `worker.py`: entry point cho tác vụ nền.
- `alembic/versions`: 12 file migration tại thời điểm rà soát; head được tài liệu ghi là `f8a1b2c3d4e5`.

**Đánh giá:** cấu trúc này phù hợp quy mô hiện tại, giúp tìm mã theo nghiệp vụ và kiểm thử logic đơn hàng độc lập. Có test kiểm tra ranh giới kiến trúc, như hạn chế router tự thực hiện truy vấn/commit. Tuy nhiên, `orders/service.py` đã dài hơn 1.100 dòng, chứa checkout, chuyển trạng thái, tracking, hết hạn và webhook. Khi mở rộng, nên tách theo các nhóm trách nhiệm này để giảm phạm vi ảnh hưởng của mỗi thay đổi.

### 5.3. Tổ chức frontend

Frontend dùng App Router, tách các route cửa hàng dưới `/store`, đăng nhập/đăng ký và khu vực quản trị như `/dashboard`, `/products`, `/orders`, `/customers`, `/categories`. Component dùng chung nằm trong `components`; logic truy cập dữ liệu và phiên nằm trong `hooks`, `lib`.

Axios client tập trung hóa base URL `/api/v1`, xử lý lỗi, đính kèm bearer token, refresh và chuẩn hóa URL ảnh. SWR được dùng cho dữ liệu catalog và quản trị. Giỏ hàng có Context riêng và lưu ID biến thể/số lượng, sau đó lấy lại thông tin từ API.

**Đánh giá:** có phân chia hợp lý giữa trang, component, hook và HTTP client. Tuy nhiên, một số trang và context còn nhiều logic, dùng `any` hoặc duy trì hợp đồng tương thích cũ. TypeScript strict đã bật nhưng những vị trí dùng `any` vẫn làm giảm hiệu quả kiểm tra kiểu.

## 6. Thiết kế dữ liệu và tính đúng đắn nghiệp vụ

### 6.1. Các thực thể chính

| Thực thể | Vai trò |
|---|---|
| User | Tài khoản, vai trò và thông tin hồ sơ |
| UserSession | Phiên refresh theo thiết bị, phiên bản token, hạn dùng và trạng thái thu hồi |
| Category | Phân loại sản phẩm |
| Product | Thông tin chung: tên, slug, giá gốc, chất liệu, form, hướng dẫn bảo quản, bảng size |
| ProductVariant | SKU, size, màu, giá ghi đè và các bộ đếm tồn kho |
| ProductImage | Object key, thứ tự, ảnh chính, màu và loại ảnh |
| InventoryAdjustment | Tồn trước/sau, mức thay đổi, lý do và người thao tác |
| Order | Người nhận, phương thức thanh toán, trạng thái, tổng tiền, mã tracking, mốc thời gian |
| OrderItem | Từng dòng hàng cùng snapshot tên, giá, SKU, size và màu |
| Payment | Giao dịch thanh toán, số tiền, provider và trạng thái |
| ProductReview | Điểm sao, nội dung và phản hồi độ vừa size |

### 6.2. Quản lý tồn kho theo biến thể

Công thức trong domain:

```text
tồn khả dụng = stock_quantity - reserved_quantity - sold_quantity
```

Database đặt các ràng buộc: các bộ đếm không âm và `reserved_quantity + sold_quantity <= stock_quantity`. SKU có ràng buộc duy nhất; tổ hợp sản phẩm/size/màu cũng được bảo vệ bằng unique constraint.

Điều cần hiểu khi vận hành là `stock_quantity` không phải toàn bộ số lượng còn bán được tại thời điểm hiện tại. Phải đọc đồng thời lượng giữ chỗ và đã bán. Đây là mô hình hợp lệ, nhưng cần tài liệu nhất quán để tránh admin hoặc báo cáo bên ngoài hiểu sai.

Checkout gom các dòng trùng biến thể, khóa biến thể theo ID đã sắp xếp, kiểm tra sản phẩm còn hoạt động và đọc giá từ database. Sau đó giữ chỗ tồn kho và tạo đơn trong transaction. Cách sắp xếp khóa giúp giảm nguy cơ deadlock; không thay thế kiểm thử cạnh tranh hoặc giám sát deadlock thực tế.

**Đánh giá:** thiết kế bảo vệ tồn kho ở cả tầng ứng dụng và database tốt hơn cách chỉ kiểm tra số lượng trên frontend. Tuy nhiên, luồng checkout có truy vấn theo từng biến thể và sản phẩm cha; số lượt truy vấn tăng theo số dòng giỏ hàng. Cần benchmark trước khi tối ưu, đồng thời bảo toàn thứ tự và phạm vi khóa.

### 6.3. Snapshot đơn hàng và tiền tệ

`OrderItem` lưu tên sản phẩm, giá đơn vị, SKU, size, màu và thành tiền tại thời điểm đặt hàng. Việc chỉnh sửa catalog sau đó không được dùng để tính lại lịch sử mua hàng. Model tiền dùng `Numeric(12,2)` và luồng tính tổng dùng `Decimal`; VietQR có hàm làm tròn VND.

Checkout yêu cầu giỏ hàng cùng một tiền tệ; VietQR yêu cầu VND. Các field đơn một sản phẩm cũ vẫn còn trong `Order` để tương thích. Đây là nợ kỹ thuật có căn cứ: khi loại bỏ cần migration và kiểm tra những đoạn summary/fallback đang phụ thuộc vào chúng.

### 6.4. Trạng thái đơn và hủy đơn

Domain khai báo các chuyển trạng thái được phép theo phương thức thanh toán. Đơn VietQR bắt đầu pending, có thời hạn mặc định 30 phút; đơn COD mới tạo ở trạng thái confirmed. Worker kiểm tra hết hạn theo lịch mỗi phút.

Khách hàng được hủy pending VietQR hoặc confirmed COD theo chính sách server. Quyền quản trị có phạm vi chuyển trạng thái rộng hơn. Chuyển paid điều chỉnh bộ đếm giữ chỗ/đã bán; hủy hoặc hết hạn giải phóng phần tồn tương ứng.

**Điểm cần hoàn thiện khi vận hành thật:** trạng thái trả hàng, hủy sau giao, hoàn tiền và hàng nhập lại kho cần quy trình riêng. Mã hiện có cho phép một số chuyển từ shipped/delivered sang cancelled ở phía quản trị; không nên tự diễn giải thao tác đó là đã hoàn tiền hoặc đã nhận hàng hoàn về kho. Chưa có module hoàn tiền tự động và reverse logistics.

### 6.5. Thanh toán và đối soát

VietQR adapter tạo URL ảnh QR dựa trên ngân hàng, tài khoản, số tiền và nội dung chuyển khoản. Webhook dùng secret header, so sánh bằng `hmac.compare_digest`, đối chiếu thông tin và có unique constraint trên cặp provider/transaction ID.

Các tình huống như tiền đến muộn, giao dịch bổ sung hoặc sai số tiền được ghi nhận với trạng thái riêng để quản trị xem xét. Việc lưu chúng phục vụ đối soát, chưa phải quy trình tự động hoàn trả hoặc xử lý chênh lệch hoàn chỉnh.

**Đánh giá:** đã có nền tảng ghi nhận thanh toán và chống trùng. Chưa thể kết luận tiền vào tài khoản sẽ tự động cập nhật đơn nếu chưa triển khai adapter/callback thật theo nhà cung cấp, xác minh nguồn gửi và nghiệm thu bằng giao dịch thực tế.

## 7. Xác thực, phân quyền và bảo vệ dữ liệu

### 7.1. Các biện pháp đã có

- Mật khẩu băm bằng bcrypt; JWT phân biệt access và refresh token.
- Access token mặc định 30 phút; refresh token mặc định 7 ngày, có cấu hình.
- Refresh token nằm trong cookie HttpOnly, có tùy chọn Secure và SameSite; cấu hình chặn tổ hợp SameSite=None nhưng Secure=false.
- Access token phía frontend giữ trong bộ nhớ, không lưu bền vững vào localStorage. localStorage có nonce phối hợp phiên; BroadcastChannel hỗ trợ đồng bộ giữa tab.
- Phiên refresh được lưu ở database theo thiết bị, có phiên bản và thông tin thu hồi; frontend có khóa phối hợp refresh và kiểm tra thế hệ phiên để hạn chế phản hồi cũ ghi đè trạng thái mới.
- API kiểm tra quyền admin và quyền truy cập đơn; giao diện có guard tương ứng.
- Đăng nhập có rate limit theo IP và định danh; đăng ký, refresh và webhook có giới hạn riêng.
- Mã tracking công khai dùng giá trị ngẫu nhiên riêng; phản hồi che thông tin người nhận.

### 7.2. Giới hạn cần hiểu đúng

**Thu hồi refresh không đồng nghĩa thu hồi ngay mọi access token đã phát hành.** `get_current_user` hiện giải mã access token rồi tìm user chưa bị xóa; không đối chiếu `user_sessions` trong từng request. Một access token đã bị sao chép có thể tiếp tục được chấp nhận đến hạn nếu không có điều kiện khác ngăn lại. Khi sản phẩm yêu cầu “đăng xuất vô hiệu hóa ngay mọi request”, cần bổ sung chính sách kiểm tra session/token rõ ràng.

Rate limiter có fallback in-memory. Cơ chế này giúp ứng dụng tiếp tục chạy khi Redis lỗi nhưng hạn mức fallback theo từng process, không còn là một hạn mức dùng chung giữa các replica.

Guard frontend phục vụ điều hướng và trải nghiệm; API mới là nơi phải quyết định quyền truy cập. Cần tiếp tục duy trì test phân quyền khi thêm endpoint mới.

### 7.3. Bảo vệ upload ảnh

API chấp nhận PNG, JPEG và WebP tĩnh, tối đa 5 MiB, tối đa 8.192 pixel mỗi chiều và 16 triệu pixel tổng. Kiểm tra bao gồm extension, MIME, magic bytes, cấu trúc file và giải mã pixel; có chặn ảnh hỏng, bị cắt và ảnh động.

Ảnh sản phẩm lưu trên MinIO theo đường dẫn public. Đây là thiết kế phù hợp để phân phối ảnh catalog. Ảnh cơ thể/người dùng cho VTON trong tương lai cần bucket private, quyền sở hữu, URL tạm, thời hạn lưu và cơ chế xóa riêng.

## 8. Hiệu năng, trải nghiệm và khả năng mở rộng

### 8.1. Những cơ chế đã có

Backend có connection pool cho MariaDB với `pool_size=10`, `max_overflow=20`, kiểm tra kết nối trước khi dùng và recycle. Có index, phân trang, một số truy vấn aggregate và cache. Dashboard metrics được cache 60 giây và có hàm invalidate khi dữ liệu liên quan thay đổi. Mã sản phẩm dùng aggregate cho điểm đánh giá thay vì cần nạp toàn bộ collection review.

Frontend có SWR, trạng thái loading/error/empty và một số thao tác thử lại. Next.js được cấu hình nguồn ảnh và rewrite `/storage/<bucket>/...` tới MinIO nội bộ. Layout có responsive class và điều hướng mobile.

**Giới hạn kết luận:** chưa chạy đánh giá Lighthouse, kiểm toán accessibility hoặc quan sát trực tiếp toàn bộ giao diện trong đợt này. Không dùng ảnh thiết kế có sẵn làm bằng chứng rằng mọi màn hình hiện tại hiển thị đúng trên mọi thiết bị.

### 8.2. Dashboard chưa phải hệ thống phân tích đầy đủ

`frontend/app/dashboard/page.tsx` truyền `data={[]}` vào RevenueChart. Component hiển thị trạng thái không có lịch sử; backend dashboard hiện không cung cấp API chuỗi doanh thu theo ngày/tháng.

Biểu đồ trạng thái đếm từ `recentOrders`. Endpoint mặc định trả 5 đơn gần nhất, nên phân bố này chỉ phản ánh tập đơn đang hiển thị. Giao diện đã ghi phạm vi “recent orders”; báo cáo kinh doanh không được dùng nó làm tỷ lệ trạng thái của toàn hệ thống.

Doanh thu tổng hiện tính từ các đơn có dấu hiệu đã thanh toán và không cancelled/expired. Đây là số tổng theo quy tắc ứng dụng, chưa phải sổ kế toán có hoàn tiền, phí, thuế và đối soát ngân hàng.

Ngoài ra, `Settings.low_stock_threshold` đã tồn tại nhưng truy vấn dashboard đang dùng trực tiếp mốc 20. Thay cấu hình không bảo đảm thay đổi thống kê tồn thấp. Nên thống nhất một nguồn quy tắc trước khi dùng để ra quyết định nhập hàng.

### 8.3. Điểm cần đo trước khi tăng quy mô

- Độ trễ p50/p95/p99 của tìm kiếm, chi tiết sản phẩm, checkout và webhook.
- Thời gian giữ khóa và tỷ lệ deadlock khi nhiều người mua cùng SKU.
- Số truy vấn theo số dòng giỏ hàng, kích thước catalog và lượng review.
- CPU/RAM của API, số kết nối database và khả năng chịu tải của pool theo số process.
- Thời gian chờ queue, tỷ lệ retry/thất bại và thời gian xử lý đơn hết hạn.
- Thời gian tải ảnh/trang trên thiết bị mobile và mạng chậm.

Hiện không có số liệu đủ để tuyên bố hệ thống hỗ trợ một lượng người dùng đồng thời cụ thể. Chưa có cơ sở kỹ thuật bắt buộc phải chuyển sang microservices hoặc thay ORM chỉ từ cấu trúc hiện tại.

## 9. Kiểm thử và chất lượng kỹ thuật

### 9.1. Phạm vi bộ test

Tại thời điểm rà soát có 83 file backend dạng `test_*.py`, 42 file frontend dạng `*.test.ts/tsx`, 3 file Playwright và 12 file migration. Đây là số file, không phải số test case hay tỷ lệ bao phủ.

Bộ backend bao gồm xác thực, cookie, phiên thiết bị, phân quyền, catalog, variant, validation checkout, tồn kho, chuyển trạng thái, thanh toán, tracking, ảnh và email. Có test kiến trúc, kiểm tra truy vấn và các tình huống hồi quy cụ thể.

Nhóm integration kiểm tra trên database ngoài: tranh mua đơn vị tồn cuối, hủy đơn đồng thời, webhook đồng thời, thay catalog trong lúc checkout, tính duy nhất user/review và migration. Các test này quan trọng vì SQLite không mô phỏng đầy đủ cơ chế khóa MariaDB.

Frontend có test về API client, phiên/refresh, auth flow, giỏ hàng, chọn variant, checkout, catalog, quản lý ảnh, quản lý kho, dashboard và hủy đơn. Playwright cung cấp kiểm thử trình duyệt cho session/ảnh, CRUD catalog và walkthrough demo.

### 9.2. CI đã cấu hình

GitHub Actions chia thành ba nhóm:

1. Backend: cài dependency có hash, `pip check`, Ruff lint/format, Alembic upgrade và downgrade/upgrade, Pytest cùng dịch vụ MariaDB/Redis.
2. Frontend: cài theo lockfile, TypeScript, Vitest, ESLint không chấp nhận warning và build production.
3. Compose smoke: dựng môi trường cô lập, cài Chromium và chạy script smoke có browser test.

Đây là nền tảng kiểm soát hồi quy đáng kể. Việc tồn tại workflow không chứng minh lần CI mới nhất thành công; cần xem kết quả chạy của đúng commit chuẩn bị phát hành.

### 9.3. Kết quả xác minh trong đợt đánh giá

Đã khởi chạy hai lệnh sau trong đợt đánh giá:

```powershell
# Tại backend/
.\.venv\Scripts\python.exe -m pytest -m 'not integration' -q

# Tại frontend/
.\node_modules\.bin\vitest.cmd run --reporter=dot
```

Cả hai tiến trình có hiển thị tiến độ nhưng chưa trả về tổng kết trong thời gian rà soát và đã được chủ động dừng. Vì vậy, **không có kết luận toàn bộ test pass hoặc fail từ lần chạy này**; cũng chưa xác định nguyên nhân thời gian chạy kéo dài. Đây là giới hạn xác minh, không phải bằng chứng hệ thống có lỗi nghiệp vụ. Không chạy test integration trên database nghiệp vụ đang dùng.

Không có số liệu coverage, kết quả benchmark tải, kiểm thử giao dịch ngân hàng thật hoặc chứng cứ gửi SMTP thật trong phạm vi đánh giá này. Không xác nhận build production, E2E hay toàn bộ CI đã đạt nếu chưa chạy tương ứng.

## 10. Triển khai, tác vụ nền và vận hành

### 10.1. Docker Compose

Compose có 7 service: MariaDB, Redis, MinIO, migrate, API, ARQ worker và frontend. API/worker chờ migration hoàn tất; các thành phần có health check và volume dữ liệu phù hợp. Các port host mặc định bind vào loopback, thuận tiện cho phát triển local.

Dockerfile backend/frontend dùng multi-stage và chạy bằng user không phải root. Backend dùng requirements có hash; frontend cài với frozen lockfile. MinIO được build từ source pin commit, giúp xác định nguồn nhưng tăng phụ thuộc network và thời gian build lần đầu.

Chưa thấy cấu hình reverse proxy/TLS hoặc triển khai dự phòng nhiều node trong Compose hiện tại. Khi đưa ra môi trường public cần thiết kế domain, HTTPS, cookie, CORS, quản lý secret, backup và giám sát tương ứng. Các biến `NEXT_PUBLIC_*` được đóng vào bundle lúc build, nên thay biến môi trường runtime đơn thuần chưa chắc đổi được endpoint trên trình duyệt.

### 10.2. Độ tin cậy của tác vụ nền

ARQ chạy email chào mừng, xác nhận đơn, báo thanh toán và lịch hết hạn đơn. Worker đặt `max_tries=3`, `job_timeout=60`; lịch hết hạn chạy mỗi phút. Worker mở database session riêng cho từng tác vụ.

Email được enqueue sau khi transaction đơn đã commit, theo cơ chế best effort. Lợi ích là lỗi gửi thông báo không làm hỏng việc đặt hàng. Hạn chế là có khoảng trống: database lưu thành công nhưng enqueue thất bại thì không có bảo đảm sự kiện email đã được lưu bền vững để gửi lại.

Nếu yêu cầu nghiệp vụ là mọi đơn đều phải có thông báo có thể truy vết, nên dùng transactional outbox hoặc bản ghi tác vụ bền vững, kèm trạng thái gửi và cơ chế xử lý lại. Cấu hình retry của worker không tự giải quyết trường hợp tác vụ chưa từng vào queue.

### 10.3. Quan sát hệ thống và phục hồi

API có request ID và log lỗi; health endpoint truy vấn database và ping Redis. Tuy nhiên, Redis suy giảm không làm health tổng chuyển 503 nếu database vẫn tốt; MinIO chỉ trả `configured`, không kiểm tra khả năng đọc/ghi trực tiếp. Vì vậy HTTP 200 ở health chưa đủ chứng minh cửa hàng, ảnh và email đều hoạt động.

SQL và MinIO là hai hệ lưu trữ độc lập. Luồng upload có cleanup best effort khi ghi metadata thất bại, nhưng không có transaction nguyên tử xuyên hai hệ. Cần đối chiếu object mồ côi và metadata trỏ ảnh mất trong vận hành.

Có script/tài liệu backup SQL và khôi phục vào database mới; script từ chối ghi đè snapshot và tránh restore lên database đã tồn tại. SQL dump không chứa ảnh MinIO. Chưa có căn cứ khẳng định đã đạt RPO/RTO cụ thể hoặc có lịch backup tự động đã được diễn tập đầy đủ.

## 11. Tổng hợp điểm mạnh và điểm hạn chế

### 11.1. Điểm mạnh có bằng chứng

1. **Đúng trọng tâm nghiệp vụ thời trang:** quản lý variant size/màu/SKU, bảng size, album và phản hồi độ vừa.
2. **Chú trọng toàn vẹn giao dịch:** server tính giá, transaction, khóa dòng, constraint tồn kho và snapshot dòng hàng.
3. **Thanh toán có xử lý ngoại lệ:** chống trùng transaction và lưu các trường hợp cần đối soát.
4. **Kiến trúc có ranh giới:** router, service, domain, integration và job được phân tách; có test kiến trúc.
5. **Quản lý phiên có chiều sâu:** refresh cookie, phiên theo thiết bị, xử lý nhiều tab và phản hồi bất đồng bộ cũ.
6. **Kiểm thử nhiều lớp:** logic, API, component, concurrency, migration và browser smoke.
7. **Tài liệu tương đối thẳng thắn:** nêu rõ giới hạn AI, thanh toán, email, health và backup ảnh.

### 11.2. Hạn chế có ảnh hưởng thực tế

1. Chưa có VTON dù tên AI-VTON còn xuất hiện.
2. Thanh toán ngân hàng tự động đầu cuối chưa được chứng minh.
3. Chưa có quy trình hoàn tiền/trả hàng/giao vận hoàn chỉnh.
4. Dashboard phân tích lịch sử còn thiếu dữ liệu.
5. Chưa bảo đảm nguyên tử giữa lưu giao dịch và phát tác vụ email.
6. Health chưa bao quát storage và worker; chưa có bằng chứng vận hành HA hoặc phục hồi theo mục tiêu cụ thể.
7. Một số service/context lớn và hợp đồng dữ liệu cũ làm tăng chi phí bảo trì.
8. Thiếu benchmark để đánh giá hiệu năng và năng lực mở rộng.

## 12. Đề xuất theo thứ tự ưu tiên

Các mục dưới đây là đề xuất từ kết quả rà soát, không phải chức năng đã hoàn thành hoặc kế hoạch triển khai đã được phê duyệt.

| Ưu tiên | Việc cần thực hiện | Tiêu chí xác nhận |
|---|---|---|
| Trước khi nhận thanh toán thật | Kết nối callback nhà cung cấp, chuẩn hóa xác thực, chống phát lại và đối soát | Kiểm thử giao dịch thành công, sai số tiền, lặp callback, tiền đến muộn và sự cố mạng |
| Trước khi bán hàng thật | Chốt quy trình COD, giao hàng, hủy sau giao, trả hàng và hoàn tiền | Quyền thao tác, luồng tiền và thời điểm nhập lại kho được thể hiện rõ trong API/UI |
| Trước khi public | Hoàn thiện HTTPS, secret, cookie, CORS và backup cả SQL lẫn ảnh | Nghiệm thu đăng nhập và mua hàng trên domain thật; restore thử thành công |
| Trước khi cam kết độ tin cậy | Bổ sung theo dõi queue, worker, storage và cơ chế phục hồi thông báo | Có thể phát hiện và xử lý đơn đã lưu nhưng chưa enqueue, email lỗi và ảnh thiếu |
| Ngắn hạn | Hoàn thiện API doanh thu theo thời gian và thống nhất ngưỡng tồn thấp | Dashboard có kỳ thống kê rõ, số liệu đối chiếu đúng với database |
| Ngắn hạn | Xác định yêu cầu thu hồi access token | Hành vi sau logout/đổi mật khẩu được mô tả và kiểm thử đúng yêu cầu |
| Ngắn hạn | Benchmark luồng checkout/catalog bằng dữ liệu đại diện | Có số đo độ trễ, query count, kết nối và cạnh tranh tồn kho |
| Khi mở rộng mã | Tách service đơn hàng, giảm `any`, xử lý field legacy theo lộ trình | Giữ nguyên invariant và chạy lại regression/integration phù hợp |
| Nếu triển khai AI | Chọn engine/provider, chuẩn hóa ảnh và thiết kế module VTON riêng | Có đánh giá chất lượng, chi phí, thời gian xử lý, quyền dữ liệu và phục hồi job |

### Điều kiện riêng cho VTON

Module thử đồ cần bổ sung tối thiểu: API upload ảnh người dùng có đồng ý sử dụng dữ liệu; storage private; kiểm tra quyền sở hữu; task có trạng thái bền vững; queue/worker inference riêng; retry/idempotency/quota; UI chờ/lỗi/kết quả; thời hạn lưu và xóa ảnh; benchmark chất lượng và chi phí.

Không nên đưa inference kéo dài vào worker hiện đang xử lý email và hết hạn đơn. Ảnh SVG seed của catalog chỉ là dữ liệu minh họa, không chứng minh chất lượng đầu vào hay đầu ra của bất kỳ engine thử đồ nào.

## 13. Nhận định cuối cùng

TrueLook có nền tảng kỹ thuật đủ rõ để tiếp tục phát triển thành cửa hàng thời trang trực tuyến: chức năng mua hàng đã nối với backend, model variant phù hợp lĩnh vực và các quy tắc quan trọng được bảo vệ bằng nhiều lớp.

Ưu tiên tiếp theo nên là hoàn thiện vận hành thương mại thực tế, xác minh tích hợp thanh toán và phục hồi dữ liệu, bổ sung khả năng quan sát và dữ liệu phân tích. Chức năng AI cần được xem là một phân hệ mới với yêu cầu riêng về xử lý ảnh, quyền riêng tư và tài nguyên tính toán. Việc gắn tên AI-VTON cho phiên bản hiện tại chưa phản ánh đầy đủ chức năng đã triển khai.

## 14. Nguồn đối chiếu trong repository

| Nội dung | File/nhóm file chính |
|---|---|
| Phạm vi và giới hạn | `README.md`, `docs/VTON_READINESS.md` |
| Công nghệ backend | `backend/requirements.in`, các `requirements-*-lock.txt`, `backend/Dockerfile` |
| Công nghệ frontend | `frontend/package.json`, `frontend/pnpm-lock.yaml`, `frontend/tsconfig.json`, `frontend/Dockerfile` |
| Kiến trúc API | `backend/app/main.py`, `backend/app/core/database.py`, `backend/app/features/*/router.py` |
| Dữ liệu catalog/kho | `backend/app/features/products/model.py`, `variant_model.py`, `variant_service.py` |
| Checkout và trạng thái | `backend/app/features/orders/service.py`, `domain.py`, `model.py`, `router.py` |
| Xác thực và phiên | `backend/app/core/security.py`, `features/users/router.py`, `sessions.py`, `session_model.py` |
| Phiên phía client | `frontend/lib/api.ts`, `session.ts`, `session-lock.ts` |
| Giỏ hàng/wishlist | `frontend/app/store/context/CartContext.tsx`, `frontend/app/store/account/page.tsx` |
| Ảnh và storage | `backend/app/features/products/images.py`, `backend/app/integrations/storage.py`, `frontend/next.config.mjs` |
| Thanh toán | `backend/app/integrations/vietqr.py`, `features/orders/service.py`, `docs/PAYMENT_SETUP.md` |
| Dashboard | `backend/app/features/dashboard/service.py`, `router.py`, `frontend/app/dashboard/page.tsx` |
| Worker và health | `backend/app/worker.py`, `jobs/`, `features/health/router.py` |
| CI và kiểm thử | `.github/workflows/ci.yml`, `backend/tests/`, `frontend/tests/`, `frontend/e2e/` |
| Triển khai và phục hồi | `docker-compose.yml`, `docs/DEMO_BACKUP.md`, `.github/scripts/demo_backup.py` |
