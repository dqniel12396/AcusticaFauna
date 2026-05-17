from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

import pandas as pd


REQUIRED_COLUMNS = {
    "audio_path",
    "normalized_label",
    "split",
    "item_role",
    "duration_seconds",
    "sha256",
}


def ensure_dir(path: str | Path) -> Path:
    output = Path(path)
    output.mkdir(parents=True, exist_ok=True)
    return output


VALID_SAMPLE_STRATEGIES = {"head", "random", "stratified"}


def _sample_group(group: pd.DataFrame, limit: int, strategy: str, random_seed: int) -> pd.DataFrame:
    if limit is None or limit <= 0 or len(group) <= limit:
        return group
    if strategy == "head":
        return group.head(limit)
    return group.sample(n=limit, random_state=random_seed)


def _stratified_limit(df: pd.DataFrame, limit: int, random_seed: int) -> pd.DataFrame:
    if limit is None or limit <= 0 or len(df) <= limit:
        return df

    parts: list[pd.DataFrame] = []
    grouped = [(key, group) for key, group in df.groupby(["split", "normalized_label"], sort=True)]
    if not grouped:
        return df.head(limit)

    # Round-robin by split+class keeps minority classes represented without changing split labels.
    shuffled_groups: list[tuple[tuple[str, str], pd.DataFrame]] = []
    for index, (key, group) in enumerate(grouped):
        shuffled = group.sample(frac=1, random_state=random_seed + index)
        shuffled_groups.append((key, shuffled.reset_index(drop=True)))

    cursor = {key: 0 for key, _ in shuffled_groups}
    while len(parts) < limit:
        added = False
        for key, group in shuffled_groups:
            position = cursor[key]
            if position < len(group):
                parts.append(group.iloc[[position]])
                cursor[key] += 1
                added = True
                if len(parts) >= limit:
                    break
        if not added:
            break

    if not parts:
        return df.head(limit)
    return pd.concat(parts, ignore_index=True)


def sample_manifest(
    df: pd.DataFrame,
    limit: int | None = None,
    limit_per_class: int | None = None,
    sample_strategy: str = "head",
    random_seed: int = 42,
) -> pd.DataFrame:
    if sample_strategy not in VALID_SAMPLE_STRATEGIES:
        raise ValueError(f"sample_strategy invalida: {sample_strategy}. Usa {sorted(VALID_SAMPLE_STRATEGIES)}")

    sampled = df.copy()
    if limit_per_class is not None and limit_per_class > 0:
        pieces: list[pd.DataFrame] = []
        for group_index, (_, group) in enumerate(sampled.groupby(["split", "normalized_label"], sort=False)):
            pieces.append(_sample_group(group, limit_per_class, sample_strategy, random_seed + group_index))
        sampled = pd.concat(pieces, ignore_index=True) if pieces else sampled.head(0)

    if limit is not None and limit > 0:
        if sample_strategy == "head":
            sampled = sampled.head(limit)
        elif sample_strategy == "random":
            sampled = sampled.sample(n=min(limit, len(sampled)), random_state=random_seed)
        else:
            sampled = _stratified_limit(sampled, limit, random_seed)

    return sampled.reset_index(drop=True)


def read_training_manifest(
    manifest_csv: str | Path,
    limit: int | None = None,
    limit_per_class: int | None = None,
    sample_strategy: str = "head",
    random_seed: int = 42,
) -> pd.DataFrame:
    manifest_path = Path(manifest_csv)
    if not manifest_path.exists():
        raise FileNotFoundError(f"No existe manifest CSV: {manifest_path}")

    df = pd.read_csv(manifest_path)
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"Manifest sin columnas requeridas: {sorted(missing)}")

    df = df.copy()
    df["audio_path"] = df["audio_path"].astype(str)
    df["normalized_label"] = df["normalized_label"].astype(str)
    df["split"] = df["split"].fillna("unassigned").astype(str)
    df["item_role"] = df["item_role"].fillna("").astype(str)
    df = df[df["item_role"] != "excluded"]
    df = df[df["audio_path"].str.len() > 0]
    df = df[df["normalized_label"].str.len() > 0]

    df = sample_manifest(
        df,
        limit=limit,
        limit_per_class=limit_per_class,
        sample_strategy=sample_strategy,
        random_seed=random_seed,
    )

    existing_mask = df["audio_path"].map(lambda value: Path(value).exists())
    missing_files = df.loc[~existing_mask, "audio_path"].tolist()
    df = df.loc[existing_mask].reset_index(drop=True)
    df.attrs["missing_files"] = missing_files
    return df


def split_manifest(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    return {
        "train": df[df["split"] == "train"].reset_index(drop=True),
        "val": df[df["split"].isin(["val", "validation"])].reset_index(drop=True),
        "test": df[df["split"] == "test"].reset_index(drop=True),
    }


def build_label_map(labels: Iterable[str]) -> dict[str, int]:
    return {label: index for index, label in enumerate(sorted(set(labels)))}


def to_one_hot_df(df: pd.DataFrame, classes: list[str]) -> pd.DataFrame:
    label_df = pd.DataFrame(0, index=df["audio_path"].tolist(), columns=classes, dtype=int)
    for audio_path, label in zip(df["audio_path"], df["normalized_label"], strict=False):
        if label in label_df.columns:
            label_df.loc[audio_path, label] = 1
    label_df.index.name = "file"
    return label_df


def to_binary_presence_df(df: pd.DataFrame, positive_label: str) -> pd.DataFrame:
    label_df = pd.DataFrame(0, index=df["audio_path"].tolist(), columns=[positive_label], dtype=int)
    for audio_path, label in zip(df["audio_path"], df["normalized_label"], strict=False):
        label_df.loc[audio_path, positive_label] = 1 if label == positive_label else 0
    label_df.index.name = "file"
    return label_df


def save_json(path: str | Path, data: dict) -> None:
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def save_used_manifests(output_dir: Path, splits: dict[str, pd.DataFrame]) -> None:
    for split, split_df in splits.items():
        split_df.to_csv(output_dir / f"{split}_manifest.csv", index=False)


def basic_manifest_summary(df: pd.DataFrame) -> dict:
    return {
        "rows": int(len(df)),
        "labels": int(df["normalized_label"].nunique()) if len(df) else 0,
        "total_duration_seconds": float(df["duration_seconds"].fillna(0).sum()) if "duration_seconds" in df else 0.0,
        "by_split": df["split"].value_counts().to_dict() if len(df) else {},
        "by_label": df["normalized_label"].value_counts().to_dict() if len(df) else {},
        "by_split_label": (
            df.groupby(["split", "normalized_label"]).size().rename("count").reset_index().to_dict(orient="records")
            if len(df)
            else []
        ),
        "missing_files": df.attrs.get("missing_files", []),
    }


def import_opensoundscape_cnn():
    try:
        from opensoundscape.ml.cnn import CNN, load_model

        return CNN, load_model
    except Exception as first_error:
        try:
            from opensoundscape.torch.models.cnn import CNN, load_model

            return CNN, load_model
        except Exception as second_error:
            raise ImportError(
                "No se pudo importar OpenSoundscape. Instala acusticafauna-ML/requirements-ml.txt "
                "en un entorno separado .venv-ml."
            ) from second_error or first_error


def choose_device(device: str) -> str | None:
    if device == "auto":
        return None
    return device


def predict_short_clips(model, audio_paths: list[str]):
    try:
        return model.predict(audio_paths, split_files_into_clips=False)
    except TypeError:
        return model.predict(audio_paths)
