# Thanh toán demo

COD là lựa chọn mặc định. Không đổi logic thanh toán hoặc xác thực webhook.

VietQR trong demo chỉ mô phỏng. `VIETQR_ACCOUNT_NO=0000000000` là số giả; không chuyển tiền thật. Cấu hình `VIETQR_WEBHOOK_SECRET` ở `.env` phải trùng header `X-Webhook-Secret`; secret rỗng bị từ chối theo logic hiện tại.

Sau khi checkout VietQR, lấy chính xác `memo` và `amount` trong response `vietqr` (hoặc Network panel). Tạo file `webhook.json`, thay hai giá trị bằng response thật và dùng transaction ID mới cho mỗi lần chuyển khoản:

```json
{
  "transaction_id": "demo-transfer-20261023-001",
  "amount": 250000,
  "content": "REPLACE_WITH_EXACT_CHECKOUT_MEMO",
  "account_number": "0000000000",
  "bank_code": "ICB"
}
```

PowerShell, từ thư mục gốc, dùng secret local trong `.env`:

```powershell
$webhookSecret = ((Get-Content .env | Where-Object { $_ -match '^VIETQR_WEBHOOK_SECRET=' } | Select-Object -Last 1) -split '=', 2)[1].Trim()
curl.exe --fail-with-body -X POST http://localhost:8000/api/v1/orders/vietqr-webhook -H "Content-Type: application/json" -H "X-Webhook-Secret: $webhookSecret" --data-binary '@webhook.json'
```

Với cổng demo riêng, thay `8000` bằng `API_PORT`. Kỳ vọng response có đúng order IDs và đơn pending chuyển sang paid; gửi lại cùng transaction ID không ghi nhận thanh toán thêm. Header sai hoặc thiếu phải trả 401.

Thay cho webhook, admin có thể mở đơn VietQR pending và xác nhận paid sau khi đối chiếu giao dịch. Đây là xác nhận thủ công, không phải tích hợp ngân hàng thật. Đóng cửa sổ QR không xác nhận thanh toán.
