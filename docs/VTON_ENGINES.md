# VTON engines (nhánh `feat/vton-api-engines`)

Lớp gọi nhiều model try-on qua một giao diện chung, nằm trong `backend/app/features/vton_lab/`.
Mục đích: thử nhanh API/model của bên khác, so sánh thời gian/chất lượng, rồi thay bằng thuật toán tự viết chạy local (~4 s CPU).

## Cấu hình

| Biến môi trường | Ý nghĩa |
|---|---|
| `VTON_LAB_ENGINES_FILE` | Đường dẫn file JSON khai báo engine (để trống = chỉ có `mock`) |
| `VTON_LAB_DEFAULT_ENGINE` | Engine mặc định (mặc định `mock`; file JSON có thể ghi đè bằng `"default"`) |

```json
{
  "default": "dmvton",
  "engines": {
    "dmvton": {
      "type": "dmvton_cpu",
      "repo": "D:/vton-local/dm-vton",
      "warp_checkpoint": "D:/vton-local/models/dmvton_pf_warp.pt",
      "gen_checkpoint": "D:/vton-local/models/dmvton_pf_gen.pt",
      "threads": 4
    },
    "catvton": { "type": "catvton_http", "url": "http://localhost:8080", "timeout_s": 3600 },
    "space": {
      "type": "gradio_space", "space": "owner/name", "api_name": "/tryon",
      "args": ["$person", "$garment"], "hf_token_env": "HF_TOKEN"
    }
  }
}
```

## Engine có sẵn

- `mock` – dán áo lên người, đóng dấu "DEMO PREVIEW"; luôn có, dùng cho CI/dev.
- `dmvton_cpu` – DM-VTON student (warp + generator nhỏ) chạy CPU, thay lớp correlation CUDA (`cupy`) bằng PyTorch thuần. Chỉ áo trên (`upper`). Cần `torch`, `torchvision`, clone DM-VTON và 2 checkpoint (không nằm trong repo). Đo với trọng số ngẫu nhiên: ~2.1 s ở 256x192, ~7.7 s ở 512x384.
- `catvton_http` – gọi dịch vụ CatVTON local (`POST {url}/v1/tryon`). Rất chậm trên CPU (~45 phút/ảnh), chỉ dùng làm "thầy" để chưng cất.
- `gradio_space` – gọi bất kỳ app Gradio/HF Space; cần `pip install gradio_client`; ảnh bị gửi ra ngoài (`sends_images_off_host=true`), chỉ dùng ảnh test.

- `fashn_api` – gọi [FASHN API](https://docs.fashn.ai) (`POST /v1/run`, poll `/v1/status/{id}`). Khóa lấy từ biến môi trường `FASHN_API_KEY` (không ghi vào file JSON). Tùy chọn: `model_name` (`tryon-v1.6` mặc định, hoặc `tryon-max`), `mode` (`performance`, `balanced`, `quality`; đo thực tế qua mạng nhà: ~12–15 s và ~13–18 s cho hai chế độ đầu, gồm ~5–6 s độ trễ gửi/xếp hàng), `timeout_s` (mặc định 60), `moderation_level`. 1 credit ≈ $0.075/ảnh. Ảnh bị gửi ra ngoài. Lỗi kiểm duyệt/ảnh không hợp lệ từ phía FASHN được ánh xạ thành `BusinessRuleError` (không chuyển sang engine khác); hết credit, mất mạng, quá thời gian → `VtonEngineError` để `fallback` chuyển engine.

Ví dụ chuỗi API → local (`fallback` nhận danh sách spec nội tuyến; khi mất mạng sẽ rơi xuống DM-VTON; cache đã prewarm được `CachedVtonEngine` kiểm tra trước cả chuỗi):

```json
{
  "default": "auto",
  "engines": {
    "auto": {"type": "fallback", "engines": [
      {"type": "fashn_api", "mode": "performance", "timeout_s": 25},
      {"type": "dmvton_cpu", "repo": "D:/vton-local/dm-vton",
       "warp_checkpoint": "D:/vton-local/dmvton-weights/dmvton_pf_warp.pt",
       "gen_checkpoint": "D:/vton-local/dmvton-weights/dmvton_pf_gen.pt"}
    ]}
  }
}
```

Đặt `FASHN_API_KEY` trong môi trường của worker/backend (không commit).

## API (chỉ admin)

- `GET /api/v1/vton-lab/engines` – danh sách engine, loại áo hỗ trợ, đã load chưa.
- `POST /api/v1/vton-lab/try-on` – multipart `person`, `garment`, `cloth_type` (`upper|lower|overall`), `engine`, `seed`. Trả PNG, header `X-Vton-Engine`, `X-Vton-Elapsed-Ms`.

Giới hạn ảnh: PNG/JPEG/WebP, ≤ 8 MiB, cạnh ngắn ≥ 128 px. Mỗi lần chỉ chạy một ảnh (khóa tuần tự vì CPU).

## Thêm engine mới

1. Tạo `engines/<ten>.py`, kế thừa `TryOnEngine`, gắn `@register_engine("<type>")`, cài `load()` và `generate(request) -> PIL.Image`.
2. Import module đó trong `engines/__init__.py`.
3. Khai báo trong file JSON ở trên. Thêm test vào `tests/test_vton_lab_engines.py`.

## Việc còn lại

Tải checkpoint DM-VTON và đo chất lượng thật; module size/BMI (đo cơ thể từ pose + chiều cao + BMI, so với `Product.size_chart`); chưng cất từ CatVTON; tối ưu ONNX Runtime. Xem `KE_HOACH_THU_DO_THEO_SO_DO.md`.

## Nối vào luồng try-on của UI

Modal try-on gọi `/vton/tasks` (hàng đợi ARQ, worker `vton_worker`). Để worker dùng engine của lab thay vì `mock`:

```
VTON_ENGINE=lab
VTON_LAB_ENGINES_FILE=D:/vton-local/engines.json
VTON_LAB_DEFAULT_ENGINE=dmvton
```

Lỗi của engine được ánh xạ sang lỗi task: engine lỗi → `engine_error` (thử lại), ảnh/loại áo không hợp lệ → `invalid_input`, cấu hình sai → `engine_misconfigured` (không thử lại). Adapter: `features/vton_lab/adapter.py`. Lưu ý `VTON_SERVICE_TIMEOUT_SECONDS`/`VTON_STALE_PROCESSING_MINUTES` vẫn áp dụng cho engine chậm.

## Chất lượng: giới hạn vùng chỉnh sửa bằng human parsing

`dmvton_cpu` nhận thêm `parsing_repo` (clone CatVTON, chỉ dùng `model/SCHP`) và
`parsing_checkpoint` (`exp-schp-201908301523-atr.pth`). Khi có, mọi chỉnh sửa của model
bị giới hạn trong vùng áo, tay và cổ → hết quầng màu ở nền. Thêm ~0.6 s/ảnh trên CPU.
