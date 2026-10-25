# Ổn định shop demo — 2026-10-25

Phạm vi đã duyệt: phương án A, ổn định shop trước VTON. Trạng thái: hoàn tất triển khai và nghiệm thu phương án A. Giữ thay đổi trong worktree riêng; chưa tag stable, chưa commit hoặc tích hợp về checkout gốc.

## Thay đổi

- Upload catalog xác minh cấu trúc và giải mã PNG/JPEG/WebP trước upload object hay đổi cover. Giữ nguyên bytes được chấp nhận, giới hạn 5 MiB, 8192 pixel mỗi chiều và 24 triệu pixel; từ chối multi-frame/animation. Lỗi ảnh không làm mất cover hiện tại.
- WebP VP8/VP8L/VP8X được đọc kích thước từ header có giới hạn trước khi gọi decoder native của Pillow; không đổi thiết lập decoder toàn cục. Bổ sung pin Pillow 13.0.0 trong cả bốn hashed lockfile.
- Analytics chỉ bật khi production và NEXT_PUBLIC_ANALYTICS_ENABLED=true; mặc định false ở env mẫu và Docker build args.
- Helper demo_restore_check.py yêu cầu project nguồn rõ ràng, backup SQL cùng mọi object catalog được DB tham chiếu, Content-Type và SHA-256; import/restore và đối chiếu trên MariaDB/MinIO riêng, chỉ dọn project dùng thử do lượt chạy tạo. Artifact đã có sẽ không bị ghi đè.
- README, VTON_READINESS và DEMO_BACKUP được cập nhật theo khả năng thực có. Chưa thêm inference, private VTON storage, mapping engine hay quota.

## Bằng chứng đã đọc

| Kiểm tra | Kết quả |
|---|---|
| Hồi quy ảnh header giả trước sửa | 3 ca fail đúng do không raise BusinessRuleError |
| Test ảnh sau validation ban đầu | 42 pass |
| Analytics flag trước/sau sửa | 3 fail → 5 pass |
| Backup helper | 6 pass; Content-Type có vòng red → green riêng |
| Native decoder WebP oversized | 3 fail → pass; test không cấp phát canvas lớn thật |
| Toàn bộ test ảnh sau fix review | 48 pass |
| Backend trước fix WebP cuối | 586 pass, 206,86 giây |
| Frontend sau cài dependency riêng | 157/157 pass, 37 file; 302,47 giây; TypeScript và ESLint pass |
| MariaDB integration | 29 pass, 210,96 giây; DB dùng một lần |
| Linux Python 3.12 hashed install / pip check / codec ảnh | Pass |
| Windows Python 3.13 hashed install / pip check | Pass |
| Restore trước recreate, lượt đầu | DB và 14 object được khôi phục/đối chiếu, verified=true |
| Backend sau fix WebP cuối | 592 pass, 424,86 giây |
| Frontend production build cuối | Pass, exit 0; build cục bộ thành công sau khi bỏ junction qua hai ổ đĩa |
| Docker build/recreate/browser cuối | Pass; 6 service healthy, migration head f8a1b2c3d4e5, ARQ health pass; Playwright 2/2 pass (1,3 phút) |
| Restore baseline cuối | Pass, DB và 14 object; Content-Type giữ nguyên, hash các file backup đã kiểm tra lại |

Lượt build đầu bị ngắt do usage limit, không được tính pass. Build local tiếp theo phát hiện lỗi junction node_modules qua hai ổ C/D; junction đã được gỡ mà không xóa dependency nguồn, và đã cài dependency riêng theo frozen lockfile. Cache offline không đủ nên tải lại đúng package đã khóa. Khi tiếp tục, Docker Desktop đang tắt; đã khởi động lại trước khi thử build Docker. Stack fastapi-founder cũ không phải dependency của truelook-demo và không được dừng/xóa trong phiên này.

## Review độc lập

Reviewer đối chiếu với bản source trước sửa, thay vì HEAD vốn chưa chứa các thay đổi có sẵn của người dùng. Một finding P2: Pillow khởi tạo native WebP canvas trước giới hạn pixel của ứng dụng. Đã kiểm tra source Pillow 13 tại máy, tái hiện bằng ba header/decoder spy an toàn và bổ sung preflight; 48 test ảnh pass sau sửa. Không có finding hành động khác.

