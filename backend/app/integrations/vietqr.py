import os
import urllib.parse
from dotenv import load_dotenv

load_dotenv()

VIETQR_BANK_ID = os.getenv("VIETQR_BANK_ID", "MB")
VIETQR_BANK_NAME = os.getenv("VIETQR_BANK_NAME", "MB Bank (Ngan hang Quan doi)")
VIETQR_ACCOUNT_NO = os.getenv("VIETQR_ACCOUNT_NO", "0382912048")
VIETQR_ACCOUNT_NAME = os.getenv("VIETQR_ACCOUNT_NAME", "LUXESTORE")

def get_vietqr_bank_config():
    return {
        "bank_id": VIETQR_BANK_ID,
        "bank_name": VIETQR_BANK_NAME,
        "account_no": VIETQR_ACCOUNT_NO,
        "account_name": VIETQR_ACCOUNT_NAME,
    }

def generate_vietqr_url(
    bank_id: str = VIETQR_BANK_ID,
    account_no: str = VIETQR_ACCOUNT_NO,
    account_name: str = VIETQR_ACCOUNT_NAME,
    amount: float = 0,
    memo: str = ""
) -> str:
    """
    Generate a dynamic VietQR image URL matching standard format.
    Format: https://img.vietqr.io/image/<BANK_ID>-<ACCOUNT_NO>-compact2.png?amount=<AMOUNT>&addInfo=<MEMO>&accountName=<NAME>
    """
    encoded_memo = urllib.parse.quote(memo)
    encoded_name = urllib.parse.quote(account_name)
    int_amount = int(round(amount))
    return f"https://img.vietqr.io/image/{bank_id}-{account_no}-compact2.png?amount={int_amount}&addInfo={encoded_memo}&accountName={encoded_name}"
