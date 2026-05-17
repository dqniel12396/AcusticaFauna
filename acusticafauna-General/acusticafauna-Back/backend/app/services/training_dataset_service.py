from __future__ import annotations

import csv
import json
import random
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.core.config import settings
from app.db.database import get_connection
from app.services.taxonomy_service import canonical_label_for, infer_from_label


VALID_VERSION_STATUSES = {"draft", "built", "locked", "archived"}
DEFAULT_RULES: dict[str, Any] = {
    "include_imported_candidates": True,
    "include_gold": True,
    "include_corrected": True,
    "include_background": True,
    "include_target_negatives": True,
    "exclude_needs_review": True,
    "exclude_uncertain": True,
    "exclude_rejected": True,
    "min_duration_seconds": 0.25,
    "max_duration_seconds": 10.0,
    "min_examples_per_label": 10,
    "max_examples_per_label": None,
    "max_background_examples": None,
    "include_label_types": [],
    "exclude_label_types": [],
    "include_group_names": [],
    "exclude_group_names": [],
    "map_species_to_group": False,
    "target_mode": "custom",
    "balance_strategy": "none",
    "background_ratio": None,
    "split_strategy": "stratified",
    "train_ratio": 0.7,
    "val_ratio": 0.15,
    "test_ratio": 0.15,
    "random_seed": 42,
}

DATASET_PRESETS: dict[str, dict[str, Any]] = {
    "general_detector_v0": {
        "version_name": "general_detector_v0",
        "description": "Detector general practico: rana/sapo, aves, insectos y ruido con caps por clase.",
        "include_imported_candidates": True,
        "include_gold": True,
        "include_corrected": True,
        "include_background": True,
        "include_target_negatives": False,
        "exclude_needs_review": True,
        "exclude_uncertain": True,
        "exclude_rejected": True,
        "min_duration_seconds": 0.25,
        "max_duration_seconds": 10.0,
        "min_examples_per_label": 10,
        "max_examples_per_label": 1000,
        "max_background_examples": 1000,
        "exclude_label_types": ["unknown", "code"],
        "map_species_to_group": True,
        "target_mode": "general_detector",
        "balance_strategy": "cap_per_label",
        "background_ratio": 1.0,
        "split_strategy": "stratified",
        "train_ratio": 0.7,
        "val_ratio": 0.15,
        "test_ratio": 0.15,
        "random_seed": 42,
    },
    "general_detector_strict_balanced": {
        "version_name": "general_detector_strict_balanced",
        "description": "Detector general con downsample estricto al tamano de la clase mas pequena.",
        "include_imported_candidates": True,
        "include_gold": True,
        "include_corrected": True,
        "include_background": True,
        "include_target_negatives": False,
        "exclude_needs_review": True,
        "exclude_uncertain": True,
        "exclude_rejected": True,
        "min_duration_seconds": 0.25,
        "max_duration_seconds": 10.0,
        "min_examples_per_label": 10,
        "max_examples_per_label": 1000,
        "max_background_examples": 1000,
        "exclude_label_types": ["unknown", "code"],
        "map_species_to_group": True,
        "target_mode": "general_detector",
        "balance_strategy": "balanced_downsample",
        "background_ratio": 1.0,
        "split_strategy": "stratified",
        "train_ratio": 0.7,
        "val_ratio": 0.15,
        "test_ratio": 0.15,
        "random_seed": 42,
    },
    "amphibian_species_v0": {
        "version_name": "amphibian_species_v0",
        "description": "Clasificador de especies anfibias con ruido/background controlado.",
        "include_imported_candidates": True,
        "include_gold": True,
        "include_corrected": True,
        "include_background": True,
        "include_target_negatives": False,
        "exclude_needs_review": True,
        "exclude_uncertain": True,
        "exclude_rejected": True,
        "min_duration_seconds": 0.25,
        "max_duration_seconds": 10.0,
        "min_examples_per_label": 30,
        "max_examples_per_label": 1000,
        "max_background_examples": 1000,
        "include_label_types": ["species", "noise"],
        "exclude_label_types": ["unknown", "code", "group"],
        "include_group_names": ["anfibio", "ruido"],
        "map_species_to_group": False,
        "target_mode": "species_classifier",
        "balance_strategy": "cap_per_label",
        "background_ratio": 1.0,
        "split_strategy": "stratified",
        "train_ratio": 0.7,
        "val_ratio": 0.15,
        "test_ratio": 0.15,
        "random_seed": 42,
    },
    "amphibian_species_v2_aliases": {
        "version_name": "amphibian_species_v2_aliases",
        "description": "Clasificador de especies anfibias con aliases/codigos normalizados a labels canonicos.",
        "include_imported_candidates": True,
        "include_gold": True,
        "include_corrected": True,
        "include_background": True,
        "include_target_negatives": False,
        "exclude_needs_review": True,
        "exclude_uncertain": True,
        "exclude_rejected": True,
        "min_duration_seconds": 0.25,
        "max_duration_seconds": 10.0,
        "min_examples_per_label": 30,
        "max_examples_per_label": 1000,
        "max_background_examples": 1000,
        "include_label_types": ["species", "noise"],
        "exclude_label_types": ["unknown", "code", "group"],
        "include_group_names": ["anfibio", "ruido"],
        "map_species_to_group": False,
        "target_mode": "species_classifier",
        "balance_strategy": "cap_per_label",
        "background_ratio": 1.0,
        "split_strategy": "stratified",
        "train_ratio": 0.7,
        "val_ratio": 0.15,
        "test_ratio": 0.15,
        "random_seed": 42,
    },
    "audit_gold_only": {
        "version_name": "audit_gold_only",
        "description": "Solo ejemplos gold/corrected para validacion humana.",
        "include_imported_candidates": False,
        "include_gold": True,
        "include_corrected": True,
        "include_background": False,
        "include_target_negatives": False,
        "exclude_needs_review": True,
        "exclude_uncertain": True,
        "exclude_rejected": True,
        "min_duration_seconds": 0.25,
        "max_duration_seconds": 10.0,
        "min_examples_per_label": 1,
        "include_label_types": ["species", "noise"],
        "exclude_label_types": ["unknown", "code"],
        "map_species_to_group": False,
        "target_mode": "custom",
        "balance_strategy": "none",
        "split_strategy": "stratified",
        "train_ratio": 0.7,
        "val_ratio": 0.15,
        "test_ratio": 0.15,
        "random_seed": 42,
    },
}


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def clean_float(value: Any, default: float | None = None) -> float | None:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def clean_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() in {"1", "true", "yes", "si", "y"}


