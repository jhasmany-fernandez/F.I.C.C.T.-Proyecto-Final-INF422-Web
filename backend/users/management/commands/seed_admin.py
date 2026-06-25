import math
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from users.models import (
    Child,
    ChildStatus,
    ChildTutorAssociation,
    ChildTutorAssociationAction,
    EducationalCenter,
    GPSDevice,
    GPSDeviceStatus,
    MonitoringConfig,
    MobileAccountStatus,
    Module,
    ModuleCode,
    Permission,
    PermissionAction,
    RiskZone,
    RiskZoneSeverity,
    RiskZoneType,
    Role,
    RolePermission,
    SafeArea,
    SafeAreaHistory,
    SafeAreaHistoryAction,
    SafeAreaStatus,
    StudentGender,
    StudentLevel,
    StudentShift,
    Tutor,
    TutorStatus,
    UserRole,
    create_child_tutor_history,
    refresh_child_tutor_reference,
    sync_tutor_children_mirror,
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
    ("CE-001", "Centro Educativo San Martín", "Av. Principal #123", "70000001", "sanmartin@centro.com", "Mañana", "Centro activo con monitoreo.", True, "regente1@colegio.com"),
    ("CE-002", "Colegio Nacional Florida", "Calle Florida #456", "70000002", "florida@centro.com", "Tarde", "Centro con alta demanda escolar.", True, "regente2@colegio.com"),
    ("CE-003", "Unidad Educativa La Salle", "Av. La Salle #789", "70000003", "lasalle@centro.com", "Mañana", "Centro de referencia académica.", True, "regente3@colegio.com"),
    ("CE-004", "Centro Educativo Los Pinos", "Zona Norte #321", "70000004", "lospinos@centro.com", "Tarde", "Centro temporalmente inactivo.", False, ""),
    ("CE-005", "Colegio Técnico Santa Cruz", "Doble Vía La Guardia #654", "70000005", "tecnico@centro.com", "Noche", "Centro técnico sin regente asignado.", True, ""),
]

GPS_DEVICES = [
    ("GPS-001", "SER-001", "860000000001111", "70000001", "Teltonika", "FMB920", GPSDeviceStatus.ASIGNADO, 78, -17.783320, -63.182100, True),
    ("GPS-002", "SER-002", "860000000002222", "70000002", "Coban", "TK303G", GPSDeviceStatus.DISPONIBLE, 18, -17.784100, -63.181200, True),
    ("GPS-003", "SER-003", "860000000003333", "70000003", "Queclink", "GV300", GPSDeviceStatus.DISPONIBLE, 56, -17.781450, -63.180150, True),
    ("GPS-004", "SER-004", "860000000004444", "70000004", "Concox", "GT06N", GPSDeviceStatus.EN_MANTENIMIENTO, 34, None, None, True),
    ("GPS-005", "SER-005", "860000000005555", "70000005", "Jimi IoT", "VL802", GPSDeviceStatus.ASIGNADO, 15, -17.785200, -63.183410, True),
    ("GPS-006", "SER-006", "860000000006666", "", "Teltonika", "TMT250", GPSDeviceStatus.PERDIDO, 5, None, None, True),
]

