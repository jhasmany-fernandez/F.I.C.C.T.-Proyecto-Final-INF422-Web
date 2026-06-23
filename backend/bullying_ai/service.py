from __future__ import annotations

from pathlib import Path

from django.conf import settings

from bullying_ai.providers import YoloViolenceProvider
from bullying_ai.types import BullyingAIDetectionResult, BullyingAIStatus


class BullyingAIService:
    def __init__(self):
        self.enabled = bool(getattr(settings, "BULLYING_AI_ENABLED", False))
        self.provider_name = getattr(settings, "BULLYING_AI_PROVIDER", "yolo_violence")
        self.model_path = Path(getattr(settings, "BULLYING_AI_MODEL_PATH", ""))
        self.device = getattr(settings, "BULLYING_AI_DEVICE", "cpu")
        self.frame_stride = int(getattr(settings, "BULLYING_AI_FRAME_STRIDE", 8))
        self.threshold = float(getattr(settings, "BULLYING_AI_ALERT_THRESHOLD", 0.72))

    def get_status(self) -> BullyingAIDetectionResult:
        if not self.enabled:
            return BullyingAIDetectionResult(
                status=BullyingAIStatus.DISABLED,
                summary="La capa de IA esta instalada en el proyecto pero desactivada por configuracion.",
                provider=self.provider_name,
                model_path=str(self.model_path),
            )

        return BullyingAIDetectionResult(
            status=BullyingAIStatus.READY if self.model_path.exists() else BullyingAIStatus.NOT_CONFIGURED,
            summary=(
                "La capa de IA esta lista para integracion."
                if self.model_path.exists()
                else "La capa de IA esta agregada pero aun falta cargar el modelo entrenado."
            ),
            provider=self.provider_name,
            model_path=str(self.model_path),
            metadata={
                "device": self.device,
                "frame_stride": self.frame_stride,
                "threshold": self.threshold,
            },
        )

    def analyze_video(self, video_path: str | Path) -> BullyingAIDetectionResult:
        if not self.enabled:
            return self.get_status()

        provider = self._build_provider()
        return provider.analyze_video(Path(video_path))

    def _build_provider(self):
        if self.provider_name == "yolo_violence":
            return YoloViolenceProvider(
                model_path=self.model_path,
                device=self.device,
                frame_stride=self.frame_stride,
                threshold=self.threshold,
            )
        raise ValueError(f"Proveedor de IA no soportado: {self.provider_name}")


def build_bullying_ai_service() -> BullyingAIService:
    return BullyingAIService()