def clean_list(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, tuple):
        return [str(item).strip() for item in value if str(item).strip()]
    try:
        parsed = json.loads(str(value))
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    except json.JSONDecodeError:
        pass
    return [part.strip() for part in str(value).split(",") if part.strip()]


def merged_rules(config: dict[str, Any] | None = None) -> dict[str, Any]:
    rules = dict(DEFAULT_RULES)
    for key, value in (config or {}).items():
        if key in rules:
            rules[key] = value
    rules["include_imported_candidates"] = clean_bool(rules.get("include_imported_candidates"), True)
    rules["include_gold"] = clean_bool(rules.get("include_gold"), True)
    rules["include_corrected"] = clean_bool(rules.get("include_corrected"), True)
    rules["include_background"] = clean_bool(rules.get("include_background"), True)
    rules["include_target_negatives"] = clean_bool(rules.get("include_target_negatives"), True)
    rules["exclude_needs_review"] = clean_bool(rules.get("exclude_needs_review"), True)
    rules["exclude_uncertain"] = clean_bool(rules.get("exclude_uncertain"), True)
    rules["exclude_rejected"] = clean_bool(rules.get("exclude_rejected"), True)
    rules["min_duration_seconds"] = clean_float(rules.get("min_duration_seconds"), 0.25)
    rules["max_duration_seconds"] = clean_float(rules.get("max_duration_seconds"), 10.0)
    rules["min_examples_per_label"] = int(rules.get("min_examples_per_label") or 0)
    rules["max_examples_per_label"] = int(rules["max_examples_per_label"]) if rules.get("max_examples_per_label") not in {None, ""} else None
    rules["max_background_examples"] = int(rules["max_background_examples"]) if rules.get("max_background_examples") not in {None, ""} else None
    rules["include_label_types"] = clean_list(rules.get("include_label_types"))
    rules["exclude_label_types"] = clean_list(rules.get("exclude_label_types"))
    rules["include_group_names"] = clean_list(rules.get("include_group_names"))
    rules["exclude_group_names"] = clean_list(rules.get("exclude_group_names"))
    rules["map_species_to_group"] = clean_bool(rules.get("map_species_to_group"), False)
    rules["target_mode"] = clean_text(rules.get("target_mode")) or "custom"
    rules["balance_strategy"] = clean_text(rules.get("balance_strategy")) or "none"
    rules["background_ratio"] = clean_float(rules.get("background_ratio"), None)
    rules["train_ratio"] = clean_float(rules.get("train_ratio"), 0.7) or 0.7
    rules["val_ratio"] = clean_float(rules.get("val_ratio"), 0.15) or 0.15
    rules["test_ratio"] = clean_float(rules.get("test_ratio"), 0.15) or 0.15
    rules["random_seed"] = int(rules.get("random_seed") or 42)
    return rules


def get_dataset_presets() -> dict[str, dict[str, Any]]:
    return {name: dict(config) for name, config in DATASET_PRESETS.items()}


def get_dataset_preset(name: str) -> dict[str, Any]:
    preset = DATASET_PRESETS.get(name)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset de dataset no encontrado.")
    return dict(preset)


def row_to_dict(row) -> dict[str, Any] | None:
    return dict(row) if row else None


def create_dataset_version(config: dict[str, Any]) -> dict[str, Any]:
    version_name = clean_text(config.get("version_name"))
    if not version_name:
        raise HTTPException(status_code=400, detail="version_name es requerido.")

    version_id = str(uuid.uuid4())
    rules = merged_rules(config)
    timestamp = now_iso()
    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO training_dataset_versions (
                id, version_name, description, created_at, created_by, status,
                source, rules_json, notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                version_id,
                version_name,
                clean_text(config.get("description")),
                timestamp,
                clean_text(config.get("created_by")) or "local",
                "draft",
                "curated_dataset",
                json.dumps(rules, ensure_ascii=False),
                clean_text(config.get("notes")),
            ),
        )
        conn.commit()
        return get_dataset_version(version_id)
    except Exception as exc:
        conn.rollback()
        if "UNIQUE" in str(exc).upper():
            raise HTTPException(status_code=409, detail="Ya existe una version con ese nombre.")
        raise
    finally:
        conn.close()


