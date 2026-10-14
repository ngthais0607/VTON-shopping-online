from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
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

VALID_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
VALID_JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 32
VALID_WEBP_BYTES = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 20


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
    assert response.json().keys() == {"id", "url", "color_name", "kind", "is_primary", "sort_order"}
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
        vietqr_account_no="0382912048",
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
            vietqr_account_no="0382912048",
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
