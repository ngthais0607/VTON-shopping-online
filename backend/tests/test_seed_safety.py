from importlib import import_module

import pytest

from app.core.config import Settings, get_settings
from app.core.security import verify_password
from app.features.users.model import User
from app.seed import seed_database


@pytest.fixture(autouse=True)
def seed_storage(monkeypatch, product_storage):
    monkeypatch.setattr(
        "app.seed.MinioProductStorage", lambda _: product_storage, raising=False
    )


@pytest.mark.parametrize("force", [False, True])
def test_seed_refuses_production_from_settings_even_with_force(
    monkeypatch, tmp_path, force
):
    envfile = tmp_path / ".env"
    envfile.write_text("APP_ENV=production\n")
    monkeypatch.delenv("APP_ENV", raising=False)
    settings = Settings(_env_file=envfile)
    monkeypatch.setattr(
        import_module("app.seed"), "get_settings", lambda: settings, raising=False
    )
    with pytest.raises(RuntimeError, match="create-admin"):
        seed_database(force=force)


def test_development_seed_passwords_are_configured_and_not_reset(
    db_session, monkeypatch, capsys
):
    settings = get_settings().model_copy(
        update={
            "app_env": "development",
            "seed_admin_password": "UniqueAdmin!472",
            "seed_customer_password": "UniqueCustomer!472",
        }
    )
    monkeypatch.setattr(
        import_module("app.seed"), "get_settings", lambda: settings, raising=False
    )
    seed_database(db=db_session)
    user = db_session.query(User).filter_by(username="admin").one()
    assert verify_password("UniqueAdmin!472", user.password_hash)
    old_hash = user.password_hash
    capsys.readouterr()
    seed_database(db=db_session)
    assert user.password_hash == old_hash
    assert "UniqueAdmin!472" not in capsys.readouterr().out


def test_generated_demo_passwords_are_not_known_defaults(db_session, capsys):
    seed_database(db=db_session)
    admin = db_session.query(User).filter_by(username="admin").one()
    customer = db_session.query(User).filter_by(username="demouser").one()
    assert not verify_password("Admin@123456", admin.password_hash)
    assert not verify_password("User@123456", customer.password_hash)
    output = capsys.readouterr().out
    assert "Admin@123456" not in output
    assert "User@123456" not in output
