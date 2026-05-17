import base64
import json
import math
import struct
import wave
from pathlib import Path


def write_activity_wav(path: Path, sample_rate: int = 8000) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        total_frames = int(sample_rate * 2.0)
        for index in range(total_frames):
            seconds = index / sample_rate
            if 0.45 <= seconds <= 0.95 or 1.45 <= seconds <= 1.75:
                value = int(14000 * math.sin(2 * math.pi * 900 * seconds))
            else:
                value = 0
            wav.writeframes(struct.pack("<h", value))
    return path


def test_audio_lab_annotation_lifecycle(client):
    payload = {
        "audio_path": "F:/audios/boana.wav",
        "audio_name": "boana.wav",
        "source_row_id": "row-1",
        "start_seconds": 0,
        "end_seconds": 5,
        "segment_start_seconds": 0,
        "segment_end_seconds": 5,
        "model_id": "boana_boans_pugnax_v3_quality045",
        "predicted_label": "Boana_pugnax",
        "raw_argmax_label": "Boana_boans",
        "decision_rule_applied": True,
        "threshold": 0.03,
        "score": 0.035,
        "score_used": 0.035,
        "user_feedback": "confirmed_positive",
        "feedback_type": "confirmed_positive",
        "notes": "pytest",
        "status": "active",
    }

    created = client.post("/api/audio-lab/annotations", json=payload)
    assert created.status_code == 200
    item = created.json()
    assert item["audio_path"] == payload["audio_path"]
    assert item["audio_name"] == "boana.wav"
    assert item["score_used"] == 0.035
    assert item["raw_argmax_label"] == "Boana_boans"
    assert item["status"] == "active"

    other = client.post(
        "/api/audio-lab/annotations",
        json={**payload, "audio_path": "F:/audios/humano.wav", "audio_name": "humano.wav"},
    )
    assert other.status_code == 200

    listed = client.get("/api/audio-lab/annotations", params={"audio_path": payload["audio_path"]})
    assert listed.status_code == 200
    data = listed.json()
    assert data["total"] == 1
    assert data["items"][0]["audio_path"] == payload["audio_path"]

    patched = client.patch(
        f"/api/audio-lab/annotations/{item['id']}",
        json={"user_feedback": "false_positive", "notes": "corregido"},
    )
    assert patched.status_code == 200
    updated = patched.json()
    assert updated["user_feedback"] == "false_positive"
    assert updated["feedback_type"] == "false_positive"
    assert updated["notes"] == "corregido"

    retracted = client.post(f"/api/audio-lab/annotations/{item['id']}/retract")
    assert retracted.status_code == 200
    assert retracted.json()["status"] == "retracted"


def test_audio_lab_excluded_human_voice_defaults(client):
    response = client.post(
        "/api/audio-lab/annotations",
        json={
            "audio_path": "F:/audios/voz.wav",
            "audio_name": "voz.wav",
            "start_seconds": 0,
            "end_seconds": 5,
            "model_id": "boana_boans_pugnax_v3_quality045",
            "predicted_label": "Boana_pugnax",
            "score_used": 0.04,
            "user_feedback": "excluded_from_training",
            "exclusion_reason": "voz_humana",
        },
    )

    assert response.status_code == 200
    item = response.json()
    assert item["user_feedback"] == "excluded_from_training"
    assert item["exclusion_reason"] == "voz_humana"
    assert item["label_type"] == "human_voice"
    assert item["recommended_training_use"] == "exclude_species_training"
    assert item["hard_negative_candidate"] == 0


