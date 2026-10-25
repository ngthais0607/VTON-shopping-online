# Review nhánh `codex/vton-review-remediation` — Vấn đề & hướng giải quyết

Repo: `ngthais0607/VTON-shopping-online` · Phạm vi đọc: auth/session, checkout, webhook VietQR, upload ảnh, frontend API client, Docker Compose, CI.

> **Lưu ý:** đây là kết quả đọc code, chưa chạy test hay build. Các đoạn code bên dưới là bản phác thảo (sketch) để định hướng, cần chỉnh theo tên hàm/schema thực tế và cập nhật test đi kèm.

## Mục lục

| # | Mức độ | Vấn đề | Công sức |
|---|--------|--------|----------|
| 1 | Cao | Access token không bị vô hiệu khi logout/đổi mật khẩu | Vừa |
| 2 | Cao | Rate limit login theo identifier cho phép khóa tài khoản người khác | Nhỏ |
| 3 | Cao | Rate limiter fail-open, mặc định `memory://` | Nhỏ |
| 4 | Cao | Refresh token bị dùng lại không bị phát hiện | Vừa |
| 5 | Cao | Checkout thiếu idempotency và giới hạn đơn pending | Vừa |
| 6 | Cao | Thứ tự khóa trong checkout không khớp tài liệu, nguy cơ deadlock | Vừa |
| 7 | Vừa | Cookie refresh `path="/"` và rủi ro SameSite khi deploy | Nhỏ |
| 8 | Vừa | `get_current_user_optional` bắt `Exception` quá rộng | Nhỏ |
| 9 | Vừa | `X-Request-ID` do client kiểm soát | Nhỏ |
| 10 | Vừa | `ensure_bucket` ghi đè policy và làm API chết khi MinIO chậm | Nhỏ |
| 11 | Vừa | Webhook secret tĩnh, rỗng thì lỗi âm thầm | Nhỏ |
| 12 | Vừa | Code multi-order trong webhook là code chết | Nhỏ |
| 13 | Vừa | Payment late/duplicate ghi sai nguồn số tiền | Nhỏ |
| 14 | Vừa | `register_user` có chuỗi try/except lồng nhau | Nhỏ |
| 15 | Vừa | Axios không có timeout, treo sẽ giữ khóa session | Nhỏ |
| 16 | Vừa | Upload ảnh: chỉ kiểm magic byte, race `is_primary` | Vừa |
| 17 | Thấp | Bảng `user_sessions` không được dọn, cột `users.refresh_version` thừa | Nhỏ |
| 18 | Thấp | README/MIGRATION_NOTES lỗi thời, docs trùng lặp | Nhỏ |
| 19 | Thấp | `getattr(settings, ..., default)` che lỗi cấu hình | Nhỏ |

**Thứ tự đề xuất:** 1 → 2 → 3 → 5 → 4 → 6 → các mục còn lại → 18 (cập nhật tài liệu sau cùng, khi code đã chốt).

---

## 1. Access token không bị vô hiệu khi logout/đổi mật khẩu

**Hiện trạng.** `_token_pair` đưa `sid` và `sv` vào access token, nhưng `decode_access_token` chỉ trả về `sub` và `get_current_user` chỉ kiểm tra user trong DB. Sau `logout`, `revoke_session` hay `change_password` (gọi `revoke_user_sessions`), access token cũ vẫn dùng được đến khi hết hạn (mặc định 30 phút).

**Hướng giải quyết tối ưu.**

1. Giải mã access token thành claims có `sub` và `sid`.
2. Trong `get_current_user`, kiểm tra session còn hiệu lực bằng **một** query join với user (không thêm round-trip).
3. **Không** so khớp `sv` (refresh_version). `sv` tăng mỗi lần rotate, nếu kiểm tra thì access token cũ sẽ chết ngay sau mỗi lần refresh và làm hỏng request đang bay.
4. Giảm `ACCESS_TOKEN_EXPIRE_MINUTES` xuống 10 để thu hẹp cửa sổ rủi ro.