def list_dataset_versions() -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT *
            FROM training_dataset_versions
            ORDER BY created_at DESC
            """
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_dataset_version(version_id: str) -> dict[str, Any]:
    conn = get_connection()
    try:
        version = row_to_dict(
            conn.execute(
                "SELECT * FROM training_dataset_versions WHERE id = ?",
                (version_id,),
            ).fetchone()
        )
        if not version:
            raise HTTPException(status_code=404, detail="Version de dataset no encontrada.")
        if version.get("rules_json"):
            try:
                version["rules"] = json.loads(version["rules_json"])
            except json.JSONDecodeError:
                version["rules"] = {}
        return version
    finally:
        conn.close()


def source_rows(conn) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
            s.*,
            r.review_status AS latest_review_status,
            r.reviewed_label,
            t.label AS taxonomy_label,
            t.group_name,
            t.label_type,
            t.use_for_training,
            t.needs_review,
            t.parent_label,
            t.aliases,
            t.code,
            rt.label AS reviewed_taxonomy_label,
            rt.group_name AS reviewed_group_name,
            rt.label_type AS reviewed_label_type,
            rt.use_for_training AS reviewed_use_for_training,
            rt.needs_review AS reviewed_needs_review,
            rt.parent_label AS reviewed_parent_label,
            rt.aliases AS reviewed_aliases,
            rt.code AS reviewed_code,
            lab.user_feedback AS lab_user_feedback,
            lab.feedback_type AS lab_feedback_type,
            lab.exclusion_reason AS lab_exclusion_reason,
            lab.status AS lab_annotation_status,
            lab.recommended_training_use AS lab_recommended_training_use,
            lab.label_type AS lab_label_type
        FROM curated_audio_segments s
        LEFT JOIN human_reviews r
            ON r.id = (
                SELECT hr.id
                FROM human_reviews hr
                WHERE hr.curated_segment_id = s.id
                ORDER BY hr.updated_at DESC
                LIMIT 1
            )
        LEFT JOIN label_taxonomy t ON t.label = s.label
        LEFT JOIN label_taxonomy rt ON rt.label = r.reviewed_label
        LEFT JOIN audio_lab_annotations lab
            ON lab.id = (
                SELECT la.id
                FROM audio_lab_annotations la
                WHERE la.audio_path = s.output_path
                  AND COALESCE(la.status, 'active') IN ('active', 'corrected')
                ORDER BY COALESCE(la.updated_at, la.created_at) DESC
                LIMIT 1
            )
        ORDER BY s.imported_at ASC, s.label ASC
        """
    ).fetchall()
    return [dict(row) for row in rows]


def taxonomy_lookup(conn) -> dict[str, dict[str, Any]]:
    rows = conn.execute("SELECT * FROM label_taxonomy").fetchall()
    return {row["label"]: dict(row) for row in rows}


