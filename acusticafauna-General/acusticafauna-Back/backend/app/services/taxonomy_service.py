from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.db.database import get_connection


ALIAS_PATH = Path(__file__).resolve().parents[1] / "data" / "initial_taxonomy_aliases.json"
AMPHIBIAN_GENERA = {
    "Allobates",
    "Andinobates",
    "Boana",
    "Dendropsophus",
    "Eleutherodactylus",
    "Engystomops",
    "Hyloxalus",
    "Leptodactylus",
    "Pristimantis",
    "Rhinella",
    "Scinax",
    "Smilisca",
    "Trachycephalus",
}
VALID_TYPES = {"species", "group", "noise", "human_activity", "unknown", "code", "negative"}


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def clean_bool(value: Any, default: bool = False) -> int:
    if value is None:
        return int(default)
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(bool(value))
    return int(str(value).strip().lower() in {"1", "true", "si", "yes", "y"})


def row_to_dict(row) -> dict[str, Any] | None:
    return dict(row) if row else None


def load_aliases() -> dict[str, Any]:
    if not ALIAS_PATH.exists():
        return {}
    with ALIAS_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def alias_entry_for(label: str | None) -> dict[str, Any] | None:
    label = clean_text(label)
    if not label:
        return None
    aliases = load_aliases()
    return aliases.get(label)


def canonical_label_for(label: str | None) -> str | None:
    label = clean_text(label)
    if not label:
        return None
    alias_data = alias_entry_for(label)
    if not alias_data:
        return label
    return (
        clean_text(alias_data.get("canonical_label"))
        or clean_text(alias_data.get("target_label"))
        or label
    )


def normalize_aliases(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):
        return json.dumps([str(item).strip() for item in value if str(item).strip()], ensure_ascii=False)
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return json.dumps(parsed, ensure_ascii=False)
    except json.JSONDecodeError:
        pass
    return json.dumps([item.strip() for item in text.split(",") if item.strip()], ensure_ascii=False)


def infer_from_label(label: str) -> dict[str, Any]:
    aliases = load_aliases()
    if label in aliases:
        alias_data = aliases[label]
        canonical_label = canonical_label_for(label)
        canonical_label_type = alias_data.get("label_type", "code")
        raw_label_type = "noise" if canonical_label_type == "noise" else "code"
        return {
            "label": label,
            "display_name": alias_data.get("display_name") or label,
            "scientific_name": alias_data.get("scientific_name"),
            "common_name": None,
            "group_name": alias_data.get("group_name"),
            "family": None,
            "genus": alias_data.get("genus"),
            "species": alias_data.get("species"),
            "label_type": raw_label_type,
            "parent_label": canonical_label,
            "aliases": normalize_aliases([label, canonical_label, alias_data.get("scientific_name")]),
            "code": label,
            "use_for_training": 0 if raw_label_type == "code" else clean_bool(alias_data.get("trainable"), True),
            "needs_review": clean_bool(alias_data.get("needs_review"), False),
            "notes": alias_data.get("notes"),
        }

    if label == "rana_sapo":
        return base_taxonomy(label, "Rana/sapo", "group", "anfibio", use_for_training=True)
    if label == "ave_general":
        return base_taxonomy(label, "Ave general", "group", "ave", use_for_training=True)
    if label == "otros_ruidos":
        return base_taxonomy(label, "Otros ruidos", "noise", "ruido", use_for_training=True)
    if label == "revisar_etiqueta":
        return base_taxonomy(label, "Requiere identificacion", "unknown", "desconocido", use_for_training=False, needs_review=True)
    if label in {"voz_humana", "ruido_humano"}:
        return base_taxonomy(label, label.replace("_", " "), "human_activity", "humano", use_for_training=True)
    if re.fullmatch(r"[A-Z]{3,8}", label):
        return base_taxonomy(label, label, "code", "desconocido", use_for_training=False, needs_review=True, code=label)

    parts = label.split("_")
    if len(parts) >= 2 and parts[0][:1].isupper() and parts[1].islower():
        genus = parts[0]
        species = parts[1]
        scientific_name = f"{genus} {species}"
        return {
            **base_taxonomy(
                label,
                scientific_name,
                "species",
                "anfibio" if genus in AMPHIBIAN_GENERA else "desconocido",
                use_for_training=True,
                needs_review=genus not in AMPHIBIAN_GENERA,
            ),
            "scientific_name": scientific_name,
            "genus": genus,
            "species": species,
        }

    return base_taxonomy(label, label.replace("_", " "), "group", "desconocido", use_for_training=True, needs_review=True)


