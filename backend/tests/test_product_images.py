from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.exc import DatabaseError

from app.core.config import Settings
from app.core.errors import BusinessRuleError, ResourceNotFoundError
from app.features.products.images import (
    MAX_IMAGE_SIZE_BYTES,
    sniff_image_type,
    store_product_image,
)
from app.features.products.model import Product, ProductImage
from app.integrations.storage import MinioProductStorage, get_product_storage
from app.main import create_app
from tests.factories import make_product


def image_bytes(format="PNG", size=(32, 32)):
    output = BytesIO()
    Image.new("RGB", size, "navy").save(output, format=format)
    return output.getvalue()


VALID_PNG_BYTES = image_bytes()
VALID_JPEG_BYTES = image_bytes("JPEG")
VALID_WEBP_BYTES = image_bytes("WEBP")


@pytest.mark.parametrize(
    "payload,filename,content_type",
    [
        (b"\x89PNG\r\n\x1a\n" + bytes(32), "broken.png", "image/png"),
        (b"\xff\xd8\xff\xe0" + bytes(32), "broken.jpg", "image/jpeg"),
        (b"RIFF\x24\x00\x00\x00WEBPVP8 " + bytes(20), "broken.webp", "image/webp"),
        (VALID_PNG_BYTES[:40], "truncated.png", "image/png"),
        (VALID_JPEG_BYTES[:-20], "truncated.jpg", "image/jpeg"),
        (VALID_WEBP_BYTES[:-12], "truncated.webp", "image/webp"),
    ],
)
def test_header_only_replacement_preserves_cover(
    db_session, payload, filename, content_type
):
    product = persist_product(db_session)
    cover = ProductImage(
        id="existing-cover",
        product_id=product.id,
        object_name="products/cover.png",
        is_primary=True,
    )
    db_session.add(cover)
    db_session.commit()
    storage = FakeProductStorage()
    with pytest.raises(BusinessRuleError) as error:
        store_product_image(
            db_session,
            storage,
            product.id,
            BytesIO(payload),
            filename,
            content_type,
            is_primary=True,
        )
    assert error.value.code == "invalid_product_image"
    assert storage.put_objects == storage.deleted == []
    assert db_session.query(ProductImage).count() == 1
    db_session.refresh(cover)
    assert cover.is_primary is True


@pytest.mark.parametrize("size", [(8193, 1), (1, 8193), (6000, 4001)])
def test_rejects_excessive_image_dimensions(size):
    from app.features.products.images import validate_image_payload

    header = MagicMock(format="PNG", size=size, n_frames=1)
    header.__enter__.return_value = header
    with patch("app.features.products.images.Image.open", return_value=header):
        with pytest.raises(BusinessRuleError) as error:
            validate_image_payload(VALID_PNG_BYTES, "png")
    assert error.value.code == "image_dimensions_exceeded"
    header.load.assert_not_called()


@pytest.mark.parametrize("size", [(8192, 1), (6000, 4000)])
def test_accepts_image_dimension_boundaries(size):
    from app.features.products.images import validate_image_payload

    header = MagicMock(format="PNG", size=size, n_frames=1)
    header.__enter__.return_value = header
    with patch("app.features.products.images.Image.open", return_value=header):
        validate_image_payload(VALID_PNG_BYTES, "png")
    header.load.assert_called_once()


def test_rejects_real_animated_png():
    from app.features.products.images import validate_image_payload

    output = BytesIO()
    Image.new("RGB", (32, 32), "red").save(
        output,
        format="PNG",
        save_all=True,
        append_images=[Image.new("RGB", (32, 32), "blue")],
        duration=100,
        loop=0,
    )
    with pytest.raises(BusinessRuleError) as error:
        validate_image_payload(output.getvalue(), "png")
    assert error.value.code == "animated_product_image_unsupported"


def test_decompression_warning_is_rejected():
    import warnings

    from app.features.products.images import validate_image_payload

    def warn_on_open(*args):
        warnings.warn("too many pixels", Image.DecompressionBombWarning)

    with patch("app.features.products.images.Image.open", side_effect=warn_on_open):
        with pytest.raises(BusinessRuleError) as error:
            validate_image_payload(VALID_PNG_BYTES, "png")
    assert error.value.code == "image_dimensions_exceeded"


def test_decode_failure_and_format_mismatch_are_rejected():
    from app.features.products.images import validate_image_payload

    with pytest.raises(BusinessRuleError):
        validate_image_payload(VALID_PNG_BYTES, "jpeg")
    with patch(
        "PIL.PngImagePlugin.PngImageFile.load", side_effect=OSError("truncated")
    ):
        with pytest.raises(BusinessRuleError) as error:
            validate_image_payload(VALID_PNG_BYTES, "png")
    assert error.value.code == "invalid_product_image"


