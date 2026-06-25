from datetime import date

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.core.exceptions import ObjectDoesNotExist
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


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


class StudentGender(models.TextChoices):
    MASCULINO = "MASCULINO", "Masculino"
    FEMENINO = "FEMENINO", "Femenino"
    OTRO = "OTRO", "Otro"


class StudentLevel(models.TextChoices):
    INICIAL = "INICIAL", "Inicial"
    PRIMARIA = "PRIMARIA", "Primaria"
    SECUNDARIA = "SECUNDARIA", "Secundaria"


class StudentShift(models.TextChoices):
    MANANA = "MANANA", "Manana"
    TARDE = "TARDE", "Tarde"
    NOCHE = "NOCHE", "Noche"


class StudentHistoryAction(models.TextChoices):
    CREACION = "CREACION", "Creacion"
    EDICION = "EDICION", "Edicion"
    CAMBIO_ESTADO = "CAMBIO_ESTADO", "Cambio de estado"
    ASIGNACION_GPS = "ASIGNACION_GPS", "Asignacion GPS"
    LIBERACION_GPS = "LIBERACION_GPS", "Liberacion GPS"
    ELIMINACION = "ELIMINACION", "Eliminacion"


class TutorStatus(models.TextChoices):
    ACTIVO = "ACTIVO", "Activo"
    INACTIVO = "INACTIVO", "Inactivo"


class MobileAccountStatus(models.TextChoices):
    ACTIVA = "ACTIVA", "Activa"
    INACTIVA = "INACTIVA", "Inactiva"
    SIN_CUENTA = "SIN_CUENTA", "Sin cuenta"


class GPSDeviceStatus(models.TextChoices):
    DISPONIBLE = "DISPONIBLE", "Disponible"
    ASIGNADO = "ASIGNADO", "Asignado"
    EN_MANTENIMIENTO = "EN_MANTENIMIENTO", "En mantenimiento"
    PERDIDO = "PERDIDO", "Perdido"
    INACTIVO = "INACTIVO", "Inactivo"


class GPSDeviceHistoryAction(models.TextChoices):
    CREACION = "CREACION", "Creacion"
    EDICION = "EDICION", "Edicion"
    ASIGNACION = "ASIGNACION", "Asignacion"
    DESASIGNACION = "DESASIGNACION", "Desasignacion"
    CAMBIO_ESTADO = "CAMBIO_ESTADO", "Cambio de estado"
    ACTIVACION = "ACTIVACION", "Activacion"
    DESACTIVACION = "DESACTIVACION", "Desactivacion"
    ELIMINACION_CONTROLADA = "ELIMINACION_CONTROLADA", "Eliminacion controlada"


class SafeAreaStatus(models.TextChoices):
    ACTIVA = "ACTIVA", "Activa"
    INACTIVA = "INACTIVA", "Inactiva"


class SafeAreaHistoryAction(models.TextChoices):
    CREACION = "CREACION", "Creacion"
    ACTUALIZACION = "ACTUALIZACION", "Actualizacion"
    ELIMINACION = "ELIMINACION", "Eliminacion"
    REEMPLAZO = "REEMPLAZO", "Reemplazo"


class ChildTutorAssociationAction(models.TextChoices):
    CREACION = "CREACION", "Creacion"
    ELIMINACION = "ELIMINACION", "Eliminacion"
    REACTIVACION = "REACTIVACION", "Reactivacion"


class LocationDeliveryStatus(models.TextChoices):
    ENVIADO = "ENVIADO", "Enviado"
    REENVIADO = "REENVIADO", "Reenviado"
    PENDIENTE = "PENDIENTE", "Pendiente"


class MonitoringStatus(models.TextChoices):
    SEGURO = "SEGURO", "Seguro"
    FUERA_AREA = "FUERA_AREA", "Fuera de area"
    ZONA_RIESGO = "ZONA_RIESGO", "Zona de riesgo"
    ERROR = "ERROR", "Error"
    PENDIENTE = "PENDIENTE", "Pendiente"


class RiskZoneSeverity(models.TextChoices):
    INFORMATIVA = "INFORMATIVO", "Informativo"
    BAJO = "BAJO", "Bajo"
    MEDIO = "MEDIO", "Medio"
    ALTO = "ALTO", "Alto"


