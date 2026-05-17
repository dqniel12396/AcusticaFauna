from __future__ import annotations

import csv
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.db.database import get_connection


REQUIRED_MANIFEST_COLUMNS = {
    "segment_id",
    "source_path",
    "source_sha256",
    "output_path",
    "split",
    "label",
    "group_type",
    "negative_for",
    "source_filename",
    "start_seconds",
    "end_seconds",
    "duration_seconds",
    "rms_max_dbfs",
    "rms_mean_dbfs",
    "threshold_dbfs",
    "sample_rate",
    "channels",
    "status",
    "error",
}

VALID_REVIEW_STATUSES = {"accepted", "corrected", "rejected", "uncertain"}


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def clean_text(value: Any) -> str | None:
    if value is None:
        return None

    text = str(value).strip()
    return text if text else None


def safe_float(value: Any) -> float | None:
    text = clean_text(value)
    if text is None:
        return None

    try:
        return float(text)
    except ValueError:
        return None


def safe_int(value: Any) -> int | None:
    text = clean_text(value)
    if text is None:
        return None

    try:
        return int(float(text))
    except ValueError:
        return None


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


def read_manifest_segments(manifest_path: Path) -> list[dict[str, Any]]:
    if not manifest_path.exists() or not manifest_path.is_file():
        raise HTTPException(status_code=400, detail="No existe manifest_segmentos.csv.")

    with manifest_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = set(reader.fieldnames or [])
        missing = sorted(REQUIRED_MANIFEST_COLUMNS - fieldnames)

        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"El manifest no tiene columnas requeridas: {missing}",
            )

        return list(reader)


def infer_label_type(group_type: str | None, label: str | None) -> str:
    if group_type == "revisar":
        return "review_pending"

    if group_type == "negativo_objetivo":
        return "negative_set"

    if group_type == "otros_ruidos" or label == "otros_ruidos":
        return "noise"

    return "species_or_class"


def upsert_label_taxonomy(
    label: str | None,
    group_type: str | None = None,
    negative_for: str | None = None,
    conn: sqlite3.Connection | None = None,
) -> str | None:
    normalized_label = clean_text(label)
    if normalized_label is None:
        return None

    owns_connection = conn is None
    conn = conn or get_connection()

    try:
        existing = conn.execute(
            "SELECT id FROM label_taxonomy WHERE label = ?",
            (normalized_label,),
        ).fetchone()

        if existing:
            return str(existing["id"])

        label_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO label_taxonomy (
                id, label, display_name, label_type, parent_label,
                is_active, notes, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                label_id,
                normalized_label,
                normalized_label.replace("_", " "),
                infer_label_type(group_type, normalized_label),
                clean_text(negative_for),
                1,
                "Detectada desde dataset_curado.",
                now_iso(),
            ),
        )

        if owns_connection:
            conn.commit()

        return label_id
    finally:
        if owns_connection:
            conn.close()


def curated_segment_exists(conn: sqlite3.Connection, segment_id: str, output_path: str) -> bool:
    row = conn.execute(
        """
        SELECT id
        FROM curated_audio_segments
        WHERE segment_id = ? OR output_path = ?
        LIMIT 1
        """,
        (segment_id, output_path),
    ).fetchone()

    return row is not None


def import_segment_row(
    row: dict[str, Any],
    conn: sqlite3.Connection | None = None,
) -> tuple[str | None, bool]:
    owns_connection = conn is None
    conn = conn or get_connection()

    try:
        segment_id = clean_text(row.get("segment_id"))
        output_path = clean_text(row.get("output_path"))

        if not segment_id:
            raise ValueError("Fila sin segment_id.")
        if not output_path:
            raise ValueError("Fila sin output_path.")

        if curated_segment_exists(conn, segment_id, output_path):
            return None, True

        label = clean_text(row.get("label"))
        group_type = clean_text(row.get("group_type"))
        negative_for = clean_text(row.get("negative_for"))

        upsert_label_taxonomy(label, group_type, negative_for, conn=conn)
        if negative_for:
            upsert_label_taxonomy(
                negative_for,
                "positivo",
                None,
                conn=conn,
            )

        curated_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO curated_audio_segments (
                id,
                segment_id,
                source_path,
                source_sha256,
                output_path,
                split,
                label,
                group_type,
                negative_for,
                source_filename,
                start_seconds,
                end_seconds,
                duration_seconds,
                rms_max_dbfs,
                rms_mean_dbfs,
                threshold_dbfs,
                sample_rate,
                channels,
                status,
                error,
                imported_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                curated_id,
                segment_id,
                clean_text(row.get("source_path")),
                clean_text(row.get("source_sha256")),
                output_path,
                clean_text(row.get("split")),
                label,
                group_type,
                negative_for,
                clean_text(row.get("source_filename")),
                safe_float(row.get("start_seconds")),
                safe_float(row.get("end_seconds")),
                safe_float(row.get("duration_seconds")),
                safe_float(row.get("rms_max_dbfs")),
                safe_float(row.get("rms_mean_dbfs")),
                safe_float(row.get("threshold_dbfs")),
                safe_int(row.get("sample_rate")),
                safe_int(row.get("channels")),
                clean_text(row.get("status")),
                clean_text(row.get("error")),
                now_iso(),
            ),
        )

        if owns_connection:
            conn.commit()

        return curated_id, False
    finally:
        if owns_connection:
            conn.close()


