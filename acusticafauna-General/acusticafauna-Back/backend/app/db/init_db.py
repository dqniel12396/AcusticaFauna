from app.db.database import get_connection


def ensure_column(cur, table_name: str, column_name: str, column_sql: str) -> None:
    cur.execute(f"PRAGMA table_info({table_name})")
    columns = [row[1] for row in cur.fetchall()]

    if column_name not in columns:
        cur.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_sql}")


def init_db() -> None:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL;")
    cur.execute("PRAGMA synchronous=NORMAL;")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS import_sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            root_path TEXT,
            source_type TEXT,
            import_mode TEXT,
            imported_at TEXT NOT NULL,
            total_selection_files INTEGER DEFAULT 0,
            total_predictions INTEGER DEFAULT 0,
            total_events INTEGER DEFAULT 0,
            imported_segments INTEGER DEFAULT 0,
            imported_spectrograms INTEGER DEFAULT 0,
            skipped_existing_events INTEGER DEFAULT 0,
            csv_detected TEXT,
            segments_dir_detected TEXT,
            spectrograms_dir_detected TEXT,
            status TEXT DEFAULT 'importado'
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            source_audio_path TEXT,
            source_audio_name TEXT,
            begin_time REAL,
            end_time REAL,
            duration_seconds REAL,
            main_common_name TEXT,
            main_species_code TEXT,
            main_confidence REAL,
            segment_audio_path TEXT,
            spectrogram_path TEXT,
            segment_audio_hash TEXT,
            spectrogram_hash TEXT,
            imported_status TEXT DEFAULT 'importado_al_pc',
            location_name TEXT,
            habitat TEXT,
            latitude REAL,
            longitude REAL,
            event_fingerprint TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(session_id) REFERENCES import_sessions(id)
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS predictions (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            rank_order INTEGER,
            common_name TEXT,
            species_code TEXT,
            confidence REAL,
            begin_time REAL,
            end_time REAL,
            low_freq REAL,
            high_freq REAL,
            begin_path TEXT,
            file_offset REAL,
            FOREIGN KEY(event_id) REFERENCES events(id)
        )
        """
    )

    ensure_column(cur, "events", "segment_audio_hash", "segment_audio_hash TEXT")
    ensure_column(cur, "events", "spectrogram_hash", "spectrogram_hash TEXT")
    ensure_column(cur, "events", "event_fingerprint", "event_fingerprint TEXT")
    ensure_column(
        cur,
        "import_sessions",
        "skipped_existing_events",
        "skipped_existing_events INTEGER DEFAULT 0",
    )

    cur.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_events_event_fingerprint ON events(event_fingerprint)"
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS curated_import_sessions (
            id TEXT PRIMARY KEY,
            dataset_root TEXT NOT NULL,
            manifest_path TEXT NOT NULL,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            status TEXT NOT NULL,
            total_rows INTEGER DEFAULT 0,
            imported_count INTEGER DEFAULT 0,
            skipped_duplicates INTEGER DEFAULT 0,
            error_count INTEGER DEFAULT 0,
            notes TEXT
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS curated_audio_segments (
            id TEXT PRIMARY KEY,
            segment_id TEXT NOT NULL,
            source_path TEXT,
            source_sha256 TEXT,
            output_path TEXT NOT NULL,
            split TEXT,
            label TEXT,
            group_type TEXT,
            negative_for TEXT,
            source_filename TEXT,
            start_seconds REAL,
            end_seconds REAL,
            duration_seconds REAL,
            rms_max_dbfs REAL,
            rms_mean_dbfs REAL,
            threshold_dbfs REAL,
            sample_rate INTEGER,
            channels INTEGER,
            status TEXT,
            error TEXT,
            spectrogram_path TEXT,
            spectrogram_status TEXT DEFAULT 'none',
            spectrogram_error TEXT,
            imported_at TEXT NOT NULL
        )
        """
    )

    ensure_column(cur, "curated_audio_segments", "spectrogram_path", "spectrogram_path TEXT")
    ensure_column(
        cur,
        "curated_audio_segments",
        "spectrogram_status",
        "spectrogram_status TEXT DEFAULT 'none'",
    )
    ensure_column(cur, "curated_audio_segments", "spectrogram_error", "spectrogram_error TEXT")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS label_taxonomy (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL UNIQUE,
            display_name TEXT,
            label_type TEXT,
            parent_label TEXT,
            is_active INTEGER DEFAULT 1,
            notes TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    ensure_column(cur, "label_taxonomy", "scientific_name", "scientific_name TEXT")
    ensure_column(cur, "label_taxonomy", "common_name", "common_name TEXT")
    ensure_column(cur, "label_taxonomy", "group_name", "group_name TEXT")
    ensure_column(cur, "label_taxonomy", "family", "family TEXT")
    ensure_column(cur, "label_taxonomy", "genus", "genus TEXT")
    ensure_column(cur, "label_taxonomy", "species", "species TEXT")
    ensure_column(cur, "label_taxonomy", "aliases", "aliases TEXT")
    ensure_column(cur, "label_taxonomy", "code", "code TEXT")
    ensure_column(cur, "label_taxonomy", "use_for_training", "use_for_training INTEGER DEFAULT 1")
    ensure_column(cur, "label_taxonomy", "needs_review", "needs_review INTEGER DEFAULT 0")
    ensure_column(cur, "label_taxonomy", "updated_at", "updated_at TEXT")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS human_reviews (
            id TEXT PRIMARY KEY,
            curated_segment_id TEXT NOT NULL,
            reviewed_label TEXT,
            review_status TEXT NOT NULL,
            reviewer TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(curated_segment_id) REFERENCES curated_audio_segments(id)
        )
        """
    )

    cur.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_curated_segments_segment_id ON curated_audio_segments(segment_id)"
    )
    cur.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_curated_segments_output_path ON curated_audio_segments(output_path)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_curated_segments_label ON curated_audio_segments(label)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_curated_segments_group_type ON curated_audio_segments(group_type)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_curated_segments_negative_for ON curated_audio_segments(negative_for)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_human_reviews_segment ON human_reviews(curated_segment_id)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_label_taxonomy_group ON label_taxonomy(group_name)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_label_taxonomy_type ON label_taxonomy(label_type)"
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS training_dataset_versions (
            id TEXT PRIMARY KEY,
            version_name TEXT NOT NULL UNIQUE,
            description TEXT,
            created_at TEXT NOT NULL,
            created_by TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            source TEXT NOT NULL DEFAULT 'curated_dataset',
            rules_json TEXT,
            total_items INTEGER DEFAULT 0,
            total_labels INTEGER DEFAULT 0,
            total_duration_seconds REAL DEFAULT 0,
            notes TEXT
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS training_dataset_items (
            id TEXT PRIMARY KEY,
            dataset_version_id TEXT NOT NULL,
            curated_segment_id TEXT NOT NULL,
            original_label TEXT,
            normalized_label TEXT,
            taxonomy_label TEXT,
            group_name TEXT,
            label_type TEXT,
            item_role TEXT,
            confidence_source TEXT,
            split TEXT,
            duration_seconds REAL,
            source_path TEXT,
            audio_path TEXT,
            sha256 TEXT,
            include_reason TEXT,
            exclude_reason TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(dataset_version_id) REFERENCES training_dataset_versions(id),
            FOREIGN KEY(curated_segment_id) REFERENCES curated_audio_segments(id)
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS training_dataset_label_stats (
            id TEXT PRIMARY KEY,
            dataset_version_id TEXT NOT NULL,
            label TEXT NOT NULL,
            count_total INTEGER DEFAULT 0,
            count_train INTEGER DEFAULT 0,
            count_val INTEGER DEFAULT 0,
            count_test INTEGER DEFAULT 0,
            duration_total_seconds REAL DEFAULT 0,
            source_imported_count INTEGER DEFAULT 0,
            gold_count INTEGER DEFAULT 0,
            corrected_count INTEGER DEFAULT 0,
            negative_count INTEGER DEFAULT 0,
            excluded_count INTEGER DEFAULT 0,
            FOREIGN KEY(dataset_version_id) REFERENCES training_dataset_versions(id)
        )
        """
    )

    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_training_items_version ON training_dataset_items(dataset_version_id)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_training_items_label ON training_dataset_items(normalized_label)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_training_items_role ON training_dataset_items(item_role)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_training_stats_version ON training_dataset_label_stats(dataset_version_id)"
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_annotations (
            id TEXT PRIMARY KEY,
            audio_path TEXT NOT NULL,
            audio_name TEXT,
            source_row_id TEXT,
            start_seconds REAL,
            end_seconds REAL,
            segment_start_seconds REAL,
            segment_end_seconds REAL,
            model_id TEXT,
            predicted_label TEXT,
            raw_argmax_label TEXT,
            decision_rule_applied INTEGER DEFAULT 0,
            threshold REAL,
            score REAL,
            score_used REAL,
            user_feedback TEXT NOT NULL,
            feedback_type TEXT,
            exclusion_reason TEXT,
            label_type TEXT,
            recommended_training_use TEXT,
            hard_negative_candidate INTEGER DEFAULT 0,
            user_label TEXT,
            notes TEXT,
            status TEXT DEFAULT 'active',
            is_legacy INTEGER DEFAULT 0,
            needs_review INTEGER DEFAULT 0,
            updated_at TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    existing_audio_lab_columns = {
        row["name"]
        for row in cur.execute("PRAGMA table_info(audio_lab_annotations)").fetchall()
    }
    audio_lab_columns = {
        "audio_path": "TEXT",
        "start_seconds": "REAL",
        "end_seconds": "REAL",
        "audio_name": "TEXT",
        "source_row_id": "TEXT",
        "segment_start_seconds": "REAL",
        "segment_end_seconds": "REAL",
        "model_id": "TEXT",
        "predicted_label": "TEXT",
        "raw_argmax_label": "TEXT",
        "decision_rule_applied": "INTEGER DEFAULT 0",
        "threshold": "REAL",
        "score": "REAL",
        "score_used": "REAL",
        "user_feedback": "TEXT",
        "feedback_type": "TEXT",
        "exclusion_reason": "TEXT",
        "label_type": "TEXT",
        "recommended_training_use": "TEXT",
        "hard_negative_candidate": "INTEGER DEFAULT 0",
        "user_label": "TEXT",
        "notes": "TEXT",
        "status": "TEXT DEFAULT 'active'",
        "is_legacy": "INTEGER DEFAULT 0",
        "needs_review": "INTEGER DEFAULT 0",
        "created_at": "TEXT",
        "updated_at": "TEXT",
        "previous_feedback": "TEXT",
        "new_feedback": "TEXT",
        "correction_note": "TEXT",
        "processed_audio_path": "TEXT",
        "batch_job_id": "TEXT",
        "batch_output_id": "TEXT",
        "processing_metadata_path": "TEXT",
        "original_source_audio_path": "TEXT",
        "final_label": "TEXT",
        "pipeline_stages_json": "TEXT",
        "model_ids_json": "TEXT",
    }
    for name, definition in audio_lab_columns.items():
        if name not in existing_audio_lab_columns:
            cur.execute(f"ALTER TABLE audio_lab_annotations ADD COLUMN {name} {definition}")
            existing_audio_lab_columns.add(name)
    cur.execute(
        """
        UPDATE audio_lab_annotations
        SET
            segment_start_seconds = COALESCE(segment_start_seconds, start_seconds),
            segment_end_seconds = COALESCE(segment_end_seconds, end_seconds),
            score_used = COALESCE(score_used, score),
            feedback_type = COALESCE(feedback_type, user_feedback),
            status = CASE
                WHEN audio_path IS NULL OR start_seconds IS NULL OR end_seconds IS NULL THEN 'needs_review'
                ELSE COALESCE(status, 'active')
            END,
            is_legacy = CASE
                WHEN raw_argmax_label IS NULL AND threshold IS NULL AND score_used IS NULL THEN 1
                ELSE COALESCE(is_legacy, 0)
            END,
            needs_review = CASE
                WHEN audio_path IS NULL OR start_seconds IS NULL OR end_seconds IS NULL THEN 1
                ELSE COALESCE(needs_review, 0)
            END,
            created_at = COALESCE(created_at, datetime('now'))
        WHERE status IS NULL
           OR segment_start_seconds IS NULL
           OR segment_end_seconds IS NULL
           OR score_used IS NULL
           OR feedback_type IS NULL
           OR is_legacy IS NULL
           OR needs_review IS NULL
           OR created_at IS NULL
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_audio_lab_annotations_audio_path ON audio_lab_annotations(audio_path)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_audio_lab_annotations_feedback ON audio_lab_annotations(user_feedback)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_audio_lab_annotations_status ON audio_lab_annotations(status)"
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_clips (
            id TEXT PRIMARY KEY,
            source_audio_path TEXT NOT NULL,
            output_audio_path TEXT NOT NULL,
            output_metadata_path TEXT,
            audio_name TEXT,
            start_seconds REAL NOT NULL,
            end_seconds REAL NOT NULL,
            duration_seconds REAL,
            purpose TEXT,
            notes TEXT,
            status TEXT DEFAULT 'created',
            created_at TEXT NOT NULL
        )
        """
    )
    existing_clip_columns = {row["name"] for row in cur.execute("PRAGMA table_info(audio_lab_clips)").fetchall()}
    if "output_metadata_path" not in existing_clip_columns:
        cur.execute("ALTER TABLE audio_lab_clips ADD COLUMN output_metadata_path TEXT")
    cur.execute(
        """
        UPDATE audio_lab_clips
        SET output_metadata_path = output_audio_path || '.json'
        WHERE output_metadata_path IS NULL
          AND output_audio_path IS NOT NULL
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_audio_lab_clips_source ON audio_lab_clips(source_audio_path)"
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_activity_runs (
            id TEXT PRIMARY KEY,
            audio_path TEXT NOT NULL,
            method TEXT NOT NULL,
            params_json TEXT NOT NULL,
            summary_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_activity_segments (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            segment_key TEXT NOT NULL,
            start_seconds REAL NOT NULL,
            end_seconds REAL NOT NULL,
            duration_seconds REAL NOT NULL,
            peak_db REAL,
            mean_db REAL,
            score REAL,
            selected INTEGER DEFAULT 0,
            clip_id TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(run_id) REFERENCES audio_lab_activity_runs(id)
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_audio_lab_activity_runs_audio ON audio_lab_activity_runs(audio_path)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_audio_lab_activity_segments_run ON audio_lab_activity_segments(run_id)"
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_batch_jobs (
            id TEXT PRIMARY KEY,
            job_name TEXT,
            mode TEXT NOT NULL,
            preset TEXT NOT NULL,
            status TEXT NOT NULL,
            progress REAL DEFAULT 0,
            phase TEXT,
            current_file TEXT,
            params_json TEXT,
            summary_json TEXT,
            created_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_batch_items (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            source_audio_path TEXT NOT NULL,
            status TEXT NOT NULL,
            duration_seconds REAL,
            segments_detected INTEGER DEFAULT 0,
            segments_created INTEGER DEFAULT 0,
            segments_discarded INTEGER DEFAULT 0,
            processed_files_count INTEGER DEFAULT 0,
            frog_detected_count INTEGER DEFAULT 0,
            review_count INTEGER DEFAULT 0,
            error_message TEXT,
            FOREIGN KEY(job_id) REFERENCES audio_lab_batch_jobs(id)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_batch_outputs (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            item_id TEXT NOT NULL,
            source_audio_path TEXT NOT NULL,
            segment_start_seconds REAL,
            segment_end_seconds REAL,
            segment_audio_path TEXT,
            processed_audio_path TEXT,
            processing_metadata_path TEXT,
            frog_detector_score REAL,
            frog_detector_prediction TEXT,
            recommended_action TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(job_id) REFERENCES audio_lab_batch_jobs(id),
            FOREIGN KEY(item_id) REFERENCES audio_lab_batch_items(id)
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_audio_lab_batch_items_job ON audio_lab_batch_items(job_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_audio_lab_batch_outputs_job ON audio_lab_batch_outputs(job_id)")
    existing_output_columns = {row["name"] for row in cur.execute("PRAGMA table_info(audio_lab_batch_outputs)").fetchall()}
    for name, definition in {
        "quality_report_path": "TEXT",
        "quality_report_label": "TEXT",
    }.items():
        if name not in existing_output_columns:
            cur.execute(f"ALTER TABLE audio_lab_batch_outputs ADD COLUMN {name} {definition}")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_quality_reports (
            id TEXT PRIMARY KEY,
            source_audio_path TEXT NOT NULL,
            processed_audio_path TEXT NOT NULL,
            report_path TEXT NOT NULL,
            recommendation_label TEXT,
            contrast_improvement_db REAL,
            clipping_processed_ratio REAL,
            frog_source_score REAL,
            frog_processed_score REAL,
            created_at TEXT NOT NULL
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_audio_lab_quality_reports_processed ON audio_lab_quality_reports(processed_audio_path)"
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_clean_manifests (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            manifest_path TEXT NOT NULL,
            summary_json TEXT,
            created_at TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS audio_lab_uploads (
            id TEXT PRIMARY KEY,
            original_filename TEXT NOT NULL,
            stored_path TEXT NOT NULL,
            size_bytes INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        )
        """
    )

    conn.commit()
    conn.close()
