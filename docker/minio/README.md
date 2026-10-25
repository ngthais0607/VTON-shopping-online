# MinIO build cho demo

CI ngày 2026-10-25 không pull được `minio/minio:RELEASE.2024-01-18T22-51-28Z` từ Docker Hub trên runner sạch. Tag tương ứng trên Quay không tồn tại và binary archive trả HTTP 410; máy local trước đó chạy nhờ cache.

Dockerfile này build từ tag nguồn chính thức, xác minh commit `19387cafab76133c2e7642de4aac8c81b9f4f8c7`. Giữ nguyên release `RELEASE.2024-01-18T22-51-28Z`, dùng trình tạo version flags của upstream và kiểm tra `minio --version` khi build. Không dùng binary hoặc mirror của bên thứ ba và không nâng release/storage format.

Nguồn: [tag upstream](https://github.com/minio/minio/tree/RELEASE.2024-01-18T22-51-28Z), [hướng dẫn container upstream](https://github.com/minio/minio/blob/master/docs/docker/README.md). LICENSE upstream được đưa vào image.

Compose build image này như các service ứng dụng; lần chạy đầu cần internet để tải source và Go modules đã khóa trong upstream go.mod/go.sum. Go module/build cache được giữ bằng BuildKit. Giới hạn compiler parallelism để chạy cùng frontend build trên CI runner.

Healthcheck dùng endpoint `/minio/health/ready` qua curl thay cho `mc`, vì image này chỉ chứa server. API, port, credential environment và volume `/data` của demo giữ nguyên.
