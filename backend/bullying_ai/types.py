from dataclasses import dataclass, field
from enum import StrEnum


class BullyingAIStatus(StrEnum):
    DISABLED = "DISABLED"
    READY = "READY"
    NOT_CONFIGURED = "NOT_CONFIGURED"
    FAILED = "FAILED"


@dataclass(slots=True)
class BullyingAIDetectionResult:
    status: BullyingAIStatus
    detected: bool = False
    confidence: float = 0.0
    summary: str = ""
    provider: str = ""
    model_path: str = ""
    metadata: dict = field(default_factory=dict)

