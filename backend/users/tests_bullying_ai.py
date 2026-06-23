from django.test import SimpleTestCase, override_settings

from bullying_ai.service import build_bullying_ai_service
from bullying_ai.types import BullyingAIStatus


class BullyingAIServiceTests(SimpleTestCase):
    @override_settings(BULLYING_AI_ENABLED=False)
    def test_service_is_disabled_by_default(self):
        service = build_bullying_ai_service()

        result = service.get_status()

        self.assertEqual(result.status, BullyingAIStatus.DISABLED)
        self.assertFalse(result.detected)

    @override_settings(
        BULLYING_AI_ENABLED=True,
        BULLYING_AI_PROVIDER="yolo_violence",
        BULLYING_AI_MODEL_PATH="C:/tmp/modelo-no-cargado.pt",
    )
    def test_service_reports_not_configured_without_model_file(self):
        service = build_bullying_ai_service()

        result = service.get_status()

        self.assertEqual(result.status, BullyingAIStatus.NOT_CONFIGURED)
        self.assertEqual(result.provider, "yolo_violence")