@pytest.mark.parametrize("chunk", [b"VP8X", b"VP8L", b"VP8 "])
def test_oversized_webp_never_constructs_native_decoder(chunk):
    from app.features.products.images import validate_image_payload

    if chunk == b"VP8X":
        body = bytes(4) + (8999).to_bytes(3, "little") * 2
    elif chunk == b"VP8L":
        body = b"\x2f" + (8999 | (8999 << 14)).to_bytes(4, "little")
    else:
        body = b"\x10\x00\x00\x9d\x01\x2a" + (9000).to_bytes(2, "little") * 2
    packed = chunk + len(body).to_bytes(4, "little") + body
    payload = b"RIFF" + (len(packed) + 4).to_bytes(4, "little") + b"WEBP" + packed
    with patch(
        "PIL.WebPImagePlugin._webp.WebPAnimDecoder",
        side_effect=AssertionError("decoder allocated"),
    ) as decoder:
        with pytest.raises(BusinessRuleError) as error:
            validate_image_payload(payload, "webp")
    assert error.value.code == "image_dimensions_exceeded"
    decoder.assert_not_called()


@pytest.mark.parametrize(
    "options", [{}, {"lossless": True}, {"icc_profile": b"profile"}]
)
def test_accepts_real_webp_header_variants(options):
    from app.features.products.images import validate_image_payload

    output = BytesIO()
    Image.new("RGB", (32, 32), "navy").save(output, format="WEBP", **options)
    validate_image_payload(output.getvalue(), "webp")


def test_primary_image_is_returned_first_after_replacement(db_session):
    product = make_product(db_session)
    db_session.add_all(
        [
            ProductImage(
                id="old-photo",
                product_id=product.id,
                object_name="old.png",
                is_primary=False,
            ),
            ProductImage(
                id="new-photo",
                product_id=product.id,
                object_name="new.png",
                is_primary=True,
            ),
        ]
    )
    db_session.commit()
    db_session.expire_all()
    assert db_session.get(Product, product.id).images[0].id == "new-photo"


def test_admin_can_upload_images_to_a_draft_product(db_session, product_storage):
    product = make_product(db_session, is_active=False)
    image = store_product_image(
        db_session,
        product_storage,
        product.id,
        BytesIO(VALID_PNG_BYTES),
        "draft.png",
        "image/png",
    )
    assert image.product_id == product.id


def test_image_delete_commit_failure_preserves_object(db_session, monkeypatch):
    from app.features.products.images import delete_product_image

    product = make_product(db_session)
    image = ProductImage(
        id="delete-failure", product_id=product.id, object_name="keep.png"
    )
    db_session.add(image)
    db_session.commit()
    storage = FakeProductStorage()

    def fail_commit():
        raise RuntimeError("commit failed")

    monkeypatch.setattr(db_session, "commit", fail_commit)
    with pytest.raises(RuntimeError, match="commit failed"):
        delete_product_image(db_session, storage, product.id, image.id)
    assert storage.deleted == []


def test_object_cleanup_failure_does_not_restore_row(db_session, caplog):
    from app.features.products.images import delete_product_image

    product = make_product(db_session)
    image = ProductImage(
        id="cleanup-failure", product_id=product.id, object_name="orphan.png"
    )
    db_session.add(image)
    db_session.commit()
    delete_product_image(
        db_session,
        FakeProductStorage(delete_error=RuntimeError("offline")),
        product.id,
        image.id,
    )
    assert db_session.get(ProductImage, "cleanup-failure") is None
    assert "orphan.png" in caplog.text


class CountingStream(BytesIO):
    def __init__(self, data: bytes):
        super().__init__(data)
        self.bytes_read = 0

    def read(self, size=-1):
        chunk = super().read(size)
        self.bytes_read += len(chunk)
        return chunk


class FakeProductStorage:
    def __init__(
        self,
        events: list[str] | None = None,
        delete_error: Exception | None = None,
    ) -> None:
        self.events = events if events is not None else []
        self.delete_error = delete_error
        self.ensure_bucket_calls = 0
        self.put_objects: list[str] = []
        self.put_payloads: list[bytes] = []
        self.content_types: list[str] = []
        self.deleted: list[str] = []

    def ensure_bucket(self) -> None:
        self.ensure_bucket_calls += 1

    def put(self, object_name, stream, content_type) -> None:
        self.events.append("put")
        self.put_objects.append(object_name)
        self.put_payloads.append(stream.read())
        self.content_types.append(content_type)

    def delete(self, object_name) -> None:
        self.events.append("delete")
        self.deleted.append(object_name)
        if self.delete_error is not None:
            raise self.delete_error

    def public_url(self, object_name) -> str:
        return f"https://images.example.test/{object_name}"