def base_taxonomy(
    label: str,
    display_name: str,
    label_type: str,
    group_name: str,
    use_for_training: bool = True,
    needs_review: bool = False,
    code: str | None = None,
) -> dict[str, Any]:
    return {
        "label": label,
        "display_name": display_name,
        "scientific_name": None,
        "common_name": None,
        "group_name": group_name,
        "family": None,
        "genus": None,
        "species": None,
        "label_type": label_type,
        "parent_label": None,
        "aliases": normalize_aliases([label]) if code else None,
        "code": code,
        "use_for_training": int(use_for_training),
        "needs_review": int(needs_review),
        "notes": "Sugerida automaticamente desde dataset_curado.",
    }


def payload_to_db(data: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
    merged = dict(existing or {})
    for key, value in data.items():
        if key in {"use_for_training", "needs_review", "is_active"}:
            merged[key] = clean_bool(value, bool(merged.get(key, 0)))
        elif key == "aliases":
            merged[key] = normalize_aliases(value)
        else:
            merged[key] = clean_text(value)

    label = clean_text(merged.get("label"))
    if not label:
        raise HTTPException(status_code=400, detail="label es requerido.")

    label_type = clean_text(merged.get("label_type")) or "group"
    if label_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"label_type debe ser uno de: {sorted(VALID_TYPES)}")
    merged["label_type"] = label_type
    merged["display_name"] = clean_text(merged.get("display_name")) or label.replace("_", " ")
    merged["is_active"] = clean_bool(merged.get("is_active"), True)
    merged["use_for_training"] = clean_bool(merged.get("use_for_training"), True)
    merged["needs_review"] = clean_bool(merged.get("needs_review"), False)
    return merged


def list_taxonomy(filters: dict[str, Any]) -> dict[str, Any]:
    where: list[str] = []
    params: list[Any] = []
    for column in ["label", "group_name", "label_type"]:
        value = clean_text(filters.get(column))
        if value:
            where.append(f"t.{column} = ?")
            params.append(value)

    for column in ["is_active", "use_for_training", "needs_review"]:
        if filters.get(column) is not None:
            where.append(f"t.{column} = ?")
            params.append(clean_bool(filters.get(column)))

    search = clean_text(filters.get("search"))
    if search:
        where.append("(t.label LIKE ? OR t.display_name LIKE ? OR t.scientific_name LIKE ? OR t.common_name LIKE ? OR t.aliases LIKE ?)")
        like = f"%{search}%"
        params.extend([like, like, like, like, like])

    few_examples = clean_bool(filters.get("few_examples")) if filters.get("few_examples") is not None else None
    having = "HAVING segment_count < 5" if few_examples else ""
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    limit = max(1, min(int(filters.get("limit") or 100), 500))
    offset = max(0, int(filters.get("offset") or 0))

    sql = f"""
        SELECT t.*, COUNT(s.id) AS segment_count
        FROM label_taxonomy t
        LEFT JOIN curated_audio_segments s ON s.label = t.label
        {where_sql}
        GROUP BY t.id
        {having}
        ORDER BY t.needs_review DESC, t.group_name ASC, t.label ASC
        LIMIT ? OFFSET ?
    """
    count_sql = f"""
        SELECT COUNT(*) AS total
        FROM (
            SELECT t.id, COUNT(s.id) AS segment_count
            FROM label_taxonomy t
            LEFT JOIN curated_audio_segments s ON s.label = t.label
            {where_sql}
            GROUP BY t.id
            {having}
        ) q
    """
    conn = get_connection()
    try:
        rows = conn.execute(sql, [*params, limit, offset]).fetchall()
        total = conn.execute(count_sql, params).fetchone()["total"]
        return {"items": [dict(row) for row in rows], "total": total, "limit": limit, "offset": offset}
    finally:
        conn.close()