class RiskZoneType(models.TextChoices):
    DELINCUENCIA = "DELINCUENCIA", "Delincuencia"
    TRAFICO = "TRAFICO", "Tráfico"
    OBRA = "OBRA", "Obra"
    RIO_CANAL = "RIO_CANAL", "Río o canal"
    ZONA_OSCURA = "ZONA_OSCURA", "Zona oscura"
    OTRO = "OTRO", "Otro"


class AlertType(models.TextChoices):
    SALIDA_AREA_SEGURA = "SALIDA_AREA_SEGURA", "Salida de area segura"
    INGRESO_ZONA_RIESGO = "INGRESO_ZONA_RIESGO", "Ingreso a zona de riesgo"
    ERROR_MONITOREO = "ERROR_MONITOREO", "Error de monitoreo"
    BULLYING_DETECTADO = "BULLYING_DETECTADO", "Bullying detectado"


class SecurityAlertPriority(models.TextChoices):
    ALTA = "ALTA", "Alta"
    MEDIA = "MEDIA", "Media"
    BAJA = "BAJA", "Baja"


class SecurityAlertStatus(models.TextChoices):
    PENDIENTE = "PENDIENTE", "Pendiente"
    ATENDIDA = "ATENDIDA", "Atendida"
    CERRADA = "CERRADA", "Cerrada"