def resolve_taxonomy_label(
    label: str | None,
    lookup: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    raw_label = clean_text(label)
    if not raw_label:
        return {
            "canonical_label": None,
            "taxonomy_label": None,
            "group_name": None,
            "label_type": None,
            "use_for_training": None,
            "needs_review": None,
            "alias_applied": False,
        }

    raw_taxonomy = lookup.get(raw_label)
    canonical_label = (
        clean_text(raw_taxonomy.get("parent_label")) if raw_taxonomy else None
    ) or canonical_label_for(raw_label) or raw_label
    canonical_taxonomy = lookup.get(canonical_label) or infer_from_label(canonical_label)

    return {
        "canonical_label": canonical_label,
        "taxonomy_label": canonical_taxonomy.get("label") or canonical_label,
        "group_name": canonical_taxonomy.get("group_name"),
        "label_type": canonical_taxonomy.get("label_type"),
        "use_for_training": canonical_taxonomy.get("use_for_training"),
        "needs_review": canonical_taxonomy.get("needs_review"),
        "alias_applied": canonical_label != raw_label,
    }


def row_training_status(row: dict[str, Any]) -> str:
    status = row.get("latest_review_status")
    if status in {"accepted", "corrected"}:
        return "gold"
    if status == "rejected":
        return "excluded"
    if status == "uncertain":
        return "needs_review"
    if row.get("group_type") == "revisar" or row.get("label") == "revisar_etiqueta":
        return "needs_review"
    if row.get("group_type") == "negativo_objetivo":
        return "candidate_negative"
    return "candidate"


def taxonomy_allows(use_for_training: Any, needs_review: Any, rules: dict[str, Any]) -> tuple[bool, str | None]:
    if use_for_training is not None and int(use_for_training) == 0:
        return False, "taxonomia_no_entrenable"
    if rules["exclude_needs_review"] and needs_review is not None and int(needs_review) == 1:
        return False, "taxonomia_requiere_revision"
    return True, None


def group_label_for_item(group_name: str | None, original_label: str | None) -> str | None:
    if group_name == "anfibio":
        return "rana_sapo"
    if group_name == "ave":
        return "ave"
    if group_name == "insecto":
        return "insecto"
    if group_name == "ruido" or original_label == "otros_ruidos":
        return "otros_ruidos"
    return original_label


def apply_taxonomy_filters(
    label_type: str | None,
    group_name: str | None,
    rules: dict[str, Any],
) -> str | None:
    if rules["include_label_types"] and (label_type or "") not in rules["include_label_types"]:
        return "tipo_taxonomico_no_incluido"
    if rules["exclude_label_types"] and (label_type or "") in rules["exclude_label_types"]:
        return "tipo_taxonomico_excluido"
    if rules["include_group_names"] and (group_name or "") not in rules["include_group_names"]:
        return "grupo_taxonomico_no_incluido"
    if rules["exclude_group_names"] and (group_name or "") in rules["exclude_group_names"]:
        return "grupo_taxonomico_excluido"
    return None


def decide_item(
    row: dict[str, Any],
    rules: dict[str, Any],
    lookup: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    lookup = lookup or {}
    review_status = row.get("latest_review_status")
    training_status = row_training_status(row)
    original_label = row.get("label")
    resolved = resolve_taxonomy_label(original_label, lookup)
    normalized_label = resolved["canonical_label"] or original_label
    taxonomy_label = resolved["taxonomy_label"] or normalized_label
    group_name = resolved["group_name"] or row.get("group_name")
    label_type = resolved["label_type"] or row.get("label_type")
    use_for_training = resolved["use_for_training"] if resolved["use_for_training"] is not None else row.get("use_for_training")
    needs_review = resolved["needs_review"] if resolved["needs_review"] is not None else row.get("needs_review")
    item_role = "positive"
    confidence_source = "imported"
    include_reason = "alias_taxonomico_aplicado" if resolved["alias_applied"] else ""
    exclude_reason = None

    if review_status == "corrected":
        reviewed_resolved = resolve_taxonomy_label(row.get("reviewed_label") or original_label, lookup)
        normalized_label = reviewed_resolved["canonical_label"] or row.get("reviewed_label") or original_label
        taxonomy_label = reviewed_resolved["taxonomy_label"] or normalized_label
        group_name = reviewed_resolved["group_name"] or row.get("reviewed_group_name") or group_name
        label_type = reviewed_resolved["label_type"] or row.get("reviewed_label_type") or label_type
        use_for_training = reviewed_resolved["use_for_training"] if reviewed_resolved["use_for_training"] is not None else row.get("reviewed_use_for_training")
        needs_review = reviewed_resolved["needs_review"] if reviewed_resolved["needs_review"] is not None else row.get("reviewed_needs_review")
        confidence_source = "corrected"
        include_reason = "revision_humana_corrected"
    elif review_status == "accepted":
        accepted_resolved = resolve_taxonomy_label(row.get("reviewed_label") or original_label, lookup)
        normalized_label = accepted_resolved["canonical_label"] or row.get("reviewed_label") or original_label
        taxonomy_label = accepted_resolved["taxonomy_label"] or normalized_label
        group_name = accepted_resolved["group_name"] or group_name
        label_type = accepted_resolved["label_type"] or label_type
        use_for_training = accepted_resolved["use_for_training"] if accepted_resolved["use_for_training"] is not None else use_for_training
        needs_review = accepted_resolved["needs_review"] if accepted_resolved["needs_review"] is not None else needs_review
        confidence_source = "gold"
        include_reason = "revision_humana_accepted"
    elif row.get("group_type") == "negativo_objetivo":
        negative_resolved = resolve_taxonomy_label(row.get("negative_for") or original_label, lookup)
        normalized_label = negative_resolved["canonical_label"] or row.get("negative_for") or original_label
        taxonomy_label = negative_resolved["taxonomy_label"] or normalized_label
        group_name = negative_resolved["group_name"] or group_name
        label_type = negative_resolved["label_type"] or label_type
        use_for_training = negative_resolved["use_for_training"] if negative_resolved["use_for_training"] is not None else use_for_training
        needs_review = negative_resolved["needs_review"] if negative_resolved["needs_review"] is not None else needs_review
        item_role = "negative"
        confidence_source = "negative_target"
        include_reason = "negativo_por_objetivo"
    elif normalized_label == "otros_ruidos" or label_type == "noise" or row.get("group_type") == "otros_ruidos":
        item_role = "background"
        include_reason = "background_ruido" if not resolved["alias_applied"] else "alias_ruido_no_especie"
    else:
        include_reason = include_reason or "candidato_importado"

    if rules["map_species_to_group"] and label_type == "species":
        normalized_label = group_label_for_item(group_name, original_label)
        taxonomy_label = normalized_label

    if review_status == "uncertain" and rules["exclude_uncertain"]:
        exclude_reason = "revision_uncertain"
    elif review_status == "rejected" and rules["exclude_rejected"]:
        exclude_reason = "revision_rejected"
    elif row.get("lab_user_feedback") == "excluded_from_training":
        exclude_reason = f"audio_lab_excluded_{row.get('lab_exclusion_reason') or 'training'}"
    elif row.get("lab_exclusion_reason") == "voz_humana" and row.get("lab_recommended_training_use") == "exclude_species_training":
        exclude_reason = "audio_lab_voz_humana"
    elif original_label == "revisar_etiqueta" or row.get("group_type") == "revisar":
        exclude_reason = "pendiente_real"
    elif not row.get("output_path") or not Path(row["output_path"]).exists():
        exclude_reason = "audio_no_encontrado"
    elif not row.get("source_sha256"):
        exclude_reason = "sin_sha256"
    elif rules["min_duration_seconds"] is not None and (row.get("duration_seconds") or 0) < rules["min_duration_seconds"]:
        exclude_reason = "duracion_menor_minimo"
    elif rules["max_duration_seconds"] is not None and (row.get("duration_seconds") or 0) > rules["max_duration_seconds"]:
        exclude_reason = "duracion_mayor_maximo"
    elif item_role == "negative" and not rules["include_target_negatives"]:
        exclude_reason = "negativos_objetivo_deshabilitados"
    elif item_role == "background" and not rules["include_background"]:
        exclude_reason = "background_deshabilitado"
    elif confidence_source == "corrected" and not rules["include_corrected"]:
        exclude_reason = "corrected_deshabilitado"
    elif confidence_source == "gold" and not rules["include_gold"]:
        exclude_reason = "gold_deshabilitado"
    elif confidence_source == "imported" and training_status == "candidate" and not rules["include_imported_candidates"]:
        exclude_reason = "candidatos_importados_deshabilitados"
    elif not exclude_reason:
        exclude_reason = apply_taxonomy_filters(label_type, group_name, rules)

    if not exclude_reason and confidence_source == "imported":
        allowed, reason = taxonomy_allows(use_for_training, needs_review, rules)
        if not allowed:
            exclude_reason = reason

    if exclude_reason:
        item_role = "excluded"

    return {
        "curated_segment_id": row["id"],
        "original_label": original_label,
        "normalized_label": normalized_label,
        "taxonomy_label": taxonomy_label,
        "group_name": group_name,
        "label_type": label_type,
        "item_role": item_role,
        "confidence_source": confidence_source,
        "split": "unassigned",
        "duration_seconds": row.get("duration_seconds"),
        "source_path": row.get("source_path"),
        "audio_path": row.get("output_path"),
        "sha256": row.get("source_sha256"),
        "include_reason": include_reason if not exclude_reason else None,
        "exclude_reason": exclude_reason,
    }


def assign_splits_for_items(items: list[dict[str, Any]], rules: dict[str, Any]) -> None:
    train_ratio = float(rules["train_ratio"])
    val_ratio = float(rules["val_ratio"])
    seed = int(rules["random_seed"])
    by_label: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        if item["item_role"] == "excluded":
            item["split"] = "unassigned"
            continue
        by_label.setdefault(item["normalized_label"] or "sin_label", []).append(item)

    for label, label_items in by_label.items():
        rng = random.Random(f"{seed}:{label}")
        rng.shuffle(label_items)
        total = len(label_items)
        train_cut = int(total * train_ratio)
        val_cut = train_cut + int(total * val_ratio)
        if total and train_cut == 0:
            train_cut = 1
            val_cut = max(val_cut, train_cut)
        for index, item in enumerate(label_items):
            if index < train_cut:
                item["split"] = "train"
            elif index < val_cut:
                item["split"] = "val"
            else:
                item["split"] = "test"


def apply_min_examples_rule(items: list[dict[str, Any]], rules: dict[str, Any]) -> None:
    minimum = int(rules.get("min_examples_per_label") or 0)
    if minimum <= 1:
        return
    counts: dict[str, int] = {}
    for item in items:
        if item["item_role"] != "excluded":
            counts[item["normalized_label"] or "sin_label"] = counts.get(item["normalized_label"] or "sin_label", 0) + 1
    for item in items:
        label = item["normalized_label"] or "sin_label"
        if item["item_role"] != "excluded" and counts.get(label, 0) < minimum:
            item["item_role"] = "excluded"
            item["split"] = "unassigned"
            item["include_reason"] = None
            item["exclude_reason"] = "pocos_ejemplos_por_etiqueta"


def cap_group(items: list[dict[str, Any]], candidates: list[dict[str, Any]], cap: int, reason: str, seed: int, key: str) -> None:
    if cap is None or cap < 0 or len(candidates) <= cap:
        return
    rng = random.Random(f"{seed}:{key}")
    shuffled = list(candidates)
    rng.shuffle(shuffled)
    for item in shuffled[cap:]:
        item["item_role"] = "excluded"
        item["split"] = "unassigned"
        item["include_reason"] = None
        item["exclude_reason"] = reason


def apply_balance_rules(items: list[dict[str, Any]], rules: dict[str, Any]) -> None:
    seed = int(rules.get("random_seed") or 42)
    included = [item for item in items if item["item_role"] != "excluded"]

    max_per_label = rules.get("max_examples_per_label")
    if max_per_label is not None:
        by_label: dict[str, list[dict[str, Any]]] = {}
        for item in included:
            by_label.setdefault(item["normalized_label"] or "sin_label", []).append(item)
        for label, label_items in by_label.items():
            cap_group(items, label_items, int(max_per_label), "exceso_max_examples_per_label", seed, f"label:{label}")

    included = [item for item in items if item["item_role"] != "excluded"]
    background_items = [item for item in included if item["item_role"] == "background"]
    max_background = rules.get("max_background_examples")
    if max_background is not None:
        cap_group(items, background_items, int(max_background), "exceso_max_background_examples", seed, "background:max")

    included = [item for item in items if item["item_role"] != "excluded"]
    background_items = [item for item in included if item["item_role"] == "background"]
    positive_count = len([item for item in included if item["item_role"] == "positive"])
    if rules.get("background_ratio") is not None and positive_count > 0:
        background_cap = int(positive_count * float(rules["background_ratio"]))
        cap_group(items, background_items, background_cap, "exceso_background_ratio", seed, "background:ratio")

    if rules.get("balance_strategy") == "balanced_downsample":
        included = [item for item in items if item["item_role"] != "excluded"]
        by_label: dict[str, list[dict[str, Any]]] = {}
        for item in included:
            by_label.setdefault(item["normalized_label"] or "sin_label", []).append(item)
        positive_labels = {label: values for label, values in by_label.items() if values}
        if len(positive_labels) > 1:
            cap = min(len(values) for values in positive_labels.values())
            for label, label_items in positive_labels.items():
                cap_group(items, label_items, cap, "balanced_downsample", seed, f"balanced:{label}")


def recompute_label_stats(conn, version_id: str) -> None:
    conn.execute("DELETE FROM training_dataset_label_stats WHERE dataset_version_id = ?", (version_id,))
    labels = conn.execute(
        """
        SELECT COALESCE(normalized_label, original_label, '') AS label
        FROM training_dataset_items
        WHERE dataset_version_id = ?
        GROUP BY COALESCE(normalized_label, original_label, '')
        """,
        (version_id,),
    ).fetchall()
    for row in labels:
        label = row["label"]
        stats = conn.execute(
            """
            SELECT
                COUNT(*) AS count_total,
                SUM(CASE WHEN split = 'train' THEN 1 ELSE 0 END) AS count_train,
                SUM(CASE WHEN split = 'val' THEN 1 ELSE 0 END) AS count_val,
                SUM(CASE WHEN split = 'test' THEN 1 ELSE 0 END) AS count_test,
                COALESCE(SUM(duration_seconds), 0) AS duration_total_seconds,
                SUM(CASE WHEN confidence_source = 'imported' THEN 1 ELSE 0 END) AS source_imported_count,
                SUM(CASE WHEN confidence_source = 'gold' THEN 1 ELSE 0 END) AS gold_count,
                SUM(CASE WHEN confidence_source = 'corrected' THEN 1 ELSE 0 END) AS corrected_count,
                SUM(CASE WHEN confidence_source = 'negative_target' THEN 1 ELSE 0 END) AS negative_count,
                SUM(CASE WHEN item_role = 'excluded' THEN 1 ELSE 0 END) AS excluded_count
            FROM training_dataset_items
            WHERE dataset_version_id = ?
              AND COALESCE(normalized_label, original_label, '') = ?
            """,
            (version_id, label),
        ).fetchone()
        conn.execute(
            """
            INSERT INTO training_dataset_label_stats (
                id, dataset_version_id, label, count_total, count_train, count_val,
                count_test, duration_total_seconds, source_imported_count, gold_count,
                corrected_count, negative_count, excluded_count
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                version_id,
                label,
                stats["count_total"] or 0,
                stats["count_train"] or 0,
                stats["count_val"] or 0,
                stats["count_test"] or 0,
                stats["duration_total_seconds"] or 0,
                stats["source_imported_count"] or 0,
                stats["gold_count"] or 0,
                stats["corrected_count"] or 0,
                stats["negative_count"] or 0,
                stats["excluded_count"] or 0,
            ),
        )


def update_version_totals(conn, version_id: str) -> None:
    totals = conn.execute(
        """
        SELECT
            COUNT(*) AS total_items,
            COUNT(DISTINCT normalized_label) AS total_labels,
            COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds
        FROM training_dataset_items
        WHERE dataset_version_id = ?
          AND item_role != 'excluded'
        """,
        (version_id,),
    ).fetchone()
    conn.execute(
        """
        UPDATE training_dataset_versions
        SET status = 'built',
            total_items = ?,
            total_labels = ?,
            total_duration_seconds = ?
        WHERE id = ?
        """,
        (
            totals["total_items"] or 0,
            totals["total_labels"] or 0,
            totals["total_duration_seconds"] or 0,
            version_id,
        ),
    )


def build_dataset_version(version_id: str) -> dict[str, Any]:
    version = get_dataset_version(version_id)
    if version["status"] == "locked":
        raise HTTPException(status_code=409, detail="No se puede reconstruir una version locked.")
    rules = merged_rules(version.get("rules", {}))
    conn = get_connection()
    try:
        conn.execute("DELETE FROM training_dataset_items WHERE dataset_version_id = ?", (version_id,))
        rows = source_rows(conn)
        lookup = taxonomy_lookup(conn)
        items = [decide_item(row, rules, lookup) for row in rows]
        apply_min_examples_rule(items, rules)
        apply_balance_rules(items, rules)
        assign_splits_for_items(items, rules)
        timestamp = now_iso()
        for item in items:
            conn.execute(
                """
                INSERT INTO training_dataset_items (
                    id, dataset_version_id, curated_segment_id, original_label,
                    normalized_label, taxonomy_label, group_name, label_type,
                    item_role, confidence_source, split, duration_seconds,
                    source_path, audio_path, sha256, include_reason, exclude_reason,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    version_id,
                    item["curated_segment_id"],
                    item["original_label"],
                    item["normalized_label"],
                    item["taxonomy_label"],
                    item["group_name"],
                    item["label_type"],
                    item["item_role"],
                    item["confidence_source"],
                    item["split"],
                    item["duration_seconds"],
                    item["source_path"],
                    item["audio_path"],
                    item["sha256"],
                    item["include_reason"],
                    item["exclude_reason"],
                    timestamp,
                ),
            )
        recompute_label_stats(conn, version_id)
        update_version_totals(conn, version_id)
        conn.commit()
        return get_dataset_version(version_id)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_dataset_items(version_id: str, filters: dict[str, Any] | None = None) -> dict[str, Any]:
    filters = filters or {}
    where = ["dataset_version_id = ?"]
    params: list[Any] = [version_id]
    for column in ["normalized_label", "item_role", "confidence_source", "split"]:
        value = clean_text(filters.get(column))
        if value:
            where.append(f"{column} = ?")
            params.append(value)
    limit = max(1, min(int(filters.get("limit") or 100), 500))
    offset = max(0, int(filters.get("offset") or 0))
    where_sql = " AND ".join(where)
    conn = get_connection()
    try:
        rows = conn.execute(
            f"""
            SELECT *
            FROM training_dataset_items
            WHERE {where_sql}
            ORDER BY normalized_label ASC, split ASC, created_at ASC
            LIMIT ? OFFSET ?
            """,
            [*params, limit, offset],
        ).fetchall()
        total = conn.execute(
            f"SELECT COUNT(*) AS total FROM training_dataset_items WHERE {where_sql}",
            params,
        ).fetchone()["total"]
        return {"items": [dict(row) for row in rows], "total": total, "limit": limit, "offset": offset}
    finally:
        conn.close()


def get_dataset_stats(version_id: str) -> dict[str, Any]:
    version = get_dataset_version(version_id)
    conn = get_connection()
    try:
        label_stats = conn.execute(
            """
            SELECT *
            FROM training_dataset_label_stats
            WHERE dataset_version_id = ?
            ORDER BY count_total DESC, label ASC
            """,
            (version_id,),
        ).fetchall()
        included_label_stats = conn.execute(
            """
            SELECT
                COALESCE(normalized_label, original_label, '') AS label,
                COUNT(*) AS count,
                COALESCE(SUM(duration_seconds), 0) AS duration_total_seconds
            FROM training_dataset_items
            WHERE dataset_version_id = ?
              AND item_role != 'excluded'
            GROUP BY COALESCE(normalized_label, original_label, '')
            ORDER BY count DESC, label ASC
            """,
            (version_id,),
        ).fetchall()
        excluded_label_stats = conn.execute(
            """
            SELECT
                COALESCE(normalized_label, original_label, '') AS label,
                COUNT(*) AS count,
                COALESCE(SUM(duration_seconds), 0) AS duration_total_seconds
            FROM training_dataset_items
            WHERE dataset_version_id = ?
              AND item_role = 'excluded'
            GROUP BY COALESCE(normalized_label, original_label, '')
            ORDER BY count DESC, label ASC
            """,
            (version_id,),
        ).fetchall()
        by_role = conn.execute(
            """
            SELECT item_role AS value, COUNT(*) AS count
            FROM training_dataset_items
            WHERE dataset_version_id = ?
            GROUP BY item_role
            ORDER BY count DESC
            """,
            (version_id,),
        ).fetchall()
        by_split = conn.execute(
            """
            SELECT split AS value, COUNT(*) AS count
            FROM training_dataset_items
            WHERE dataset_version_id = ?
            GROUP BY split
            ORDER BY count DESC
            """,
            (version_id,),
        ).fetchall()
        by_exclude_reason = conn.execute(
            """
            SELECT COALESCE(exclude_reason, '') AS value, COUNT(*) AS count
            FROM training_dataset_items
            WHERE dataset_version_id = ? AND item_role = 'excluded'
            GROUP BY COALESCE(exclude_reason, '')
            ORDER BY count DESC
            """,
            (version_id,),
        ).fetchall()
        by_label_type = conn.execute(
            """
            SELECT COALESCE(label_type, '') AS value, COUNT(*) AS count
            FROM training_dataset_items
            WHERE dataset_version_id = ? AND item_role != 'excluded'
            GROUP BY COALESCE(label_type, '')
            ORDER BY count DESC
            """,
            (version_id,),
        ).fetchall()
        by_group_name = conn.execute(
            """
            SELECT COALESCE(group_name, '') AS value, COUNT(*) AS count
            FROM training_dataset_items
            WHERE dataset_version_id = ? AND item_role != 'excluded'
            GROUP BY COALESCE(group_name, '')
            ORDER BY count DESC
            """,
            (version_id,),
        ).fetchall()
        by_confidence_source = conn.execute(
            """
            SELECT COALESCE(confidence_source, '') AS value, COUNT(*) AS count
            FROM training_dataset_items
            WHERE dataset_version_id = ?
            GROUP BY COALESCE(confidence_source, '')
            ORDER BY count DESC
            """,
            (version_id,),
        ).fetchall()
        duration_by_label = conn.execute(
            """
            SELECT normalized_label AS label,
                   COUNT(*) AS count,
                   COALESCE(SUM(duration_seconds), 0) AS duration_total_seconds
            FROM training_dataset_items
            WHERE dataset_version_id = ? AND item_role != 'excluded'
            GROUP BY normalized_label
            ORDER BY duration_total_seconds DESC
            """,
            (version_id,),
        ).fetchall()
        rules = version.get("rules", {})
        min_examples = int(rules.get("min_examples_per_label") or 10)
        few_examples = [
            dict(row)
            for row in conn.execute(
                """
                SELECT normalized_label AS label, COUNT(*) AS count
                FROM training_dataset_items
                WHERE dataset_version_id = ? AND item_role != 'excluded'
                GROUP BY normalized_label
                HAVING count < ?
                ORDER BY count ASC, label ASC
                """,
                (version_id, min_examples),
            ).fetchall()
        ]
        dominant_labels = [
            dict(row)
            for row in conn.execute(
                """
                SELECT normalized_label AS label, COUNT(*) AS count
                FROM training_dataset_items
                WHERE dataset_version_id = ? AND item_role != 'excluded'
                GROUP BY normalized_label
                ORDER BY count DESC
                LIMIT 10
                """,
                (version_id,),
            ).fetchall()
        ]
        totals = conn.execute(
            """
            SELECT
                COUNT(*) AS total_rows,
                SUM(CASE WHEN item_role != 'excluded' THEN 1 ELSE 0 END) AS included_total,
                SUM(CASE WHEN item_role = 'excluded' THEN 1 ELSE 0 END) AS excluded_total,
                COALESCE(SUM(CASE WHEN item_role != 'excluded' THEN duration_seconds ELSE 0 END), 0) AS included_duration_seconds,
                COALESCE(SUM(CASE WHEN item_role = 'excluded' THEN duration_seconds ELSE 0 END), 0) AS excluded_duration_seconds
            FROM training_dataset_items
            WHERE dataset_version_id = ?
            """,
            (version_id,),
        ).fetchone()
        mixed_taxonomy_labels = [
            dict(row)
            for row in conn.execute(
                """
                SELECT normalized_label AS label, label_type, group_name, COUNT(*) AS count
                FROM training_dataset_items
                WHERE dataset_version_id = ?
                  AND item_role != 'excluded'
                  AND COALESCE(label_type, '') IN ('group', 'code', 'unknown', 'negative')
                GROUP BY normalized_label, label_type, group_name
                ORDER BY count DESC
                """,
                (version_id,),
            ).fetchall()
        ]
        return {
            "version": version,
            "totals": dict(totals) if totals else {},
            "label_stats": [dict(row) for row in label_stats],
            "included_label_stats": [dict(row) for row in included_label_stats],
            "excluded_label_stats": [dict(row) for row in excluded_label_stats],
            "by_normalized_label": [dict(row) for row in label_stats],
            "by_role": [dict(row) for row in by_role],
            "included_by_role": [dict(row) for row in by_role if row["value"] != "excluded"],
            "by_split": [dict(row) for row in by_split],
            "by_exclude_reason": [dict(row) for row in by_exclude_reason],
            "excluded_by_reason": [dict(row) for row in by_exclude_reason],
            "by_label_type": [dict(row) for row in by_label_type],
            "by_group_name": [dict(row) for row in by_group_name],
            "by_confidence_source": [dict(row) for row in by_confidence_source],
            "duration_by_label": [dict(row) for row in duration_by_label],
            "few_examples": few_examples,
            "dominant_labels": dominant_labels,
            "mixed_taxonomy_labels": mixed_taxonomy_labels,
        }
    finally:
        conn.close()


def count_value(rows: list[dict[str, Any]], value: str) -> int:
    for row in rows:
        if row.get("value") == value:
            return int(row.get("count") or 0)
    return 0


def get_dataset_audit(version_id: str) -> dict[str, Any]:
    stats = get_dataset_stats(version_id)
    version = stats["version"]
    rules = version.get("rules", {})
    warnings: list[dict[str, Any]] = []
    included_total = int(version.get("total_items") or 0)
    background_count = count_value(stats["by_role"], "background")
    positive_count = count_value(stats["by_role"], "positive")
    excluded_count = count_value(stats["by_role"], "excluded")

    if included_total and background_count / included_total > 0.4:
        warnings.append(
            {
                "code": "background_dominates",
                "severity": "warning",
                "message": "otros_ruidos/background domina el dataset incluido.",
                "details": {"background_count": background_count, "included_total": included_total},
            }
        )

    if included_total and included_total < 100:
        warnings.append(
            {
                "code": "dataset_too_small",
                "severity": "warning",
                "message": "La version incluida es pequena para entrenamiento practico; usala como auditoria o prueba.",
                "details": {"included_total": included_total},
            }
        )

    if positive_count and background_count / max(positive_count, 1) > 2:
        warnings.append(
            {
                "code": "background_ratio_high",
                "severity": "warning",
                "message": "Hay demasiado background frente a positivos.",
                "details": {"background_count": background_count, "positive_count": positive_count},
            }
        )

    group_items = [row for row in stats["by_label_type"] if row["value"] == "group"]
    if group_items:
        warnings.append(
            {
                "code": "groups_mixed_with_species",
                "severity": "warning",
                "message": "Hay grupos generales mezclados con etiquetas de especies.",
                "details": group_items,
            }
        )

    code_items = [row for row in stats["by_label_type"] if row["value"] == "code"]
    if code_items:
        warnings.append(
            {
                "code": "codes_in_dataset",
                "severity": "warning",
                "message": "Hay codigos dentro del dataset. Revisalos antes de entrenar.",
                "details": code_items,
            }
        )

    if stats["few_examples"]:
        warnings.append(
            {
                "code": "few_examples",
                "severity": "info",
                "message": "Hay clases con pocos ejemplos.",
                "details": stats["few_examples"][:20],
            }
        )

    if stats["dominant_labels"] and included_total:
        top = stats["dominant_labels"][0]
        if int(top["count"]) / included_total > 0.35:
            warnings.append(
                {
                    "code": "dominant_label",
                    "severity": "warning",
                    "message": "Una clase domina demasiado el dataset.",
                    "details": top,
                }
            )

    tax_review_count = count_value(stats["by_exclude_reason"], "taxonomia_requiere_revision")
    if tax_review_count > 0:
        warnings.append(
            {
                "code": "taxonomy_review_exclusions",
                "severity": "info",
                "message": "Muchos segmentos se excluyeron porque la taxonomia requiere revision.",
                "details": {"count": tax_review_count},
            }
        )

    pending_count = count_value(stats["by_exclude_reason"], "pendiente_real")
    if pending_count > 0:
        warnings.append(
            {
                "code": "pending_review_labels",
                "severity": "info",
                "message": "Hay segmentos revisar_etiqueta o pendientes reales excluidos.",
                "details": {"count": pending_count},
            }
        )

    if excluded_count > included_total:
        warnings.append(
            {
                "code": "many_excluded",
                "severity": "info",
                "message": "Hay mas filas excluidas que incluidas; esta version parece de auditoria.",
                "details": {"excluded_count": excluded_count, "included_total": included_total},
            }
        )

    return {
        "version": version,
        "warnings": warnings,
        "summary": {
            "included_total": included_total,
            "excluded_count": excluded_count,
            "background_count": background_count,
            "positive_count": positive_count,
            "min_examples_per_label": rules.get("min_examples_per_label"),
        },
        "stats": stats,
    }


def assign_splits(version_id: str, strategy: dict[str, Any] | None = None) -> dict[str, Any]:
    version = get_dataset_version(version_id)
    rules = merged_rules({**version.get("rules", {}), **(strategy or {})})
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM training_dataset_items WHERE dataset_version_id = ?",
            (version_id,),
        ).fetchall()
        items = [dict(row) for row in rows]
        assign_splits_for_items(items, rules)
        for item in items:
            conn.execute("UPDATE training_dataset_items SET split = ? WHERE id = ?", (item["split"], item["id"]))
        recompute_label_stats(conn, version_id)
        update_version_totals(conn, version_id)
        conn.execute(
            "UPDATE training_dataset_versions SET rules_json = ? WHERE id = ?",
            (json.dumps(rules, ensure_ascii=False), version_id),
        )
        conn.commit()
        return get_dataset_stats(version_id)
    finally:
        conn.close()


def export_dataset_manifest(version_id: str, format: str = "csv", included_only: bool = False) -> Path:
    if format != "csv":
        raise HTTPException(status_code=400, detail="Solo se soporta export csv por ahora.")
    version = get_dataset_version(version_id)
    export_dir = settings.IMPORTS_DIR / "training_datasets"
    export_dir.mkdir(parents=True, exist_ok=True)
    suffix = "_included_only" if included_only else ""
    output_path = export_dir / f"{version['version_name']}_manifest{suffix}.csv"
    where_extra = "AND item_role != 'excluded'" if included_only else ""
    conn = get_connection()
    try:
        rows = [
            dict(row)
            for row in conn.execute(
                f"""
                SELECT *
                FROM training_dataset_items
                WHERE dataset_version_id = ?
                  {where_extra}
                ORDER BY normalized_label ASC, split ASC, created_at ASC
                """,
                (version_id,),
            ).fetchall()
        ]
    finally:
        conn.close()
    headers = [
        "dataset_version_id",
        "curated_segment_id",
        "original_label",
        "normalized_label",
        "taxonomy_label",
        "group_name",
        "label_type",
        "item_role",
        "confidence_source",
        "split",
        "duration_seconds",
        "source_path",
        "audio_path",
        "sha256",
        "include_reason",
        "exclude_reason",
    ]
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key) for key in headers})
    return output_path


def set_dataset_status(version_id: str, status: str) -> dict[str, Any]:
    if status not in VALID_VERSION_STATUSES:
        raise HTTPException(status_code=400, detail=f"status invalido: {status}")
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE training_dataset_versions SET status = ? WHERE id = ?",
            (status, version_id),
        )
        conn.commit()
    finally:
        conn.close()
    return get_dataset_version(version_id)


def lock_dataset_version(version_id: str) -> dict[str, Any]:
    return set_dataset_status(version_id, "locked")


def archive_dataset_version(version_id: str) -> dict[str, Any]:
    return set_dataset_status(version_id, "archived")