def test_training_dataset_excludes_audio_lab_excluded_from_training(client, imported_curated_dataset):
    from app.services.curated_dataset_service import list_curated_segments
    from app.services.taxonomy_service import suggest_taxonomy_from_curated_labels
    from app.services.training_dataset_service import (
        build_dataset_version,
        create_dataset_version,
        get_dataset_items,
    )

    segment = next(
        item
        for item in list_curated_segments({"limit": 20})["items"]
        if item["label"] == "Boana_boans"
    )
    response = client.post(
        "/api/audio-lab/annotations",
        json={
            "audio_path": segment["output_path"],
            "audio_name": "voz_humana.wav",
            "start_seconds": 0,
            "end_seconds": 5,
            "model_id": "boana_boans_pugnax_v3_quality045",
            "predicted_label": "Boana_pugnax",
            "score_used": 0.04,
            "user_feedback": "excluded_from_training",
            "exclusion_reason": "voz_humana",
        },
    )
    assert response.status_code == 200

    suggest_taxonomy_from_curated_labels()
    version = create_dataset_version(
        {
            "version_name": "dataset_pytest_audio_lab_exclusion",
            "created_by": "pytest",
            "min_duration_seconds": 0.1,
            "max_duration_seconds": 1.0,
            "min_examples_per_label": 1,
        }
    )
    build_dataset_version(version["id"])
    items = get_dataset_items(version["id"], {"limit": 20})["items"]
    excluded = [item for item in items if item["original_label"] == "Boana_boans"]

    assert excluded
    assert excluded[0]["item_role"] == "excluded"
    assert excluded[0]["exclude_reason"] == "audio_lab_excluded_voz_humana"


def test_audio_lab_waveform_uploads_and_clips(client, sample_audio_file):
    waveform = client.get(
        "/api/audio-lab/waveform",
        params={"audio_path": str(sample_audio_file), "points": 128},
    )
    assert waveform.status_code == 200
    data = waveform.json()
    assert data["duration_seconds"] > 0
    assert data["sample_rate"] > 0
    assert len(data["peaks"]) <= 128

    raw = sample_audio_file.read_bytes()
    uploaded = client.post(
        "/api/audio-lab/uploads/batch",
        json={
            "files": [
                {
                    "original_filename": "upload.wav",
                    "content_base64": base64.b64encode(raw).decode("ascii"),
                }
            ]
        },
    )
    assert uploaded.status_code == 200
    upload_item = uploaded.json()["items"][0]
    assert upload_item["stored_path"].endswith("upload.wav")
    assert upload_item["size_bytes"] == len(raw)

    clip = client.post(
        "/api/audio-lab/clips",
        json={
            "source_audio_path": str(sample_audio_file),
            "start_seconds": 0,
            "end_seconds": 0.05,
            "suggested_name": "pytest_clip",
            "purpose": "revision",
            "notes": "clip test",
        },
    )
    assert clip.status_code == 200
    clip_item = clip.json()
    assert clip_item["output_audio_path"]
    assert clip_item["output_audio_path"].endswith(".wav")
    assert clip_item["output_metadata_path"].endswith(".wav.json")
    assert clip_item["source_audio_path"] == str(sample_audio_file)
    assert abs(clip_item["duration_seconds"] - 0.05) < 0.03
    assert clip_item["playable_url"].endswith(f"/clips/{clip_item['id']}/audio")
    assert clip_item["file_exists"] is True
    assert clip_item["wav_exists"] is True

    from pathlib import Path

    wav_path = Path(clip_item["output_audio_path"])
    metadata_path = Path(clip_item["output_metadata_path"])
    assert wav_path.exists()
    assert wav_path.parent.name == "clips"
    assert metadata_path.exists()
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    assert metadata["output_audio_path"] == clip_item["output_audio_path"]

    detail = client.get(f"/api/audio-lab/clips/{clip_item['id']}")
    assert detail.status_code == 200
    assert detail.json()["output_audio_path"] == clip_item["output_audio_path"]
    assert detail.json()["wav_exists"] is True

    audio = client.get(f"/api/audio-lab/clips/{clip_item['id']}/audio")
    assert audio.status_code == 200
    assert audio.headers["content-type"].startswith("audio/")
    assert audio.content

    listed = client.get("/api/audio-lab/clips")
    assert listed.status_code == 200
    assert any(item["id"] == clip_item["id"] for item in listed.json()["items"])