```python
# core/security.py
@dataclass(frozen=True)
class AccessTokenClaims:
    subject: str
    session_id: str

def decode_access_claims(token: str) -> AccessTokenClaims:
    payload = _decode_token_payload(token, expected_type="access")
    sid = payload.get("sid")
    if not isinstance(sid, str) or len(sid) != 32:
        raise _invalid_token()
    return AccessTokenClaims(subject=payload["sub"], session_id=sid)

def get_current_user(credentials=Depends(http_bearer), db: Session = Depends(get_db)) -> User:
    if credentials is None or not credentials.credentials:
        raise _invalid_token()
    claims = decode_access_claims(credentials.credentials)
    user = (
        db.query(User)
        .join(UserSession, UserSession.user_id == User.id)
        .filter(
            User.id == int(claims.subject),
            User.is_deleted.is_(False),
            UserSession.id == claims.session_id,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > datetime.now(timezone.utc),
        )
        .first()
    )
    if user is None:
        raise _invalid_token()
    return user
```

**Lưu ý khi triển khai.**
- Token cũ không có `sid` sẽ bị từ chối, người dùng phải đăng nhập lại (đã có tiền lệ trong README).
- Test đang tự tạo access token bằng `create_access_token({"sub": ...})` sẽ phải tạo kèm session thật. Nên thêm fixture `make_session_token(user)`.
- `security.py` import `UserSession` có thể gây import vòng với `features.users`; nếu vậy, đặt hàm kiểm tra session vào `features/users/sessions.py` và để dependency gọi hàm đó.
- Áp dụng cùng logic cho `get_current_user_optional` (xem mục 8).

---

## 2. Rate limit login theo identifier cho phép khóa tài khoản người khác

**Hiện trạng.** `@limiter.limit("5/minute", key_func=login_identifier_key)` chỉ dùng HMAC của identifier làm key. Bất kỳ ai cũng có thể gửi 5 request sai mỗi phút với email của nạn nhân để chặn họ đăng nhập (account lockout DoS).

**Hướng giải quyết tối ưu.** Chia hai tầng:

- Tầng chặt: key = `IP + identifier` (5 lần/phút). Kẻ tấn công từ một IP không thể khóa người khác khỏi IP khác.
- Tầng rộng: key = identifier với ngưỡng cao hơn nhiều (ví dụ 30/giờ) để chống brute-force phân tán nhưng không khóa người dùng thật ngay lập tức.

```python
# features/users/login_limits.py
from app.core.rate_limiter import get_client_ip

def login_ip_identifier_key(request: Request) -> str:
    return f"{get_client_ip(request)}|{request.state.login_identifier_key}"

# router.py
@limiter.limit("60/minute")                                  # theo IP
@limiter.limit("5/minute", key_func=login_ip_identifier_key) # IP + identifier
@limiter.limit("30/hour", key_func=login_identifier_key)     # chỉ identifier, ngưỡng rộng
def login_user(...): ...
```

**Tùy chọn nâng cao.** Sau N lần thất bại liên tiếp cho một identifier, yêu cầu CAPTCHA thay vì chặn cứng.

**Kèm theo (nhỏ).** `login_user` hiện giữ `FOR UPDATE` trên hàng user **trong lúc chạy bcrypt** (~100–300ms). Nên chạy `verify_password` trước (query không khóa), chỉ khóa khi cần tạo session. Điều này tránh việc bị spam một tài khoản làm tắc hàng của user đó.

---

## 3. Rate limiter fail-open, mặc định `memory://`

**Hiện trạng.** `Limiter(..., swallow_errors=True, in_memory_fallback_enabled=True)` và `redis_url` mặc định `memory://`. Khi Redis lỗi hoặc chưa cấu hình, giới hạn chuyển sang bộ nhớ từng process, nên với N worker thì giới hạn thực tế nhân N, và không ai biết.

**Hướng giải quyết tối ưu.**

1. Trong `Settings`, nếu `app_env == "production"` mà `redis_url` bắt đầu bằng `memory://` thì từ chối khởi động.
2. Giữ `swallow_errors=True` để API không sập khi Redis chập chờn, nhưng **log cảnh báo** mỗi lần rơi vào fallback (và nên có metric).
3. Với endpoint nhạy cảm (login, register, webhook) cân nhắc fail-closed khi Redis không khả dụng.

