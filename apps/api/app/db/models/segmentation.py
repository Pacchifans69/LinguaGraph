"""Persistent sentence-segmentation ORM models (ADR-010)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CHAR,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, utcnow


class SegmentationLayer(Base):
    """One reviewed linguistic segmentation of one TextVersion."""

    __tablename__ = "segmentation_layers"
    __table_args__ = (
        UniqueConstraint(
            "text_version_id",
            "granularity",
            name="uq_segmentation_layers_text_version_granularity",
        ),
        CheckConstraint(
            "granularity IN ('sentence')",
            name="ck_segmentation_layers_granularity",
        ),
        CheckConstraint(
            "origin IN ('manual', 'intl_segmenter')",
            name="ck_segmentation_layers_origin",
        ),
        Index("ix_segmentation_layers_text_version_id", "text_version_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    text_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(
            "text_versions.id",
            ondelete="CASCADE",
            name="fk_segmentation_layers_text_version_id_text_versions",
        ),
        nullable=False,
    )
    granularity: Mapped[str] = mapped_column(String(32), nullable=False)
    requested_locale: Mapped[str] = mapped_column(String(100), nullable=False)
    resolved_locale: Mapped[str] = mapped_column(String(100), nullable=False)
    origin: Mapped[str] = mapped_column(String(32), nullable=False)
    content_hash: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
    )

    text_version: Mapped["TextVersion"] = relationship(
        back_populates="segmentation_layers"
    )
    segments: Mapped[list["Segment"]] = relationship(
        back_populates="segmentation_layer",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Segment.ordinal",
    )

    def __repr__(self) -> str:
        return (
            f"<SegmentationLayer id={self.id} "
            f"text_version_id={self.text_version_id} "
            f"granularity={self.granularity!r}>"
        )


class Segment(Base):
    """One code-point interval in a complete canonical-text partition."""

    __tablename__ = "segments"
    __table_args__ = (
        CheckConstraint(
            "ordinal >= 0",
            name="ck_segments_ordinal_non_negative",
        ),
        CheckConstraint(
            "start_offset >= 0",
            name="ck_segments_start_offset_non_negative",
        ),
        CheckConstraint(
            "end_offset > start_offset",
            name="ck_segments_end_offset_after_start",
        ),
        UniqueConstraint(
            "segmentation_layer_id",
            "ordinal",
            name="uq_segments_layer_ordinal",
        ),
        UniqueConstraint(
            "segmentation_layer_id",
            "start_offset",
            "end_offset",
            name="uq_segments_layer_start_end",
        ),
        Index("ix_segments_segmentation_layer_id", "segmentation_layer_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    segmentation_layer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(
            "segmentation_layers.id",
            ondelete="CASCADE",
            name="fk_segments_segmentation_layer_id_segmentation_layers",
        ),
        nullable=False,
    )
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    start_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    end_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    exact_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
    )

    segmentation_layer: Mapped["SegmentationLayer"] = relationship(
        back_populates="segments"
    )

    def __repr__(self) -> str:
        return (
            f"<Segment id={self.id} ordinal={self.ordinal} "
            f"[{self.start_offset}:{self.end_offset})>"
        )
