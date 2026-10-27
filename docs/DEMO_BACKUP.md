# Bản dự phòng demo

Sau khi seed và trước khi thao tác checkout, từ repo root:

```powershell
python .github/scripts/demo_backup.py backup demo-backups/seeded.sql
```

Dump dùng transaction snapshot, lưu UTF-8 nguyên byte và gồm schema, migration, tài khoản, variant, tồn kho và đơn mẫu. Thư mục `demo-backups/` được bỏ qua bởi Git. Không ghi đè file backup đã có; chọn tên mới cho lần tiếp theo.

Kiểm tra restore vào database mới, không ghi đè database hiện tại:

```powershell
python .github/scripts/demo_backup.py restore demo-backups/seeded.sql --database truelook_restore
```

Để chạy lại từ bản restore, cấp quyền cho user app trên database mới và cấu hình `DATABASE_URL` trong `.env` trỏ tới database đó trên host `mariadb:3306`, rồi `docker compose up -d`. Giữ database ban đầu để có thể quay lại. Tên DB khôi phục đã tồn tại sẽ bị từ chối.

Ảnh nằm trong MinIO, không nằm trong SQL dump. Giữ volume MinIO của project demo; ảnh seed có thể được upload lại bằng `docker compose exec api python -m app.seed` (giữ nguyên các đơn và tài khoản). Ảnh admin tự upload cần được sao lưu riêng nếu sử dụng.

Video dự phòng và kết quả kiểm chứng thực tế được ghi ở [DEMO_VERIFICATION.md](DEMO_VERIFICATION.md). Video tự động là bản chạy trình duyệt thực, không thay thế lượt nghiệm thu thủ công của người thuyết trình.

Bản sạch đã chuẩn bị trên máy này: `demo-backups/clothing-seeded.sql` (12 sản phẩm quần áo, 3 đơn mẫu). DB nguồn `truelook_clothing_seed` và DB kiểm tra restore `truelook_clothing_restore_check` nằm trong project `truelook-demo`. Bản `seeded.sql` cũ là snapshot trước khi thu gọn danh mục; dùng bản clothing-seeded cho demo cuối.

# Video đã kiểm chứng — 2026-10-24

Bản Docker cuối kiểm tra ngày **2026-10-25**: dùng `demo-backups/admin-catalog-2026-10-25.webm` và `demo-backups/shop-walkthrough-2026-10-25.webm`; cả hai kịch bản production đã pass. Giữ các bản ngày 24 làm lịch sử.

- `demo-backups/admin-catalog-2026-10-24.webm`: CRUD danh mục/sản phẩm, size/màu, thay/xóa ảnh trên bản Docker 13000.
- `demo-backups/shop-walkthrough-2026-10-24.webm`: khách mua COD, hủy đơn, chuyển sang admin/dashboard/Settings, quay từ lượt walkthrough hoàn tất.
- Các video/ảnh và SQL trong `demo-backups/` được gitignore; giữ bản sao riêng khi chuyển máy.