```python
# core/config.py
@model_validator(mode="after")
def validate_production(self) -> "Settings":
    if self.app_env == "production":
        if self.redis_url.strip().startswith("memory://") or not self.redis_url.strip():
            raise ValueError("REDIS_URL must point to a real Redis in production")
        if not self.vietqr_webhook_secret or len(self.vietqr_webhook_secret) < 32:
            raise ValueError("VIETQR_WEBHOOK_SECRET (>=32 chars) is required in production")
    return self
```

(Đoạn validator này cũng giải quyết mục 11.)

---

## 4. Refresh token bị dùng lại không bị phát hiện

**Hiện trạng.** `rotate_session` chỉ trả 401 khi `refresh_version` không khớp. Nếu kẻ trộm giữ token cũ và dùng lại sau khi người dùng thật đã rotate, session vẫn sống, nên không có tín hiệu về việc bị đánh cắp.

**Hướng giải quyết tối ưu: reuse detection có cửa sổ ân hạn.**

- Thêm cột `rotated_at` (DateTime) vào `user_sessions`, cập nhật mỗi lần rotate.
- Khi `UPDATE ... WHERE refresh_version = :v` không khớp dòng nào, đọc lại session:
  - Nếu `claims.version < session.refresh_version` **và** `now - rotated_at > GRACE` (ví dụ 10 giây) → coi là dùng lại token cũ, **revoke cả session**, ghi log bảo mật.
  - Nếu trong cửa sổ ân hạn (hai tab refresh gần như đồng thời) → chỉ trả 401 như hiện tại.
- Frontend đã có khóa tab (`withSessionLock`) nên race thực tế rất ít.

```python
class RefreshReuseDetected(AuthenticationError): ...

def rotate_session(db, claims):
    ...
    if updated != 1:
        session = db.query(UserSession).filter_by(id=claims.session_id).first()
        now = datetime.now(timezone.utc)
        if (session and session.revoked_at is None
                and claims.version < session.refresh_version
                and (now - session.rotated_at.replace(tzinfo=timezone.utc)) > REUSE_GRACE):
            session.revoked_at = now
            raise RefreshReuseDetected("Could not validate credentials", code="invalid_token")
        raise AuthenticationError("Could not validate credentials", code="invalid_token")

# service.refresh_user_session
except RefreshReuseDetected:
    db.commit()      # giữ lại việc revoke dù request thất bại
    logger.warning("Refresh token reuse detected", extra={"user_id": claims.subject, "sid": claims.session_id})
    raise
except Exception:
    db.rollback(); raise
```

**Migration.** Thêm `rotated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` và viết bước downgrade tương ứng.

---

## 5. Checkout thiếu idempotency và giới hạn đơn pending

**Hiện trạng.** `POST /checkout-cart` không có rate limit, không có idempotency. Hậu quả:

- Bấm đúp hoặc retry mạng tạo hai đơn và giữ chỗ tồn kho hai lần.
- Một user có thể tạo nhiều đơn VietQR pending để giữ hết hàng trong 15 phút (reservation abuse).

**Hướng giải quyết tối ưu.** Ba lớp:

**(a) Idempotency-Key (chính).**

- Bảng `idempotency_keys(user_id, key, request_hash, order_id, created_at)`, unique `(user_id, key)`.
- Router nhận header `Idempotency-Key`. Cùng key và cùng `request_hash` thì trả lại đơn đã tạo (HTTP 200/201 cùng body). Cùng key mà body khác thì trả 409/422.
- Insert key trong **cùng transaction** với tạo đơn để không bị lệch.
- Dọn key cũ hơn 24 giờ bằng cron ARQ (có thể gộp với mục 17).

**(b) Giới hạn đơn pending theo user.**

```python
# trong checkout_cart, sau khi lock user
MAX_PENDING_VIETQR = 3
pending = (db.query(func.count(Order.id))
             .filter(Order.user_id == user.id,
                     Order.status == OrderStatus.PENDING.value).scalar())
if is_vietqr and pending >= MAX_PENDING_VIETQR:
    raise BusinessRuleError("Too many unpaid orders", code="too_many_pending_orders")
```

Cần khóa hàng user (`lock_active_user`) trước khi đếm để hai request song song không cùng vượt qua giới hạn.

