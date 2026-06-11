"""Model catalog helpers for the standalone Live2D demo.

This module reads the model directory layout and enriches the existing
``model_dict.json`` entries with data discovered from each model's
``model3.json`` file.
"""

from __future__ import annotations

import json
from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = APP_DIR.parents[1]
MODEL_DICT_PATH = PROJECT_ROOT / "model_dict.json"
LIVE2D_MODELS_DIR = PROJECT_ROOT / "live2d-models"


def load_model_entries() -> list[dict[str, object]]:
    """Load the base model entries and enrich them from model directories.

    Returns:
        list[dict[str, object]]: Enriched model catalog entries.
    """

    base_entries = _load_base_entries()
    if not base_entries:
        base_entries = _discover_base_entries()

    enriched_entries: list[dict[str, object]] = []
    for entry in base_entries:
        if not isinstance(entry, dict):
            continue

        enriched_entries.append(_enrich_entry(entry))

    return enriched_entries


def write_model_entries(target_path: Path = MODEL_DICT_PATH) -> None:
    """Write the enriched model catalog to disk.

    Args:
        target_path (Path): Output file path.

    Returns:
        None: This function writes the catalog file in place.
    """

    catalog = load_model_entries()
    target_path.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=4), encoding="utf-8"
    )


def _load_base_entries() -> list[dict[str, object]]:
    """Load the existing model_dict.json file if it exists."""

    if not MODEL_DICT_PATH.exists() or not MODEL_DICT_PATH.is_file():
        return []

    try:
        data = json.loads(MODEL_DICT_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []

    if not isinstance(data, list):
        return []

    return [entry for entry in data if isinstance(entry, dict)]


def _discover_base_entries() -> list[dict[str, object]]:
    """Create minimal entries by scanning the model directory."""

    entries: list[dict[str, object]] = []
    for model_json in sorted(LIVE2D_MODELS_DIR.rglob("*.model3.json")):
        relative = model_json.relative_to(PROJECT_ROOT).as_posix()
        model_name = model_json.stem.removesuffix(".model3")
        entries.append({"name": model_name, "url": f"/{relative}"})

    return entries


def _enrich_entry(entry: dict[str, object]) -> dict[str, object]:
    """Attach discovered expressions, motions, and hit areas to a model entry."""

    enriched = dict(entry)
    model_path = _resolve_model_path(enriched)
    if model_path is None:
        enriched.setdefault("availableExpressions", [])
        enriched.setdefault("availableMotions", {})
        enriched.setdefault("availableHitAreas", [])
        return enriched

    model_settings = _load_json(model_path)
    if not isinstance(model_settings, dict):
        enriched.setdefault("availableExpressions", [])
        enriched.setdefault("availableMotions", {})
        enriched.setdefault("availableHitAreas", [])
        return enriched

    file_refs = model_settings.get("FileReferences", {})
    if not isinstance(file_refs, dict):
        file_refs = {}

    expressions = []
    for index, expression in enumerate(file_refs.get("Expressions", []) or []):
        if not isinstance(expression, dict):
            continue

        expression_name = str(expression.get(
            "Name", f"expression_{index + 1}"))
        expression_file = str(expression.get("File", ""))
        expressions.append(
            {
                "name": expression_name,
                "file": expression_file,
                "index": index,
            }
        )

    motions: dict[str, list[dict[str, object]]] = {}
    for group_name, group_items in (file_refs.get("Motions", {}) or {}).items():
        if not isinstance(group_items, list):
            continue

        motion_items: list[dict[str, object]] = []
        for index, motion_item in enumerate(group_items):
            if not isinstance(motion_item, dict):
                continue

            motion_file = str(motion_item.get("File", ""))
            motion_items.append(
                {
                    "index": index,
                    "name": Path(motion_file).stem if motion_file else f"motion_{index + 1}",
                    "file": motion_file,
                }
            )

        motions[str(group_name)] = motion_items

    hit_areas = []
    for hit_area in model_settings.get("HitAreas", []) or []:
        if not isinstance(hit_area, dict):
            continue

        hit_area_id = str(hit_area.get("Id", ""))
        if hit_area_id:
            hit_areas.append(hit_area_id)

    enriched["model3Path"] = f"/{model_path.relative_to(PROJECT_ROOT).as_posix()}"
    enriched["availableExpressions"] = expressions
    enriched["availableMotions"] = motions
    enriched["availableHitAreas"] = hit_areas
    enriched["actionSummary"] = {
        "expressions": len(expressions),
        "motionGroups": len(motions),
        "motionItems": sum(len(items) for items in motions.values()),
        "hitAreas": len(hit_areas),
    }

    return enriched


def _resolve_model_path(entry: dict[str, object]) -> Path | None:
    """Resolve the model3.json file for a catalog entry."""

    url = str(entry.get("url", "")).lstrip("/")
    if url:
        candidate = PROJECT_ROOT / url
        if candidate.exists() and candidate.is_file():
            return candidate

    name = str(entry.get("name", "")).strip()
    if not name:
        return None

    candidates = sorted(LIVE2D_MODELS_DIR.glob(
        f"{name}/runtime/*.model3.json"))
    if candidates:
        return candidates[0]

    return None


def _load_json(path: Path) -> object | None:
    """Load JSON from a file, returning ``None`` on decode failure."""

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None
