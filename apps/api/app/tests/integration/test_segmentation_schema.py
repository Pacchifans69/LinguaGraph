"""PostgreSQL schema guards for M2 segmentation persistence."""

import pytest
from sqlalchemy import inspect

pytestmark = pytest.mark.integration


def test_segmentation_tables_constraints_indexes_and_cascades(db_engine) -> None:
    inspector = inspect(db_engine)

    assert {"segmentation_layers", "segments"}.issubset(
        set(inspector.get_table_names())
    )

    layer_columns = {
        column["name"]: column for column in inspector.get_columns(
            "segmentation_layers"
        )
    }
    assert set(layer_columns) == {
        "id",
        "text_version_id",
        "granularity",
        "basis_layer_id",
        "requested_locale",
        "resolved_locale",
        "origin",
        "content_hash",
        "created_at",
        "updated_at",
    }
    assert layer_columns["basis_layer_id"]["nullable"]
    assert all(
        not column["nullable"]
        for name, column in layer_columns.items()
        if name != "basis_layer_id"
    )

    segment_columns = {
        column["name"]: column for column in inspector.get_columns("segments")
    }
    assert set(segment_columns) == {
        "id",
        "segmentation_layer_id",
        "ordinal",
        "start_offset",
        "end_offset",
        "exact_text",
        "is_word_like",
        "created_at",
    }
    assert segment_columns["is_word_like"]["nullable"]
    assert all(
        not column["nullable"]
        for name, column in segment_columns.items()
        if name != "is_word_like"
    )

    layer_checks = {
        item["name"] for item in inspector.get_check_constraints(
            "segmentation_layers"
        )
    }
    assert layer_checks == {
        "ck_segmentation_layers_granularity",
        "ck_segmentation_layers_origin",
    }
    segment_checks = {
        item["name"] for item in inspector.get_check_constraints("segments")
    }
    assert segment_checks == {
        "ck_segments_ordinal_non_negative",
        "ck_segments_start_offset_non_negative",
        "ck_segments_end_offset_after_start",
    }

    layer_uniques = {
        item["name"] for item in inspector.get_unique_constraints(
            "segmentation_layers"
        )
    }
    assert "uq_segmentation_layers_text_version_granularity" in layer_uniques
    segment_uniques = {
        item["name"] for item in inspector.get_unique_constraints("segments")
    }
    assert {
        "uq_segments_layer_ordinal",
        "uq_segments_layer_start_end",
    }.issubset(segment_uniques)

    layer_fk = inspector.get_foreign_keys("segmentation_layers")
    assert len(layer_fk) == 2
    assert {item["referred_table"] for item in layer_fk} == {
        "text_versions",
        "segmentation_layers",
    }
    assert all(item["options"].get("ondelete") == "CASCADE" for item in layer_fk)
    segment_fk = inspector.get_foreign_keys("segments")
    assert len(segment_fk) == 1
    assert segment_fk[0]["referred_table"] == "segmentation_layers"
    assert segment_fk[0]["options"].get("ondelete") == "CASCADE"

    assert "ix_segmentation_layers_text_version_id" in {
        item["name"] for item in inspector.get_indexes("segmentation_layers")
    }
    assert "ix_segmentation_layers_basis_layer_id" in {
        item["name"] for item in inspector.get_indexes("segmentation_layers")
    }
    assert "ix_segments_segmentation_layer_id" in {
        item["name"] for item in inspector.get_indexes("segments")
    }