**(c) Rate limit endpoint.** Thêm tham số `request: Request` và `@limiter.limit("10/minute")`.

**Frontend.**
- Sinh `crypto.randomUUID()` cho mỗi *lần mở* trang checkout, gửi qua header, và giữ nguyên khi retry.
- Vô hiệu hóa nút đặt hàng trong lúc đang gửi.

---

## 6. Thứ tự khóa trong checkout không khớp tài liệu

**Hiện trạng.** `MIGRATION_NOTES` mô tả: khóa Product rồi Variant, đều theo id tăng dần. Code thực tế lặp từng variant: khóa variant `FOR UPDATE`, rồi khóa product cha `FOR SHARE`. Thứ tự là `V1 → P(V1) → V2 → P(V2)`, xen kẽ. Nếu có đường code khác khóa product trước rồi variant (sửa sản phẩm, adjust-stock, hủy đơn), hai transaction có thể chờ vòng nhau và gây deadlock.

**Hướng giải quyết tối ưu: một helper khóa tập trung, dùng ở mọi nơi.**

```python
# features/products/locking.py
def lock_inventory(db: Session, variant_ids: Iterable[int]) -> dict[int, ProductVariant]:
    ids = sorted(set(variant_ids))
    # 1) đọc không khóa để biết product cha
    product_ids = sorted({pid for (pid,) in db.query(ProductVariant.product_id)
                                              .filter(ProductVariant.id.in_(ids))})
    # 2) khóa product theo id tăng dần, MỘT query
    db.query(Product).filter(Product.id.in_(product_ids)) \
      .order_by(Product.id).populate_existing().with_for_update(read=True).all()
    # 3) khóa variant theo id tăng dần, MỘT query
    variants = (db.query(ProductVariant).filter(ProductVariant.id.in_(ids))
                  .order_by(ProductVariant.id).populate_existing().with_for_update().all())
    return {v.id: v for v in variants}
```

Quy ước thống nhất: **Product → Variant → Order**, luôn theo id tăng dần. Áp dụng helper cho `checkout_cart`, `_resolve_and_lock_order_inventory` (webhook), `expire_pending_orders`, `adjust-stock` và các hàm sửa sản phẩm.

**Kiểm chứng.** Thêm test tích hợp trên MariaDB: chạy song song checkout, adjust-stock và expire trên cùng tập variant, xác nhận không có lỗi 1213 (deadlock). Nếu chọn giữ code hiện tại thì ít nhất phải sửa tài liệu cho đúng.

---

## 7. Cookie refresh `path="/"` và SameSite

**Hiện trạng.** Cookie `refresh_token` gắn `path="/"` nên bị gửi kèm mọi request tới API. `SameSite=lax` hoạt động tốt khi frontend và API cùng site (localhost:3000 và localhost:8000), nhưng sẽ làm hỏng refresh nếu production đặt hai bên ở registrable domain khác nhau.

**Hướng giải quyết tối ưu.**

- Thu hẹp `path` về `/api/v1/users` (đủ cho `/refresh` và `/logout`).
- Khi đổi path, `delete_cookie` cũng phải dùng đúng path mới. Trong giai đoạn chuyển tiếp, xóa thêm cookie cũ ở `path="/"` để không còn cookie mồ côi.
- Ghi rõ trong tài liệu triển khai: frontend và API nên chung site (ví dụ `app.example.com` và `api.example.com`) với `SameSite=lax`; nếu bắt buộc khác site thì dùng `SameSite=none; Secure`.

```python
REFRESH_COOKIE_PATH = "/api/v1/users"
response.set_cookie(..., path=REFRESH_COOKIE_PATH)
# logout: xóa cả hai
response.delete_cookie("refresh_token", path=REFRESH_COOKIE_PATH, ...)
response.delete_cookie("refresh_token", path="/", ...)  # bỏ sau 1–2 release
```

---

## 8. `get_current_user_optional` bắt `Exception` quá rộng

**Hiện trạng.** `except Exception: return None` nuốt cả lỗi DB, lỗi kết nối, nên request bị coi như khách vãng lai mà không ai biết.

**Hướng giải quyết.** Chỉ bắt lỗi xác thực; để lỗi hạ tầng nổi lên 500.

