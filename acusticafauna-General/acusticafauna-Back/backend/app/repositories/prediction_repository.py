import sqlite3


def list_predictions_for_event(conn: sqlite3.Connection, event_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT *
        FROM predictions
        WHERE event_id = ?
        ORDER BY rank_order ASC
        """,
        (event_id,),
    ).fetchall()

    return [dict(row) for row in rows]