def import_curated_manifest(dataset_root: Path) -> dict[str, Any]:
    dataset_root = Path(dataset_root).expanduser().resolve()
    manifest_path = dataset_root / "manifests" / "manifest_segmentos.csv"
    rows = read_manifest_segments(manifest_path)

    conn = get_connection()
    session_id = str(uuid.uuid4())
    started_at = now_iso()

    conn.execute(
        """
        INSERT INTO curated_import_sessions (
            id, dataset_root, manifest_path, started_at, status, total_rows
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (session_id, str(dataset_root), str(manifest_path), started_at, "running", len(rows)),
    )
    conn.commit()

    imported_count = 0
    skipped_duplicates = 0
    error_count = 0
    errors: list[str] = []

    try:
        for index, row in enumerate(rows, start=1):
            try:
                _, skipped = import_segment_row(row, conn=conn)
                if skipped:
                    skipped_duplicates += 1
                else:
                    imported_count += 1
            except Exception as exc:
                error_count += 1
                if len(errors) < 5:
                    errors.append(f"Fila {index}: {exc}")

        status = "completed" if error_count == 0 else "completed_with_errors"
        notes = "; ".join(errors) if errors else None
        conn.execute(
            """
            UPDATE curated_import_sessions
            SET finished_at = ?,
                status = ?,
                imported_count = ?,
                skipped_duplicates = ?,
                error_count = ?,
                notes = ?
            WHERE id = ?
            """,
            (
                now_iso(),
                status,
                imported_count,
                skipped_duplicates,
                error_count,
                notes,
                session_id,
            ),
        )
        conn.commit()

        return {
            "session_id": session_id,
            "dataset_root": str(dataset_root),
            "manifest_path": str(manifest_path),
            "status": status,
            "total_rows": len(rows),
            "imported_count": imported_count,
            "skipped_duplicates": skipped_duplicates,
            "error_count": error_count,
            "notes": notes,
        }
    except Exception:
        conn.execute(
            """
            UPDATE curated_import_sessions
            SET finished_at = ?, status = ?, notes = ?
            WHERE id = ?
            """,
            (now_iso(), "failed", "Importacion interrumpida.", session_id),
        )
        conn.commit()
        raise
    finally:
        conn.close()


def build_segments_query(filters: dict[str, Any]) -> tuple[str, list[Any]]:
    where: list[str] = []
    params: list[Any] = []

    for column in ["label", "group_type", "negative_for", "status"]:
        value = clean_text(filters.get(column))
        if value:
            where.append(f"s.{column} = ?")
            params.append(value)

    min_duration = safe_float(filters.get("min_duration"))
    if min_duration is not None:
        where.append("s.duration_seconds >= ?")
        params.append(min_duration)

    max_duration = safe_float(filters.get("max_duration"))
    if max_duration is not None:
        where.append("s.duration_seconds <= ?")
        params.append(max_duration)

    review_status = clean_text(filters.get("review_status"))
    if review_status:
        where.append("r.review_status = ?")
        params.append(review_status)

    if filters.get("pending_real"):
        where.append(
            "((r.review_status = 'uncertain') OR (r.review_status IS NULL AND (s.group_type = 'revisar' OR s.label = 'revisar_etiqueta')))"
        )

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    sql = f"""
        SELECT
            s.*,
            r.review_status,
            r.review_status AS latest_review_status,
            r.reviewed_label,
            r.reviewer,
            r.notes AS review_notes,
            r.updated_at AS review_updated_at,
            t.display_name AS taxonomy_display_name,
            t.scientific_name AS taxonomy_scientific_name,
            t.group_name AS taxonomy_group,
            t.label_type AS taxonomy_label_type,
            t.use_for_training AS taxonomy_use_for_training,
            t.needs_review AS taxonomy_needs_review,
            CASE
                WHEN s.group_type = 'revisar' OR s.label = 'revisar_etiqueta' THEN 'needs_audit'
                ELSE 'imported'
            END AS source_label_status,
            CASE
                WHEN r.review_status IN ('accepted', 'corrected') THEN 'gold'
                WHEN r.review_status = 'rejected' THEN 'excluded'
                WHEN r.review_status = 'uncertain' THEN 'needs_review'
                WHEN s.group_type = 'revisar' OR s.label = 'revisar_etiqueta' THEN 'needs_review'
                WHEN s.group_type = 'negativo_objetivo' THEN 'candidate_negative'
                ELSE 'candidate'
            END AS training_status,
            CASE
                WHEN r.review_status = 'uncertain' THEN 1
                WHEN r.review_status IN ('accepted', 'corrected', 'rejected') THEN 0
                WHEN s.group_type = 'revisar' OR s.label = 'revisar_etiqueta' THEN 1
                ELSE 0
            END AS is_real_pending
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
        {where_sql}
        ORDER BY s.imported_at DESC, s.label ASC
    """

    return sql, params


def list_curated_segments(filters: dict[str, Any]) -> dict[str, Any]:
    limit = safe_int(filters.get("limit")) or 100
    offset = safe_int(filters.get("offset")) or 0
    limit = max(1, min(limit, 500))
    offset = max(0, offset)

    base_sql, params = build_segments_query(filters)
    data_sql = f"{base_sql} LIMIT ? OFFSET ?"
    data_params = [*params, limit, offset]

    count_sql = f"SELECT COUNT(*) AS total FROM ({base_sql}) q"

    conn = get_connection()
    try:
        rows = conn.execute(data_sql, data_params).fetchall()
        total = conn.execute(count_sql, params).fetchone()["total"]
        return {
            "items": [dict(row) for row in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    finally:
        conn.close()


def get_curated_segment_detail(segment_id: str) -> dict[str, Any]:
    conn = get_connection()
    try:
        segment = row_to_dict(
            conn.execute(
                """
                SELECT
                    s.*,
                    r.review_status,
                    r.review_status AS latest_review_status,
                    r.reviewed_label,
                    r.reviewer,
                    r.notes AS review_notes,
                    r.updated_at AS review_updated_at,
                    t.display_name AS taxonomy_display_name,
                    t.scientific_name AS taxonomy_scientific_name,
                    t.group_name AS taxonomy_group,
                    t.label_type AS taxonomy_label_type,
                    t.use_for_training AS taxonomy_use_for_training,
                    t.needs_review AS taxonomy_needs_review,
                    CASE
                        WHEN s.group_type = 'revisar' OR s.label = 'revisar_etiqueta' THEN 'needs_audit'
                        ELSE 'imported'
                    END AS source_label_status,
                    CASE
                        WHEN r.review_status IN ('accepted', 'corrected') THEN 'gold'
                        WHEN r.review_status = 'rejected' THEN 'excluded'
                        WHEN r.review_status = 'uncertain' THEN 'needs_review'
                        WHEN s.group_type = 'revisar' OR s.label = 'revisar_etiqueta' THEN 'needs_review'
                        WHEN s.group_type = 'negativo_objetivo' THEN 'candidate_negative'
                        ELSE 'candidate'
                    END AS training_status,
                    CASE
                        WHEN r.review_status = 'uncertain' THEN 1
                        WHEN r.review_status IN ('accepted', 'corrected', 'rejected') THEN 0
                        WHEN s.group_type = 'revisar' OR s.label = 'revisar_etiqueta' THEN 1
                        ELSE 0
                    END AS is_real_pending
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
                WHERE s.id = ?
                """,
                (segment_id,),
            ).fetchone()
        )

        if not segment:
            raise HTTPException(status_code=404, detail="Segmento curado no encontrado.")

        reviews = conn.execute(
            """
            SELECT *
            FROM human_reviews
            WHERE curated_segment_id = ?
            ORDER BY updated_at DESC
            """,
            (segment_id,),
        ).fetchall()

        return {
            "segment": segment,
            "reviews": [dict(row) for row in reviews],
        }
    finally:
        conn.close()


def count_by(conn: sqlite3.Connection, column: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        f"""
        SELECT COALESCE({column}, '') AS value, COUNT(*) AS count
        FROM curated_audio_segments
        GROUP BY COALESCE({column}, '')
        ORDER BY count DESC, value ASC
        """
    ).fetchall()

    return [dict(row) for row in rows]


def get_curated_dataset_stats() -> dict[str, Any]:
    conn = get_connection()
    try:
        total_row = conn.execute(
            """
            SELECT
                COUNT(s.id) AS total_segments,
                COALESCE(SUM(s.duration_seconds), 0) AS total_duration_seconds,
                SUM(
                    CASE
                        WHEN r.review_status = 'uncertain' THEN 1
                        WHEN r.review_status IS NULL
                            AND (s.group_type = 'revisar' OR s.label = 'revisar_etiqueta') THEN 1
                        ELSE 0
                    END
                ) AS review_queue_count
            FROM curated_audio_segments s
            LEFT JOIN human_reviews r
                ON r.id = (
                    SELECT hr.id
                    FROM human_reviews hr
                    WHERE hr.curated_segment_id = s.id
                    ORDER BY hr.updated_at DESC
                    LIMIT 1
                )
            """
        ).fetchone()

        sample_rates = conn.execute(
            """
            SELECT sample_rate, COUNT(*) AS count
            FROM curated_audio_segments
            WHERE sample_rate IS NOT NULL
            GROUP BY sample_rate
            ORDER BY count DESC, sample_rate ASC
            """
        ).fetchall()

        review_statuses = conn.execute(
            """
            SELECT review_status, COUNT(*) AS count
            FROM human_reviews
            GROUP BY review_status
            ORDER BY count DESC
            """
        ).fetchall()

        return {
            "total_segments": total_row["total_segments"],
            "total_duration_seconds": total_row["total_duration_seconds"],
            "review_queue_count": total_row["review_queue_count"] or 0,
            "by_group_type": count_by(conn, "group_type"),
            "by_label": count_by(conn, "label"),
            "by_negative_for": count_by(conn, "negative_for"),
            "sample_rates": [dict(row) for row in sample_rates],
            "review_statuses": [dict(row) for row in review_statuses],
        }
    finally:
        conn.close()


def list_labels() -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT *
            FROM label_taxonomy
            WHERE is_active = 1
            ORDER BY label ASC
            """
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def mark_segment_review(
    segment_id: str,
    reviewed_label: str | None,
    review_status: str,
    reviewer: str | None,
    notes: str | None,
) -> dict[str, Any]:
    if review_status not in VALID_REVIEW_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"review_status debe ser uno de: {sorted(VALID_REVIEW_STATUSES)}",
        )

    conn = get_connection()
    try:
        segment = conn.execute(
            "SELECT id, label FROM curated_audio_segments WHERE id = ?",
            (segment_id,),
        ).fetchone()

        if not segment:
            raise HTTPException(status_code=404, detail="Segmento curado no encontrado.")

        final_label = clean_text(reviewed_label) or segment["label"]
        clean_reviewer = clean_text(reviewer)
        clean_notes = clean_text(notes)
        upsert_label_taxonomy(final_label, conn=conn)

        latest_review = conn.execute(
            """
            SELECT *
            FROM human_reviews
            WHERE curated_segment_id = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (segment_id,),
        ).fetchone()

        if (
            latest_review
            and latest_review["review_status"] == review_status
            and latest_review["reviewed_label"] == final_label
            and latest_review["reviewer"] == clean_reviewer
            and latest_review["notes"] == clean_notes
        ):
            return dict(latest_review)

        review_id = str(uuid.uuid4())
        timestamp = now_iso()
        conn.execute(
            """
            INSERT INTO human_reviews (
                id,
                curated_segment_id,
                reviewed_label,
                review_status,
                reviewer,
                notes,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                review_id,
                segment_id,
                final_label,
                review_status,
                clean_reviewer,
                clean_notes,
                timestamp,
                timestamp,
            ),
        )
        conn.commit()

        review = conn.execute(
            "SELECT * FROM human_reviews WHERE id = ?",
            (review_id,),
        ).fetchone()

        return dict(review)
    finally:
        conn.close()
