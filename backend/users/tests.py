from django.contrib.auth import get_user_model
from django.test import TestCase
from django.test.utils import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from datetime import date, datetime
from pathlib import Path
import tempfile
from unittest.mock import patch

from users.models import (
    AccessControlRecord,
    BullyingVideoAnalysis,
    Child,
    ChildTutorAssociation,
    EducationalCenter,
    GeographicLocation,
    GPSDevice,
    MonitoringAlert,
    MobileAccountStatus,
    PickupRecord,
    Tutor,
    TutorStatus,
    UserRole,
    Role,
    AccessControlRecordType,
)


class LoginViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.password = "12345678"
        self.admin_role = Role.objects.create(name="Administrador", description="Admin", is_active=True)
        self.tutor_role = Role.objects.create(name="Tutor", description="Tutor", is_active=True)
        self.user_model = get_user_model()

    def create_user(self, *, email: str, nombre: str, rol: str, role=None, is_active: bool = True):
        user = self.user_model.objects.create(
            email=email,
            username=email,
            nombre=nombre,
            rol=rol,
            role=role,
            is_active=is_active,
        )
        user.set_password(self.password)
        user.save()
        return user

    def test_mobile_login_allows_regent_user(self):
        self.create_user(
            email="regente@colegio.com",
            nombre="Regente",
            rol=UserRole.REGENTE,
            role=None,
        )

        response = self.client.post(
            "/api/auth/login/",
            {"email": "regente@colegio.com", "password": self.password},
            format="json",
            HTTP_X_CLIENT_PLATFORM="mobile",
            HTTP_ACCEPT="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["email"], "regente@colegio.com")
        self.assertIn("token", response.data)
        self.assertIsNone(response.data["user"]["role"])

    def test_mobile_login_succeeds_when_user_has_no_related_role(self):
        self.create_user(
            email="tutor@colegio.com",
            nombre="Tutor",
            rol=UserRole.TUTOR,
            role=None,
        )

        response = self.client.post(
            "/api/auth/login/",
            {"email": "tutor@colegio.com", "password": self.password},
            format="json",
            HTTP_X_CLIENT_PLATFORM="mobile",
            HTTP_ACCEPT="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["email"], "tutor@colegio.com")
        self.assertIsNone(response.data["user"]["role"])

    def test_web_login_blocks_non_admin_users(self):
        self.create_user(
            email="tutor@colegio.com",
            nombre="Tutor",
            rol=UserRole.TUTOR,
            role=self.tutor_role,
        )

        response = self.client.post(
            "/api/auth/login/",
            {"email": "tutor@colegio.com", "password": self.password},
            format="json",
            HTTP_X_CLIENT_PLATFORM="web",
            HTTP_ACCEPT="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["message"], "Rol no autorizado para acceso web.")

    def test_mobile_login_blocks_admin_users(self):
        self.create_user(
            email="admin@colegio.com",
            nombre="Administrador",
            rol=UserRole.ADMIN,
            role=self.admin_role,
        )

        response = self.client.post(
            "/api/auth/login/",
            {"email": "admin@colegio.com", "password": self.password},
            format="json",
            HTTP_X_CLIENT_PLATFORM="mobile",
            HTTP_ACCEPT="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["message"], "Rol no autorizado para acceso móvil.")

    def test_login_requires_email_field(self):
        response = self.client.post(
            "/api/auth/login/",
            {"username": "admin@colegio.com", "password": self.password},
            format="json",
            HTTP_X_CLIENT_PLATFORM="mobile",
            HTTP_ACCEPT="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["message"], "Datos incompletos o inválidos.")
        self.assertIn("email", response.data["errors"])


class MobilePickupFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.password = "12345678"
        self.user_model = get_user_model()
        self.tutor_user = self.user_model.objects.create(
            email="tutor.app@test.com",
            username="tutor.app@test.com",
            nombre="Tutor App",
            rol=UserRole.TUTOR,
            is_active=True,
        )
        self.tutor_user.set_password(self.password)
        self.tutor_user.save()

        self.center = EducationalCenter.objects.create(
            code="CE-T1",
            name="Centro Test",
            address="Zona Test",
            regent=None,
        )
        self.child = Child.objects.create(
            code="EST-T1",
            nombres="Nino",
            apellidos="Prueba",
            fecha_nacimiento=date(2018, 1, 1),
            curso="1ro",
            centro_educativo=self.center,
        )
        self.tutor = Tutor.objects.create(
            nombres="Tutor",
            apellidos="Prueba",
            correo_electronico="tutor.real@test.com",
            telefono="70000099",
            direccion="Zona Test",
            parentesco="Padre",
            correo_acceso="tutor.app@test.com",
        )
        self.tutor.children.add(self.child)
        ChildTutorAssociation.objects.create(child=self.child, tutor=self.tutor, is_active=True)

    def test_tutor_can_confirm_pickup_from_mobile(self):
        login = self.client.post(
            "/api/auth/login/",
            {"email": "tutor.app@test.com", "password": self.password},
            format="json",
            HTTP_X_CLIENT_PLATFORM="mobile",
            HTTP_ACCEPT="application/json",
        )
        self.assertEqual(login.status_code, 200)
        token = login.data["token"]["access"]

        response = self.client.post(
            "/api/mobile/deliveries/confirm/",
            {"child_id": self.child.id, "biometric_method": "HUELLA"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_CLIENT_PLATFORM="mobile",
            HTTP_ACCEPT="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["message"], "Retiro confirmado correctamente.")
        self.assertEqual(PickupRecord.objects.count(), 1)

    def test_pickup_history_filters_by_date_for_mobile_and_web(self):
        pickup = PickupRecord.objects.create(
            child=self.child,
            tutor=self.tutor,
            confirmed_by=self.tutor_user,
            biometric_method="HUELLA",
        )
        pickup.confirmed_at = timezone.make_aware(datetime(2026, 6, 22, 8, 30, 0))
        pickup.save(update_fields=["confirmed_at"])

        login = self.client.post(
            "/api/auth/login/",
            {"email": "tutor.app@test.com", "password": self.password},
            format="json",
            HTTP_X_CLIENT_PLATFORM="mobile",
            HTTP_ACCEPT="application/json",
        )
        token = login.data["token"]["access"]

        mobile_response = self.client.get(
            "/api/mobile/deliveries/?date=2026-06-22",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_CLIENT_PLATFORM="mobile",
            HTTP_ACCEPT="application/json",
        )
        self.assertEqual(mobile_response.status_code, 200)
        self.assertEqual(len(mobile_response.data["data"]), 1)

        mobile_empty = self.client.get(
            "/api/mobile/deliveries/?date=2026-06-21",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_CLIENT_PLATFORM="mobile",
            HTTP_ACCEPT="application/json",
        )
        self.assertEqual(mobile_empty.status_code, 200)
        self.assertEqual(len(mobile_empty.data["data"]), 0)

        admin_user = self.user_model.objects.create(
            email="admin@test.com",
            username="admin@test.com",
            nombre="Admin",
            rol=UserRole.ADMIN,
            is_active=True,
        )
        admin_user.set_password(self.password)
        admin_user.save()

        admin_login = self.client.post(
            "/api/auth/login/",
            {"email": "admin@test.com", "password": self.password},
            format="json",
            HTTP_X_CLIENT_PLATFORM="web",
            HTTP_ACCEPT="application/json",
        )
        admin_token = admin_login.data["token"]["access"]

        web_response = self.client.get(
            "/api/deliveries/?date=2026-06-22",
            HTTP_AUTHORIZATION=f"Bearer {admin_token}",
            HTTP_X_CLIENT_PLATFORM="web",
            HTTP_ACCEPT="application/json",
        )
        self.assertEqual(web_response.status_code, 200)
        self.assertEqual(len(web_response.data["data"]), 1)

    def test_regent_can_register_access_control_record(self):
        regent_user = self.user_model.objects.create(
            email="regente.app@test.com",
            username="regente.app@test.com",
            nombre="Regente App",
            rol=UserRole.REGENTE,
            is_active=True,
        )
        regent_user.set_password(self.password)
        regent_user.save()
        self.center.regent = regent_user
        self.center.save(update_fields=["regent"])

        login = self.client.post(
            "/api/auth/login/",
            {"email": "regente.app@test.com", "password": self.password},
            format="json",
            HTTP_X_CLIENT_PLATFORM="mobile",
            HTTP_ACCEPT="application/json",
        )
        token = login.data["token"]["access"]

        response = self.client.post(
            "/api/mobile/access-control/register/",
            {"child_id": self.child.id, "record_type": "INGRESO"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_CLIENT_PLATFORM="mobile",
            HTTP_ACCEPT="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["message"], "Registro guardado correctamente.")
        self.assertEqual(AccessControlRecord.objects.count(), 1)
        self.assertEqual(AccessControlRecord.objects.first().record_type, AccessControlRecordType.INGRESO)
from datetime import date, datetime
from pathlib import Path
import tempfile

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.test.utils import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from users.models import (
    AccessControlRecord,
    AccessControlRecordType,
    BullyingVideoAnalysis,
    Child,
    ChildTutorAssociation,
    EducationalCenter,
    GPSDevice,
    GeographicLocation,
    MonitoringAlert,
    PickupRecord,
    Role,
    Tutor,
    UserRole,
)

class BullyingSimulationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.password = "12345678"
        self.user_model = get_user_model()

        self.regent_user = self.user_model.objects.create(
            email="regente.sim@test.com",
            username="regente.sim@test.com",
            nombre="Regente Sim",
            rol=UserRole.REGENTE,
            is_active=True,
        )
        self.regent_user.set_password(self.password)
        self.regent_user.mobile_push_token = "regent-fcm-token"
        self.regent_user.save()

        self.admin_user = self.user_model.objects.create(
            email="admin.sim@test.com",
            username="admin.sim@test.com",
            nombre="Admin Sim",
            rol=UserRole.ADMIN,
            is_active=True,
        )
        self.admin_user.set_password(self.password)
        self.admin_user.save()

        self.center = EducationalCenter.objects.create(
            code="CE-SIM",
            name="Centro Simulación",
            address="Zona Sim",
            regent=self.regent_user,
        )
        self.device = GPSDevice.objects.create(
            code="GPS-SIM-1",
            serial_number="SER-SIM-1",
            phone_number="70011122",
            brand="Test",
            model="Tracker",
            imei="IMEISIM0001",
        )
        self.child = Child.objects.create(
            code="EST-SIM-1",
            nombres="Mario",
            apellidos="Simulacion",
            fecha_nacimiento=date(2017, 2, 10),
            curso="5to A",
            centro_educativo=self.center,
            dispositivo_gps=self.device,
        )
        self.tutor_user = self.user_model.objects.create(
            email="tutor.sim@test.com",
            username="tutor.sim@test.com",
            nombre="Tutor Sim",
            rol=UserRole.TUTOR,
            is_active=True,
            mobile_push_token="tutor-fcm-token",
        )
        self.tutor = Tutor.objects.create(
            nombres="Tutor",
            apellidos="Simulación",
            correo_electronico="tutor.sim@test.com",
            correo_acceso="tutor.sim@test.com",
            telefono="70000999",
            direccion="Zona Sim",
            parentesco="Padre",
            estado=TutorStatus.ACTIVO,
            cuenta_movil_estado=MobileAccountStatus.ACTIVA,
        )
        ChildTutorAssociation.objects.create(
            child=self.child,
            tutor=self.tutor,
            is_active=True,
            created_by=self.admin_user,
        )
        GeographicLocation.objects.create(
            device=self.device,
            child=self.child,
            latitude=-17.783327,
            longitude=-63.182140,
            precision=8.5,
            speed=0,
            device_timestamp=timezone.now(),
        )

    @patch("users.views.get_firebase_admin_app", return_value=object())
    @patch("users.views.messaging.send", return_value="message-id")
    def test_admin_can_process_bullying_video_and_notify_regent_and_tutor(
        self,
        send_mock,
        _firebase_app_mock,
    ):
        with tempfile.TemporaryDirectory() as temp_dir:
            video_path = Path(temp_dir) / "bullying_aula_01.mp4"
            video_path.write_bytes(b"fake video")

            with override_settings(BULLYING_SIMULATION_DIR=temp_dir):
                login = self.client.post(
                    "/api/auth/login/",
                    {"email": "admin.sim@test.com", "password": self.password},
                    format="json",
                    HTTP_X_CLIENT_PLATFORM="web",
                    HTTP_ACCEPT="application/json",
                )
                self.assertEqual(login.status_code, 200)
                token = login.data["token"]["access"]

                response = self.client.post(
                    "/api/bullying-simulations/",
                    {"child_id": self.child.id, "video_name": "bullying_aula_01.mp4"},
                    format="json",
                    HTTP_AUTHORIZATION=f"Bearer {token}",
                    HTTP_X_CLIENT_PLATFORM="web",
                    HTTP_ACCEPT="application/json",
                )

                self.assertEqual(response.status_code, 201)
                self.assertEqual(BullyingVideoAnalysis.objects.count(), 1)
                self.assertEqual(MonitoringAlert.objects.count(), 1)
                alert = MonitoringAlert.objects.first()
                self.assertEqual(alert.alert_type, "BULLYING_DETECTADO")
                self.assertEqual(response.data["data"]["generated_alert"]["alert_type"], "BULLYING_DETECTADO")
                self.assertEqual(send_mock.call_count, 2)
                sent_tokens = {call.args[0].token for call in send_mock.call_args_list}
                self.assertEqual(sent_tokens, {"regent-fcm-token", "tutor-fcm-token"})