CHILDREN = [
    ("María", "Fernández López", date(2016, 4, 12), StudentGender.FEMENINO, "CI-0001", "RUDE-0001", "5to", "A", StudentLevel.PRIMARIA, StudentShift.MANANA, "Barrio Norte 101", "70010001", "Rosa Fernández", "72100001", "CE-001", "GPS-001", ChildStatus.ACTIVO, ""),
    ("José", "Vargas Núñez", date(2015, 8, 3), StudentGender.MASCULINO, "CI-0002", "RUDE-0002", "6to", "B", StudentLevel.PRIMARIA, StudentShift.MANANA, "Barrio Norte 102", "70010002", "Carlos Vargas", "72100002", "CE-001", None, ChildStatus.ACTIVO, ""),
    ("Camila", "Rojas Pérez", date(2017, 2, 22), StudentGender.FEMENINO, "CI-0003", "RUDE-0003", "4to", "A", StudentLevel.PRIMARIA, StudentShift.TARDE, "Plan 3000 45", "70010003", "Ana Rojas", "72100003", "CE-002", "GPS-002", ChildStatus.ACTIVO, ""),
    ("Diego", "Mamani Flores", date(2014, 11, 17), StudentGender.MASCULINO, "CI-0004", "RUDE-0004", "1ro", "C", StudentLevel.SECUNDARIA, StudentShift.TARDE, "Villa Primero de Mayo", "70010004", "Luis Mamani", "72100004", "CE-002", None, ChildStatus.ACTIVO, ""),
    ("Luciana", "Guzmán Salazar", date(2016, 7, 9), StudentGender.FEMENINO, "CI-0005", "RUDE-0005", "5to", "B", StudentLevel.PRIMARIA, StudentShift.MANANA, "Av. Busch 120", "70010005", "Marta Guzmán", "72100005", "CE-003", None, ChildStatus.INACTIVO, "Cambio temporal de institución."),
    ("Mateo", "Suárez Rocha", date(2015, 12, 1), StudentGender.MASCULINO, "CI-0006", "RUDE-0006", "6to", "A", StudentLevel.PRIMARIA, StudentShift.NOCHE, "Zona Sur 12", "70010006", "Patricia Suárez", "72100006", "CE-003", None, ChildStatus.INACTIVO, "Mantenimiento preventivo del servicio."),
    ("Valentina", "Paredes Arias", date(2017, 5, 30), StudentGender.FEMENINO, "CI-0007", "RUDE-0007", "4to", "C", StudentLevel.PRIMARIA, StudentShift.MANANA, "Av. Alemana 300", "70010007", "Laura Paredes", "72100007", "CE-001", "GPS-005", ChildStatus.ACTIVO, ""),
    ("Thiago", "Quispe Molina", date(2014, 9, 14), StudentGender.MASCULINO, "CI-0008", "RUDE-0008", "1ro", "B", StudentLevel.SECUNDARIA, StudentShift.TARDE, "Distrito 8", "70010008", "Patricia Quispe", "72100008", "CE-002", None, ChildStatus.INACTIVO, "Solicitud administrativa."),
]

TUTORS = [
    ("María", "López García", "maria.lopez@gmail.com", "987 654 321", "Av. Siempre Viva 123", "Madre", TutorStatus.ACTIVO, MobileAccountStatus.ACTIVA, "maria.lopez@gmail.com", [2]),
    ("Carlos", "Pérez Ramírez", "carlos.perez@gmail.com", "789 456 123", "Calle Bolívar 456", "Padre", TutorStatus.ACTIVO, MobileAccountStatus.ACTIVA, "carlos.perez@gmail.com", [2]),
    ("Ana", "Torres Díaz", "ana.torres@gmail.com", "765 222 111", "Zona Norte 12", "Abuela", TutorStatus.ACTIVO, MobileAccountStatus.ACTIVA, "ana.torres@gmail.com", [3]),
    ("Laura", "Gómez Salazar", "laura.gomez@gmail.com", "700 111 999", "Barrio Central 55", "Tía", TutorStatus.ACTIVO, MobileAccountStatus.ACTIVA, "laura.gomez@gmail.com", [4, 7]),
    ("José", "Martínez Vargas", "jose.martinez@gmail.com", "733 888 000", "Av. Integración 80", "Padre", TutorStatus.INACTIVO, MobileAccountStatus.INACTIVA, "jose.martinez@gmail.com", [5]),
    ("Patricia", "Herrera Castillo", "patricia.herrera@gmail.com", "744 333 222", "Zona Sur 9", "Madre", TutorStatus.ACTIVO, MobileAccountStatus.ACTIVA, "patricia.herrera@gmail.com", [6, 8]),
    ("Miguel", "Sánchez Rojas", "miguel.sanchez@gmail.com", "711 222 444", "Villa Esperanza 21", "Tutor Legal", TutorStatus.ACTIVO, MobileAccountStatus.SIN_CUENTA, "", [3]),
]

SAFE_AREAS = [
    (
        "CE-001",
        "Área Segura Principal San Martín",
        {
            "type": "Polygon",
            "coordinates": [[
                [-84.090125, 9.928240],
                [-84.089654, 9.928312],
                [-84.089432, 9.928102],
                [-84.089654, 9.927765],
                [-84.089998, 9.927732],
                [-84.090210, 9.927910],
                [-84.090310, 9.928150],
                [-84.090125, 9.928240],
            ]],
        },
        "2856.45",
        "214.78",
        7,
    ),
    (
        "CE-002",
        "Área Segura Florida",
        {
            "type": "Polygon",
            "coordinates": [[
                [-63.182100, -17.783300],
                [-63.181600, -17.783100],
                [-63.181100, -17.783400],
                [-63.181000, -17.783950],
                [-63.181500, -17.784200],
                [-63.182000, -17.784100],
                [-63.182300, -17.783700],
                [-63.182100, -17.783300],
            ]],
        },
        "3120.10",
        "228.64",
        7,
    ),
]

