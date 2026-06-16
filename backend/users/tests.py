from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from users.models import Role, UserRole


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

    def test_mobile_login_allows_email_password_for_active_user(self):
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

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["email"], "admin@colegio.com")
        self.assertIn("token", response.data)
        self.assertEqual(response.data["user"]["role"], "Administrador")

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