def get_taxonomy_item(item_id: str) -> dict[str, Any]:
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM label_taxonomy WHERE id = ?", (item_id,)).fetchone()
        item = row_to_dict(row)
        if not item:
            raise HTTPException(status_code=404, detail="Taxonomia no encontrada.")
        return item
    finally:
        conn.close()


def create_taxonomy_item(data: dict[str, Any]) -> dict[str, Any]:
    item = payload_to_db(data)
    item_id = str(uuid.uuid4())
    timestamp = now_iso()
    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO label_taxonomy (
                id, label, display_name, scientific_name, common_name, group_name,
                family, genus, species, label_type, parent_label, aliases, code,
                is_active, use_for_training, needs_review, notes, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item_id, item["label"], item["display_name"], item.get("scientific_name"),
                item.get("common_name"), item.get("group_name"), item.get("family"),
                item.get("genus"), item.get("species"), item.get("label_type"),
                item.get("parent_label"), item.get("aliases"), item.get("code"),
                item.get("is_active", 1), item.get("use_for_training", 1),
                item.get("needs_review", 0), item.get("notes"), timestamp, timestamp,
            ),
        )
        conn.commit()
        return get_taxonomy_item(item_id)
    except Exception as exc:
        conn.rollback()
        if "UNIQUE" in str(exc).upper():
            raise HTTPException(status_code=409, detail="Ya existe una taxonomia para ese label.")
        raise
    finally:
        conn.close()


