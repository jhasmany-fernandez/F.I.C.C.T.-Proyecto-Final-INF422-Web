from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from bullying_ai.types import BullyingAIDetectionResult


class BaseBullyingAIProvider(ABC):
    provider_name = "base"

    def __init__(self, *, model_path: Path, device: str, frame_stride: int, threshold: float):
        self.model_path = model_path
        self.device = device
        self.frame_stride = frame_stride
        self.threshold = threshold

    @abstractmethod
    def analyze_video(self, video_path: Path) -> BullyingAIDetectionResult:
        raise NotImplementedError
