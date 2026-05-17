from fastapi import APIRouter
from app.db.database import get_connection
from app.repositories.session_repository import list_sessions

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/")
def get_sessions():
    conn = get_connection()
    try:
        data = list_sessions(conn)
        return data
    finally:
        conn.close()