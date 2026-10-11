from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.integrations.email import SmtpEmailSender, render_email_template


@pytest.mark.asyncio
async def test_render_email_template():
    html = await render_email_template("welcome.html", {"user_name": "Test User"})
    assert "Test User" in html
    assert "LuxeStore" in html


@pytest.mark.asyncio
def settings(**overrides):
    values = dict(
        emails_enabled=True,
        emails_console_log=False,
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_user="sender",
        smtp_password="secret",
        emails_from_email="shop@example.com",
        emails_from_name="Shop",
    )
    values.update(overrides)
    return SimpleNamespace(**values)


@pytest.mark.asyncio
async def test_disabled_email_does_not_render_or_send(monkeypatch):
    send = AsyncMock()
    monkeypatch.setattr("app.integrations.email.aiosmtplib.send", send)
    await SmtpEmailSender(settings(emails_enabled=False)).send(
        "Welcome", "person@example.com", "missing.html", {}
    )
    send.assert_not_awaited()


@pytest.mark.asyncio
async def test_console_email_logs_without_smtp(monkeypatch, caplog):
    send = AsyncMock()
    monkeypatch.setattr("app.integrations.email.aiosmtplib.send", send)
    with caplog.at_level("INFO"):
        await SmtpEmailSender(settings(emails_console_log=True)).send(
            "Welcome", "person@example.com", "welcome.html", {"user_name": "Ada"}
        )
    send.assert_not_awaited()
    assert "person@example.com" in caplog.text
    assert "Ada" in caplog.text


@pytest.mark.asyncio
async def test_smtp_email_uses_settings_and_propagates_failure(monkeypatch):
    send = AsyncMock(side_effect=RuntimeError("SMTP unavailable"))
    monkeypatch.setattr("app.integrations.email.aiosmtplib.send", send)
    with pytest.raises(RuntimeError, match="SMTP unavailable"):
        await SmtpEmailSender(settings()).send(
            "Welcome", "person@example.com", "welcome.html", {"user_name": "Ada"}
        )
    message = send.await_args.args[0]
    assert message["Subject"] == "Welcome"
    assert message["To"] == "person@example.com"
    assert send.await_args.kwargs["hostname"] == "smtp.example.com"