def test_audio_lab_activity_detect_and_create_clips(client, tmp_path):
    activity_audio = write_activity_wav(tmp_path / "activity.wav")

    detected = client.post(
        "/api/audio-lab/activity/detect",
        json={
            "audio_path": str(activity_audio),
            "method": "energy",
            "threshold_db": -35,
            "min_activity_seconds": 0.2,
            "min_silence_seconds": 0.2,
            "padding_seconds": 0.05,
            "window_seconds": 0.05,
            "hop_seconds": 0.025,
            "normalize": False,
            "merge_gap_seconds": 0.1,
            "max_segment_seconds": 1.0,
        },
    )

    assert detected.status_code == 200
    payload = detected.json()
    assert payload["audio_path"] == str(activity_audio)
    assert payload["duration_seconds"] == 2.0
    assert payload["run_id"]
    assert payload["summary"]["segments_detected"] >= 1
    assert payload["summary"]["active_seconds"] < payload["duration_seconds"]
    assert payload["summary"]["silent_seconds"] > 0
    assert payload["segments"][0]["start_seconds"] < payload["segments"][0]["end_seconds"]

    created = client.post(
        "/api/audio-lab/activity/create-clips",
        json={
            "audio_path": str(activity_audio),
            "segments": payload["segments"][:1],
            "purpose": "revision",
            "name_prefix": "pytest_activity",
            "format": "wav",
        },
    )

    assert created.status_code == 200
    clip_payload = created.json()
    assert clip_payload["total"] == 1
    clip = clip_payload["clips"][0]
    assert clip["source_audio_path"] == str(activity_audio)
    assert clip["output_audio_path"].endswith(".wav")
    assert clip["file_exists"] is True
    assert clip["wav_exists"] is True
    assert Path(clip["output_audio_path"]).exists()