```python
def get_current_user_optional(credentials=Depends(http_bearer), db=Depends(get_db)) -> User | None:
    if credentials is None or not credentials.credentials:
        return None
    try:
        return _load_user_for_token(db, credentials.credentials)  # dùng chung với get_current_user
    except AuthenticationError:
        return None
```

Tách hàm dùng chung `_load_user_for_token` để hai dependency không lệch logic (đặc biệt sau khi làm mục 1).

---

## 9. `X-Request-ID` do client kiểm soát

**Hiện trạng.** Middleware tin hoàn toàn giá trị header của client, không giới hạn độ dài hay ký tự. Có thể gây phình log hoặc log injection (xuống dòng, ký tự điều khiển).

**Hướng giải quyết.**

```python
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")

incoming = request.headers.get("X-Request-ID", "")
request_id = incoming if _REQUEST_ID_RE.fullmatch(incoming) else str(uuid.uuid4())
```

---

## 10. `ensure_bucket` ghi đè policy và làm API chết khi MinIO chậm

**Hiện trạng.** Mỗi lần khởi động gọi `set_bucket_policy` với policy cố định, ghi đè mọi statement thêm tay. Ngoài ra `lifespan` gọi `ensure_bucket()` mà không retry, MinIO chưa sẵn sàng thì API không lên.

**Hướng giải quyết tối ưu.**

- Tách việc tạo bucket và policy thành bước khởi tạo (service `minio-init` trong Compose, hoặc lệnh CLI `python -m app.cli init-storage`), chạy một lần trước khi API start. API chỉ kiểm tra tồn tại.
- Nếu vẫn giữ trong lifespan: đọc policy hiện có, chỉ ghi khi thiếu statement của mình, và bọc retry có backoff (ví dụ 5 lần) kèm log rõ ràng.
- Cân nhắc bỏ phụ thuộc cứng: nếu MinIO lỗi thì API vẫn lên, chỉ endpoint upload ảnh trả 503. Việc này đồng thời cải thiện readiness probe.

---

## 11. Webhook dùng secret tĩnh, rỗng thì lỗi âm thầm

**Hiện trạng.** Secret rỗng thì mọi webhook trả 401 mà không có cảnh báo lúc khởi động, rất khó debug. Chống replay chỉ dựa vào `transaction_id` duy nhất.

**Hướng giải quyết.**

1. Validator ở mục 3 bắt buộc secret (>= 32 ký tự) khi production. Ở môi trường dev, log `WARNING` một lần khi khởi động nếu secret rỗng: *"VietQR webhook disabled: VIETQR_WEBHOOK_SECRET is empty"*.
2. Nếu nhà cung cấp hỗ trợ chữ ký (HMAC-SHA256 trên raw body + timestamp), chuyển sang xác thực chữ ký và từ chối timestamp lệch quá ~5 phút. Đây là nâng cấp tùy chọn, tùy theo khả năng của nhà cung cấp webhook thực tế.
3. Giữ `compare_digest` như hiện tại cho cơ chế secret tĩnh.

---

## 12. Code multi-order trong webhook là code chết

**Hiện trạng.** `parse_order_ids_from_memo` có thể trả nhiều id, nhưng `process_vietqr_webhook` từ chối ngay (`unsupported_multi_order_payment`). Phần còn lại vẫn viết cho nhiều đơn (`sum(...)`, vòng `for order in orders`, `orders[0]` trong nhánh mismatch, các cờ `has_pending/has_late/all_paid`), làm hàm dài ~270 dòng và khó đọc.

**Hướng giải quyết.** Đơn giản hóa về đúng một đơn:

```python
order_id = parse_single_order_id(payload.content)   # trả int, hoặc raise invalid_webhook_memo
order = lock_order(db, order_id)                    # sau khi lock_inventory
outcome = classify(order, payload)                  # PAID | DUPLICATE | LATE | MISMATCH
```

Tách thành các hàm nhỏ: `_verify_webhook_auth`, `_find_existing_payment`, `_record_exceptional_payment(status)`, `_apply_payment`. Dọn luôn `_ANY_PREFIX_REGEX` nếu chỉ còn một token hợp lệ. Giữ nguyên toàn bộ test đồng thời hiện có làm lưới an toàn khi refactor.