def persist_product(db_session, **overrides) -> Product:
    defaults = {
        "name": "Image product",
        "price": 59.99,
        "stock_quantity": 10,
    }
    merged = defaults | overrides
    product = make_product(db_session, **merged)
    db_session.commit()
    db_session.refresh(product)
    return product


def test_sniff_image_type_pure_function():
    assert sniff_image_type(VALID_JPEG_BYTES) == "jpeg"
    assert sniff_image_type(VALID_PNG_BYTES) == "png"
    assert sniff_image_type(VALID_WEBP_BYTES) == "webp"
    assert sniff_image_type(b"NOT_AN_IMAGE_PAYLOAD") is None
    assert sniff_image_type(b"") is None
    assert sniff_image_type(b"\xff\xd8") is None  # Too short for JPEG


@pytest.mark.parametrize(
    ("payload", "filename", "content_type", "expected_ext"),
    [
        (VALID_PNG_BYTES, "catalog.png", "image/png", ".png"),
        (VALID_JPEG_BYTES, "photo.jpg", "image/jpeg", ".jpg"),
        (VALID_JPEG_BYTES, "photo.jpeg", "image/jpeg", ".jpg"),
        (VALID_WEBP_BYTES, "banner.webp", "image/webp", ".webp"),
    ],
)
def test_store_product_image_accepts_valid_formats(
    db_session,
    payload,
    filename,
    content_type,
    expected_ext,
):
    product = persist_product(db_session)
    storage = FakeProductStorage()

    image = store_product_image(
        db_session,
        storage,
        product.id,
        BytesIO(payload),
        filename,
        content_type,
    )

    assert image.object_name.startswith("products/")
    assert image.object_name.endswith(expected_ext)
    assert storage.put_payloads == [payload]
    assert storage.content_types == [content_type]


def test_store_product_image_uploads_then_commits_metadata(db_session):
    product = persist_product(db_session)
    events = []
    storage = FakeProductStorage(events=events)
    real_commit = db_session.commit

    def tracked_commit():
        events.append("commit")
        return real_commit()

    with patch.object(db_session, "commit", side_effect=tracked_commit) as commit:
        image = store_product_image(
            db_session,
            storage,
            product.id,
            BytesIO(VALID_PNG_BYTES),
            "catalog.PNG",
            "image/png",
        )

    assert commit.call_count == 1
    assert events == ["put", "commit"]
    assert storage.put_objects == [image.object_name]
    assert storage.put_payloads == [VALID_PNG_BYTES]
    assert storage.content_types == ["image/png"]
    assert image.object_name.startswith("products/")
    assert image.object_name.endswith(".png")
    assert "catalog" not in image.object_name
    assert image.url == storage.public_url(image.object_name)
    assert db_session.get(ProductImage, image.id) is image


def test_store_product_image_does_not_upload_when_product_is_missing(db_session):
    storage = FakeProductStorage()

    with pytest.raises(ResourceNotFoundError) as error:
        store_product_image(
            db_session,
            storage,
            999999,
            BytesIO(VALID_PNG_BYTES),
            "catalog.png",
            "image/png",
        )

    assert error.value.code == "product_not_found"
    assert storage.put_objects == []


@pytest.mark.parametrize(
    ("filename", "content_type"),
    [
        ("catalog", "image/png"),
        ("catalog.svg", "image/svg+xml"),
        ("catalog.jpg", "image/png"),
    ],
)
def test_store_product_image_rejects_unsafe_or_mismatched_file_types(
    db_session,
    filename,
    content_type,
):
    product = persist_product(db_session)
    storage = FakeProductStorage()

    with pytest.raises(BusinessRuleError) as error:
        store_product_image(
            db_session,
            storage,
            product.id,
            BytesIO(b"not-an-image"),
            filename,
            content_type,
        )

    assert error.value.code == "invalid_product_image"
    assert storage.put_objects == []
    assert db_session.query(ProductImage).count() == 0


def test_store_product_image_rejects_empty_file(db_session):
    product = persist_product(db_session)
    storage = FakeProductStorage()

    with pytest.raises(BusinessRuleError) as error:
        store_product_image(
            db_session,
            storage,
            product.id,
            BytesIO(b""),
            "catalog.png",
            "image/png",
        )

    assert error.value.code == "invalid_product_image"
    assert storage.put_objects == []


