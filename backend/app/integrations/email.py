"""Email delivery boundary for worker notification jobs."""

import logging
from email.message import EmailMessage
from pathlib import Path
from typing import Protocol

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)
_templates = Environment(
    loader=FileSystemLoader(
        Path(__file__).resolve().parents[1] / "templates" / "emails"
    ),
    autoescape=select_autoescape(["html"]),
)


async def render_email_template(template_name: str, context: dict[str, object]) -> str:
    return _templates.get_template(template_name).render(**context)


class EmailSender(Protocol):
    async def send(
        self,
        subject: str,
        recipient: str,
        template_name: str,
        context: dict[str, object],
    ) -> None: ...


class SmtpEmailSender:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    async def send(
        self,
        subject: str,
        recipient: str,
        template_name: str,
        context: dict[str, object],
    ) -> None:
        if not self.settings.emails_enabled:
            logger.info(
                "Email disabled for recipient=%s subject=%s", recipient, subject
            )
            return

        html = await render_email_template(template_name, context)
        if self.settings.emails_console_log:
            logger.info(
                "Email console delivery recipient=%s subject=%s body=%s",
                recipient,
                subject,
                html,
            )
            return

        message = EmailMessage()
        message["From"] = (
            f"{self.settings.emails_from_name} <{self.settings.emails_from_email}>"
        )
        message["To"] = recipient
        message["Subject"] = subject
        message.set_content(html, subtype="html")
        try:
            await aiosmtplib.send(
                message,
                hostname=self.settings.smtp_host,
                port=self.settings.smtp_port,
                username=self.settings.smtp_user,
                password=self.settings.smtp_password,
                start_tls=True,
            )
        except Exception:
            logger.exception("Email delivery failed recipient=%s", recipient)
            raise
        logger.info("Email delivered recipient=%s", recipient)
