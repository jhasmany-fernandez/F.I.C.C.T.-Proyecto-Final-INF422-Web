from datetime import date

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from users.models import (
    Child,
    ChildStatus,
    EducationalCenter,
    GPSDevice,
    MobileAccountStatus,
    Module,
    ModuleCode,
    Permission,
    PermissionAction,
    Role,
    RolePermission,
    Tutor,
    TutorStatus,
    UserRole,
)

User = get_user_model()

MODULES = [
    ("Dashboard", ModuleCode.DASHBOARD),
    ("Usuarios", ModuleCode.USUARIOS),
    ("Estudiantes", ModuleCode.ESTUDIANTES),
    ("Regentes", ModuleCode.REGENTES),
    ("Tutores", ModuleCode.TUTORES),
    ("Reportes", ModuleCode.REPORTES),
    ("Configuración", ModuleCode.CONFIGURACION),
    ("Auditoría", ModuleCode.AUDITORIA),
    ("Perfil", ModuleCode.PERFIL),
]

ACTIONS = [
    PermissionAction.VER,
    PermissionAction.CREAR,
    PermissionAction.EDITAR,
    PermissionAction.ELIMINAR,
    PermissionAction.ACTIVAR,
    PermissionAction.DESACTIVAR,
    PermissionAction.CONSULTAR,
]

BASE_ROLES = [
    ("Administrador", "Control total del sistema.", True),
    ("Regente", "Gestión operativa institucional.", True),
    ("Tutor", "Acceso orientado a consulta y seguimiento.", True),
    ("Asistente", "Permisos administrativos limitados.", False),
    ("Invitado", "Acceso mínimo de solo lectura.", False),
]

EDUCATIONAL_CENTERS = [
    ("CE-001", "Centro Educativo San Martín"),
    ("CE-002", "Unidad Educativa Libertad"),
    ("CE-003", "Colegio Horizonte"),
]

GPS_DEVICES = [
    ("GPS-001", "Teltonika FMB920", "860000000001111"),
    ("GPS-002", "Coban TK303G", "860000000002222"),
    ("GPS-003", "Queclink GV300", "860000000003333"),
    ("GPS-004", "Concox GT06N", "860000000004444"),
    ("GPS-005", "Jimi IoT VL802", "860000000005555"),
    ("GPS-006", "Teltonika TMT250", "860000000006666"),
]

CHILDREN = [
    ("María", "Fernández López", date(2016, 4, 12), "5to Primaria", "CE-001", "GPS-001", ChildStatus.ACTIVO, ""),
    ("José", "Vargas Núñez", date(2015, 8, 3), "6to Primaria", "CE-001", "GPS-002", ChildStatus.ACTIVO, ""),
    ("Camila", "Rojas Pérez", date(2017, 2, 22), "4to Primaria", "CE-002", "GPS-003", ChildStatus.ACTIVO, ""),
    ("Diego", "Mamani Flores", date(2014, 11, 17), "1ro Secundaria", "CE-002", None, ChildStatus.ACTIVO, ""),
    ("Luciana", "Guzmán Salazar", date(2016, 7, 9), "5to Primaria", "CE-003", None, ChildStatus.INACTIVO, "Cambio temporal de institución."),
    ("Mateo", "Suárez Rocha", date(2015, 12, 1), "6to Primaria", "CE-003", "GPS-004", ChildStatus.INACTIVO, "Mantenimiento preventivo del servicio."),
    ("Valentina", "Paredes Arias", date(2017, 5, 30), "4to Primaria", "CE-001", "GPS-005", ChildStatus.ACTIVO, ""),
    ("Thiago", "Quispe Molina", date(2014, 9, 14), "1ro Secundaria", "CE-002", None, ChildStatus.INACTIVO, "Solicitud administrativa."),
]

TUTORS = [
    ("María", "López García", "maria.lopez@gmail.com", "987 654 321", "Av. Siempre Viva 123", "Madre", TutorStatus.ACTIVO, MobileAccountStatus.ACTIVA, "maria.lopez@gmail.com", [1, 2]),
    ("Carlos", "Pérez Ramírez", "carlos.perez@gmail.com", "789 456 123", "Calle Bolívar 456", "Padre", TutorStatus.ACTIVO, MobileAccountStatus.ACTIVA, "carlos.perez@gmail.com", [2]),
    ("Ana", "Torres Díaz", "ana.torres@gmail.com", "765 222 111", "Zona Norte 12", "Abuela", TutorStatus.ACTIVO, MobileAccountStatus.ACTIVA, "ana.torres@gmail.com", [3]),
    ("Laura", "Gómez Salazar", "laura.gomez@gmail.com", "700 111 999", "Barrio Central 55", "Tía", TutorStatus.ACTIVO, MobileAccountStatus.ACTIVA, "laura.gomez@gmail.com", [1, 4, 7]),
    ("José", "Martínez Vargas", "jose.martinez@gmail.com", "733 888 000", "Av. Integración 80", "Padre", TutorStatus.INACTIVO, MobileAccountStatus.INACTIVA, "jose.martinez@gmail.com", [5]),
    ("Patricia", "Herrera Castillo", "patricia.herrera@gmail.com", "744 333 222", "Zona Sur 9", "Madre", TutorStatus.ACTIVO, MobileAccountStatus.ACTIVA, "patricia.herrera@gmail.com", [6, 8]),
    ("Miguel", "Sánchez Rojas", "miguel.sanchez@gmail.com", "711 222 444", "Villa Esperanza 21", "Tutor Legal", TutorStatus.ACTIVO, MobileAccountStatus.SIN_CUENTA, "", [3]),
]


