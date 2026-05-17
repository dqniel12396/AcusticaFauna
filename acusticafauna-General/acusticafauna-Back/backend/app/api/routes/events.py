from fastapi import APIRouter, HTTPException
from app.db.database import get_connection
from app.repositories.event_repository import get_event, list_events
from app.repositories.prediction_repository import list_predictions_for_event

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/")
def get_events(session_id: str | None = None):
    conn = get_connection()
    try:
        data = list_events(conn, session_id=session_id)
        return data
    finally:
        conn.close()

@router.get("/{event_id}")
def get_event_detail(event_id: str):
    conn = get_connection()

    event = get_event(conn, event_id)
    if not event:
        conn.close()
        raise HTTPException(status_code=404, detail="Evento no encontrado.")

    predictions = list_predictions_for_event(conn, event_id)
    conn.close()

    return {
        "event": event,
        "predictions": predictions,
    }