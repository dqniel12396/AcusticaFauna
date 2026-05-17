from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.core.config import settings
from app.db.database import get_connection
from app.api.routes.audio_lab import ensure_audio_lab_schema, fetch_annotations_for_audit


router = APIRouter(prefix="/ml", tags=["ml"])

ML_TIMEOUT = httpx.Timeout(90.0, connect=2.0)


def ml_service_error(exc: Exception) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail=(
            "El servicio ML no esta activo. Inicialo desde acusticafauna-ML "
            "para usar prediccion."
        ),
    )


async def request_ml(method: str, path: str, json: dict[str, Any] | None = None, params: dict[str, Any] | None = None) -> httpx.Response:
    url = f"{settings.ML_API_BASE_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=ML_TIMEOUT) as client:
            response = await client.request(method, url, json=json, params=params)
    except httpx.RequestError as exc:
        raise ml_service_error(exc) from exc

    if response.status_code >= 400:
        try:
            detail = response.json().get("detail")
        except ValueError:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=detail or "Error del servicio ML.")

    return response


def audio_lab_feedback_items() -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        ensure_audio_lab_schema(conn)
        return fetch_annotations_for_audit(conn)
    finally:
        conn.close()


@router.get("/health")
async def health():
    response = await request_ml("GET", "/health")
    return response.json()


@router.get("/models")
async def models():
    response = await request_ml("GET", "/models")
    return response.json()


@router.get("/models/registry")
async def models_registry():
    response = await request_ml("GET", "/models/registry")
    return response.json()


@router.post("/models/{model_id}/promote")
async def promote_model(model_id: str, payload: dict[str, Any] | None = None):
    response = await request_ml("POST", f"/models/{model_id}/promote", json=payload or {})
    return response.json()


@router.post("/models/{model_id}/archive")
async def archive_model(model_id: str, payload: dict[str, Any] | None = None):
    response = await request_ml("POST", f"/models/{model_id}/archive", json=payload or {})
    return response.json()


@router.post("/models/{model_id}/reject")
async def reject_model(model_id: str, payload: dict[str, Any] | None = None):
    response = await request_ml("POST", f"/models/{model_id}/reject", json=payload or {})
    return response.json()


@router.patch("/models/{model_id}/notes")
async def patch_model_notes(model_id: str, payload: dict[str, Any]):
    response = await request_ml("PATCH", f"/models/{model_id}/notes", json=payload)
    return response.json()


@router.post("/predict/audio-path")
async def predict_audio_path(payload: dict[str, Any]):
    response = await request_ml("POST", "/predict/audio-path", json=payload)
    return response.json()


@router.post("/identify/audio-path")
async def identify_audio_path(payload: dict[str, Any]):
    response = await request_ml("POST", "/identify/audio-path", json=payload)
    return response.json()


@router.post("/spectrogram/audio-path")
async def spectrogram_audio_path(payload: dict[str, Any]):
    response = await request_ml("POST", "/spectrogram/audio-path", json=payload)
    return Response(content=response.content, media_type=response.headers.get("content-type", "image/png"))


@router.get("/training/presets")
async def training_presets():
    response = await request_ml("GET", "/training/presets")
    return response.json()


@router.get("/training/manifests")
async def training_manifests():
    response = await request_ml("GET", "/training/manifests")
    return response.json()


@router.get("/training/manifest-summary")
async def training_manifest_summary(manifest_csv: str):
    response = await request_ml("GET", "/training/manifest-summary", params={"manifest_csv": manifest_csv})
    return response.json()


@router.get("/training/manifest-candidates")
async def training_manifest_candidates(manifest_csv: str):
    response = await request_ml("GET", "/training/manifest-candidates", params={"manifest_csv": manifest_csv})
    return response.json()


@router.post("/training/clean-manifest/dry-run")
async def training_clean_manifest_dry_run(payload: dict[str, Any]):
    response = await request_ml(
        "POST",
        "/training/clean-manifest/dry-run",
        json={**payload, "feedback_items": audio_lab_feedback_items()},
    )
    return response.json()


@router.post("/training/clean-manifest")
async def training_clean_manifest(payload: dict[str, Any]):
    response = await request_ml(
        "POST",
        "/training/clean-manifest",
        json={**payload, "feedback_items": audio_lab_feedback_items()},
    )
    return response.json()


@router.post("/training/specialized-manifest/dry-run")
async def training_specialized_manifest_dry_run(payload: dict[str, Any]):
    feedback_items = audio_lab_feedback_items() if payload.get("apply_feedback", True) else []
    response = await request_ml(
        "POST",
        "/training/specialized-manifest/dry-run",
        json={**payload, "feedback_items": feedback_items},
    )
    return response.json()


@router.post("/training/specialized-manifest")
async def training_specialized_manifest(payload: dict[str, Any]):
    feedback_items = audio_lab_feedback_items() if payload.get("apply_feedback", True) else []
    response = await request_ml(
        "POST",
        "/training/specialized-manifest",
        json={**payload, "feedback_items": feedback_items},
    )
    return response.json()


@router.get("/training/jobs")
async def training_jobs():
    response = await request_ml("GET", "/training/jobs")
    return response.json()


@router.post("/training/jobs")
async def create_training_job(payload: dict[str, Any]):
    response = await request_ml("POST", "/training/jobs", json=payload)
    return response.json()


@router.get("/training/jobs/{job_id}")
async def training_job(job_id: str):
    response = await request_ml("GET", f"/training/jobs/{job_id}")
    return response.json()


@router.get("/training/jobs/{job_id}/logs")
async def training_job_logs(job_id: str):
    response = await request_ml("GET", f"/training/jobs/{job_id}/logs")
    return response.json()


@router.get("/training/jobs/{job_id}/artifacts/{filename}")
async def training_job_artifact(job_id: str, filename: str):
    response = await request_ml("GET", f"/training/jobs/{job_id}/artifacts/{filename}")
    return Response(
        content=response.content,
        media_type=response.headers.get("content-type", "application/octet-stream"),
        headers={"content-disposition": response.headers.get("content-disposition", f'attachment; filename="{filename}"')},
    )


@router.post("/training/jobs/{job_id}/cancel")
async def cancel_training_job(job_id: str):
    response = await request_ml("POST", f"/training/jobs/{job_id}/cancel")
    return response.json()


@router.post("/training/jobs/{job_id}/evaluate")
async def evaluate_training_job(job_id: str, payload: dict[str, Any] | None = None):
    response = await request_ml("POST", f"/training/jobs/{job_id}/evaluate", json=payload or {})
    return response.json()


@router.post("/training/jobs/{job_id}/calibrate-threshold")
async def calibrate_training_job_threshold(job_id: str, payload: dict[str, Any]):
    response = await request_ml("POST", f"/training/jobs/{job_id}/calibrate-threshold", json=payload)
    return response.json()


@router.post("/training/jobs/{job_id}/register-model")
async def register_training_job_model(job_id: str, payload: dict[str, Any] | None = None):
    response = await request_ml("POST", f"/training/jobs/{job_id}/register-model", json=payload or {})
    return response.json()