---

## 13. Payment late/duplicate ghi sai nguồn số tiền

**Hiện trạng.** Hai nhánh `late_payment` và `duplicate_payment` lưu `amount=order.total_amount` thay vì số tiền thực nhận `payload.amount`. Hiện chưa sai vì kiểm tra mismatch chạy trước, nhưng sẽ sai nếu sau này nới lỏng kiểm tra (ví dụ cho phép sai số) và làm đối soát lệch.

**Hướng giải quyết.** Luôn lưu số tiền **thực nhận** (`payload.amount`) cho mọi bản ghi `Payment`; số tiền kỳ vọng nằm ở đơn hàng.

```python
Payment(order_id=order.id, provider="vietqr",
        provider_transaction_id=payload.transaction_id,
        amount=payload.amount, currency=order.currency, status="late_payment", ...)
```

---

## 14. `register_user` có chuỗi try/except lồng nhau

**Hiện trạng.** Khi `background_tasks is None`, hàm thử `anyio.from_thread.run`, rồi `asyncio.get_event_loop()`, rồi `asyncio.run` trong chuỗi `except`. Router luôn truyền `background_tasks`, nên nhánh này không dùng và dễ gây lỗi event loop nếu gọi từ nơi khác.

**Hướng giải quyết.** Bắt buộc tham số `background_tasks: BackgroundTasks` (bỏ giá trị mặc định `None`) và xóa toàn bộ nhánh dự phòng. Nếu cần gọi từ CLI/test thì truyền một `BackgroundTasks()` giả hoặc enqueue trực tiếp bằng `asyncio.run` ở đúng một chỗ.

---

## 15. Axios không có timeout

**Hiện trạng.** `axios.create` không đặt `timeout`, và request refresh dùng `axios.post` trần cũng vậy. Một request treo trong `withSessionLock` giữ khóa của **tất cả các tab**, làm người dùng kẹt.

**Hướng giải quyết.**

```ts
const apiClient = axios.create({ baseURL: API_BASE_URL, withCredentials: true, timeout: 15_000 });

await axios.post(`${API_BASE_URL}/users/refresh`, {}, { withCredentials: true, timeout: 10_000 });
```

- Đặt timeout riêng lớn hơn cho upload ảnh (ví dụ 60s).
- Cho `withSessionLock` một timeout tổng (ví dụ 20s) để khóa luôn được giải phóng.
- Dọn import trùng từ `./session` ở đầu `lib/api.ts` (đang import hai dòng).

---

## 16. Upload ảnh: chỉ kiểm magic byte, race `is_primary`

**Hiện trạng.**
- Chỉ kiểm tra 8–12 byte đầu. Một file có header hợp lệ nhưng nội dung hỏng/độc, hoặc kích thước pixel khổng lồ (decompression bomb), vẫn được lưu và có thể làm sập Next.js image optimizer khi tối ưu ảnh.
- `is_primary`: xóa cờ cũ rồi mới thêm ảnh mới, không khóa product, nên hai upload đồng thời có thể cùng thành primary hoặc cùng không có primary.

**Hướng giải quyết tối ưu.**

- Dùng Pillow để mở và xác thực: `Image.open(BytesIO(payload)).verify()`, đặt `Image.MAX_IMAGE_PIXELS` (ví dụ 40 triệu pixel), từ chối ảnh vượt quá. Thêm `pillow` vào `requirements.txt` và lock file. Tùy chọn: re-encode ảnh để loại metadata (EXIF, GPS).
- Khóa hàng product (`with_for_update()`) trước khi đổi cờ `is_primary`, hoặc thêm unique index một phần cho primary mỗi product nếu DB hỗ trợ.

---

## 17. Bảng `user_sessions` không được dọn, cột `users.refresh_version` thừa

**Hiện trạng.**
- Session hết hạn hoặc đã revoke nằm lại mãi trong bảng. (Mình **chưa kiểm tra** xem có job dọn trong `worker.py` hay không; nếu đã có thì bỏ phần này.)
- Sau khi chuyển sang session theo thiết bị, `users.refresh_version` chỉ còn được tham chiếu ở `model.py` (định nghĩa cột), không còn được dùng khi rotate.

