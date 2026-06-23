from __future__ import annotations

from pathlib import Path

from bullying_ai.providers.base import BaseBullyingAIProvider
from bullying_ai.types import BullyingAIDetectionResult, BullyingAIStatus


class YoloViolenceProvider(BaseBullyingAIProvider):
    provider_name = "yolo_violence"

    def analyze_video(self, video_path: Path) -> BullyingAIDetectionResult:
        if not self.model_path.exists():
            return BullyingAIDetectionResult(
                status=BullyingAIStatus.NOT_CONFIGURED,
                summary="El modelo de IA para violencia escolar aun no fue cargado en el proyecto.",
                provider=self.provider_name,
                model_path=str(self.model_path),
                metadata={
                    "video_path": str(video_path),
                    "device": self.device,
                    "frame_stride": self.frame_stride,
                    "threshold": self.threshold,
                    "engine": "ultralytics-yolo",
                },
            )

        try:
            # Import perezoso: el proyecto puede incluir la IA sin instalarla todavia.
            from ultralytics import YOLO  # type: ignore
        except Exception as exc:
            return BullyingAIDetectionResult(
                status=BullyingAIStatus.NOT_CONFIGURED,
                summary="El proveedor YOLO esta agregado pero sus dependencias no estan instaladas.",
                provider=self.provider_name,
                model_path=str(self.model_path),
                metadata={
                    "video_path": str(video_path),
                    "device": self.device,
                    "missing_dependency": "ultralytics",
                    "error": str(exc),
                },
            )

        model = YOLO(str(self.model_path))
        predictions = model.predict(
            source=str(video_path),
            device=self.device,
            stream=False,
            verbose=False,
        )

        highest_confidence = 0.0
        total_hits = 0
        sampled_frames = 0

        for frame_index, prediction in enumerate(predictions):
            if self.frame_stride > 1 and frame_index % self.frame_stride != 0:
                continue
            sampled_frames += 1
            boxes = getattr(prediction, "boxes", None)
            if boxes is None:
                continue
            confidences = getattr(boxes, "conf", None)
            if confidences is None:
                continue
            for confidence in confidences.tolist():
                highest_confidence = max(highest_confidence, float(confidence))
                if float(confidence) >= self.threshold:
                    total_hits += 1

        detected = total_hits > 0
        summary = (
            "La IA detecto patrones compatibles con agresion fisica escolar."
            if detected
            else "La IA no encontro evidencia suficiente de agresion en las muestras procesadas."
        )
        return BullyingAIDetectionResult(
            status=BullyingAIStatus.READY,
            detected=detected,
            confidence=highest_confidence,
            summary=summary,
            provider=self.provider_name,
            model_path=str(self.model_path),
            metadata={
                "video_path": str(video_path),
                "device": self.device,
                "frame_stride": self.frame_stride,
                "threshold": self.threshold,
                "sampled_frames": sampled_frames,
                "hits_above_threshold": total_hits,
                "engine": "ultralytics-yolo",
            },
        )
