import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Thiết lập biến môi trường cấu hình JWT & DB để chạy kiểm thử
os.environ["SECRET_KEY"] = "super-secret-test-key-must-be-32-bytes-long-for-jwt-hs256!"
os.environ["JWT_ALGORITHM"] = "HS256"
os.environ["DATABASE_URL"] = "sqlite:///./test.db"

# Giả lập minio client để không kết nối tới server MinIO thật khi chạy test
import unittest.mock
import sys
mock_minio = unittest.mock.MagicMock()
mock_minio.MINIO_EXTERNAL_URL = "http://localhost:9000"
mock_minio.MINIO_BUCKET = "product-images"
mock_minio.ensure_bucket_exists = lambda: None
mock_minio.minio_client = unittest.mock.MagicMock()
sys.modules['app.integrations.minio_client'] = mock_minio

# Import các thành phần của ứng dụng sau khi đã thiết lập biến môi trường
from app.main import app
from app.core.database import Base, get_db
from app.features.users.model import User

# Sử dụng database sqlite tạm thời cho test
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
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
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session):
    # Ghi đè database dependency để sử dụng Database Test Session
    def override_get_db():
        try:
            yield db_session
            db_session.commit()
        except Exception:
            db_session.rollback()
            raise

    app.dependency_overrides[get_db] = override_get_db
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
            last_name="Test"
        )
        db_session.add(mock_admin)
        db_session.commit()
        db_session.refresh(mock_admin)
    else:
        mock_admin = existing

    from app.core.security import get_current_admin
    app.dependency_overrides[get_current_admin] = lambda: mock_admin
    yield mock_admin
    if get_current_admin in app.dependency_overrides:
        del app.dependency_overrides[get_current_admin]

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
            last_name="Test"
        )
        db_session.add(mock_user)
        db_session.commit()
        db_session.refresh(mock_user)
    else:
        mock_user = existing

    from app.core.security import get_current_user
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield mock_user
    if get_current_user in app.dependency_overrides:
        del app.dependency_overrides[get_current_user]