class SecurityAlertHistoryAction(models.TextChoices):
    CREADA = "CREADA", "Creada"
    VISTA = "VISTA", "Vista"
    ATENDIDA = "ATENDIDA", "Atendida"
    CERRADA = "CERRADA", "Cerrada"
    REABIERTA = "REABIERTA", "Reabierta"
    ACTUALIZADA = "ACTUALIZADA", "Actualizada"


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
    code = models.CharField(max_length=30, unique=True, blank=True)
    name = models.CharField(max_length=150, unique=True)
    address = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    shift = models.CharField(max_length=40, blank=True)
    description = models.TextField(blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    deactivation_reason = models.CharField(max_length=200, blank=True)
    regent = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="assigned_educational_centers",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name

    @property
    def status(self) -> str:
        return "activo" if self.is_active else "inactivo"


class GPSDevice(models.Model):
    code = models.CharField(max_length=40, unique=True)
    serial_number = models.CharField(max_length=80, unique=True, null=True, blank=True)
    phone_number = models.CharField(max_length=30, unique=True, null=True, blank=True)
    brand = models.CharField(max_length=80, blank=True)
    model = models.CharField(max_length=120)
    imei = models.CharField(max_length=30, unique=True)
    status = models.CharField(max_length=20, choices=GPSDeviceStatus.choices, default=GPSDeviceStatus.DISPONIBLE)
    battery_level = models.PositiveSmallIntegerField(
        default=100,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    last_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    last_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="gps_devices_created",
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="gps_devices_updated",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ("code",)

    def __str__(self) -> str:
        return f"{self.code} - {self.model}"

    @property
    def assignment_status(self) -> str:
        assigned = self.children.filter(status=ChildStatus.ACTIVO).exists()
        return "asignado" if assigned else "disponible"

    @property
    def assigned_child(self):
        return self.children.filter(status=ChildStatus.ACTIVO).order_by("-fecha_actualizacion", "-id").first()

    @property
    def is_battery_low(self) -> bool:
        return self.battery_level <= 20

    @property
    def is_without_signal(self) -> bool:
        if not self.last_seen_at:
            return True
        return self.last_seen_at <= timezone.now() - timezone.timedelta(hours=24)

    def sync_status_with_assignment(self):
        child = self.assigned_child
        if child and self.status != GPSDeviceStatus.ASIGNADO:
            self.status = GPSDeviceStatus.ASIGNADO
        elif not child and self.status == GPSDeviceStatus.ASIGNADO:
            self.status = GPSDeviceStatus.DISPONIBLE if self.is_active else GPSDeviceStatus.INACTIVO
        if not self.is_active and self.status != GPSDeviceStatus.INACTIVO:
            self.status = GPSDeviceStatus.INACTIVO

    def save(self, *args, **kwargs):
        if self.phone_number == "":
            self.phone_number = None
        if self.serial_number:
            self.serial_number = self.serial_number.strip().upper()
        if self.phone_number:
            self.phone_number = self.phone_number.strip()
        if self.brand:
            self.brand = self.brand.strip()
        if self.model:
            self.model = self.model.strip()
        self.code = self.code.strip().upper()
        self.imei = self.imei.strip()
        if not self.is_active:
            self.status = GPSDeviceStatus.INACTIVO
        super().save(*args, **kwargs)


class GPSDeviceHistory(models.Model):
    gps_device = models.ForeignKey(GPSDevice, on_delete=models.CASCADE, related_name="history_entries")
    action = models.CharField(max_length=30, choices=GPSDeviceHistoryAction.choices)
    detail = models.CharField(max_length=255, blank=True)
    previous_status = models.CharField(max_length=20, choices=GPSDeviceStatus.choices, blank=True)
    new_status = models.CharField(max_length=20, choices=GPSDeviceStatus.choices, blank=True)
    previous_child = models.ForeignKey(
        "Child",
        on_delete=models.SET_NULL,
        related_name="gps_history_previous_entries",
        null=True,
        blank=True,
    )
    new_child = models.ForeignKey(
        "Child",
        on_delete=models.SET_NULL,
        related_name="gps_history_new_entries",
        null=True,
        blank=True,
    )
    previous_is_active = models.BooleanField(null=True, blank=True)
    new_is_active = models.BooleanField(null=True, blank=True)
    user = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="gps_history_entries",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-id")

    def __str__(self) -> str:
        return f"{self.gps_device.code} - {self.action}"


class User(AbstractUser):
    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(unique=True)
    nombre = models.CharField(max_length=150)
    rol = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.TUTOR)
    mobile_push_token = models.CharField(max_length=255, blank=True)
    mobile_push_platform = models.CharField(max_length=30, blank=True)
    mobile_push_updated_at = models.DateTimeField(null=True, blank=True)
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

    @property
    def role_name(self) -> str | None:
        if not self.role_id:
            return None

        cached_role = getattr(self, "_role_cache", None)
        if cached_role is not None:
            return cached_role.name

        try:
            return self.role.name
        except ObjectDoesNotExist:
            return None

    @property
    def is_admin_user(self) -> bool:
        return self.rol == UserRole.ADMIN or (self.role_name or "").strip().lower() == "administrador"

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
    genero = models.CharField(max_length=12, choices=StudentGender.choices, default=StudentGender.OTRO)
    ci = models.CharField(max_length=30, unique=True, null=True, blank=True)
    rude = models.CharField(max_length=30, unique=True, null=True, blank=True)
    curso = models.CharField(max_length=100)
    paralelo = models.CharField(max_length=20, blank=True)
    nivel = models.CharField(max_length=20, choices=StudentLevel.choices, default=StudentLevel.PRIMARIA)
    turno = models.CharField(max_length=20, choices=StudentShift.choices, default=StudentShift.MANANA)
    direccion = models.CharField(max_length=255, blank=True)
    telefono_contacto = models.CharField(max_length=30, blank=True)
    nombre_contacto_emergencia = models.CharField(max_length=150, blank=True)
    telefono_contacto_emergencia = models.CharField(max_length=30, blank=True)
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
    desactivado_en = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="students_deleted",
        null=True,
        blank=True,
    )
    tutor_reference = models.CharField(max_length=120, blank=True)
    fecha_registro = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="students_created",
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="students_updated",
        null=True,
        blank=True,
    )

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

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombres} {self.apellidos}"

    @property
    def educational_center(self):
        return self.centro_educativo

    @property
    def gps_device(self):
        return self.dispositivo_gps

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def save(self, *args, **kwargs):
        self.code = self.code.strip().upper()
        self.nombres = self.nombres.strip()
        self.apellidos = self.apellidos.strip()
        self.curso = self.curso.strip()
        self.paralelo = self.paralelo.strip()
        self.direccion = self.direccion.strip()
        self.telefono_contacto = self.telefono_contacto.strip()
        self.nombre_contacto_emergencia = self.nombre_contacto_emergencia.strip()
        self.telefono_contacto_emergencia = self.telefono_contacto_emergencia.strip()
        self.motivo_desactivacion = self.motivo_desactivacion.strip()
        self.tutor_reference = self.tutor_reference.strip()
        if self.ci == "":
            self.ci = None
        if self.rude == "":
            self.rude = None
        if self.ci:
            self.ci = self.ci.strip().upper()
        if self.rude:
            self.rude = self.rude.strip().upper()
        super().save(*args, **kwargs)