## Các quyết định khi thực hiện

1. Giữ nguyên thay đổi chưa commit của người dùng; lưu baseline và chỉ sửa trong worktree riêng. Chưa commit gộp baseline. Rủi ro nếu bỏ qua: đưa công việc có sẵn vào commit ngoài phạm vi.
2. Dùng PowerShell/Python để ghi ledger và bằng chứng thay các script Bash của skill trên Windows. Rủi ro: bookkeeping phải được kiểm tra trực tiếp qua file/log.
3. Giữ Content-Type khi backup/restore, ngoài nội dung file. Thiếu thuộc tính này có thể khiến ảnh phục hồi không hiển thị đúng.
4. Snapshot yêu cầu tạm ngưng CRUD/checkout; đối chiếu trước/sau counts, object names và Content-Type. Đây không phải snapshot transactional xuyên DB/MinIO; concurrent writes ngoài điều kiện này có thể làm backup không nhất quán.
5. Giữ worktree và ledger cho người dùng kiểm tra, chưa sửa checkout gốc D:/fastapi-founder. Chưa tích hợp hoặc tạo tag.

6. Gỡ junction node_modules qua hai ổ đĩa và cài dependency riêng theo frozen lockfile sau lỗi Webpack ./D:/; thư mục dependency nguồn ổ D không bị xóa. Chi phí là tải/cài package, không thay code sản phẩm.

## Vị trí và giới hạn

Source: worktree shop-stabilization đính kèm chat. Bằng chứng chi tiết nằm ở .superpowers/sdd/2026-10-25-shop-stabilization/. Backup nằm trong demo-backups/; chứa dữ liệu tài khoản/đơn hàng nên không commit vào Git hoặc chia sẻ công khai.

Chưa đo hiệu năng tải hoặc gửi SMTP thật. Không kết luận sẵn sàng production hoặc VTON từ kết quả demo này. Không có thay đổi schema DB; dữ liệu và volumes demo được giữ khi thay image.

Rollback ứng dụng dùng image IDs trong images-before.json và cấu hình trước sửa; không down --volumes nguồn. Có thể khôi phục SQL và object artifacts vào project mới để kiểm tra, không import đè lên demo đang dùng. Image IDs trước/sau, runtime states và log đã lưu trong bộ bằng chứng bên dưới.

## Baseline đã lưu

- Source base commit: `03005a7da8496275f090e77911798ba86133a931`; source gồm cả các thay đổi chưa commit được bảo toàn trong worktree.
- Source manifest SHA-256: `7d69e416868919156c6ad38dffa5db79737adf32eead735ca12178ee3cd9000c`. File validation trong API đang chạy khớp hash source ở worktree; Pillow runtime 13.0.0.
- Backup: `demo-backups/shop-baseline-final-20261025/` (database.sql, 14 object, manifest verified=true).
- Video/ảnh và bản sao log/identity: `demo-backups/shop-baseline-final-evidence-20261025/`; images-final.json ghi ID image cụ thể.
- Kịch bản browser đã xác nhận upload PNG hỏng trả 400 và giữ cover; đây là lỗi cố ý tạo để kiểm tra, không phải lỗi nghiệm thu. Không có request Analytics.
- Runtime nghiệm thu: shop `http://localhost:13000/store`, API `http://localhost:18000/docs`, project `truelook-demo`. Chạy lệnh Compose từ worktree này để dùng bản source đã sửa.
- Stack `fastapi-founder` cũ không cần cho shop demo này và chưa được dừng/xóa.

## Đóng gói Git

Theo yêu cầu tiếp theo của người dùng, bản shop đã nghiệm thu được đóng gói để push lên nhánh `codex/shop-stabilization`. Các ghi chú chưa commit ở phần trước mô tả trạng thái lúc nghiệm thu local; chưa tạo tag stable hoặc merge vào checkout gốc. Dữ liệu backup/video/config riêng tư được giữ local theo gitignore.
