from datetime import date

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class UserRole(models.TextChoices):
    ADMIN = "ADMIN", "Administrador"
    REGENTE = "REGENTE", "Regente"
    TUTOR = "TUTOR", "Tutor"


class ModuleCode(models.TextChoices):
    DASHBOARD = "dashboard", "Dashboard"
    USUARIOS = "usuarios", "Usuarios"
    ESTUDIANTES = "estudiantes", "Estudiantes"
    REGENTES = "regentes", "Regentes"
    TUTORES = "tutores", "Tutores"
    REPORTES = "reportes", "Reportes"
    CONFIGURACION = "configuracion", "Configuración"
    AUDITORIA = "auditoria", "Auditoría"
    PERFIL = "perfil", "Perfil"


class PermissionAction(models.TextChoices):
    VER = "ver", "Ver"
    CREAR = "crear", "Crear"
    EDITAR = "editar", "Editar"
    ELIMINAR = "eliminar", "Eliminar"
    ACTIVAR = "activar", "Activar"
    DESACTIVAR = "desactivar", "Desactivar"
    CONSULTAR = "consultar", "Consultar"


class ChildStatus(models.TextChoices):
    ACTIVO = "activo", "Activo"
    INACTIVO = "inactivo", "Inactivo"


class TutorStatus(models.TextChoices):
    ACTIVO = "ACTIVO", "Activo"
    INACTIVO = "INACTIVO", "Inactivo"


class MobileAccountStatus(models.TextChoices):
    ACTIVA = "ACTIVA", "Activa"
    INACTIVA = "INACTIVA", "Inactiva"
    SIN_CUENTA = "SIN_CUENTA", "Sin cuenta"


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email: str, password: str, **extra_fields):
        if not email:
            raise ValueError("El correo electrónico es obligatorio.")
        email = self.normalize_email(email)
        user = self.model(email=email, username=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email: str, password: str, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("rol", UserRole.ADMIN)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self._create_user(email, password, **extra_fields)


class Role(models.Model):
    name = models.CharField(max_length=120, unique=True)
    description = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name

    @property
    def is_core_admin(self) -> bool:
        return self.name.strip().lower() == "administrador"


class Module(models.Model):
    name = models.CharField(max_length=120, unique=True)
    code = models.CharField(max_length=80, unique=True, choices=ModuleCode.choices)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("id",)

    def __str__(self) -> str:
        return self.name


class Permission(models.Model):
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="permissions")
    action = models.CharField(max_length=20, choices=PermissionAction.choices)
    code = models.CharField(max_length=120, unique=True)

    class Meta:
        ordering = ("module__id", "action")
        constraints = [
            models.UniqueConstraint(fields=("module", "action"), name="unique_permission_by_module_action"),
        ]

    def __str__(self) -> str:
        return self.code


class EducationalCenter(models.Model):
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=150, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name


class GPSDevice(models.Model):
    code = models.CharField(max_length=40, unique=True)
    model = models.CharField(max_length=120)
    imei = models.CharField(max_length=30, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("code",)

    def __str__(self) -> str:
        return f"{self.code} - {self.model}"

    @property
    def assignment_status(self) -> str:
        assigned = self.children.filter(status=ChildStatus.ACTIVO).exists()
        return "asignado" if assigned else "disponible"


class User(AbstractUser):
    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(unique=True)
    nombre = models.CharField(max_length=150)
    rol = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.TUTOR)
    role = models.ForeignKey(
        Role,
        on_delete=models.SET_NULL,
        related_name="users",
        null=True,
        blank=True,
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["nombre"]

    objects = UserManager()

    def save(self, *args, **kwargs):
        if self.role and self.role.name.strip().lower() == "administrador":
            self.rol = UserRole.ADMIN
        elif self.role and self.role.name.strip().lower() == "regente":
            self.rol = UserRole.REGENTE
        elif self.role and self.role.name.strip().lower() == "tutor":
            self.rol = UserRole.TUTOR
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.nombre} <{self.email}>"


class RolePermission(models.Model):
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="role_permissions")
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE, related_name="permission_roles")

    class Meta:
        ordering = ("role__name", "permission__module__id", "permission__action")
        constraints = [
            models.UniqueConstraint(fields=("role", "permission"), name="unique_role_permission"),
        ]

    def __str__(self) -> str:
        return f"{self.role.name} -> {self.permission.code}"


class Child(models.Model):
    code = models.CharField(max_length=20, unique=True)
    nombres = models.CharField(max_length=150)
    apellidos = models.CharField(max_length=150)
    fecha_nacimiento = models.DateField()
    curso = models.CharField(max_length=100)
    centro_educativo = models.ForeignKey(
        EducationalCenter,
        on_delete=models.PROTECT,
        related_name="children",
    )
    dispositivo_gps = models.ForeignKey(
        GPSDevice,
        on_delete=models.SET_NULL,
        related_name="children",
        null=True,
        blank=True,
    )
    foto = models.ImageField(upload_to="children/", null=True, blank=True)
    status = models.CharField(max_length=10, choices=ChildStatus.choices, default=ChildStatus.ACTIVO)
    motivo_desactivacion = models.CharField(max_length=200, blank=True)
    tutor_reference = models.CharField(max_length=120, blank=True)
    fecha_registro = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-fecha_registro",)

    def __str__(self) -> str:
        return f"{self.code} - {self.nombres} {self.apellidos}"

    @property
    def edad(self) -> int:
        today = date.today()
        return today.year - self.fecha_nacimiento.year - (
            (today.month, today.day) < (self.fecha_nacimiento.month, self.fecha_nacimiento.day)
        )


class Tutor(models.Model):
    nombres = models.CharField(max_length=150)
    apellidos = models.CharField(max_length=150)
    correo_electronico = models.EmailField(unique=True)
    telefono = models.CharField(max_length=30, unique=True)
    direccion = models.CharField(max_length=255)
    parentesco = models.CharField(max_length=50)
    estado = models.CharField(max_length=10, choices=TutorStatus.choices, default=TutorStatus.ACTIVO)
    cuenta_movil_estado = models.CharField(
        max_length=12,
        choices=MobileAccountStatus.choices,
        default=MobileAccountStatus.SIN_CUENTA,
    )
    correo_acceso = models.EmailField(blank=True)
    ultimo_acceso = models.DateTimeField(null=True, blank=True)
    fecha_registro = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)
    motivo_desactivacion = models.CharField(max_length=200, blank=True)
    creado_por = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="tutors_created",
        null=True,
        blank=True,
    )
    actualizado_por = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="tutors_updated",
        null=True,
        blank=True,
    )
    children = models.ManyToManyField(Child, related_name="tutors", blank=True)

    class Meta:
        ordering = ("-fecha_registro",)

    def __str__(self) -> str:
        return f"{self.nombres} {self.apellidos}"

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombres} {self.apellidos}"