class StudentHistory(models.Model):
    student = models.ForeignKey(Child, on_delete=models.CASCADE, related_name="history_entries")
    action = models.CharField(max_length=30, choices=StudentHistoryAction.choices)
    description = models.CharField(max_length=255, blank=True)
    previous_data = models.JSONField(default=dict, blank=True)
    new_data = models.JSONField(default=dict, blank=True)
    performed_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="student_history_entries",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-id")

    def __str__(self) -> str:
        return f"{self.student.code} - {self.action}"


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


class ChildTutorAssociation(models.Model):
    child = models.ForeignKey(Child, on_delete=models.CASCADE, related_name="child_tutor_associations")
    tutor = models.ForeignKey(Tutor, on_delete=models.CASCADE, related_name="child_tutor_associations")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="child_tutor_associations_created",
        null=True,
        blank=True,
    )
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="child_tutor_associations_deactivated",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ("-updated_at",)
        constraints = [models.UniqueConstraint(fields=("child", "tutor"), name="unique_child_tutor_association")]

    def __str__(self) -> str:
        return f"{self.child} -> {self.tutor}"


class ChildTutorAssociationHistory(models.Model):
    association = models.ForeignKey(
        ChildTutorAssociation,
        on_delete=models.CASCADE,
        related_name="history_entries",
    )
    child = models.ForeignKey(
        Child,
        on_delete=models.CASCADE,
        related_name="child_tutor_association_history_entries",
    )
    tutor = models.ForeignKey(
        Tutor,
        on_delete=models.CASCADE,
        related_name="child_tutor_association_history_entries",
    )
    action = models.CharField(max_length=20, choices=ChildTutorAssociationAction.choices)
    detail = models.CharField(max_length=255)
    user = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="child_tutor_association_history_actions",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.child} - {self.tutor} - {self.action}"


class PickupBiometricMethod(models.TextChoices):
    BIOMETRIA = "BIOMETRIA", "Biometria del dispositivo"
    HUELLA = "HUELLA", "Huella dactilar"
    ROSTRO = "ROSTRO", "Reconocimiento facial"


class PickupRecord(models.Model):
    child = models.ForeignKey(
        Child,
        on_delete=models.PROTECT,
        related_name="pickup_records",
    )
    tutor = models.ForeignKey(
        Tutor,
        on_delete=models.PROTECT,
        related_name="pickup_records",
    )
    confirmed_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="pickup_records_confirmed",
        null=True,
        blank=True,
    )
    biometric_method = models.CharField(
        max_length=20,
        choices=PickupBiometricMethod.choices,
        default=PickupBiometricMethod.BIOMETRIA,
    )
    source_platform = models.CharField(max_length=20, default="mobile")
    note = models.CharField(max_length=255, blank=True)
    confirmed_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-confirmed_at", "-id")

    def __str__(self) -> str:
        return f"{self.child.code} retirado por {self.tutor.nombre_completo}"


class AccessControlRecordType(models.TextChoices):
    INGRESO = "INGRESO", "Control de ingreso"
    ASISTENCIA = "ASISTENCIA", "Registro de asistencia"


