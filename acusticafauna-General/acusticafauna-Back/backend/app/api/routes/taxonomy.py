from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.services.taxonomy_service import (
    create_taxonomy_item,
    deactivate_taxonomy_item,
    get_examples_for_label,
    get_label_counts,
    get_taxonomy_item,
    list_taxonomy,
    merge_labels,
    suggest_taxonomy_from_curated_labels,
    update_taxonomy_item,
)


router = APIRouter(prefix="/taxonomy", tags=["taxonomy"])


class TaxonomyPayload(BaseModel):
    label: str | None = None
    display_name: str | None = None
    scientific_name: str | None = None
    common_name: str | None = None
    group_name: str | None = None
    family: str | None = None
    genus: str | None = None
    species: str | None = None
    label_type: str | None = None
    parent_label: str | None = None
    aliases: str | list[str] | None = None
    code: str | None = None
    is_active: bool | None = None
    use_for_training: bool | None = None
    needs_review: bool | None = None
    notes: str | None = None


class MergePayload(BaseModel):
    source_label: str
    target_label: str


def payload_to_dict(payload: BaseModel) -> dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump(exclude_unset=True)
    return payload.dict(exclude_unset=True)


@router.get("")
def list_items(
    label: str | None = None,
    group_name: str | None = None,
    label_type: str | None = None,
    is_active: bool | None = None,
    use_for_training: bool | None = None,
    needs_review: bool | None = None,
    search: str | None = None,
    few_examples: bool | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    filters: dict[str, Any] = {
        "label": label,
        "group_name": group_name,
        "label_type": label_type,
        "is_active": is_active,
        "use_for_training": use_for_training,
        "needs_review": needs_review,
        "search": search,
        "few_examples": few_examples,
        "limit": limit,
        "offset": offset,
    }
    return list_taxonomy(filters)


@router.get("/stats")
def stats():
    return get_label_counts()


@router.post("/suggest-from-curated")
def suggest_from_curated():
    return suggest_taxonomy_from_curated_labels()


@router.post("/merge")
def merge(payload: MergePayload):
    return merge_labels(payload.source_label, payload.target_label)


@router.get("/{label}/examples")
def examples(label: str, limit: int = Query(25, ge=1, le=100)):
    return get_examples_for_label(label, limit)


@router.get("/{item_id}")
def get_item(item_id: str):
    return get_taxonomy_item(item_id)


@router.post("")
def create_item(payload: TaxonomyPayload):
    return create_taxonomy_item(payload_to_dict(payload))


@router.put("/{item_id}")
def update_item(item_id: str, payload: TaxonomyPayload):
    return update_taxonomy_item(item_id, payload_to_dict(payload))


@router.delete("/{item_id}")
def delete_item(item_id: str):
    return deactivate_taxonomy_item(item_id)
