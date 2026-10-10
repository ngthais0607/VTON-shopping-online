from enum import Enum


class OrderPaymentMethod(str, Enum):
    VIETQR = "vietqr"
    COD = "cod"


class OrderStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PAID = "paid"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
