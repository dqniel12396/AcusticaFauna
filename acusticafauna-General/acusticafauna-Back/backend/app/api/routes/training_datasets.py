from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.services.training_dataset_service import (
    archive_dataset_version,
    assign_splits,
    build_dataset_version,
    create_dataset_version,
    export_dataset_manifest,
    get_dataset_audit,
    get_dataset_items,
    get_dataset_presets,
    get_dataset_stats,
    get_dataset_version,
    list_dataset_versions,
    lock_dataset_version,
)


router = APIRouter(prefix="/training-datasets", tags=["training-datasets"])


class DatasetVersionPayload(BaseModel):
    version_name: str
    description: str | None = None
    created_by: str | None = None
    notes: str | None = None
    include_imported_candidates: bool | None = None
    include_gold: bool | None = None
    include_corrected: bool | None = None
    include_background: bool | None = None
    include_target_negatives: bool | None = None
    exclude_needs_review: bool | None = None
    exclude_uncertain: bool | None = None
    exclude_rejected: bool | None = None
    min_duration_seconds: float | None = None
    max_duration_seconds: float | None = None
    min_examples_per_label: int | None = None
    max_examples_per_label: int | None = None
    max_background_examples: int | None = None
    include_label_types: list[str] | None = None
    exclude_label_types: list[str] | None = None
    include_group_names: list[str] | None = None
    exclude_group_names: list[str] | None = None
    map_species_to_group: bool | None = None
    target_mode: str | None = None
    balance_strategy: str | None = None
    background_ratio: float | None = None
    split_strategy: str | None = None
    train_ratio: float | None = None
    val_ratio: float | None = None
    test_ratio: float | None = None
    random_seed: int | None = None


class SplitPayload(BaseModel):
    split_strategy: str | None = None
    train_ratio: float | None = None
    val_ratio: float | None = None
    test_ratio: float | None = None
    random_seed: int | None = None


def model_to_dict(payload: BaseModel) -> dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump(exclude_unset=True)
    return payload.dict(exclude_unset=True)


@router.get("")
def list_versions():
    return list_dataset_versions()


@router.post("")
def create_version(payload: DatasetVersionPayload):
    return create_dataset_version(model_to_dict(payload))


@router.get("/presets")
def presets():
    return get_dataset_presets()


@router.get("/{version_id}")
def get_version(version_id: str):
    return get_dataset_version(version_id)


@router.post("/{version_id}/build")
def build_version(version_id: str):
    return build_dataset_version(version_id)


@router.get("/{version_id}/items")
def list_items(
    version_id: str,
    normalized_label: str | None = None,
    item_role: str | None = None,
    confidence_source: str | None = None,
    split: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    return get_dataset_items(
        version_id,
        {
            "normalized_label": normalized_label,
            "item_role": item_role,
            "confidence_source": confidence_source,
            "split": split,
            "limit": limit,
            "offset": offset,
        },
    )


@router.get("/{version_id}/stats")
def stats(version_id: str):
    return get_dataset_stats(version_id)


@router.get("/{version_id}/audit")
def audit(version_id: str):
    return get_dataset_audit(version_id)


@router.post("/{version_id}/splits")
def split(version_id: str, payload: SplitPayload):
    return assign_splits(version_id, model_to_dict(payload))


@router.get("/{version_id}/export")
def export(version_id: str, format: str = "csv", included_only: bool = False):
    output_path = export_dataset_manifest(version_id, format=format, included_only=included_only)
    return FileResponse(output_path, filename=output_path.name)


@router.post("/{version_id}/lock")
def lock(version_id: str):
    return lock_dataset_version(version_id)


@router.post("/{version_id}/archive")
def archive(version_id: str):
    return archive_dataset_version(version_id)
