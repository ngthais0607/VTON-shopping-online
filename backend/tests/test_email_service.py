import pytest
from app.core.email import render_email_template, send_email


@pytest.mark.asyncio
async def test_render_email_template():
    html = await render_email_template("welcome.html", {"user_name": "Test User"})
    assert "Test User" in html
    assert "LuxeStore" in html


@pytest.mark.asyncio
async def test_send_email_console_log(capsys):
    await send_email(
        subject="Test Subject",
        recipient="test@example.com",
        template_name="welcome.html",
        context={"user_name": "Test User"}
    )
    captured = capsys.readouterr()
    assert "EMAIL CONSOLE LOG" in captured.out
    assert "test@example.com" in captured.out