class AccessControlRecord(models.Model):
    child = models.ForeignKey(
        Child,
        on_delete=models.PROTECT,
        related_name="access_control_records",
    )
    recorded_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="access_control_records",
        null=True,
        blank=True,
    )
    record_type = models.CharField(
        max_length=20,
        choices=AccessControlRecordType.choices,
    )
    source_platform = models.CharField(max_length=20, default="mobile")
    note = models.CharField(max_length=255, blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-recorded_at", "-id")

    def __str__(self) -> str:
        return f"{self.child.code} - {self.record_type}"


class SafeArea(models.Model):
    educational_center = models.ForeignKey(
        EducationalCenter,
        on_delete=models.CASCADE,
        related_name="safe_areas",
    )
    name = models.CharField(max_length=150)
    status = models.CharField(max_length=10, choices=SafeAreaStatus.choices, default=SafeAreaStatus.ACTIVA)
    polygon = models.JSONField()
    area_m2 = models.DecimalField(max_digits=12, decimal_places=2)
    perimeter_m = models.DecimalField(max_digits=12, decimal_places=2)
    points_count = models.PositiveIntegerField()
    created_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="safe_areas_created",
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="safe_areas_updated",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("-updated_at",)

    def __str__(self) -> str:
        return f"{self.educational_center.name} - {self.name}"


class SafeAreaHistory(models.Model):
    safe_area = models.ForeignKey(
        SafeArea,
        on_delete=models.SET_NULL,
        related_name="history_entries",
        null=True,
        blank=True,
    )
    educational_center = models.ForeignKey(
        EducationalCenter,
        on_delete=models.CASCADE,
        related_name="safe_area_history_entries",
    )
    action = models.CharField(max_length=20, choices=SafeAreaHistoryAction.choices)
    previous_polygon = models.JSONField(null=True, blank=True)
    new_polygon = models.JSONField(null=True, blank=True)
    previous_area_m2 = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    new_area_m2 = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    previous_perimeter_m = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    new_perimeter_m = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    points_count = models.PositiveIntegerField(default=0)
    user = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="safe_area_history_actions",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.educational_center.name} - {self.action}"


class GeographicLocation(models.Model):
    device = models.ForeignKey(
        GPSDevice,
        on_delete=models.PROTECT,
        related_name="geographic_locations",
    )
    child = models.ForeignKey(
        Child,
        on_delete=models.PROTECT,
        related_name="geographic_locations",
    )
    latitude = models.DecimalField(max_digits=10, decimal_places=6)
    longitude = models.DecimalField(max_digits=10, decimal_places=6)
    precision = models.FloatField()
    speed = models.FloatField(null=True, blank=True)
    device_timestamp = models.DateTimeField()
    server_received_at = models.DateTimeField(auto_now_add=True)
    delivery_status = models.CharField(
        max_length=20,
        choices=LocationDeliveryStatus.choices,
        default=LocationDeliveryStatus.ENVIADO,
    )
    inside_safe_area = models.BooleanField(null=True, blank=True)
    created_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="geographic_locations_created",
        null=True,
        blank=True,
    )
    source_ip = models.GenericIPAddressField(null=True, blank=True)
    source_host = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-device_timestamp", "-created_at")
        constraints = [
            models.UniqueConstraint(
                fields=("device", "device_timestamp"),
                name="unique_geographic_location_device_timestamp",
            )
        ]

    def __str__(self) -> str:
        return f"{self.device.code} @ {self.device_timestamp.isoformat()}"


class RiskZone(models.Model):
    educational_center = models.ForeignKey(
        EducationalCenter,
        on_delete=models.SET_NULL,
        related_name="risk_zones",
        null=True,
        blank=True,
    )
    code = models.CharField(max_length=20, unique=True, blank=True, null=True)
    name = models.CharField(max_length=150)
    description = models.CharField(max_length=255, blank=True)
    risk_type = models.CharField(
        max_length=20,
        choices=RiskZoneType.choices,
        default=RiskZoneType.OTRO,
    )
    polygon = models.JSONField()
    center_latitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    center_longitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    area_m2 = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    perimeter_m = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    severity = models.CharField(
        max_length=12,
        choices=RiskZoneSeverity.choices,
        default=RiskZoneSeverity.MEDIO,
    )
    created_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="risk_zones_created",
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="risk_zones_updated",
        null=True,
        blank=True,
    )
    deleted_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="risk_zones_deleted",
        null=True,
        blank=True,
    )
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        if self.educational_center:
            return f"{self.educational_center.name} - {self.name}"
        return f"Zona general - {self.name}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.code and self.pk:
            self.code = f"RZ-{self.pk:05d}"
            type(self).objects.filter(pk=self.pk).update(code=self.code)


