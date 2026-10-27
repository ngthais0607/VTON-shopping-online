# Chuẩn bị module VTON

Cập nhật 2026-10-26. Đây là điều kiện triển khai, không phải xác nhận module đã sẵn sàng. Xem [review ổn định hiện tại](reviews/2026-10-26-stability-review.md).

| Thành phần | Hiện có | Cần bổ sung cho VTON |
|---|---|---|
| User/session | Refresh theo thiết bị, phân quyền | Quyền sở hữu task và ảnh |
| Catalog | Variant size/màu/SKU; ảnh có kind/color_name; upload verify/decode ảnh tĩnh, giới hạn 5 MiB/8192 pixel mỗi chiều/16 MP | UI quản lý loại ảnh/màu; ảnh phù hợp mỗi màu |
| Category | Hai tầng, slug có thể sửa | Mapping engine rõ ràng, trạng thái unsupported |
| Storage | MinIO ensure/put/delete/public_url; ảnh sản phẩm public | Storage private, URL tạm, retention và xóa dữ liệu |
| Worker | ARQ email/expire đơn, timeout 60 giây | Queue/worker inference riêng, task bền vững, idempotency, retry, phục hồi enqueue |
| UI | Shop và admin; chưa có thử đồ | Upload, consent, trạng thái chờ/lỗi/kết quả, quota |

Ảnh seed là SVG minh họa, chưa chứng minh chất lượng inference. Chưa có benchmark GPU/latency/chi phí và chưa chọn engine/provider.

Ổn định shop trước khi triển khai. Giữ module trong feature riêng, dùng user/variant qua ranh giới rõ ràng và migration riêng. Không đưa inference dài vào worker xử lý đơn hiện tại.
