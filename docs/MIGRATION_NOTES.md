# Migration và dữ liệu

Nguồn chuẩn: `backend/alembic/versions/`. Head hiện tại: `f8a1b2c3d4e5`.

## Chạy migration

Compose chạy migrate trước API và worker. Kiểm tra bằng `docker compose exec api alembic current`. Khi chạy backend riêng, từ `backend` với cấu hình database đã chuẩn bị, chạy `python -m alembic upgrade head` rồi `python -m alembic current`.

Sao lưu trước khi đổi schema theo [DEMO_BACKUP.md](DEMO_BACKUP.md). Không chạy downgrade trên dữ liệu cần giữ để thử nghiệm.

## Chuỗi revision

| Revision | Thay đổi |
|---|---|
| `6ea70e2e94f1` | Schema ban đầu |
| `c91f8a4e2b10` | Giao hàng, public code, phương thức thanh toán, thời hạn đơn |
| `8f4c2d1a7b90` | Phiên bản refresh token trên user |
| `d4a7c8e91f23` | OrderItem, review và ràng buộc dữ liệu |
| `e5b8c9d0f1a2` | Index truy vấn và fulltext |
| `f7c2a1b9e8d3` | Public code của đơn bắt buộc có giá trị |
| `a1b2c3d4e5f6` | Variant và thuộc tính thời trang |
| `b2c3d4e5f6a7` | Bỏ tồn kho legacy trên product và cột Paddle |
| `c3d4e5f6a7b8` | Lịch sử điều chỉnh tồn kho |
| `d4e5f6a7b8c9` | Loại review trùng và thêm unique constraint |
| `e6f7a8b9c0d1` | Ràng buộc reserved + sold không vượt stock; từ chối dữ liệu sai, không tự sửa |
| `f8a1b2c3d4e5` | Refresh session riêng cho từng thiết bị |

## Giới hạn khi mở rộng

- Tồn kho thuộc ProductVariant. Checkout gửi variant_id; OrderItem giữ snapshot tên/size/màu/SKU/giá. Điều chỉnh qua `POST /api/v1/variants/{id}/adjust-stock`, kèm lý do.
- Không dùng create_all thay migration trong runtime. Module mới cần revision và kiểm tra nâng/hạ schema trên database dùng một lần.
- Downgrade qua d4a7c8e91f23 xóa order_items và product_reviews. Review bị dedupe ở d4e5f6a7b8c9 không phục hồi bằng downgrade.
- Revision contract loại cột legacy; kiểm tra preflight và phương án phục hồi trước khi áp dụng dữ liệu cũ.
- Downgrade revision session xóa user_sessions; không kỳ vọng giữ nguyên refresh session.

Kiểm tra MariaDB riêng bằng `backend/.venv/Scripts/python.exe .github/scripts/run_integration.py` từ repo root. Script tạo container/database dùng một lần và tự dọn.