class MonitoringConfig(models.Model):
    min_time_between_alerts_min = models.PositiveIntegerField(default=5)
    min_distance_state_change_m = models.PositiveIntegerField(default=10)
    max_gps_accuracy_m = models.PositiveIntegerField(default=50)
    enable_risk_zones = models.BooleanField(default=True)
    register_errors_as_pending = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Monitoring configuration"
        verbose_name_plural = "Monitoring configuration"

    def __str__(self) -> str:
        return "Configuración de monitoreo"


class MonitoringAlert(models.Model):
    code = models.CharField(max_length=20, unique=True, blank=True, null=True)
    child = models.ForeignKey(
        Child,
        on_delete=models.CASCADE,
        related_name="monitoring_alerts",
    )
    educational_center = models.ForeignKey(
        EducationalCenter,
        on_delete=models.CASCADE,
        related_name="monitoring_alerts",
        null=True,
        blank=True,
    )
    gps_device = models.ForeignKey(
        GPSDevice,
        on_delete=models.SET_NULL,
        related_name="monitoring_alerts",
        null=True,
        blank=True,
    )
    location_record = models.ForeignKey(
        GeographicLocation,
        on_delete=models.CASCADE,
        related_name="generated_alerts",
    )
    monitoring_history = models.ForeignKey(
        "MonitoringHistory",
        on_delete=models.SET_NULL,
        related_name="generated_security_alerts",
        null=True,
        blank=True,
    )
    risk_zone = models.ForeignKey(
        "RiskZone",
        on_delete=models.SET_NULL,
        related_name="generated_alerts",
        null=True,
        blank=True,
    )
    alert_type = models.CharField(max_length=30, choices=AlertType.choices)
    priority = models.CharField(
        max_length=10,
        choices=SecurityAlertPriority.choices,
        default=SecurityAlertPriority.MEDIA,
    )
    workflow_status = models.CharField(
        max_length=12,
        choices=SecurityAlertStatus.choices,
        default=SecurityAlertStatus.PENDIENTE,
    )
    title = models.CharField(max_length=150, blank=True)
    description = models.CharField(max_length=255, blank=True)
    reason = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=MonitoringStatus.choices)
    latitude = models.DecimalField(max_digits=10, decimal_places=6)
    longitude = models.DecimalField(max_digits=10, decimal_places=6)
    accuracy = models.FloatField(null=True, blank=True)
    speed = models.FloatField(null=True, blank=True)
    event_datetime = models.DateTimeField(null=True, blank=True)
    detected_at = models.DateTimeField(null=True, blank=True)
    attended_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="security_alerts_created",
        null=True,
        blank=True,
    )
    attended_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="security_alerts_attended",
        null=True,
        blank=True,
    )
    closed_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="security_alerts_closed",
        null=True,
        blank=True,
    )
    active = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.child.code} - {self.alert_type}"

    def save(self, *args, **kwargs):
        if not self.code:
            last_alert = MonitoringAlert.objects.order_by("-id").first()
            next_id = 1 if last_alert is None else last_alert.id + 1
            self.code = f"AL-{next_id:06d}"
        if self.educational_center_id is None:
            self.educational_center = self.child.centro_educativo
        if self.gps_device_id is None:
            self.gps_device = self.child.dispositivo_gps
        if not self.title:
            self.title = (
                "Salida del área segura"
                if self.alert_type == AlertType.SALIDA_AREA_SEGURA
                else "Ingreso a zona de riesgo"
                if self.alert_type == AlertType.INGRESO_ZONA_RIESGO
                else "Bullying detectado"
                if self.alert_type == AlertType.BULLYING_DETECTADO
                else "Alerta de monitoreo"
            )
        if not self.description:
            self.description = self.reason
        if self.detected_at is None:
            self.detected_at = self.event_datetime or timezone.now()
        if self.event_datetime is None:
            self.event_datetime = self.detected_at
        super().save(*args, **kwargs)


class BullyingVideoAnalysisResult(models.TextChoices):
    NORMAL = "NORMAL", "Normal"
    BULLYING_DETECTADO = "BULLYING_DETECTADO", "Bullying detectado"