**Hướng giải quyết.**

- Thêm cron ARQ hằng ngày:

```python
async def purge_sessions(ctx):
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    db.query(UserSession).filter(
        or_(UserSession.expires_at < cutoff, UserSession.revoked_at < cutoff)
    ).delete(synchronize_session=False)
```

- Lưu 30 ngày là để phục vụ điều tra bảo mật và mục 4. Cũng dọn `idempotency_keys` (mục 5) ở đây.
- Với `users.refresh_version`: xác nhận không còn nơi nào đọc (grep), rồi drop bằng migration riêng theo mô hình expand/contract (phát hành code bỏ dùng trước, drop cột ở bản sau).

---

## 18. README/MIGRATION_NOTES lỗi thời, docs trùng lặp

**Hiện trạng.**
- README ghi `alembic current` phải là `d4e5f6a7b8c9`, nhưng head thực tế là `f8a1b2c3d4e5` (`add_user_sessions`, sau `e6f7a8b9c0d1_guard_variant_inventory`).
- README vẫn mô tả refresh rotation **theo từng user** bằng `users.refresh_version`, trong khi code đã chuyển sang session theo thiết bị.
- Có hai file `MIGRATION_NOTES.md` khác nhau (gốc repo và `docs/`); danh sách revision thiếu `e6f7a8b9c0d1` và `f8a1b2c3d4e5`.
- `docs/reviews/` có khoảng 10 báo cáo cũ.

**Hướng giải quyết.**

- Giữ **một** `MIGRATION_NOTES.md` (trong `docs/`), xóa bản còn lại, cập nhật đủ revision.
- Thay câu "head phải là X" cứng trong README bằng lệnh `alembic heads`, hoặc tự động hóa: CI chạy `alembic heads` và so khớp với tài liệu.
- Sửa mô tả auth trong README theo thiết kế session theo thiết bị (sau khi xong mục 1 và 4).
- Gom các báo cáo review cũ vào `docs/archive/` hoặc chuyển ra release notes/wiki, chỉ giữ báo cáo mới nhất ở `docs/reviews/`.

---

## 19. `getattr(settings, "refresh_cookie_samesite", "lax")` che lỗi cấu hình

**Hiện trạng.** `Settings` đã khai báo `refresh_cookie_samesite` nên `getattr` với giá trị mặc định là thừa, và nếu ai đó đổi tên field thì lỗi bị che bằng giá trị mặc định thay vì báo lỗi.

**Hướng giải quyết.** Dùng thuộc tính trực tiếp `settings.refresh_cookie_samesite`. Thêm type hint cho `request.app.state.settings` (hoặc dùng `Depends(get_settings)`), để pyrefly/mypy bắt được lỗi tên field.

---

## Checklist triển khai gợi ý

**Đợt 1 — Bảo mật xác thực (ưu tiên nhất)**
- [ ] Mục 1: ràng buộc access token với session, giảm TTL
- [ ] Mục 2: key `IP + identifier` cho login, chạy bcrypt ngoài khóa
- [ ] Mục 3 và 11: validator production cho Redis và webhook secret
- [ ] Mục 4: reuse detection (kèm migration `rotated_at`)

**Đợt 2 — Toàn vẹn đơn hàng và tồn kho**
- [ ] Mục 5: idempotency key, giới hạn pending, rate limit
- [ ] Mục 6: helper `lock_inventory` + test deadlock
- [ ] Mục 12 và 13: đơn giản hóa webhook, ghi đúng số tiền

**Đợt 3 — Độ bền và vận hành**
- [ ] Mục 7, 8, 9, 10, 14, 15, 16, 19
- [ ] Mục 17: cron dọn session/key, drop cột thừa

**Đợt 4 — Tài liệu**
- [ ] Mục 18: README, MIGRATION_NOTES, dọn `docs/reviews`

**Gợi ý kiểm thử cho mỗi đợt:** chạy lại toàn bộ `pytest` trên MariaDB (CI đã có), thêm test hồi quy cho từng mục (ví dụ: access token sau logout trả 401; hai request checkout cùng Idempotency-Key trả cùng đơn; 5 request login sai từ IP khác không khóa người dùng thật).
