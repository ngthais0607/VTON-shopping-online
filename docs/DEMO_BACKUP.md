# Backup và kiểm chứng khôi phục shop

Cách dùng hiện tại từ repo root (Python có dependencies backend, Docker đang chạy):

```powershell
backend/.venv/Scripts/python.exe .github/scripts/demo_restore_check.py --source-project truelook-demo --output demo-backups/shop-stable-20261025-unique
```

Chọn tên output mới cho mỗi lượt. Dừng thao tác CRUD/checkout trong lúc chụp snapshot. Script chỉ đọc project nguồn; tạo MariaDB và MinIO riêng trong project `shop-restore-check-<random>`, import DB, khôi phục và đọc lại mọi object catalog được DB tham chiếu, kiểm tra counts/migration/SHA-256, rồi dọn riêng tài nguyên thử. Không sửa DATABASE_URL hoặc bucket của demo sống để kiểm tra restore.

Artifacts gồm database.sql, objects/ và manifest.json với mapping object name, Content-Type, kích thước/hash và kết quả verified. Có cả ảnh admin tự upload; chỉ giữ ảnh seed không đủ để khôi phục catalog. Nếu verified=false hoặc script lỗi, chưa công nhận backup đã nghiệm thu; giữ artifacts để chẩn đoán và chạy lại vào thư mục mới. Script từ chối ghi đè output đã có.

SQL chứa dữ liệu tài khoản và đơn hàng; lưu bản sao ở nơi được giới hạn truy cập, không commit artifacts vào Git. Khi chuyển máy cần cả SQL, objects, manifest, cấu hình riêng và source/image tương ứng. Một SQL dump không chứa ảnh MinIO. Muốn rollback ứng dụng, dùng image/config trước thay đổi và giữ nguyên volumes nguồn; đợt ổn định này không đổi schema DB.

Lệnh SQL-only cũ bên dưới là tài liệu lịch sử. Nếu dùng script cũ, phải đặt COMPOSE_PROJECT_NAME đúng nguồn; script mới phía trên yêu cầu source-project rõ ràng và bao gồm ảnh.

---

# Bản dự phòng demo — lịch sử

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
