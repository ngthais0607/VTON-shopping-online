import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

# Thiết lập biến môi trường cấu hình JWT & DB để chạy kiểm thử
os.environ["SECRET_KEY"] = "super-secret-test-key-must-be-32-bytes-long-for-jwt-hs256!"
os.environ["JWT_ALGORITHM"] = "HS256"
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
# Keep DTO URL expectations independent of a developer's local object-store settings.
os.environ["MINIO_BUCKET"] = "product-images"
os.environ["MINIO_ENDPOINT"] = "localhost:9000"
os.environ["MINIO_ACCESS_KEY"] = "test-minio-access-key"
os.environ["MINIO_SECRET_KEY"] = "test-minio-secret-key"
os.environ["MINIO_EXTERNAL_URL"] = ""
os.environ["VIETQR_BANK_ID"] = "MB"
os.environ["VIETQR_BANK_NAME"] = "MB Bank (Ngan hang Quan doi)"
os.environ["VIETQR_ACCOUNT_NO"] = "0382912048"
os.environ["VIETQR_ACCOUNT_NAME"] = "TRUELOOK"
os.environ["VIETQR_WEBHOOK_SECRET"] = "test-webhook-secret-32-chars-long-abc"

# Import các thành phần của ứng dụng sau khi đã thiết lập biến môi trường
from app.core.database import Base, get_db
from app.features.users.model import User
from app.integrations.storage import get_product_storage
from app.main import app

# Sử dụng database sqlite tạm thời cho test
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)


@event.listens_for(engine, "connect")
def configure_sqlite_transactions(dbapi_connection, _connection_record):
    dbapi_connection.isolation_level = None


@event.listens_for(engine, "begin")
def begin_sqlite_transaction(connection):
    connection.exec_driver_sql("BEGIN")


TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    # Tạo bảng dữ liệu mới cho quá trình test
    Base.metadata.create_all(bind=engine)
    yield
    # Xóa bảng dữ liệu sau khi kết thúc session test
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("./test.db"):
        try:
            os.remove("./test.db")
        except PermissionError:
            pass


@pytest.fixture
def db_session():
    from app.features.dashboard.service import invalidate_dashboard_cache
    invalidate_dashboard_cache()

    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(
        bind=connection,
        join_transaction_mode="create_savepoint",
    )

    yield session

    session.close()
    if transaction.is_active:
        transaction.rollback()
    connection.close()
    invalidate_dashboard_cache()


@pytest.fixture
def product_storage():
    class FakeProductStorage:
        def __init__(self):
            self.ensure_bucket_calls = 0
            self.put_objects = []
            self.put_payloads = []
            self.content_types = []
            self.deleted = []

        def ensure_bucket(self):
            self.ensure_bucket_calls += 1

        def put(self, object_name, stream, content_type):
            self.put_objects.append(object_name)
            self.put_payloads.append(stream.read())
            self.content_types.append(content_type)

        def delete(self, object_name):
            self.deleted.append(object_name)

        def public_url(self, object_name):
            return f"https://images.example.test/{object_name}"

    return FakeProductStorage()


@pytest.fixture
def client(db_session, product_storage):
    # Ghi đè database dependency để sử dụng Database Test Session
    def override_get_db():
        try:
            yield db_session
            db_session.commit()
        except Exception:
            db_session.rollback()
            raise

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_product_storage] = lambda: product_storage
    app.state.product_storage = product_storage
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def mock_admin_auth(client, db_session):
    # Fixture dùng để giả lập quyền Admin đã đăng nhập thành công
    existing = db_session.query(User).filter(User.id == 999).first()
    if not existing:
        mock_admin = User(
            id=999,
            username="admin_test",
            email="admin@test.com",
            password_hash="mock_hash",
            role="admin",
            first_name="Admin",
            last_name="Test",
        )
        db_session.add(mock_admin)
        db_session.commit()
        db_session.refresh(mock_admin)
    else:
        mock_admin = existing

    from app.core.security import get_current_admin, get_optional_user

    app.dependency_overrides[get_current_admin] = lambda: mock_admin
    app.dependency_overrides[get_optional_user] = lambda: mock_admin
    yield mock_admin
    if get_current_admin in app.dependency_overrides:
        del app.dependency_overrides[get_current_admin]
    if get_optional_user in app.dependency_overrides:
        del app.dependency_overrides[get_optional_user]


@pytest.fixture
def mock_user_auth(client, db_session):
    # Fixture giả lập tài khoản khách hàng (Customer) bình thường đã đăng nhập
    existing = db_session.query(User).filter(User.id == 123).first()
    if not existing:
        mock_user = User(
            id=123,
            username="customer_test",
            email="customer@test.com",
            password_hash="mock_hash",
            role="customer",
            first_name="Customer",
            last_name="Test",
        )
        db_session.add(mock_user)
        db_session.commit()
        db_session.refresh(mock_user)
    else:
        mock_user = existing

    from app.core.security import get_current_user, get_optional_user

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_optional_user] = lambda: mock_user
    yield mock_user
    if get_current_user in app.dependency_overrides:
        del app.dependency_overrides[get_current_user]
    if get_optional_user in app.dependency_overrides:
        del app.dependency_overrides[get_optional_user]