def test_audio_lab_batch_processing_clean_existing_and_full_auto(client, tmp_path):
    long_name = "Boana_boans__" + ("nombre_muy_largo_" * 6) + "source.wav"
    first = write_activity_wav(tmp_path / long_name)
    second = write_activity_wav(tmp_path / "second.wav")
    original_size = first.stat().st_size

    clean_job = client.post(
        "/api/audio-lab/batch-processing/jobs",
        json={
            "job_name": "pytest_clean",
            "input_audio_paths": [str(first), str(second)],
            "mode": "clean_existing",
            "preset": "normal",
            "steps": {
                "detect_activity": False,
                "create_segments": False,
                "discard_empty_segments": False,
                "denoise": True,
                "normalize": True,
                "bandpass": True,
                "run_frog_detector": False,
            },
            "denoise_params": {
                "method": "spectral_gate",
                "preset": "normal",
                "prop_decrease": 0.6,
                "frequency_min_hz": 300,
                "frequency_max_hz": 3000,
                "normalize": True,
            },
        },
    )
    assert clean_job.status_code == 200
    clean_id = clean_job.json()["job_id"]
    clean_detail = client.get(f"/api/audio-lab/batch-processing/jobs/{clean_id}")
    assert clean_detail.status_code == 200
    clean_payload = clean_detail.json()
    assert clean_payload["status"] == "completed"
    assert clean_payload["summary"]["processed_files_count"] == 2
    assert len(clean_payload["outputs"]) == 2
    assert clean_payload["outputs"][0]["segment_audio_path"] is None
    assert Path(clean_payload["outputs"][0]["processed_audio_path"]).exists()
    assert clean_payload["outputs"][0]["source_audio_name"] == first.name
    assert "nombre_muy_largo" in clean_payload["outputs"][0]["display_name"]
    assert clean_payload["outputs"][0]["display_label"].endswith("procesado")
    assert clean_payload["outputs"][0]["batch_job_name"] == "pytest_clean"
    assert clean_payload["outputs"][0]["processing_method"] == "spectral_gate"
    assert clean_payload["outputs"][0]["short_id"]

    from app.core.config import settings

    old_ml_url = settings.ML_API_BASE_URL
    settings.ML_API_BASE_URL = "http://127.0.0.1:9"
    quality_dir = settings.STORAGE_DIR / "audio_lab" / "quality_reports"
    assert not quality_dir.exists()
    try:
        quality = client.post(
            "/api/audio-lab/audio-processing/quality-report",
            json={
                "source_audio_path": clean_payload["outputs"][0]["source_audio_path"],
                "processed_audio_path": clean_payload["outputs"][0]["processed_audio_path"],
                    "run_frog_detector": True,
                    "frog_detector_model_id": "frog_detector_v1_binary_v3_hardneg",
                    "frog_detector_threshold": 0.3,
                    "batch_output_id": clean_payload["outputs"][0]["id"],
                },
            )
    finally:
        settings.ML_API_BASE_URL = old_ml_url
    assert quality.status_code == 200
    quality_payload = quality.json()
    assert quality_payload["source_audio_path"] == clean_payload["outputs"][0]["source_audio_path"]
    assert quality_payload["processed_audio_path"] == clean_payload["outputs"][0]["processed_audio_path"]
    assert quality_payload["display_name"] == clean_payload["outputs"][0]["display_name"]
    assert quality_payload["batch_output_id"] == clean_payload["outputs"][0]["id"]
    assert quality_payload["duration_seconds"] > 0
    assert quality_payload["sample_rate_source"] > 0
    assert quality_payload["sample_rate_processed"] > 0
    assert "contrast_improvement_db" in quality_payload
    assert len(quality_payload["band_energy"]) == 4
    assert quality_payload["recommendation"]["training_use"] == "requires_review"
    assert "detector no disponible" in quality_payload["recommendation"]["warnings"]
    report_path = Path(quality_payload["report_path"])
    assert report_path.exists()
    assert report_path.parent == quality_dir
    assert report_path.name.endswith(".quality.json")
    assert len(report_path.name) < 120
    assert first.stat().st_size == original_size

    full_job = client.post(
        "/api/audio-lab/batch-processing/jobs",
        json={
            "job_name": "pytest_full",
            "input_audio_paths": [str(first)],
            "mode": "full_auto",
            "preset": "normal",
            "steps": {
                "detect_activity": True,
                "create_segments": True,
                "discard_empty_segments": True,
                "denoise": True,
                "normalize": True,
                "bandpass": True,
                "run_frog_detector": False,
            },
            "activity_params": {
                "method": "energy",
                "threshold_db": -35,
                "min_activity_seconds": 0.2,
                "min_silence_seconds": 0.2,
                "padding_seconds": 0.05,
                "window_seconds": 0.05,
                "hop_seconds": 0.025,
                "frequency_min_hz": 300,
                "frequency_max_hz": 3000,
                "merge_gap_seconds": 0.1,
                "max_segment_seconds": 1.0,
                "normalize": False,
            },
        },
    )
    assert full_job.status_code == 200
    full_id = full_job.json()["job_id"]
    full_detail = client.get(f"/api/audio-lab/batch-processing/jobs/{full_id}")
    assert full_detail.status_code == 200
    full_payload = full_detail.json()
    assert full_payload["status"] == "completed"
    assert full_payload["summary"]["segments_detected"] >= 1
    assert full_payload["summary"]["segments_created"] >= 1
    assert full_payload["outputs"]
    assert Path(full_payload["outputs"][0]["segment_audio_path"]).exists()
    assert Path(full_payload["outputs"][0]["processed_audio_path"]).exists()
    assert full_payload["outputs"][0]["segment_label"] == "seg_0001"
    assert full_payload["outputs"][0]["display_label"].endswith("procesado")

    logs = client.get(f"/api/audio-lab/batch-processing/jobs/{full_id}/logs")
    assert logs.status_code == 200
    assert "Job completado" in logs.json()["logs"]