RISK_ZONES = [
    (
        "CE-001",
        "Zona de tráfico alto San Martín",
        "Zona de circulación vehicular densa cercana al Centro Educativo San Martín.",
        RiskZoneType.TRAFICO,
        RiskZoneSeverity.ALTO,
        {
            "type": "Polygon",
            "coordinates": [[
                [-84.090900, 9.928900],
                [-84.090200, 9.929050],
                [-84.089950, 9.928450],
                [-84.090700, 9.928250],
                [-84.090900, 9.928900],
            ]],
        },
    ),
    (
        "CE-002",
        "Zona oscura Florida",
        "Sector con iluminación deficiente cercano al Colegio Nacional Florida.",
        RiskZoneType.ZONA_OSCURA,
        RiskZoneSeverity.MEDIO,
        {
            "type": "Polygon",
            "coordinates": [[
                [-63.182400, -17.783900],
                [-63.181900, -17.783750],
                [-63.181700, -17.784150],
                [-63.182250, -17.784320],
                [-63.182400, -17.783900],
            ]],
        },
    ),
    (
        None,
        "Zona general de delincuencia",
        "Área general reportada por vecinos con incidentes de delincuencia.",
        RiskZoneType.DELINCUENCIA,
        RiskZoneSeverity.ALTO,
        {
            "type": "Polygon",
            "coordinates": [[
                [-63.179500, -17.782800],
                [-63.178900, -17.782700],
                [-63.178700, -17.783250],
                [-63.179300, -17.783400],
                [-63.179500, -17.782800],
            ]],
        },
    ),
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
        regents = self._seed_regents(roles["Regente"])
        centers = self._seed_centers(regents)
        devices = self._seed_devices()
        self._seed_children(centers, devices)
        admin_user = self._seed_admin_user(roles["Administrador"])
        self._seed_tutors(admin_user, roles["Tutor"])
        self._seed_safe_areas(centers, admin_user)
        self._seed_risk_zones(centers, admin_user)
        self._seed_monitoring_config()
        self._seed_child_tutor_associations(admin_user)

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

    def _seed_regents(self, regent_role: Role):
        regents_data = [
            ("Regente Juan Pérez", "regente1@colegio.com"),
            ("Regente Marta Salvatierra", "regente2@colegio.com"),
            ("Regente Luis Roca", "regente3@colegio.com"),
        ]
        regents: dict[str, User] = {}
        for nombre, email in regents_data:
            regent, _ = User.objects.update_or_create(
                email=email,
                defaults={
                    "nombre": nombre,
                    "rol": UserRole.REGENTE,
                    "role": regent_role,
                    "is_active": True,
                    "is_staff": False,
                    "username": email,
                },
            )
            regent.set_password("12345678")
            regent.save()
            regents[email] = regent
        return regents

    def _seed_centers(self, regents: dict[str, User]):
        centers: dict[str, EducationalCenter] = {}
        for code, name, address, phone, email, shift, description, is_active, regent_email in EDUCATIONAL_CENTERS:
            center, _ = EducationalCenter.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "address": address,
                    "phone": phone,
                    "email": email,
                    "shift": shift,
                    "description": description,
                    "is_active": is_active,
                    "deactivation_reason": "" if is_active else "Centro cerrado temporalmente",
                    "regent": regents.get(regent_email) if regent_email else None,
                },
            )
            centers[code] = center
        return centers

    def _seed_devices(self):
        devices: dict[str, GPSDevice] = {}
        for code, serial_number, imei, phone_number, brand, model, status, battery_level, latitude, longitude, is_active in GPS_DEVICES:
            device, _ = GPSDevice.objects.update_or_create(
                code=code,
                defaults={
                    "serial_number": serial_number,
                    "imei": imei,
                    "phone_number": phone_number or None,
                    "brand": brand,
                    "model": model,
                    "status": status,
                    "battery_level": battery_level,
                    "last_latitude": latitude,
                    "last_longitude": longitude,
                    "is_active": is_active,
                },
            )
            devices[code] = device
        return devices

    def _seed_children(self, centers: dict[str, EducationalCenter], devices: dict[str, GPSDevice]):
        admin_user = User.objects.filter(email="admin@colegio.com").first()
        for index, child_data in enumerate(CHILDREN, start=1):
            (
                nombres,
                apellidos,
                fecha_nacimiento,
                genero,
                ci,
                rude,
                curso,
                paralelo,
                nivel,
                turno,
                direccion,
                telefono_contacto,
                nombre_contacto_emergencia,
                telefono_contacto_emergencia,
                center_code,
                gps_code,
                status,
                motivo,
            ) = child_data
            Child.objects.update_or_create(
                code=f"NIN-{index:04d}",
                defaults={
                    "nombres": nombres,
                    "apellidos": apellidos,
                    "fecha_nacimiento": fecha_nacimiento,
                    "genero": genero,
                    "ci": ci,
                    "rude": rude,
                    "curso": curso,
                    "paralelo": paralelo,
                    "nivel": nivel,
                    "turno": turno,
                    "direccion": direccion,
                    "telefono_contacto": telefono_contacto,
                    "nombre_contacto_emergencia": nombre_contacto_emergencia,
                    "telefono_contacto_emergencia": telefono_contacto_emergencia,
                    "centro_educativo": centers[center_code],
                    "dispositivo_gps": devices.get(gps_code) if gps_code else None,
                    "status": status,
                    "motivo_desactivacion": motivo,
                    "desactivado_en": timezone.now() if status == ChildStatus.INACTIVO else None,
                    "created_by": admin_user,
                    "updated_by": admin_user,
                },
            )

    def _seed_tutors(self, admin_user: User, tutor_role: Role):
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

            if correo_acceso:
                user, _ = User.objects.update_or_create(
                    email=correo_acceso,
                    defaults={
                        "nombre": f"{nombres} {apellidos}",
                        "rol": UserRole.TUTOR,
                        "role": tutor_role,
                        "is_active": cuenta_movil_estado == MobileAccountStatus.ACTIVA,
                        "is_staff": False,
                        "username": correo_acceso,
                    },
                )
                user.set_password("12345678")
                user.save()

    def _seed_child_tutor_associations(self, admin_user: User):
        expected_pairs: set[tuple[int, int]] = set()

        children_by_id = {child.id: child for child in Child.objects.all()}
        tutors_by_email = {tutor.correo_electronico: tutor for tutor in Tutor.objects.all()}

        for _, _, correo, _, _, _, _, _, _, child_ids in TUTORS:
            tutor = tutors_by_email.get(correo)
            if not tutor:
                continue

            for child_id in child_ids:
                child = children_by_id.get(child_id)
                if not child:
                    continue
                expected_pairs.add((child.id, tutor.id))
                is_active = child.status == ChildStatus.ACTIVO and tutor.estado == TutorStatus.ACTIVO
                association, created = ChildTutorAssociation.objects.update_or_create(
                    child=child,
                    tutor=tutor,
                    defaults={
                        "is_active": is_active,
                        "created_by": admin_user,
                        "deactivated_at": None if is_active else timezone.now(),
                        "deactivated_by": None if is_active else admin_user,
                    },
                )
                if created:
                    create_child_tutor_history(
                        association=association,
                        action=ChildTutorAssociationAction.CREACION,
                        detail="Asociación inicial cargada por seed.",
                        user=admin_user,
                    )

        for association in ChildTutorAssociation.objects.select_related("child", "tutor").all():
            if (association.child_id, association.tutor_id) in expected_pairs:
                continue
            association.is_active = False
            association.deactivated_at = timezone.now()
            association.deactivated_by = admin_user
            association.save(update_fields=["is_active", "deactivated_at", "deactivated_by", "updated_at"])
            sync_tutor_children_mirror(association.tutor)
        for tutor in Tutor.objects.all():
            sync_tutor_children_mirror(tutor)
        for child in Child.objects.all():
            refresh_child_tutor_reference(child)

    def _seed_safe_areas(self, centers: dict[str, EducationalCenter], admin_user: User):
        for center_code, name, polygon, area_m2, perimeter_m, points_count in SAFE_AREAS:
            center = centers[center_code]
            safe_area, _ = SafeArea.objects.update_or_create(
                educational_center=center,
                name=name,
                defaults={
                    "status": SafeAreaStatus.ACTIVA,
                    "polygon": polygon,
                    "area_m2": area_m2,
                    "perimeter_m": perimeter_m,
                    "points_count": points_count,
                    "created_by": admin_user,
                    "updated_by": admin_user,
                    "is_active": True,
                },
            )

            history_payloads = [
                (
                    SafeAreaHistoryAction.CREACION,
                    None,
                    polygon,
                    None,
                    area_m2,
                    None,
                    perimeter_m,
                    points_count,
                ),
                (
                    SafeAreaHistoryAction.ACTUALIZACION,
                    polygon,
                    polygon,
                    area_m2,
                    area_m2,
                    perimeter_m,
                    perimeter_m,
                    points_count,
                ),
            ]

            for index, (
                action,
                previous_polygon,
                new_polygon,
                previous_area_m2,
                new_area_m2,
                previous_perimeter_m,
                new_perimeter_m,
                points_count_value,
            ) in enumerate(history_payloads, start=1):
                SafeAreaHistory.objects.update_or_create(
                    safe_area=safe_area,
                    educational_center=center,
                    action=action,
                    points_count=points_count_value,
                    new_area_m2=new_area_m2,
                    defaults={
                        "previous_polygon": previous_polygon,
                        "new_polygon": new_polygon,
                        "previous_area_m2": previous_area_m2,
                        "new_area_m2": new_area_m2,
                        "previous_perimeter_m": previous_perimeter_m,
                        "new_perimeter_m": new_perimeter_m,
                        "user": admin_user,
                    },
                )

    def _quantize_measure(self, value: float):
        return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    def _quantize_coordinate(self, value: float):
        return Decimal(value).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)

    def _measure_polygon(self, polygon: dict):
        ring = polygon["coordinates"][0]
        unique_points = ring[:-1]
        mean_lat_rad = math.radians(sum(lat for _, lat in unique_points) / len(unique_points))
        origin_lng, origin_lat = unique_points[0]
        earth_radius = 6371000.0

        projected = []
        for lng, lat in unique_points:
            x = math.radians(lng - origin_lng) * earth_radius * math.cos(mean_lat_rad)
            y = math.radians(lat - origin_lat) * earth_radius
            projected.append((x, y))

        area = 0.0
        perimeter = 0.0
        for index, (x1, y1) in enumerate(projected):
            x2, y2 = projected[(index + 1) % len(projected)]
            area += x1 * y2 - x2 * y1
            perimeter += math.hypot(x2 - x1, y2 - y1)

        center_longitude = sum(point[0] for point in unique_points) / len(unique_points)
        center_latitude = sum(point[1] for point in unique_points) / len(unique_points)
        return {
            "area_m2": self._quantize_measure(abs(area) / 2),
            "perimeter_m": self._quantize_measure(perimeter),
            "center_longitude": self._quantize_coordinate(center_longitude),
            "center_latitude": self._quantize_coordinate(center_latitude),
        }

    def _seed_risk_zones(self, centers: dict[str, EducationalCenter], admin_user: User):
        for center_code, name, description, risk_type, severity, polygon in RISK_ZONES:
            measurements = self._measure_polygon(polygon)
            center = centers[center_code] if center_code else None
            risk_zone = RiskZone.objects.filter(educational_center=center, name=name).first()
            if risk_zone is None:
                risk_zone = RiskZone(educational_center=center, name=name, created_by=admin_user)

            risk_zone.description = description
            risk_zone.risk_type = risk_type
            risk_zone.severity = severity
            risk_zone.polygon = polygon
            risk_zone.center_latitude = measurements["center_latitude"]
            risk_zone.center_longitude = measurements["center_longitude"]
            risk_zone.area_m2 = measurements["area_m2"]
            risk_zone.perimeter_m = measurements["perimeter_m"]
            risk_zone.is_active = True
            risk_zone.deleted_at = None
            risk_zone.deleted_by = None
            risk_zone.updated_by = admin_user
            risk_zone.save()

        for zone in RiskZone.objects.all():
            if not zone.polygon:
                continue
            measurements = self._measure_polygon(zone.polygon)
            if zone.code and zone.center_latitude is not None and zone.center_longitude is not None and zone.area_m2 and zone.perimeter_m:
                continue
            zone.risk_type = zone.risk_type or RiskZoneType.OTRO
            zone.severity = {
                "ALTA": RiskZoneSeverity.ALTO,
                "MEDIA": RiskZoneSeverity.MEDIO,
                "BAJA": RiskZoneSeverity.BAJO,
            }.get(zone.severity, zone.severity)
            zone.center_latitude = measurements["center_latitude"]
            zone.center_longitude = measurements["center_longitude"]
            zone.area_m2 = measurements["area_m2"]
            zone.perimeter_m = measurements["perimeter_m"]
            zone.created_by = zone.created_by or admin_user
            zone.updated_by = admin_user
            zone.save()

    def _seed_monitoring_config(self):
        MonitoringConfig.objects.update_or_create(
            id=1,
            defaults={
                "min_time_between_alerts_min": 5,
                "min_distance_state_change_m": 10,
                "max_gps_accuracy_m": 50,
                "enable_risk_zones": True,
                "register_errors_as_pending": True,
            },
        )
