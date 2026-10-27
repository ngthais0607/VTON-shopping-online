from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, String

from app.core.database import Base


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(String(32), primary_key=True, default=lambda: uuid4().hex)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    refresh_version = Column(BigInteger, nullable=False, default=0, server_default="0")
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