class Command(BaseCommand):
    help = "Crea módulos, permisos, roles base, catálogos y datos de prueba."

    @transaction.atomic
    def handle(self, *args, **options):
        modules_by_code: dict[str, Module] = {}
        permissions_by_code: dict[str, Permission] = {}

        for name, code in MODULES:
            module, _ = Module.objects.update_or_create(code=code, defaults={"name": name, "is_active": True})
            modules_by_code[code] = module

        for _, code in MODULES:
            module = modules_by_code[code]
            for action in ACTIONS:
                permission_code = f"{module.code}.{action}"
                permission, _ = Permission.objects.update_or_create(
                    code=permission_code,
                    defaults={"module": module, "action": action},
                )
                permissions_by_code[permission_code] = permission

        roles: dict[str, Role] = {}
        for name, description, is_active in BASE_ROLES:
            role, _ = Role.objects.update_or_create(
                name=name,
                defaults={"description": description, "is_active": is_active},
            )
            roles[name] = role

        self._sync_role_permissions(roles, permissions_by_code)
        centers = self._seed_centers()
        devices = self._seed_devices()
        self._seed_children(centers, devices)
        admin_user = self._seed_admin_user(roles["Administrador"])
        self._seed_tutors(admin_user)

    def _seed_admin_user(self, admin_role: Role):
        user, created = User.objects.update_or_create(
            email="admin@colegio.com",
            defaults={
                "nombre": "Administrador",
                "rol": UserRole.ADMIN,
                "role": admin_role,
                "is_active": True,
                "is_staff": True,
                "username": "admin@colegio.com",
            },
        )
        user.set_password("12345678")
        user.save()
        self.stdout.write(self.style.SUCCESS("Usuario administrador creado." if created else "Usuario administrador actualizado."))
        return user

    def _sync_role_permissions(self, roles: dict[str, Role], permissions_by_code: dict[str, Permission]):
        mapping = {
            "Administrador": list(permissions_by_code.keys()),
            "Regente": [
                code
                for code in permissions_by_code.keys()
                if not code.startswith("configuracion.")
                and not code.startswith("auditoria.eliminar")
                and not code.startswith("usuarios.eliminar")
            ],
            "Tutor": [code for code in permissions_by_code.keys() if code.endswith(".ver") or code.endswith(".consultar")],
            "Asistente": [
                code
                for code in permissions_by_code.keys()
                if code.startswith(("dashboard.", "usuarios.", "reportes.", "perfil."))
                and not code.endswith(".eliminar")
            ],
            "Invitado": [code for code in permissions_by_code.keys() if code.startswith("dashboard.") and code.endswith(".consultar")],
        }

        for role_name, permission_codes in mapping.items():
            role = roles[role_name]
            RolePermission.objects.filter(role=role).delete()
            RolePermission.objects.bulk_create(
                [RolePermission(role=role, permission=permissions_by_code[permission_code]) for permission_code in permission_codes]
            )

    def _seed_centers(self):
        centers: dict[str, EducationalCenter] = {}
        for code, name in EDUCATIONAL_CENTERS:
            center, _ = EducationalCenter.objects.update_or_create(
                code=code,
                defaults={"name": name, "is_active": True},
            )
            centers[code] = center
        return centers

    def _seed_devices(self):
        devices: dict[str, GPSDevice] = {}
        for code, model, imei in GPS_DEVICES:
            device, _ = GPSDevice.objects.update_or_create(
                code=code,
                defaults={"model": model, "imei": imei, "is_active": True},
            )
            devices[code] = device
        return devices

    def _seed_children(self, centers: dict[str, EducationalCenter], devices: dict[str, GPSDevice]):
        for index, (nombres, apellidos, fecha_nacimiento, curso, center_code, gps_code, status, motivo) in enumerate(CHILDREN, start=1):
            Child.objects.update_or_create(
                code=f"NIN-{index:04d}",
                defaults={
                    "nombres": nombres,
                    "apellidos": apellidos,
                    "fecha_nacimiento": fecha_nacimiento,
                    "curso": curso,
                    "centro_educativo": centers[center_code],
                    "dispositivo_gps": devices.get(gps_code) if gps_code else None,
                    "status": status,
                    "motivo_desactivacion": motivo,
                },
            )

    def _seed_tutors(self, admin_user: User):
        children_by_id = {child.id: child for child in Child.objects.all()}
        for tutor_data in TUTORS:
            (
                nombres,
                apellidos,
                correo,
                telefono,
                direccion,
                parentesco,
                estado,
                cuenta_movil_estado,
                correo_acceso,
                child_ids,
            ) = tutor_data
            tutor, _ = Tutor.objects.update_or_create(
                correo_electronico=correo,
                defaults={
                    "nombres": nombres,
                    "apellidos": apellidos,
                    "telefono": telefono,
                    "direccion": direccion,
                    "parentesco": parentesco,
                    "estado": estado,
                    "cuenta_movil_estado": cuenta_movil_estado,
                    "correo_acceso": correo_acceso,
                    "motivo_desactivacion": "Sin acceso móvil temporal." if estado == TutorStatus.INACTIVO else "",
                    "creado_por": admin_user,
                    "actualizado_por": admin_user,
                },
            )
            tutor.children.set([children_by_id[child_id] for child_id in child_ids if child_id in children_by_id])