def test_store_product_image_rejects_png_bytes_with_jpg_extension(db_session):
    product = persist_product(db_session)
    storage = FakeProductStorage()

    with pytest.raises(BusinessRuleError) as error:
        store_product_image(
            db_session,
            storage,
            product.id,
            BytesIO(VALID_PNG_BYTES),
            "catalog.jpg",
            "image/jpeg",
        )

    assert error.value.code == "invalid_product_image"
    assert storage.put_objects == []


def test_store_product_image_rejects_fake_png_content(db_session):
    product = persist_product(db_session)
    storage = FakeProductStorage()

    with pytest.raises(BusinessRuleError) as error:
        store_product_image(
            db_session,
            storage,
            product.id,
            BytesIO(b"plain text that claims to be png"),
            "catalog.png",
            "image/png",
        )

    assert error.value.code == "invalid_product_image"
    assert storage.put_objects == []


def test_store_product_image_rejects_early_when_size_exceeds_max(db_session):
    product = persist_product(db_session)
    storage = FakeProductStorage()

    with pytest.raises(BusinessRuleError) as error:
        store_product_image(
            db_session,
            storage,
            product.id,
            BytesIO(VALID_PNG_BYTES),
            "catalog.png",
            "image/png",
            size=MAX_IMAGE_SIZE_BYTES + 10,
        )

    assert error.value.code == "image_too_large"
    assert storage.put_objects == []


def test_store_product_image_bounded_read_does_not_exceed_max_plus_one(db_session):
    product = persist_product(db_session)
    storage = FakeProductStorage()
    # 10MB of PNG-prefixed payload
    large_payload = VALID_PNG_BYTES + b"x" * (10 * 1024 * 1024)
    stream = CountingStream(large_payload)

    with pytest.raises(BusinessRuleError) as error:
        store_product_image(
            db_session,
            storage,
            product.id,
            stream,
            "catalog.png",
            "image/png",
        )

    assert error.value.code == "image_too_large"
    assert stream.bytes_read == MAX_IMAGE_SIZE_BYTES + 1
    assert storage.put_objects == []
    assert db_session.query(ProductImage).count() == 0


def test_store_product_image_compensates_when_database_commit_fails(db_session):
    product = persist_product(db_session)
    storage = FakeProductStorage()
    database_error = DatabaseError("INSERT", {}, RuntimeError("database down"))

    with (
        patch.object(db_session, "commit", side_effect=database_error),
        patch.object(db_session, "rollback", wraps=db_session.rollback) as rollback,
        pytest.raises(DatabaseError) as error,
    ):
        store_product_image(
            db_session,
            storage,
            product.id,
            BytesIO(VALID_PNG_BYTES),
            "catalog.png",
            "image/png",
        )

    assert error.value is database_error
    assert storage.deleted == [storage.put_objects[0]]
    assert rollback.call_count == 1
    assert db_session.query(ProductImage).count() == 0


def test_store_product_image_still_deletes_when_rollback_fails(db_session):
    product = persist_product(db_session)
    storage = FakeProductStorage()
    database_error = DatabaseError("INSERT", {}, RuntimeError("database down"))

    with (
        patch.object(db_session, "commit", side_effect=database_error),
        patch.object(
            db_session,
            "rollback",
            side_effect=RuntimeError("rollback failed"),
        ) as rollback,
        pytest.raises(DatabaseError) as error,
    ):
        store_product_image(
            db_session,
            storage,
            product.id,
            BytesIO(VALID_PNG_BYTES),
            "catalog.png",
            "image/png",
        )

    assert error.value is database_error
    assert rollback.call_count == 1
    assert storage.deleted == [storage.put_objects[0]]


def test_store_product_image_preserves_database_error_when_delete_fails(db_session):
    product = persist_product(db_session)
    delete_error = RuntimeError("delete failed")
    storage = FakeProductStorage(delete_error=delete_error)
    database_error = DatabaseError("INSERT", {}, RuntimeError("database down"))

    with (
        patch.object(db_session, "commit", side_effect=database_error),
        patch.object(db_session, "rollback", wraps=db_session.rollback) as rollback,
        pytest.raises(DatabaseError) as error,
    ):
        store_product_image(
            db_session,
            storage,
            product.id,
            BytesIO(VALID_PNG_BYTES),
            "catalog.png",
            "image/png",
        )

    assert error.value is database_error
    assert rollback.call_count == 1
    assert storage.deleted == [storage.put_objects[0]]


