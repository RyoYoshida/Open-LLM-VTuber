"""Regenerate model_dict.json from the Live2D model directories."""

from __future__ import annotations

from model_catalog import write_model_entries


def main() -> None:
    """Regenerate the enriched model catalog on disk."""

    write_model_entries()
    print("model_dict.json was regenerated from live2d-models/")


if __name__ == "__main__":
    main()