class BullyingVideoAnalysis(models.Model):
    child = models.ForeignKey(
        Child,
        on_delete=models.CASCADE,
        related_name="bullying_video_analyses",
    )
    educational_center = models.ForeignKey(
        EducationalCenter,
        on_delete=models.CASCADE,
        related_name="bullying_video_analyses",
    )
    source_video_name = models.CharField(max_length=180)
    source_video_path = models.CharField(max_length=255)
    source_folder = models.CharField(max_length=255, blank=True)
    detector_name = models.CharField(max_length=120, default="Simulador IA Open Source")
    result = models.CharField(max_length=30, choices=BullyingVideoAnalysisResult.choices)
    confidence = models.FloatField(default=0)
    event_timestamp_seconds = models.PositiveIntegerField(null=True, blank=True)
    summary = models.CharField(max_length=255)
    metadata = models.JSONField(default=dict, blank=True)
    generated_alert = models.ForeignKey(
        MonitoringAlert,
        on_delete=models.SET_NULL,
        related_name="bullying_video_analyses",
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="bullying_video_analyses_created",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.source_video_name} - {self.result}"


class SecurityAlertHistory(models.Model):
    alert = models.ForeignKey(
        MonitoringAlert,
        on_delete=models.CASCADE,
        related_name="security_history_entries",
    )
    action = models.CharField(max_length=15, choices=SecurityAlertHistoryAction.choices)
    previous_status = models.CharField(
        max_length=12,
        choices=SecurityAlertStatus.choices,
        null=True,
        blank=True,
    )
    new_status = models.CharField(
        max_length=12,
        choices=SecurityAlertStatus.choices,
        null=True,
        blank=True,
    )
    comment = models.CharField(max_length=255, blank=True)
    changed_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        related_name="security_alert_history_entries",
        null=True,
        blank=True,
    )
    changed_at = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("-changed_at",)

    def __str__(self) -> str:
        return f"{self.alert.code} - {self.action}"


class MonitoringHistory(models.Model):
    child = models.ForeignKey(
        Child,
        on_delete=models.CASCADE,
        related_name="monitoring_history_entries",
    )
    location_record = models.ForeignKey(
        GeographicLocation,
        on_delete=models.CASCADE,
        related_name="monitoring_entries",
    )
    status = models.CharField(max_length=20, choices=MonitoringStatus.choices)
    reason = models.CharField(max_length=255)
    distance_to_perimeter_m = models.FloatField(null=True, blank=True)
    risk_zone = models.ForeignKey(
        RiskZone,
        on_delete=models.SET_NULL,
        related_name="monitoring_history_entries",
        null=True,
        blank=True,
    )
    alert = models.ForeignKey(
        MonitoringAlert,
        on_delete=models.SET_NULL,
        related_name="history_entries",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    additional_info = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.child.code} - {self.status}"


def refresh_child_tutor_reference(child: Child):
    tutor_names = list(
        child.tutors.filter(
            estado=TutorStatus.ACTIVO,
            child_tutor_associations__is_active=True,
        )
        .distinct()
        .order_by("nombres", "apellidos")
        .values_list("nombres", "apellidos")
    )
    child.tutor_reference = ", ".join(f"{nombres} {apellidos}" for nombres, apellidos in tutor_names)[:120]
    child.save(update_fields=["tutor_reference", "fecha_actualizacion"])


def sync_tutor_children_mirror(tutor: Tutor):
    active_child_ids = ChildTutorAssociation.objects.filter(tutor=tutor, is_active=True).values_list("child_id", flat=True)
    tutor.children.set(Child.objects.filter(id__in=active_child_ids))


def create_child_tutor_history(*, association: ChildTutorAssociation, action: str, detail: str, user=None):
    return ChildTutorAssociationHistory.objects.create(
        association=association,
        child=association.child,
        tutor=association.tutor,
        action=action,
        detail=detail,
        user=user,
    )


def deactivate_child_tutor_association(association: ChildTutorAssociation, user=None, detail: str = ""):
    if not association.is_active:
        return association

    association.is_active = False
    association.deactivated_at = timezone.now()
    association.deactivated_by = user
    association.save(update_fields=["is_active", "deactivated_at", "deactivated_by", "updated_at"])
    sync_tutor_children_mirror(association.tutor)
    refresh_child_tutor_reference(association.child)
    create_child_tutor_history(
        association=association,
        action=ChildTutorAssociationAction.ELIMINACION,
        detail=detail or "Asociación desactivada.",
        user=user,
    )
    return association
