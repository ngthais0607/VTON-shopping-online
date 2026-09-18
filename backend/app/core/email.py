import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from jinja2 import Environment, FileSystemLoader
import aiosmtplib

logger = logging.getLogger(__name__)

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates", "emails")
jinja_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))

EMAILS_ENABLED = os.getenv("EMAILS_ENABLED", "True").lower() == "true"
EMAILS_CONSOLE_LOG = os.getenv("EMAILS_CONSOLE_LOG", "True").lower() == "true"
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
EMAILS_FROM_EMAIL = os.getenv("EMAILS_FROM_EMAIL", "noreply@luxestore.com")
EMAILS_FROM_NAME = os.getenv("EMAILS_FROM_NAME", "LuxeStore E-Commerce")


async def render_email_template(template_name: str, context: dict) -> str:
    template = jinja_env.get_template(template_name)
    return template.render(**context)


async def send_email(subject: str, recipient: str, template_name: str, context: dict):
    if not EMAILS_ENABLED:
        logger.info(f"Email disabled. Skipping email to {recipient} with subject: {subject}")
        return

    html_content = await render_email_template(template_name, context)

    if EMAILS_CONSOLE_LOG:
        print("\n" + "="*60)
        print(f"[EMAIL CONSOLE LOG] To: {recipient} | Subject: {subject}")
        print("="*60)
        print(html_content)
        print("="*60 + "\n")
        logger.info(f"[CONSOLE LOG MODE] Email printed for {recipient}")
        return

    message = MIMEMultipart("alternative")
    message["From"] = f"{EMAILS_FROM_NAME} <{EMAILS_FROM_EMAIL}>"
    message["To"] = recipient
    message["Subject"] = subject
    message.attach(MIMEText(html_content, "html", "utf-8"))

    try:
        await aiosmtplib.send(
            message,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER,
            password=SMTP_PASSWORD,
            start_tls=True
        )
        logger.info(f"Email sent successfully to {recipient}")
    except Exception as e:
        logger.error(f"Failed to send email to {recipient}: {str(e)}")
        raise e
