import sqlite3


def list_events(conn: sqlite3.Connection, session_id: str | None = None) -> list[dict]:
    if session_id:
        rows = conn.execute(
            """
            SELECT *
            FROM events
            WHERE session_id = ?
            ORDER BY created_at DESC
            """,
            (session_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT *
            FROM events
            ORDER BY created_at DESC
            """
        ).fetchall()

    return [dict(row) for row in rows]


def get_event(conn: sqlite3.Connection, event_id: str) -> dict | None:
    row = conn.execute(
        "SELECT * FROM events WHERE id = ?",
        (event_id,),
    ).fetchone()

    return dict(row) if row else None