# VTON readiness — sau review shop 2026-10-25

Ưu tiên đã thống nhất: ổn định và chốt baseline shop trước, chưa triển khai VTON.

| Hạng mục | Hiện có | Chưa có / cần xác minh |
|---|---|---|
| Shop | User/session, variant, giỏ hàng, COD/VietQR, admin catalog | Chưa nghiệm thu production hoặc tải đồng thời thực tế |
| Ảnh catalog | MinIO public products/*, metadata kind/color_name ở backend | UI chưa quản lý metadata VTON theo màu; ảnh seed SVG chưa chứng minh chất lượng inference |
| Queue | ARQ cho email và expire đơn | Chưa có task inference, trạng thái/recovery/idempotency VTON hoặc worker GPU riêng |
| Storage ảnh người dùng | Chưa triển khai | Cần private storage, quyền sở hữu, URL tạm thời, chính sách lưu/xóa |
| Mapping trang phục | Category và slug | Chưa có mapping xác định sang loại trang phục engine |
| Model/GPU | Chưa chọn | Chưa có benchmark latency, chi phí hay chất lượng |

Bằng chứng phiên review trước sửa: 566 backend unit, 29 MariaDB integration, 152 frontend test; production build và 2 kịch bản browser pass. Runtime migration head là f8a1b2c3d4e5. Đây là số liệu lịch sử của phiên review, không thay thế kiểm chứng source sau sửa.

Xem [review](reviews/2026-10-25-shop-vton-readiness-review.md) và báo cáo ổn định shop sau khi có kết quả mới. Không dùng tài liệu này để khẳng định đã hỗ trợ presigned URL, inference hay mô phỏng độ vừa size. Chưa xác minh SMTP thật, hiệu năng tải hoặc điều kiện vận hành production. Không có cam kết giá GPU, latency hoặc kết luận pháp lý trong đợt này.