def update_taxonomy_item(item_id: str, data: dict[str, Any]) -> dict[str, Any]:
    current = get_taxonomy_item(item_id)
    item = payload_to_db(data, current)
    conn = get_connection()
    try:
        conn.execute(
            """
            UPDATE label_taxonomy
            SET label = ?, display_name = ?, scientific_name = ?, common_name = ?,
                group_name = ?, family = ?, genus = ?, species = ?, label_type = ?,
                parent_label = ?, aliases = ?, code = ?, is_active = ?,
                use_for_training = ?, needs_review = ?, notes = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                item["label"], item["display_name"], item.get("scientific_name"),
                item.get("common_name"), item.get("group_name"), item.get("family"),
                item.get("genus"), item.get("species"), item.get("label_type"),
                item.get("parent_label"), item.get("aliases"), item.get("code"),
                item.get("is_active", 1), item.get("use_for_training", 1),
                item.get("needs_review", 0), item.get("notes"), now_iso(), item_id,
            ),
        )
        conn.commit()
        return get_taxonomy_item(item_id)
    finally:
        conn.close()


def deactivate_taxonomy_item(item_id: str) -> dict[str, Any]:
    return update_taxonomy_item(item_id, {"is_active": 0})


def merge_labels(source_label: str, target_label: str) -> dict[str, Any]:
    source = clean_text(source_label)
    target = clean_text(target_label)
    if not source or not target:
        raise HTTPException(status_code=400, detail="source_label y target_label son requeridos.")
    conn = get_connection()
    try:
        source_row = conn.execute("SELECT * FROM label_taxonomy WHERE label = ?", (source,)).fetchone()
        if not source_row:
            raise HTTPException(status_code=404, detail="Etiqueta origen no encontrada.")
        target_row = conn.execute("SELECT * FROM label_taxonomy WHERE label = ?", (target,)).fetchone()
        if not target_row:
            target_data = infer_from_label(target)
            target_data["label"] = target
            create_taxonomy_item(target_data)
        aliases = []
        if source_row["aliases"]:
            try:
                aliases.extend(json.loads(source_row["aliases"]))
            except json.JSONDecodeError:
                aliases.append(source_row["aliases"])
        aliases.append(source)
        conn.execute(
            """
            UPDATE label_taxonomy
            SET parent_label = ?, is_active = 0, use_for_training = 0,
                needs_review = 1, aliases = ?, updated_at = ?
            WHERE label = ?
            """,
            (target, normalize_aliases(aliases), now_iso(), source),
        )
        conn.commit()
        return {"source_label": source, "target_label": target, "status": "mapped"}
    finally:
        conn.close()


def suggest_taxonomy_from_curated_labels() -> dict[str, Any]:
    conn = get_connection()
    created = 0
    existing = 0
    labels: list[str] = []
    try:
        rows = conn.execute(
            """
            SELECT DISTINCT value AS label
            FROM (
                SELECT label AS value
                FROM curated_audio_segments
                WHERE label IS NOT NULL AND TRIM(label) != ''
                UNION
                SELECT negative_for AS value
                FROM curated_audio_segments
                WHERE negative_for IS NOT NULL AND TRIM(negative_for) != ''
            ) labels
            ORDER BY label ASC
            """
        ).fetchall()
        for row in rows:
            label = row["label"]
            labels.append(label)
            found = conn.execute("SELECT * FROM label_taxonomy WHERE label = ?", (label,)).fetchone()
            item = payload_to_db(infer_from_label(label))
            canonical_label = clean_text(item.get("parent_label"))
            if canonical_label and canonical_label != label:
                canonical_found = conn.execute(
                    "SELECT id, aliases FROM label_taxonomy WHERE label = ?",
                    (canonical_label,),
                ).fetchone()
                canonical_data = payload_to_db(infer_from_label(canonical_label))
                alias_values = [label, canonical_label, canonical_data.get("scientific_name")]
                if canonical_found:
                    existing_aliases: list[str] = []
                    if canonical_found["aliases"]:
                        try:
                            existing_aliases = json.loads(canonical_found["aliases"])
                        except json.JSONDecodeError:
                            existing_aliases = [canonical_found["aliases"]]
                    merged_aliases = list(dict.fromkeys([*existing_aliases, *[v for v in alias_values if v]]))
                    conn.execute(
                        "UPDATE label_taxonomy SET aliases = ?, updated_at = ? WHERE id = ?",
                        (normalize_aliases(merged_aliases), now_iso(), canonical_found["id"]),
                    )
                else:
                    timestamp = now_iso()
                    conn.execute(
                        """
                        INSERT INTO label_taxonomy (
                            id, label, display_name, scientific_name, common_name, group_name,
                            family, genus, species, label_type, parent_label, aliases, code,
                            is_active, use_for_training, needs_review, notes, created_at, updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            str(uuid.uuid4()), canonical_data["label"], canonical_data["display_name"],
                            canonical_data.get("scientific_name"), canonical_data.get("common_name"),
                            canonical_data.get("group_name"), canonical_data.get("family"),
                            canonical_data.get("genus"), canonical_data.get("species"),
                            canonical_data.get("label_type"), canonical_data.get("parent_label"),
                            normalize_aliases(alias_values), canonical_data.get("code"),
                            canonical_data.get("is_active", 1), canonical_data.get("use_for_training", 1),
                            canonical_data.get("needs_review", 0), canonical_data.get("notes"),
                            timestamp, timestamp,
                        ),
                    )
                    created += 1
            if found:
                updates: dict[str, Any] = {}
                for field in [
                    "display_name",
                    "scientific_name",
                    "common_name",
                    "group_name",
                    "family",
                    "genus",
                    "species",
                    "parent_label",
                    "aliases",
                    "code",
                    "notes",
                ]:
                    if not found[field] and item.get(field):
                        updates[field] = item.get(field)
                if found["label_type"] not in VALID_TYPES:
                    updates["label_type"] = item.get("label_type")
                if found["use_for_training"] is None or item.get("use_for_training") == 0:
                    updates["use_for_training"] = item.get("use_for_training", 1)
                if found["needs_review"] is None or item.get("needs_review"):
                    updates["needs_review"] = item.get("needs_review", found["needs_review"] or 0)
                if updates:
                    assignments = ", ".join(f"{field} = ?" for field in updates)
                    conn.execute(
                        f"UPDATE label_taxonomy SET {assignments}, updated_at = ? WHERE id = ?",
                        [*updates.values(), now_iso(), found["id"]],
                    )
                existing += 1
                continue
            timestamp = now_iso()
            conn.execute(
                """
                INSERT INTO label_taxonomy (
                    id, label, display_name, scientific_name, common_name, group_name,
                    family, genus, species, label_type, parent_label, aliases, code,
                    is_active, use_for_training, needs_review, notes, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()), item["label"], item["display_name"], item.get("scientific_name"),
                    item.get("common_name"), item.get("group_name"), item.get("family"),
                    item.get("genus"), item.get("species"), item.get("label_type"),
                    item.get("parent_label"), item.get("aliases"), item.get("code"),
                    item.get("is_active", 1), item.get("use_for_training", 1),
                    item.get("needs_review", 0), item.get("notes"), timestamp, timestamp,
                ),
            )
            created += 1
        conn.commit()
        return {"created": created, "existing": existing, "labels_seen": len(labels)}
    finally:
        conn.close()


def count_by(conn, column: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        f"""
        SELECT COALESCE({column}, '') AS value, COUNT(*) AS count
        FROM label_taxonomy
        GROUP BY COALESCE({column}, '')
        ORDER BY count DESC, value ASC
        """
    ).fetchall()
    return [dict(row) for row in rows]


def get_label_counts() -> dict[str, Any]:
    conn = get_connection()
    try:
        total = conn.execute("SELECT COUNT(*) AS total FROM label_taxonomy").fetchone()["total"]
        species = conn.execute("SELECT COUNT(*) AS count FROM label_taxonomy WHERE label_type = 'species'").fetchone()["count"]
        trainable = conn.execute("SELECT COUNT(*) AS count FROM label_taxonomy WHERE use_for_training = 1 AND is_active = 1").fetchone()["count"]
        incomplete = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM label_taxonomy
            WHERE needs_review = 1
               OR group_name IS NULL
               OR label_type IS NULL
               OR display_name IS NULL
            """
        ).fetchone()["count"]
        few_examples = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM (
                SELECT t.id, COUNT(s.id) AS segment_count
                FROM label_taxonomy t
                LEFT JOIN curated_audio_segments s ON s.label = t.label
                GROUP BY t.id
                HAVING segment_count < 5
            ) q
            """
        ).fetchone()["count"]
        with_alias = conn.execute(
            "SELECT COUNT(*) AS count FROM label_taxonomy WHERE aliases IS NOT NULL OR code IS NOT NULL"
        ).fetchone()["count"]
        segment_counts = conn.execute(
            """
            SELECT s.label, COUNT(*) AS count
            FROM curated_audio_segments s
            GROUP BY s.label
            ORDER BY count DESC, s.label ASC
            """
        ).fetchall()
        return {
            "total_labels": total,
            "species_count": species,
            "trainable_count": trainable,
            "incomplete_count": incomplete,
            "few_examples_count": few_examples,
            "with_alias_or_code_count": with_alias,
            "by_type": count_by(conn, "label_type"),
            "by_group": count_by(conn, "group_name"),
            "segment_counts": [dict(row) for row in segment_counts],
        }
    finally:
        conn.close()


def get_examples_for_label(label: str, limit: int = 25) -> dict[str, Any]:
    label = clean_text(label)
    if not label:
        raise HTTPException(status_code=400, detail="label requerido.")
    limit = max(1, min(int(limit or 25), 100))
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT s.*,
                   r.review_status AS latest_review_status,
                   r.reviewed_label
            FROM curated_audio_segments s
            LEFT JOIN human_reviews r
                ON r.id = (
                    SELECT hr.id
                    FROM human_reviews hr
                    WHERE hr.curated_segment_id = s.id
                    ORDER BY hr.updated_at DESC
                    LIMIT 1
                )
            WHERE s.label = ? OR s.negative_for = ?
            ORDER BY
                CASE WHEN r.review_status IN ('accepted', 'corrected') THEN 0 ELSE 1 END,
                s.imported_at DESC
            LIMIT ?
            """,
            (label, label, limit),
        ).fetchall()
        return {"label": label, "items": [dict(row) for row in rows], "limit": limit}
    finally:
        conn.close()
