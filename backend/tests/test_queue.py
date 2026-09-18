from app.core.queue import parse_redis_settings


def test_parse_redis_settings():
    settings = parse_redis_settings("redis://localhost:6379/0")
    assert settings.host == "localhost"
    assert settings.port == 6379
    assert settings.database == 0

    settings_custom = parse_redis_settings("redis://redis_host:6380/2")
    assert settings_custom.host == "redis_host"
    assert settings_custom.port == 6380
    assert settings_custom.database == 2