def test_upload_route_returns_public_contract_without_object_name(
    client,
    db_session,
    mock_admin_auth,
    product_storage,
):
    product = persist_product(db_session)

    response = client.post(
        f"/api/v1/products/{product.id}/upload-image",
        files={"file": ("catalog.webp", VALID_WEBP_BYTES, "image/webp")},
    )

    assert response.status_code == 201
    assert response.json().keys() == {
        "id",
        "url",
        "color_name",
        "kind",
        "is_primary",
        "sort_order",
    }
    assert response.json()["url"].startswith("https://images.example.test/products/")
    assert "object_name" not in response.text
    assert product_storage.put_payloads == [VALID_WEBP_BYTES]


def test_upload_image_with_color_kind_and_primary_flag(
    client,
    db_session,
    mock_admin_auth,
    product_storage,
):
    product = persist_product(db_session)

    res1 = client.post(
        f"/api/v1/products/{product.id}/upload-image",
        data={"color_name": "Navy", "kind": "model_photo", "is_primary": "true"},
        files={"file": ("model.png", VALID_PNG_BYTES, "image/png")},
    )
    assert res1.status_code == 201
    img1 = res1.json()
    assert img1["color_name"] == "Navy"
    assert img1["kind"] == "model_photo"
    assert img1["is_primary"] is True

    # Upload second image as primary, ensuring first becomes non-primary
    res2 = client.post(
        f"/api/v1/products/{product.id}/upload-image",
        data={"color_name": "White", "kind": "flat_lay", "is_primary": "true"},
        files={"file": ("flat.png", VALID_PNG_BYTES, "image/png")},
    )
    assert res2.status_code == 201
    img2 = res2.json()
    assert img2["color_name"] == "White"
    assert img2["kind"] == "flat_lay"
    assert img2["is_primary"] is True

    db_session.expire_all()
    first_db = db_session.get(ProductImage, img1["id"])
    assert first_db.is_primary is False


def test_minio_storage_adapter_uses_settings_and_sdk_primitives():
    settings = Settings(
        _env_file=None,
        secret_key="test-secret-at-least-32-chars-long!",
        vietqr_bank_id="MB",
        vietqr_account_no="0000000000",
        minio_endpoint="minio.internal:9000",
        minio_access_key="access",
        minio_secret_key="secret",
        minio_bucket="catalog-images",
        minio_external_url="https://cdn.example.test/assets/",
    )
    client = MagicMock()
    client.bucket_exists.return_value = False

    with patch("app.integrations.storage.Minio", return_value=client) as minio:
        storage = MinioProductStorage(settings)

    stream = BytesIO(b"image")
    storage.ensure_bucket()
    storage.put("products/image.png", stream, "image/png")
    storage.delete("products/image.png")

    minio.assert_called_once_with(
        endpoint="minio.internal:9000",
        access_key="access",
        secret_key="secret",
        secure=False,
    )
    client.make_bucket.assert_called_once_with("catalog-images")
    client.set_bucket_policy.assert_called_once()
    client.put_object.assert_called_once_with(
        bucket_name="catalog-images",
        object_name="products/image.png",
        data=stream,
        length=-1,
        part_size=10 * 1024 * 1024,
        content_type="image/png",
    )
    client.remove_object.assert_called_once_with(
        bucket_name="catalog-images",
        object_name="products/image.png",
    )
    assert storage.public_url("products/image.png") == (
        "https://cdn.example.test/assets/catalog-images/products/image.png"
    )


def test_application_lifespan_ensures_product_storage_bucket():
    application = create_app(
        Settings(
            _env_file=None,
            secret_key="test-secret-for-lifespan-32-bytes!",
            vietqr_bank_id="MB",
            vietqr_account_no="0000000000",
        )
    )
    storage = FakeProductStorage()
    application.state.product_storage = storage
    application.dependency_overrides[get_product_storage] = lambda: storage

    with TestClient(application):
        pass

    assert storage.ensure_bucket_calls == 1


def test_storage_dependency_returns_the_application_owned_adapter():
    storage = FakeProductStorage()
    request = SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(product_storage=storage))
    )

    assert get_product_storage(request) is storage


def test_upload_image_rejects_invalid_kind(client, db_session, mock_admin_auth):
    product = persist_product(db_session, name="Kind Test Product")
    response = client.post(
        f"/api/v1/products/{product.id}/images",
        files={"file": ("photo.jpg", VALID_JPEG_BYTES, "image/jpeg")},
        data={"kind": "invalid_kind_123"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_image_kind"
