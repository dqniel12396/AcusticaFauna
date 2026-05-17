import sqlite3
from app.core.config import settings


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(
        settings.DB_PATH,
        check_same_thread=False,  # 👈 IMPORTANTE
        timeout=30,               # 👈 evita lock inmediato
    )
    conn.row_factory = sqlite3.Row
    return conn