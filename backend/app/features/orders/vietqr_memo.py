import logging
import re

logger = logging.getLogger(__name__)


def generate_order_payment_memo(order_id: int) -> str:
    if order_id <= 0:
        raise ValueError("order_id must be a positive integer")
    return f"TL{order_id}"


_MEMO_TOKEN_REGEX = re.compile(
    r"(?i)(?<![A-Za-z0-9])(?:TL|TRUELOOK|LUXESTORE)[\s_-]*([1-9]\d*(?:(?:[xX]|_)[1-9]\d*)*)(?![A-Za-z0-9])"
)


_ANY_PREFIX_REGEX = re.compile(
    r"(?i)(?<![A-Za-z0-9])(?:TL|TRUELOOK|LUXESTORE)[\s_-]*([A-Za-z0-9_-]+)"
)


def parse_order_ids_from_memo(content: str) -> list[int]:
    if not content or not content.strip():
        return []

    all_prefix_matches = _ANY_PREFIX_REGEX.findall(content)
    valid_matches = _MEMO_TOKEN_REGEX.findall(content)

    if len(all_prefix_matches) != len(valid_matches) or len(valid_matches) != 1:
        return []

    token_body = valid_matches[0]
    raw_ids = re.split(r"[xX_]", token_body)
    ids = sorted(list({int(i) for i in raw_ids if i and int(i) > 0}))
    return ids
