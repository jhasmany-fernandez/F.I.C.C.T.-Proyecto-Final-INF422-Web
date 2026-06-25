import logging
import json
import math
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, time, timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.utils.dateparse import parse_date, parse_datetime, parse_time
from django.utils import timezone
from rest_framework import parsers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    AccessControlRecord,
    AccessControlRecordType,
    AlertType,
    BullyingVideoAnalysis,
    BullyingVideoAnalysisResult,
    Child,
    ChildStatus,
    StudentHistory,
    StudentHistoryAction,
    ChildTutorAssociation,
    ChildTutorAssociationAction,
    EducationalCenter,
    GeographicLocation,
    GPSDevice,
    GPSDeviceHistory,
    GPSDeviceHistoryAction,
    GPSDeviceStatus,
    LocationDeliveryStatus,
    MonitoringAlert,
    MonitoringConfig,
    MonitoringHistory,
    MonitoringStatus,
    SecurityAlertHistory,
    SecurityAlertHistoryAction,
    SecurityAlertPriority,
    SecurityAlertStatus,
    PickupRecord,
    MobileAccountStatus,
    Module,
    Permission,
    RiskZone,
    Role,
    RolePermission,
    SafeArea,
    SafeAreaHistory,
    SafeAreaHistoryAction,
    SafeAreaStatus,
    Tutor,
    TutorStatus,
    User,
    UserRole,
    create_child_tutor_history,
    deactivate_child_tutor_association,
    refresh_child_tutor_reference,
    sync_tutor_children_mirror,
)
from .permissions import IsAdminOrRegentRole, IsAdminRole, IsMobileRole, IsMonitoringRole
from .serializers import (
    AccessControlRecordRegisterSerializer,
    AccessControlRecordSerializer,
    BullyingVideoAnalysisSerializer,
    BullyingVideoSimulationProcessSerializer,
    BullyingVideoUploadSerializer,
    MobileDeviceTokenSerializer,
    ChildDetailSerializer,
    ChildListSerializer,
    ChildStatusSerializer,
    StudentDetailSerializer,
    StudentHistorySerializer,
    StudentListSerializer,
    StudentStatusSerializer,
    StudentWriteSerializer,
    ChildTutorAssociationCreateSerializer,
    ChildTutorAssociationHistorySerializer,
    ChildTutorAssociationSerializer,
    ChildWriteSerializer,
    EducationalCenterCreateUpdateSerializer,
    EducationalCenterDetailSerializer,
    EducationalCenterOptionSerializer,
    EducationalCenterStatusSerializer,
    EducationalCenterSerializer,
    GeographicLocationHistorySerializer,
    GeographicLocationRegisterSerializer,
    GeographicLocationSerializer,
    GPSDeviceHistorySerializer,
    GPSDeviceSerializer,
    GPSDeviceStatusSerializer,
    GPSDeviceWriteSerializer,
    LoginSerializer,
    MonitoringAnalyzeSerializer,
    MonitoringConfigSerializer,
    MonitoringCurrentStatusSerializer,
    PickupConfirmSerializer,
    PickupRecordSerializer,
    SecurityAlertCreateSerializer,
    SecurityAlertHistorySerializer,
    SecurityAlertStatusSerializer,
    MonitoringHistorySerializer,
    ModuleSerializer,
    PermissionSerializer,
    RegentDetailSerializer,
    RegentEducationalCenterSerializer,
    RegentListSerializer,
    RegentOptionSerializer,
    RegentStatusSerializer,
    RegentWriteSerializer,
    RoleDetailSerializer,
    RoleListSerializer,
    RiskZoneCreateUpdateSerializer,
    RiskZonePolygonPayloadSerializer,
    RoleStatusSerializer,
    RoleWriteSerializer,
    RiskZoneSerializer,
    RiskZoneStatusSerializer,
    SafeAreaCreateUpdateSerializer,
    SafeAreaDetailSerializer,
    SafeAreaHistorySerializer,
    SafeAreaPolygonPayloadSerializer,
    SafeAreaSerializer,
    SafeAreaStatusSerializer,
    TutorChildrenUpdateSerializer,
    TutorChildSerializer,
    TutorDetailSerializer,
    TutorListSerializer,
    TutorStatusSerializer,
    TutorWriteSerializer,
    UserDetailSerializer,
    UserListSerializer,
    UserStatusSerializer,
    UserWriteSerializer,
)

User = get_user_model()
logger = logging.getLogger(__name__)

try:
    import firebase_admin
    from firebase_admin import credentials, messaging
except Exception:  # pragma: no cover
    firebase_admin = None
    credentials = None
    messaging = None


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        client_platform = (request.headers.get("X-Client-Platform") or "web").strip().lower()
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": "Datos incompletos o inválidos.", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]

        try:
            user = User.objects.select_related("role").filter(email__iexact=email).first()
            if user is None:
                return Response({"message": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)
            if not user.check_password(password):
                return Response({"message": "Contraseña incorrecta."}, status=status.HTTP_401_UNAUTHORIZED)
            if not user.is_active:
                return Response({"message": "Tu cuenta se encuentra inactiva."}, status=status.HTTP_403_FORBIDDEN)

            if client_platform == "mobile" and user.rol not in {UserRole.TUTOR, UserRole.REGENTE}:
                return Response({"message": "Rol no autorizado para acceso móvil."}, status=status.HTTP_403_FORBIDDEN)

            if client_platform != "mobile" and user.rol not in {UserRole.ADMIN, UserRole.REGENTE}:
                return Response({"message": "Rol no autorizado para acceso web."}, status=status.HTTP_403_FORBIDDEN)

            refresh = RefreshToken.for_user(user)
            return Response(
                {
                    "message": "Inicio de sesión exitoso.",
                    "token": {"access": str(refresh.access_token), "refresh": str(refresh)},
                    "access_token": str(refresh.access_token),
                    "user": {
                        "id": user.id,
                        "email": user.email,
                        "nombre": user.nombre,
                        "rol": user.rol,
                        "role": user.role_name,
                    },
                },
                status=status.HTTP_200_OK,
            )
        except Exception:
            logger.exception("Login failed for email=%s platform=%s", email, client_platform)
            return Response({"message": "Ocurrió un error interno controlado."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class BaseAdminView(APIView):
    permission_classes = [IsAdminRole]

    def extract_error_message(self, errors):
        if isinstance(errors, dict):
            for value in errors.values():
                if isinstance(value, list) and value:
                    return str(value[0])
                if isinstance(value, dict):
                    nested = self.extract_error_message(value)
                    if nested:
                        return nested
        return "Error al guardar. Intente nuevamente."


class BaseMobileView(APIView):
    permission_classes = [IsMobileRole]


class BaseMonitoringView(APIView):
    permission_classes = [IsMonitoringRole]


class BaseAdminOrRegentView(BaseAdminView):
    permission_classes = [IsAdminOrRegentRole]


def quantize_measure(value: float) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def quantize_coordinate(value: float) -> Decimal:
    return Decimal(value).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


def parse_polygon_payload(polygon: dict):
    if not polygon:
        raise ValueError("El polígono es obligatorio.")
    if not isinstance(polygon, dict) or polygon.get("type") != "Polygon":
        raise ValueError("GeoJSON inválido.")
    coordinates = polygon.get("coordinates")
    if not isinstance(coordinates, list) or not coordinates or not isinstance(coordinates[0], list):
        raise ValueError("GeoJSON inválido.")

    ring = coordinates[0]
    if len(ring) < 4:
        raise ValueError("El polígono debe tener al menos 3 puntos.")

    normalized: list[tuple[float, float]] = []
    for point in ring:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            raise ValueError("Coordenadas inválidas o incompletas.")
        longitude, latitude = point
        try:
            lng = float(longitude)
            lat = float(latitude)
        except (TypeError, ValueError):
            raise ValueError("Coordenadas inválidas o incompletas.")
        if lat < -90 or lat > 90 or lng < -180 or lng > 180:
            raise ValueError("Coordenadas inválidas o incompletas.")
        normalized.append((lng, lat))

    if normalized[0] != normalized[-1]:
        raise ValueError("El polígono debe estar cerrado correctamente.")

    unique_points = normalized[:-1]
    if len(unique_points) < 3:
        raise ValueError("El polígono debe tener al menos 3 puntos.")
    return normalized


def calculate_polygon_metrics(points: list[tuple[float, float]]):
    unique_points = points[:-1]
    mean_lat_rad = math.radians(sum(lat for _, lat in unique_points) / len(unique_points))
    origin_lng, origin_lat = unique_points[0]
    earth_radius = 6371000.0

    projected: list[tuple[float, float]] = []
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

    area = abs(area) / 2
    quantized_area = quantize_measure(area)
    quantized_perimeter = quantize_measure(perimeter)

    # Reject polygons that collapse into a line or a point after normalization.
    if quantized_area <= Decimal("0.00"):
        raise ValueError("El área del polígono no puede ser 0 m².")
    if quantized_perimeter <= Decimal("0.00"):
        raise ValueError("El perímetro del polígono no puede ser 0 m.")

    return {
        "area_m2": quantized_area,
        "perimeter_m": quantized_perimeter,
        "points_count": len(unique_points),
        "is_valid": True,
    }


class UserListCreateView(BaseAdminView):
    def get(self, request):
        try:
            queryset = User.objects.select_related("role").all()

            search = request.query_params.get("search", "").strip()
            role = request.query_params.get("role", "").strip().upper()
            is_active = request.query_params.get("is_active", "").strip().lower()

            if search:
                queryset = queryset.filter(
                    Q(nombre__icontains=search) | Q(last_name__icontains=search) | Q(email__icontains=search)
                )
            if role in {UserRole.ADMIN, UserRole.REGENTE, UserRole.TUTOR}:
                queryset = queryset.filter(rol=role)
            if is_active in {"true", "false", "activo", "inactivo"}:
                queryset = queryset.filter(is_active=is_active in {"true", "activo"})

            total = queryset.count()
            page = max(int(request.query_params.get("page", "1") or 1), 1)
            page_size = max(min(int(request.query_params.get("page_size", "10") or 10), 100), 1)
            start = (page - 1) * page_size
            end = start + page_size
            items = queryset.order_by("-date_joined", "-id")[start:end]
            total_pages = (total + page_size - 1) // page_size if total else 1

            return Response(
                {
                    "count": total,
                    "page": page,
                    "page_size": page_size,
                    "total_pages": total_pages,
                    "results": UserListSerializer(items, many=True).data,
                },
                status=status.HTTP_200_OK,
            )
        except Exception:
            logger.exception("User list failed")
            return Response({"message": "No se pudo cargar la lista de usuarios."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def post(self, request):
        try:
            serializer = UserWriteSerializer(data=request.data)
            if not serializer.is_valid():
                return Response(
                    {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user = serializer.save()
            detail = self._get_detail(user.id)
            return Response(UserDetailSerializer(detail).data, status=status.HTTP_201_CREATED)
        except IntegrityError:
            return Response(
                {
                    "message": "Ya existe un usuario con ese correo electrónico.",
                    "errors": {"email": ["Ya existe un usuario con ese correo electrónico."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            logger.exception("User create failed")
            return Response({"message": "Error al guardar. Intente nuevamente."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_detail(self, user_id: int):
        return User.objects.select_related("role").get(pk=user_id)


class UserDetailView(BaseAdminView):
    def get_object(self, user_id: int):
        return User.objects.select_related("role").filter(pk=user_id).first()

    def get(self, request, user_id: int):
        try:
            user = self.get_object(user_id)
            if not user:
                return Response({"message": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)
            return Response(UserDetailSerializer(user).data, status=status.HTTP_200_OK)
        except Exception:
            logger.exception("User detail failed for user_id=%s", user_id)
            return Response({"message": "No se pudo cargar el detalle del usuario."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def put(self, request, user_id: int):
        try:
            user = self.get_object(user_id)
            if not user:
                return Response({"message": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)

            serializer = UserWriteSerializer(instance=user, data=request.data)
            if not serializer.is_valid():
                return Response(
                    {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            updated_user = serializer.save()
            detail = self.get_object(updated_user.id)
            return Response(UserDetailSerializer(detail).data, status=status.HTTP_200_OK)
        except IntegrityError:
            return Response(
                {
                    "message": "Ya existe un usuario con ese correo electrónico.",
                    "errors": {"email": ["Ya existe un usuario con ese correo electrónico."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            logger.exception("User update failed for user_id=%s", user_id)
            return Response({"message": "Error al guardar. Intente nuevamente."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request, user_id: int):
        user = self.get_object(user_id)
        if not user:
            return Response({"message": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        if request.user.id == user.id:
            return Response({"message": "No puede desactivar su propio usuario."}, status=status.HTTP_400_BAD_REQUEST)

        user.is_active = False
        user.save(update_fields=["is_active"])
        detail = self.get_object(user.id)
        return Response(
            {
                "message": "Usuario inactivado correctamente.",
                "user": UserDetailSerializer(detail).data,
            },
            status=status.HTTP_200_OK,
        )


class UserStatusView(BaseAdminView):
    def patch(self, request, user_id: int):
        user = User.objects.select_related("role").filter(pk=user_id).first()
        if not user:
            return Response({"message": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UserStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        next_status = serializer.validated_data["is_active"]
        if request.user.id == user.id and not next_status:
            return Response({"message": "No puede desactivar su propio usuario."}, status=status.HTTP_400_BAD_REQUEST)

        user.is_active = next_status
        user.save(update_fields=["is_active"])
        detail = User.objects.select_related("role").get(pk=user_id)
        return Response(UserDetailSerializer(detail).data, status=status.HTTP_200_OK)


class UserStatsView(BaseAdminView):
    def get(self, request):
        try:
            queryset = User.objects.all()
            return Response(
                {
                    "total_usuarios": queryset.count(),
                    "activos": queryset.filter(is_active=True).count(),
                    "inactivos": queryset.filter(is_active=False).count(),
                    "administradores": queryset.filter(rol=UserRole.ADMIN).count(),
                    "regentes": queryset.filter(rol=UserRole.REGENTE).count(),
                    "tutores": queryset.filter(rol=UserRole.TUTOR).count(),
                },
                status=status.HTTP_200_OK,
            )
        except Exception:
            logger.exception("User stats failed")
            return Response({"message": "No se pudieron cargar las estadísticas de usuarios."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def validate_and_measure_polygon(polygon: dict):
    points = parse_polygon_payload(polygon)
    metrics = calculate_polygon_metrics(points)
    return {
        "polygon": {"type": "Polygon", "coordinates": [[list(point) for point in points]]},
        **metrics,
    }


def calculate_polygon_center(points: list[tuple[float, float]]):
    unique_points = points[:-1]
    longitude = sum(point[0] for point in unique_points) / len(unique_points)
    latitude = sum(point[1] for point in unique_points) / len(unique_points)
    return {
        "center_longitude": quantize_coordinate(longitude),
        "center_latitude": quantize_coordinate(latitude),
    }


def filter_pickups_by_date(queryset, raw_date: str | None):
    if not raw_date:
        return queryset, None

    selected_date = parse_date(raw_date)
    if selected_date is None:
        return None, "La fecha enviada es inválida. Use el formato YYYY-MM-DD."

    current_tz = timezone.get_current_timezone()
    start_of_day = timezone.make_aware(datetime.combine(selected_date, time.min), current_tz)
    end_of_day = start_of_day + timedelta(days=1)
    return queryset.filter(confirmed_at__gte=start_of_day, confirmed_at__lt=end_of_day), None


def filter_access_records_by_date(queryset, raw_date: str | None):
    if not raw_date:
        return queryset, None

    selected_date = parse_date(raw_date)
    if selected_date is None:
        return None, "La fecha enviada es inválida. Use el formato YYYY-MM-DD."

    current_tz = timezone.get_current_timezone()
    start_of_day = timezone.make_aware(datetime.combine(selected_date, time.min), current_tz)
    end_of_day = start_of_day + timedelta(days=1)
    return queryset.filter(recorded_at__gte=start_of_day, recorded_at__lt=end_of_day), None


def create_safe_area_history(
    *,
    safe_area: SafeArea | None,
    educational_center: EducationalCenter,
    action: str,
    user,
    previous_polygon=None,
    new_polygon=None,
    previous_area_m2=None,
    new_area_m2=None,
    previous_perimeter_m=None,
    new_perimeter_m=None,
    points_count: int = 0,
):
    SafeAreaHistory.objects.create(
        safe_area=safe_area,
        educational_center=educational_center,
        action=action,
        previous_polygon=previous_polygon,
        new_polygon=new_polygon,
        previous_area_m2=previous_area_m2,
        new_area_m2=new_area_m2,
        previous_perimeter_m=previous_perimeter_m,
        new_perimeter_m=new_perimeter_m,
        points_count=points_count,
        user=user,
    )


def point_inside_polygon(longitude: float, latitude: float, polygon: dict) -> bool:
    coordinates = polygon.get("coordinates", [])
    if not coordinates or not coordinates[0]:
        return False

    ring = coordinates[0]
    is_inside = False
    previous_index = len(ring) - 1

    for index, current in enumerate(ring):
        current_lng, current_lat = current
        previous_lng, previous_lat = ring[previous_index]

        intersects = ((current_lat > latitude) != (previous_lat > latitude)) and (
            longitude
            < (previous_lng - current_lng) * (latitude - current_lat) / ((previous_lat - current_lat) or 1e-12)
            + current_lng
        )
        if intersects:
            is_inside = not is_inside
        previous_index = index

    return is_inside


def create_gps_device_history(
    *,
    gps_device: GPSDevice,
    action: str,
    user=None,
    detail: str = "",
    previous_status: str = "",
    new_status: str = "",
    previous_child: Child | None = None,
    new_child: Child | None = None,
    previous_is_active: bool | None = None,
    new_is_active: bool | None = None,
):
    GPSDeviceHistory.objects.create(
        gps_device=gps_device,
        action=action,
        user=user,
        detail=detail,
        previous_status=previous_status,
        new_status=new_status,
        previous_child=previous_child,
        new_child=new_child,
        previous_is_active=previous_is_active,
        new_is_active=new_is_active,
    )


def get_client_ip(request) -> str | None:
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def mobile_error_response(message: str, code: str, status_code: int, details: dict | None = None):
    payload = {
        "success": False,
        "message": message,
        "code": code,
    }
    if details:
        payload["details"] = details
    return Response(payload, status=status_code)


def get_mobile_children_scope(user: User):
    queryset = Child.objects.select_related("centro_educativo", "dispositivo_gps")

    if user.rol == UserRole.REGENTE:
        return queryset.filter(centro_educativo__regent=user).distinct()

    if user.rol == UserRole.TUTOR:
        tutor = Tutor.objects.filter(correo_acceso__iexact=user.email).first()
        if tutor is None:
            return Child.objects.none()
        return queryset.filter(
            tutors=tutor,
            child_tutor_associations__tutor=tutor,
            child_tutor_associations__is_active=True,
        ).distinct()

    return Child.objects.none()


def get_mobile_accessible_children(user: User, *, include_inactive: bool = False):
    queryset = get_mobile_children_scope(user)
    if not include_inactive:
        queryset = queryset.filter(status=ChildStatus.ACTIVO)
    return queryset.filter(
        dispositivo_gps__isnull=False,
        dispositivo_gps__is_active=True,
    ).distinct()


def get_active_safe_area(child: Child):
    return (
        SafeArea.objects.filter(
            educational_center=child.centro_educativo,
            status=SafeAreaStatus.ACTIVA,
            is_active=True,
        )
        .order_by("-updated_at")
        .first()
    )


def get_monitoring_config() -> MonitoringConfig:
    config = MonitoringConfig.objects.order_by("id").first()
    if config:
        return config
    return MonitoringConfig.objects.create()


def get_monitoring_accessible_children(user: User):
    if user.rol == UserRole.ADMIN:
        return Child.objects.select_related("centro_educativo", "dispositivo_gps").all()
    return get_mobile_accessible_children(user)


def get_active_risk_zones(child: Child):
    return RiskZone.objects.filter(
        Q(educational_center=child.centro_educativo) | Q(educational_center__isnull=True),
        deleted_at__isnull=True,
        is_active=True,
    ).order_by("name")


def distance_meters_between_points(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_radius = 6371000.0
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    value = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2
    )
    return 2 * earth_radius * math.atan2(math.sqrt(value), math.sqrt(max(1 - value, 0)))


def project_point(longitude: float, latitude: float, origin_lng: float, origin_lat: float, mean_lat_rad: float):
    earth_radius = 6371000.0
    x = math.radians(longitude - origin_lng) * earth_radius * math.cos(mean_lat_rad)
    y = math.radians(latitude - origin_lat) * earth_radius
    return x, y


def distance_point_to_segment(point, segment_start, segment_end) -> float:
    px, py = point
    x1, y1 = segment_start
    x2, y2 = segment_end
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(px - x1, py - y1)
    ratio = ((px - x1) * dx + (py - y1) * dy) / ((dx * dx) + (dy * dy))
    ratio = max(0.0, min(1.0, ratio))
    closest_x = x1 + ratio * dx
    closest_y = y1 + ratio * dy
    return math.hypot(px - closest_x, py - closest_y)


def distance_to_polygon_perimeter_m(longitude: float, latitude: float, polygon: dict) -> float | None:
    coordinates = polygon.get("coordinates", [])
    if not coordinates or not coordinates[0]:
        return None

    ring = coordinates[0]
    if len(ring) < 2:
        return None

    latitudes = [point[1] for point in ring]
    mean_lat_rad = math.radians(sum(latitudes) / len(latitudes))
    origin_lng, origin_lat = ring[0]
    projected_ring = [project_point(lng, lat, origin_lng, origin_lat, mean_lat_rad) for lng, lat in ring]
    projected_point = project_point(longitude, latitude, origin_lng, origin_lat, mean_lat_rad)

    min_distance = None
    for index in range(len(projected_ring) - 1):
        distance = distance_point_to_segment(
            projected_point,
            projected_ring[index],
            projected_ring[index + 1],
        )
        if min_distance is None or distance < min_distance:
            min_distance = distance
    return round(min_distance, 2) if min_distance is not None else None


def get_alert_type_for_status(status_value: str) -> str | None:
    if status_value == MonitoringStatus.FUERA_AREA:
        return AlertType.SALIDA_AREA_SEGURA
    if status_value == MonitoringStatus.ZONA_RIESGO:
        return AlertType.INGRESO_ZONA_RIESGO
    if status_value == MonitoringStatus.ERROR:
        return AlertType.ERROR_MONITOREO
    return None


def get_security_alert_priority(status_value: str, risk_zone: RiskZone | None = None) -> str:
    if status_value == MonitoringStatus.ZONA_RIESGO and risk_zone is not None:
        if risk_zone.severity == "INFORMATIVO":
            return SecurityAlertPriority.BAJA
        severity_map = {
            "ALTO": SecurityAlertPriority.ALTA,
            "MEDIO": SecurityAlertPriority.MEDIA,
            "BAJO": SecurityAlertPriority.BAJA,
            "ALTA": SecurityAlertPriority.ALTA,
            "MEDIA": SecurityAlertPriority.MEDIA,
            "BAJA": SecurityAlertPriority.BAJA,
        }
        return severity_map.get(risk_zone.severity, SecurityAlertPriority.MEDIA)
    if status_value == MonitoringStatus.FUERA_AREA:
        return SecurityAlertPriority.ALTA
    if status_value == MonitoringStatus.ERROR:
        return SecurityAlertPriority.MEDIA
    return SecurityAlertPriority.BAJA


def get_security_alert_title(alert_type: str) -> str:
    return {
        AlertType.SALIDA_AREA_SEGURA: "Salida del área segura",
        AlertType.INGRESO_ZONA_RIESGO: "Ingreso a zona de riesgo",
        AlertType.ERROR_MONITOREO: "Error de monitoreo",
        AlertType.BULLYING_DETECTADO: "Bullying detectado",
    }.get(alert_type, "Alerta de seguridad")


def get_bullying_simulation_directory() -> Path:
    directory = Path(settings.BULLYING_SIMULATION_DIR)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def get_bullying_simulation_children_scope(user: User):
    queryset = Child.objects.select_related("centro_educativo", "dispositivo_gps").filter(status=ChildStatus.ACTIVO)
    if user.rol == UserRole.ADMIN:
        return queryset
    if user.rol == UserRole.REGENTE:
        return queryset.filter(centro_educativo__regent=user)
    return Child.objects.none()


def list_bullying_simulation_video_paths():
    directory = get_bullying_simulation_directory()
    allowed_extensions = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
    return [
        path
        for path in sorted(directory.rglob("*"))
        if path.is_file() and path.suffix.lower() in allowed_extensions
    ]


def load_bullying_simulation_metadata(video_path: Path):
    metadata_path = video_path.with_suffix(".json")
    if not metadata_path.exists():
        return {}
    try:
        data = json.loads(metadata_path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        logger.warning("No se pudo leer metadata de simulacion para %s", video_path)
        return {}


def infer_bullying_simulation_result(video_path: Path, metadata: dict):
    valid_results = {choice for choice, _ in BullyingVideoAnalysisResult.choices}
    result = metadata.get("result")
    if result not in valid_results:
        filename = video_path.stem.lower()
        keywords = ("bullying", "bulling", "pelea", "agresion", "violencia", "acoso", "fight")
        result = (
            BullyingVideoAnalysisResult.BULLYING_DETECTADO
            if any(keyword in filename for keyword in keywords)
            else BullyingVideoAnalysisResult.NORMAL
        )

    confidence = metadata.get("confidence")
    if not isinstance(confidence, (int, float)):
        confidence = 0.93 if result == BullyingVideoAnalysisResult.BULLYING_DETECTADO else 0.16

    event_timestamp_seconds = metadata.get("event_timestamp_seconds")
    if not isinstance(event_timestamp_seconds, int) or event_timestamp_seconds < 0:
        event_timestamp_seconds = 18 if result == BullyingVideoAnalysisResult.BULLYING_DETECTADO else None

    summary = (metadata.get("summary") or "").strip()
    if not summary:
        summary = (
            "Posible agresión física detectada en el aula durante la simulación."
            if result == BullyingVideoAnalysisResult.BULLYING_DETECTADO
            else "No se detectaron eventos compatibles con bullying en el video analizado."
        )

    priority = metadata.get("priority")
    valid_priorities = {choice for choice, _ in SecurityAlertPriority.choices}
    if priority not in valid_priorities:
        priority = (
            SecurityAlertPriority.ALTA
            if result == BullyingVideoAnalysisResult.BULLYING_DETECTADO
            else SecurityAlertPriority.BAJA
        )

    return {
        "result": result,
        "confidence": round(float(confidence), 2),
        "event_timestamp_seconds": event_timestamp_seconds,
        "summary": summary,
        "priority": priority,
        "classroom": (metadata.get("classroom") or "").strip(),
        "raw_metadata": metadata,
    }


def serialize_bullying_simulation_video(video_path: Path):
    directory = get_bullying_simulation_directory()
    metadata = load_bullying_simulation_metadata(video_path)
    inferred = infer_bullying_simulation_result(video_path, metadata)
    relative_name = video_path.relative_to(directory).as_posix()
    metadata_path = video_path.with_suffix(".json")
    return {
        "name": relative_name,
        "size_bytes": video_path.stat().st_size,
        "metadata_file": metadata_path.name if metadata_path.exists() else None,
        "expected_result": inferred["result"],
        "confidence_hint": inferred["confidence"],
        "summary_hint": inferred["summary"],
        "classroom": inferred["classroom"],
    }


def resolve_bullying_simulation_video(video_name: str):
    normalized = Path(video_name).as_posix().lstrip("/")
    directory = get_bullying_simulation_directory()
    for video_path in list_bullying_simulation_video_paths():
        if video_path.relative_to(directory).as_posix() == normalized:
            return video_path
    return None


def get_or_create_simulation_location(*, child: Child, user: User):
    location = GeographicLocation.objects.filter(child=child).order_by("-device_timestamp", "-created_at").first()
    if location is not None:
        return location

    gps_device = child.dispositivo_gps
    if gps_device is None:
        device_code = f"SIM-{child.code}".upper()[:40]
        gps_device, _ = GPSDevice.objects.update_or_create(
            code=device_code,
            defaults={
                "serial_number": f"SIM-{child.code}".upper()[:80],
                "model": "GPS Demo Simulacion",
                "imei": f"990{child.id:012d}"[:30],
                "status": GPSDeviceStatus.ASIGNADO,
                "battery_level": 100,
                "is_active": True,
                "created_by": user,
                "updated_by": user,
            },
        )
        if child.dispositivo_gps_id != gps_device.id:
            child.dispositivo_gps = gps_device
            child.updated_by = user
            child.save(update_fields=["dispositivo_gps", "updated_by", "fecha_actualizacion"])

    center = child.centro_educativo
    base_latitude = center.latitude if center and center.latitude is not None else Decimal("-17.783327")
    base_longitude = center.longitude if center and center.longitude is not None else Decimal("-63.182140")
    offset = Decimal(child.id % 10) * Decimal("0.0001")

    latitude = (Decimal(base_latitude) + offset).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
    longitude = (Decimal(base_longitude) + offset).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
    now = timezone.now()

    return GeographicLocation.objects.create(
        device=gps_device,
        child=child,
        latitude=latitude,
        longitude=longitude,
        precision=8.0,
        speed=0.0,
        device_timestamp=now,
        delivery_status=LocationDeliveryStatus.ENVIADO,
        inside_safe_area=True,
        created_by=user,
        source_host="simulation-video",
    )


def get_firebase_admin_app():
    if firebase_admin is None or credentials is None:
        return None
    try:
        return firebase_admin.get_app()
    except ValueError:
        credential_path = Path(settings.FIREBASE_ADMIN_CREDENTIALS)
        if not credential_path.exists():
            logger.warning("No se encontró la credencial Firebase Admin: %s", credential_path)
            return None
        try:
            return firebase_admin.initialize_app(credentials.Certificate(str(credential_path)))
        except Exception:
            logger.exception("No se pudo inicializar Firebase Admin")
            return None


def send_bullying_notification_to_regent(*, alert: MonitoringAlert):
    if messaging is None:
        return
    educational_center = alert.educational_center or alert.child.centro_educativo
    regent = educational_center.regent if educational_center else None
    token = (regent.mobile_push_token or "").strip() if regent else ""
    if not token:
        return

    app = get_firebase_admin_app()
    if app is None:
        return

    classroom = ""
    if isinstance(alert.metadata, dict):
        classroom = str(alert.metadata.get("classroom") or "").strip()

    title = "Alerta de bullying detectada"
    body_parts = [alert.child.nombre_completo]
    if classroom:
        body_parts.append(classroom)
    body = " / ".join(body_parts)

    try:
        messaging.send(
            messaging.Message(
                token=token,
                notification=messaging.Notification(
                    title=title,
                    body=body,
                ),
                data={
                    "type": "BULLYING_DETECTADO",
                    "alert_id": str(alert.id),
                    "child_id": str(alert.child_id),
                    "educational_center_id": str(educational_center.id if educational_center else ""),
                    "classroom": classroom,
                },
                android=messaging.AndroidConfig(priority="high"),
            ),
            app=app,
        )
    except Exception:
        logger.exception("No se pudo enviar push FCM al regente para alerta %s", alert.id)


def execute_bullying_simulation_analysis(*, child: Child, video_path: Path, user: User):
    location = get_or_create_simulation_location(child=child, user=user)

    monitoring_history = MonitoringHistory.objects.filter(
        child=child,
        location_record=location,
    ).order_by("-created_at").first()
    metadata = load_bullying_simulation_metadata(video_path)
    inferred = infer_bullying_simulation_result(video_path, metadata)

    generated_alert = None
    if inferred["result"] == BullyingVideoAnalysisResult.BULLYING_DETECTADO:
        config = get_monitoring_config()
        cutoff = timezone.now() - timedelta(minutes=config.min_time_between_alerts_min)
        generated_alert = MonitoringAlert.objects.filter(
            child=child,
            alert_type=AlertType.BULLYING_DETECTADO,
            detected_at__gte=cutoff,
            is_active=True,
        ).order_by("-created_at").first()

        if generated_alert is None:
            event_datetime = timezone.now()
            if inferred["event_timestamp_seconds"] is not None:
                event_datetime = location.device_timestamp + timedelta(seconds=inferred["event_timestamp_seconds"])
            generated_alert = MonitoringAlert.objects.create(
                child=child,
                educational_center=child.centro_educativo,
                gps_device=child.dispositivo_gps,
                location_record=location,
                monitoring_history=monitoring_history,
                risk_zone=monitoring_history.risk_zone if monitoring_history else None,
                alert_type=AlertType.BULLYING_DETECTADO,
                priority=inferred["priority"],
                workflow_status=SecurityAlertStatus.PENDIENTE,
                title=get_security_alert_title(AlertType.BULLYING_DETECTADO),
                description=inferred["summary"],
                reason=inferred["summary"],
                status=monitoring_history.status if monitoring_history else MonitoringStatus.PENDIENTE,
                latitude=location.latitude,
                longitude=location.longitude,
                accuracy=location.precision,
                speed=location.speed,
                event_datetime=event_datetime,
                detected_at=timezone.now(),
                created_by=user,
                active=True,
                is_active=True,
                metadata={
                    "simulation_source": "video_folder",
                    "video_name": video_path.name,
                    "video_relative_path": video_path.relative_to(get_bullying_simulation_directory()).as_posix(),
                    "event_timestamp_seconds": inferred["event_timestamp_seconds"],
                    "confidence": inferred["confidence"],
                    "classroom": inferred["classroom"],
                },
            )
            create_security_alert_history(
                alert=generated_alert,
                action=SecurityAlertHistoryAction.CREADA,
                previous_status=None,
                new_status=SecurityAlertStatus.PENDIENTE,
                comment="Alerta generada automáticamente por simulación de bullying en video.",
                changed_by=user,
                metadata={"simulation": True, "video_name": video_path.name},
            )
            send_bullying_notification_to_regent(alert=generated_alert)
        if monitoring_history and monitoring_history.alert_id is None:
            monitoring_history.alert = generated_alert
            monitoring_history.save(update_fields=["alert"])

    analysis = BullyingVideoAnalysis.objects.create(
        child=child,
        educational_center=child.centro_educativo,
        source_video_name=video_path.name,
        source_video_path=video_path.relative_to(get_bullying_simulation_directory()).as_posix(),
        source_folder=str(get_bullying_simulation_directory()),
        result=inferred["result"],
        confidence=inferred["confidence"],
        event_timestamp_seconds=inferred["event_timestamp_seconds"],
        summary=inferred["summary"],
        metadata={
            **inferred["raw_metadata"],
            "classroom": inferred["classroom"],
            "priority": inferred["priority"],
        },
        generated_alert=generated_alert,
        created_by=user,
    )
    return analysis, generated_alert, None


def get_security_alerts_scope(user: User):
    queryset = MonitoringAlert.objects.select_related(
        "child",
        "educational_center",
        "gps_device",
        "location_record",
        "monitoring_history",
        "risk_zone",
        "attended_by",
        "closed_by",
    ).filter(is_active=True)

    if user.rol == UserRole.ADMIN:
        return queryset

    if user.rol == UserRole.REGENTE:
        return queryset.filter(educational_center__regent=user)

    if user.rol == UserRole.TUTOR:
        tutor = Tutor.objects.filter(correo_acceso__iexact=user.email).first()
        if tutor is None:
            return MonitoringAlert.objects.none()
        return queryset.filter(
            child__tutors=tutor,
            child__child_tutor_associations__tutor=tutor,
            child__child_tutor_associations__is_active=True,
        ).distinct()

    return MonitoringAlert.objects.none()


def get_security_alert_by_access(user: User, alert_id: int):
    alert = MonitoringAlert.objects.select_related(
        "child",
        "educational_center",
        "gps_device",
        "location_record",
        "monitoring_history",
        "risk_zone",
        "attended_by",
        "closed_by",
    ).filter(id=alert_id, is_active=True).first()
    if alert is None:
        return None, Response({"message": "Alerta no encontrada."}, status=status.HTTP_404_NOT_FOUND)
    if not get_security_alerts_scope(user).filter(id=alert_id).exists():
        return None, Response(
            {"message": "No tienes permisos para visualizar esta alerta."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return alert, None


def create_security_alert_history(
    *,
    alert: MonitoringAlert,
    action: str,
    previous_status: str | None,
    new_status: str | None,
    comment: str = "",
    changed_by=None,
    metadata: dict | None = None,
):
    return SecurityAlertHistory.objects.create(
        alert=alert,
        action=action,
        previous_status=previous_status,
        new_status=new_status,
        comment=comment,
        changed_by=changed_by,
        metadata=metadata or {},
    )


def serialize_security_alert_history_entry(entry: SecurityAlertHistory):
    return SecurityAlertHistorySerializer(entry).data


def build_security_alert_payload(alert: MonitoringAlert):
    code = alert.code or f"AL-{alert.id:06d}"
    educational_center = alert.educational_center or alert.child.centro_educativo
    gps_device = alert.gps_device or alert.child.dispositivo_gps
    event_datetime = alert.event_datetime or alert.detected_at or alert.created_at
    priority = alert.priority or get_security_alert_priority(alert.status, alert.risk_zone)
    title = alert.title or get_security_alert_title(alert.alert_type)
    description = alert.description or alert.reason
    return {
        "id": alert.id,
        "code": code,
        "child": {
            "id": alert.child_id,
            "full_name": f"{alert.child.nombres} {alert.child.apellidos}",
        },
        "educational_center": {
            "id": educational_center.id if educational_center else None,
            "name": educational_center.name if educational_center else "",
        },
        "gps_device": {
            "id": gps_device.id if gps_device else None,
            "code": gps_device.code if gps_device else None,
        },
        "location": {
            "id": alert.location_record_id,
            "latitude": float(alert.location_record.latitude),
            "longitude": float(alert.location_record.longitude),
        },
        "monitoring": {
            "id": alert.monitoring_history_id,
            "estado": alert.status,
            "distancia_perimetro_m": (
                alert.monitoring_history.distance_to_perimeter_m
                if alert.monitoring_history
                else None
            ),
        },
        "risk_zone": (
            {
                "id": alert.risk_zone_id,
                "name": alert.risk_zone.name,
                "severity": alert.risk_zone.severity,
            }
            if alert.risk_zone
            else None
        ),
        "alert_type": alert.alert_type,
        "priority": priority,
        "status": alert.workflow_status,
        "title": title,
        "description": description,
        "latitude": float(alert.latitude),
        "longitude": float(alert.longitude),
        "accuracy": alert.accuracy,
        "speed": alert.speed,
        "event_datetime": event_datetime,
        "detected_at": alert.detected_at,
        "attended_at": alert.attended_at,
        "attended_by": alert.attended_by.nombre if alert.attended_by else None,
        "closed_at": alert.closed_at,
        "closed_by": alert.closed_by.nombre if alert.closed_by else None,
        "created_at": alert.created_at,
        "updated_at": alert.updated_at,
        "is_active": alert.is_active,
        "active": alert.active,
        "metadata": alert.metadata,
    }


def build_security_alert_list_payload(alert: MonitoringAlert):
    payload = build_security_alert_payload(alert)
    return {
        "id": payload["id"],
        "code": payload["code"],
        "child": payload["child"],
        "educational_center": payload["educational_center"],
        "alert_type": payload["alert_type"],
        "priority": payload["priority"],
        "status": payload["status"],
        "latitude": payload["latitude"],
        "longitude": payload["longitude"],
        "event_datetime": payload["event_datetime"],
        "created_at": payload["created_at"],
        "title": payload["title"],
        "description": payload["description"],
    }


def update_security_alert_status(
    *,
    alert: MonitoringAlert,
    new_status: str,
    comment: str,
    user,
):
    previous_status = alert.workflow_status
    if previous_status == new_status:
        return alert

    alert.workflow_status = new_status
    if new_status == SecurityAlertStatus.ATENDIDA:
        alert.attended_at = timezone.now()
        alert.attended_by = user
        alert.active = True
    elif new_status == SecurityAlertStatus.CERRADA:
        alert.closed_at = timezone.now()
        alert.closed_by = user
        alert.active = False
    elif new_status == SecurityAlertStatus.PENDIENTE:
        alert.active = True
    alert.save()

    action = {
        SecurityAlertStatus.ATENDIDA: SecurityAlertHistoryAction.ATENDIDA,
        SecurityAlertStatus.CERRADA: SecurityAlertHistoryAction.CERRADA,
        SecurityAlertStatus.PENDIENTE: SecurityAlertHistoryAction.REABIERTA,
    }[new_status]
    create_security_alert_history(
        alert=alert,
        action=action,
        previous_status=previous_status,
        new_status=new_status,
        comment=comment,
        changed_by=user,
    )
    return alert


def resolve_monitoring_for_location(location: GeographicLocation):
    child = location.child
    config = get_monitoring_config()
    safe_area = get_active_safe_area(child)
    inside_safe_area = location.inside_safe_area
    if safe_area and inside_safe_area is None:
        inside_safe_area = point_inside_polygon(float(location.longitude), float(location.latitude), safe_area.polygon)

    if location.precision > config.max_gps_accuracy_m:
        return {
            "status": MonitoringStatus.PENDIENTE if config.register_errors_as_pending else MonitoringStatus.ERROR,
            "reason": f"Precisión GPS insuficiente ({location.precision:.2f} m).",
            "safe_area": safe_area,
            "inside_safe_area": inside_safe_area,
            "distance_to_perimeter_m": None,
            "risk_zone": None,
        }

    if safe_area is None:
        return {
            "status": MonitoringStatus.PENDIENTE,
            "reason": "No existe un área segura activa para el niño.",
            "safe_area": None,
            "inside_safe_area": None,
            "distance_to_perimeter_m": None,
            "risk_zone": None,
        }

    risk_zone = None
    if config.enable_risk_zones:
        for zone in get_active_risk_zones(child):
            if point_inside_polygon(float(location.longitude), float(location.latitude), zone.polygon):
                risk_zone = zone
                break

    distance_to_perimeter_m = distance_to_polygon_perimeter_m(
        float(location.longitude),
        float(location.latitude),
        safe_area.polygon,
    )

    if risk_zone is not None:
        return {
            "status": MonitoringStatus.ZONA_RIESGO,
            "reason": f"El niño ingresó a la zona de riesgo {risk_zone.name}.",
            "safe_area": safe_area,
            "inside_safe_area": inside_safe_area,
            "distance_to_perimeter_m": distance_to_perimeter_m,
            "risk_zone": risk_zone,
        }

    if inside_safe_area is True:
        return {
            "status": MonitoringStatus.SEGURO,
            "reason": "El niño se encuentra dentro del área segura.",
            "safe_area": safe_area,
            "inside_safe_area": True,
            "distance_to_perimeter_m": distance_to_perimeter_m,
            "risk_zone": None,
        }

    return {
        "status": MonitoringStatus.FUERA_AREA,
        "reason": "El niño se encuentra fuera del área segura.",
        "safe_area": safe_area,
        "inside_safe_area": False,
        "distance_to_perimeter_m": distance_to_perimeter_m,
        "risk_zone": None,
    }


def ensure_monitoring_history(location: GeographicLocation):
    existing = (
        MonitoringHistory.objects.select_related("risk_zone", "alert", "location_record", "child")
        .filter(location_record=location)
        .first()
    )
    if existing:
        return existing

    monitoring_data = resolve_monitoring_for_location(location)
    config = get_monitoring_config()
    status_value = monitoring_data["status"]
    reason = monitoring_data["reason"]
    alert = None
    alert_type = get_alert_type_for_status(status_value)

    if status_value == MonitoringStatus.SEGURO:
        active_alerts = MonitoringAlert.objects.filter(
            child=location.child,
            is_active=True,
            workflow_status__in=[SecurityAlertStatus.PENDIENTE, SecurityAlertStatus.ATENDIDA],
        )
        for active_alert in active_alerts:
            previous_status = active_alert.workflow_status
            active_alert.workflow_status = SecurityAlertStatus.CERRADA
            active_alert.active = False
            active_alert.closed_at = timezone.now()
            active_alert.save(
                update_fields=["workflow_status", "active", "closed_at", "updated_at"]
            )
            create_security_alert_history(
                alert=active_alert,
                action=SecurityAlertHistoryAction.CERRADA,
                previous_status=previous_status,
                new_status=SecurityAlertStatus.CERRADA,
                comment="Cierre automático al volver a estado seguro.",
                changed_by=None,
                metadata={"automatico": True},
            )

    if alert_type:
        cutoff = timezone.now() - timedelta(minutes=config.min_time_between_alerts_min)
        recent_alert = MonitoringAlert.objects.filter(
            child=location.child,
            alert_type=alert_type,
            reason=reason,
            detected_at__gte=cutoff,
            is_active=True,
        ).first()
        if recent_alert is None:
            alert = MonitoringAlert.objects.create(
                child=location.child,
                educational_center=location.child.centro_educativo,
                gps_device=location.device,
                location_record=location,
                alert_type=alert_type,
                priority=get_security_alert_priority(status_value, monitoring_data["risk_zone"]),
                workflow_status=SecurityAlertStatus.PENDIENTE,
                title=get_security_alert_title(alert_type),
                description=reason,
                reason=reason,
                status=status_value,
                latitude=location.latitude,
                longitude=location.longitude,
                accuracy=location.precision,
                speed=location.speed,
                event_datetime=location.device_timestamp,
                detected_at=timezone.now(),
                risk_zone=monitoring_data["risk_zone"],
                active=True,
                is_active=True,
                metadata={
                    "safe_area_id": monitoring_data["safe_area"].id if monitoring_data["safe_area"] else None,
                    "inside_safe_area": monitoring_data["inside_safe_area"],
                    "delivery_status": location.delivery_status,
                },
            )
            create_security_alert_history(
                alert=alert,
                action=SecurityAlertHistoryAction.CREADA,
                previous_status=None,
                new_status=SecurityAlertStatus.PENDIENTE,
                comment="Alerta generada automáticamente.",
                changed_by=None,
                metadata={"automatico": True},
            )
        else:
            alert = recent_alert

    history = MonitoringHistory.objects.create(
        child=location.child,
        location_record=location,
        status=status_value,
        reason=reason,
        distance_to_perimeter_m=monitoring_data["distance_to_perimeter_m"],
        risk_zone=monitoring_data["risk_zone"],
        alert=alert,
        additional_info={
            "safe_area_id": monitoring_data["safe_area"].id if monitoring_data["safe_area"] else None,
            "inside_safe_area": monitoring_data["inside_safe_area"],
            "precision": location.precision,
            "delivery_status": location.delivery_status,
        },
    )
    if alert and alert.monitoring_history_id is None:
        alert.monitoring_history = history
        alert.save(update_fields=["monitoring_history", "updated_at"])
    return history


MOBILE_LOCATION_TIMEOUT_MINUTES = 15


def get_child_by_access(user: User, child_id: int):
    child = Child.objects.select_related("centro_educativo", "dispositivo_gps").filter(id=child_id).first()
    if child is None:
        return None, mobile_error_response(
            "Niño no encontrado",
            "NINO_NO_ENCONTRADO",
            status.HTTP_404_NOT_FOUND,
            {"nino_id": child_id},
        )

    if not get_mobile_children_scope(user).filter(id=child_id).exists():
        return None, mobile_error_response(
            "No tienes permisos para visualizar la ubicación de este niño.",
            "ROL_NO_PERMITIDO",
            status.HTTP_403_FORBIDDEN,
            {"nino_id": child_id},
        )
    return child, None


def polygon_centroid(polygon: dict):
    coordinates = polygon.get("coordinates", [])
    if not coordinates or not coordinates[0]:
        return None
    ring = coordinates[0]
    if len(ring) < 2:
        return None
    points = ring[:-1] if ring[0] == ring[-1] else ring
    if not points:
        return None
    longitude = sum(point[0] for point in points) / len(points)
    latitude = sum(point[1] for point in points) / len(points)
    return {
        "latitude": round(latitude, 6),
        "longitude": round(longitude, 6),
    }


def get_child_last_location(child: Child):
    return (
        GeographicLocation.objects.select_related("device", "child")
        .filter(child=child)
        .order_by("-device_timestamp", "-created_at")
        .first()
    )


def map_status_descriptor(code: str, *, reason: str | None = None, distance_to_safe_area_m=None):
    mapping = {
        "SEGURO": ("Seguro", "Dentro del área segura"),
        "FUERA_DEL_AREA": ("Fuera del área", "El niño está fuera del área segura"),
        "ZONA_DE_RIESGO": ("Zona de riesgo", "El niño está dentro de una zona de riesgo activa"),
        "SIN_UBICACION": ("Sin ubicación", "No hay ubicaciones recientes disponibles para este niño."),
        "DISPOSITIVO_DESCONECTADO": ("Sin conexión", "El dispositivo GPS no está enviando ubicaciones."),
        "SIN_AREA_SEGURA": ("Sin área segura", "No hay área segura configurada para el centro educativo."),
    }
    label, default_description = mapping.get(code, ("Pendiente", "Estado no disponible"))
    payload = {
        "code": code,
        "label": label,
        "description": reason or default_description,
        "distance_to_safe_area_m": distance_to_safe_area_m or 0,
    }
    return payload


def get_map_state_for_child(child: Child):
    last_location = get_child_last_location(child)
    safe_area = get_active_safe_area(child)
    risk_zones = list(get_active_risk_zones(child))
    active_alerts = list(
        MonitoringAlert.objects.filter(child=child, active=True)
        .select_related("location_record")
        .order_by("-created_at")
    )

    if last_location is None:
        return {
            "last_location": None,
            "safe_area": safe_area,
            "risk_zones": risk_zones,
            "status": map_status_descriptor("SIN_UBICACION"),
            "active_alerts": active_alerts,
            "monitoring_entry": None,
        }

    now = timezone.now()
    if now - last_location.device_timestamp > timedelta(minutes=MOBILE_LOCATION_TIMEOUT_MINUTES):
        return {
            "last_location": last_location,
            "safe_area": safe_area,
            "risk_zones": risk_zones,
            "status": map_status_descriptor(
                "DISPOSITIVO_DESCONECTADO",
                reason="El dispositivo GPS no está enviando ubicaciones.",
            ),
            "active_alerts": active_alerts,
            "monitoring_entry": None,
        }

    if safe_area is None:
        return {
            "last_location": last_location,
            "safe_area": None,
            "risk_zones": risk_zones,
            "status": map_status_descriptor("SIN_AREA_SEGURA"),
            "active_alerts": active_alerts,
            "monitoring_entry": None,
        }

    monitoring_entry = ensure_monitoring_history(last_location)
    status_code = {
        MonitoringStatus.SEGURO: "SEGURO",
        MonitoringStatus.FUERA_AREA: "FUERA_DEL_AREA",
        MonitoringStatus.ZONA_RIESGO: "ZONA_DE_RIESGO",
        MonitoringStatus.PENDIENTE: "SIN_UBICACION",
        MonitoringStatus.ERROR: "DISPOSITIVO_DESCONECTADO",
    }.get(monitoring_entry.status, "SIN_UBICACION")

    return {
        "last_location": last_location,
        "safe_area": safe_area,
        "risk_zones": risk_zones,
        "status": map_status_descriptor(
            status_code,
            reason=monitoring_entry.reason,
            distance_to_safe_area_m=monitoring_entry.distance_to_perimeter_m or 0,
        ),
        "active_alerts": active_alerts,
        "monitoring_entry": monitoring_entry,
    }


def build_child_card_payload(child: Child):
    map_state = get_map_state_for_child(child)
    last_location = map_state["last_location"]
    return {
        "id": child.id,
        "full_name": f"{child.nombres} {child.apellidos}",
        "course": child.curso,
        "educational_center": child.centro_educativo.name,
        "photo_url": child.foto.url if child.foto else None,
        "connection_status": "En línea" if map_state["status"]["code"] not in {"SIN_UBICACION", "DISPOSITIVO_DESCONECTADO"} else "Sin conexión",
        "last_updated_at": last_location.device_timestamp if last_location else None,
        "status": map_state["status"],
    }


def build_map_summary_payload(child: Child):
    map_state = get_map_state_for_child(child)
    last_location = map_state["last_location"]
    safe_area = map_state["safe_area"]
    center = child.centro_educativo
    center_point = None
    if center.latitude is not None and center.longitude is not None:
        center_point = {
            "latitude": float(center.latitude),
            "longitude": float(center.longitude),
        }
    elif safe_area is not None:
        center_point = polygon_centroid(safe_area.polygon)

    recent_locations = list(
        GeographicLocation.objects.filter(child=child)
        .order_by("-device_timestamp", "-created_at")[:10]
    )
    recent_path = []
    for location in reversed(recent_locations):
        monitoring_entry = MonitoringHistory.objects.filter(location_record=location).order_by("-created_at").first()
        status_code = "SEGURO"
        if monitoring_entry is not None:
            status_code = {
                MonitoringStatus.SEGURO: "SEGURO",
                MonitoringStatus.FUERA_AREA: "FUERA_DEL_AREA",
                MonitoringStatus.ZONA_RIESGO: "ZONA_DE_RIESGO",
                MonitoringStatus.PENDIENTE: "SIN_UBICACION",
                MonitoringStatus.ERROR: "DISPOSITIVO_DESCONECTADO",
            }.get(monitoring_entry.status, "SEGURO")
        recent_path.append(
            {
                "latitude": float(location.latitude),
                "longitude": float(location.longitude),
                "recorded_at": location.device_timestamp,
                "status": status_code,
                "accuracy": location.precision,
                "speed": location.speed,
            }
        )

    return {
        "child": {
            "id": child.id,
            "code": child.code,
            "full_name": f"{child.nombres} {child.apellidos}",
            "grade": child.curso,
            "birth_date": child.fecha_nacimiento,
            "age": child.edad,
            "photo_url": child.foto.url if child.foto else None,
            "gps_device": {
                "code": child.dispositivo_gps.code if child.dispositivo_gps else None,
                "status": "activo" if child.dispositivo_gps and child.dispositivo_gps.is_active else "inactivo",
            },
        },
        "educational_center": {
            "id": center.id,
            "name": center.name,
            "address": center.address,
            "latitude": center_point["latitude"] if center_point else None,
            "longitude": center_point["longitude"] if center_point else None,
        },
        "current_location": (
            {
                "latitude": float(last_location.latitude),
                "longitude": float(last_location.longitude),
                "recorded_at": last_location.device_timestamp,
                "accuracy": last_location.precision,
                "speed": last_location.speed,
                "source": "GPS",
            }
            if last_location
            else None
        ),
        "safe_area": (
            {
                "id": safe_area.id,
                "name": safe_area.name,
                "polygon": safe_area.polygon,
            }
            if safe_area
            else None
        ),
        "risk_zones": [
            {
                "id": zone.id,
                "name": zone.name,
                "risk_level": zone.severity.lower(),
                "polygon": zone.polygon,
            }
            for zone in map_state["risk_zones"]
        ],
        "status": map_state["status"],
        "recent_path": recent_path,
        "active_alerts": [
            {
                "id": alert.id,
                "type": alert.alert_type,
                "title": alert.alert_type.replace("_", " ").title(),
                "description": alert.reason,
                "created_at": alert.created_at,
                "status": "activa" if alert.active else "cerrada",
                "distance_m": next(
                    (
                        entry.distance_to_perimeter_m
                        for entry in MonitoringHistory.objects.filter(alert=alert).order_by("-created_at")[:1]
                    ),
                    None,
                ),
            }
            for alert in map_state["active_alerts"]
        ],
    }


def format_duration(seconds_total: float) -> str:
    seconds_total = max(0, int(seconds_total))
    hours, remainder = divmod(seconds_total, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def build_location_code(location: GeographicLocation) -> str:
    return f"LOC-{location.device_timestamp:%Y}-{location.id:09d}"


def parse_history_datetime(value: str | None, *, end_of_day: bool = False):
    if not value:
        return None
    parsed = parse_datetime(value)
    if parsed is not None:
        return parsed
    parsed_date = parse_date(value)
    if parsed_date is not None:
        target_time = time(23, 59, 59) if end_of_day else time(0, 0, 0)
        return datetime.combine(parsed_date, target_time, tzinfo=timezone.get_current_timezone())
    return None


def build_history_map_context(child: Child):
    safe_area = get_active_safe_area(child)
    return {
        "child_id": child.id,
        "safe_area": (
            {
                "id": safe_area.id,
                "name": safe_area.name,
                "polygon": safe_area.polygon,
            }
            if safe_area
            else None
        ),
        "risk_zones": [
            {
                "id": zone.id,
                "name": zone.name,
                "severity": zone.severity,
                "polygon": zone.polygon,
            }
            for zone in get_active_risk_zones(child)
        ],
    }


def build_location_detail_payload(location: GeographicLocation):
    monitoring_entry = (
        MonitoringHistory.objects.select_related("risk_zone", "alert", "child")
        .filter(location_record=location)
        .order_by("-created_at")
        .first()
    )
    if monitoring_entry is None:
        monitoring_entry = ensure_monitoring_history(location)

    return {
        "id": location.id,
        "location_code": build_location_code(location),
        "child": {
            "id": location.child.id,
            "nombre_completo": f"{location.child.nombres} {location.child.apellidos}",
        },
        "fecha_hora": location.device_timestamp,
        "estado_monitoreo": monitoring_entry.status,
        "latitude": float(location.latitude),
        "longitude": float(location.longitude),
        "accuracy": location.precision,
        "speed": location.speed,
        "device_code": location.device.code,
        "source": "Dispositivo GPS",
        "direccion_aproximada": location.source_host or "No disponible",
        "observacion": monitoring_entry.reason,
        "distancia_perimetro_m": monitoring_entry.distance_to_perimeter_m,
        "zona_riesgo": (
            {
                "id": monitoring_entry.risk_zone.id,
                "name": monitoring_entry.risk_zone.name,
            }
            if monitoring_entry.risk_zone
            else None
        ),
        "alerta": (
            {
                "id": monitoring_entry.alert.id,
                "code": f"ALT-{monitoring_entry.alert.created_at:%Y}-{monitoring_entry.alert.id:07d}",
                "tipo": monitoring_entry.alert.alert_type,
                "activa": monitoring_entry.alert.active,
            }
            if monitoring_entry.alert
            else None
        ),
    }


class RoleListCreateView(BaseAdminView):
    def get(self, request):
        queryset = Role.objects.annotate(
            users_count=Count("users", distinct=True),
            permissions_count=Count("role_permissions", distinct=True),
        )

        search = request.query_params.get("search", "").strip()
        state = request.query_params.get("is_active", "").strip().lower()
        created_at = request.query_params.get("created_at", "").strip()

        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(description__icontains=search))
        if state in {"true", "false"}:
            queryset = queryset.filter(is_active=state == "true")
        if created_at:
            parsed_date = parse_date(created_at)
            if parsed_date:
                queryset = queryset.filter(created_at__date=parsed_date)

        return Response(RoleListSerializer(queryset.order_by("-created_at"), many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = RoleWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            role = serializer.save()
            detail = self._get_detail(role.id)
            return Response(RoleDetailSerializer(detail).data, status=status.HTTP_201_CREATED)
        except Exception:
            return Response({"message": "Error al guardar. Intente nuevamente."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_detail(self, role_id: int):
        return Role.objects.annotate(users_count=Count("users", distinct=True)).prefetch_related(
            "users",
            Prefetch("role_permissions", queryset=RolePermission.objects.select_related("permission__module")),
        ).get(pk=role_id)


class RoleDetailView(BaseAdminView):
    def get_object(self, role_id: int):
        return Role.objects.annotate(users_count=Count("users", distinct=True)).prefetch_related(
            "users",
            Prefetch("role_permissions", queryset=RolePermission.objects.select_related("permission__module")),
        ).filter(pk=role_id).first()

    def get(self, request, role_id: int):
        role = self.get_object(role_id)
        if not role:
            return Response({"message": "Rol no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        return Response(RoleDetailSerializer(role).data, status=status.HTTP_200_OK)

    def put(self, request, role_id: int):
        role = self.get_object(role_id)
        if not role:
            return Response({"message": "Rol no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        serializer = RoleWriteSerializer(instance=role, data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            updated_role = serializer.save()
            detail = self.get_object(updated_role.id)
            return Response(RoleDetailSerializer(detail).data, status=status.HTTP_200_OK)
        except Exception:
            return Response({"message": "Error al guardar. Intente nuevamente."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request, role_id: int):
        role = self.get_object(role_id)
        if not role:
            return Response({"message": "Rol no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        if role.users.exists():
            return Response({"message": "No se puede eliminar un rol con usuarios asignados."}, status=status.HTTP_400_BAD_REQUEST)
        role.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RoleStatusView(BaseAdminView):
    def patch(self, request, role_id: int):
        role = Role.objects.filter(pk=role_id).first()
        if not role:
            return Response({"message": "Rol no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        serializer = RoleStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"message": "Estado inválido.", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        next_status = serializer.validated_data["is_active"]
        if role.is_core_admin and not next_status:
            return Response({"message": "No se puede desactivar el rol Administrador principal."}, status=status.HTTP_400_BAD_REQUEST)

        role.is_active = next_status
        role.save(update_fields=["is_active", "updated_at"])
        detail = Role.objects.annotate(
            users_count=Count("users", distinct=True),
            permissions_count=Count("role_permissions", distinct=True),
        ).get(pk=role_id)
        return Response(RoleListSerializer(detail).data, status=status.HTTP_200_OK)


class ModuleListView(BaseAdminView):
    def get(self, request):
        return Response(ModuleSerializer(Module.objects.order_by("id"), many=True).data, status=status.HTTP_200_OK)


class PermissionListView(BaseAdminView):
    def get(self, request):
        permissions = Permission.objects.select_related("module").order_by("module__id", "action")
        return Response(PermissionSerializer(permissions, many=True).data, status=status.HTTP_200_OK)


class RoleStatsView(BaseAdminView):
    def get(self, request):
        return Response(
            {
                "total_roles": Role.objects.count(),
                "active_roles": Role.objects.filter(is_active=True).count(),
                "inactive_roles": Role.objects.filter(is_active=False).count(),
                "total_permissions": Permission.objects.count(),
                "total_modules": Module.objects.count(),
            },
            status=status.HTTP_200_OK,
        )


class EducationalCenterListCreateView(BaseAdminView):
    def get(self, request):
        queryset = EducationalCenter.objects.select_related("regent").annotate(children_count=Count("children", distinct=True))

        search = request.query_params.get("search", "").strip()
        code = request.query_params.get("code", "").strip()
        center_status = request.query_params.get("status", "").strip().lower()
        regent = request.query_params.get("regent", "").strip()
        has_regent = request.query_params.get("has_regent", "").strip().lower()
        shift = request.query_params.get("shift", "").strip()
        page_param = request.query_params.get("page", "").strip()
        page_size_param = request.query_params.get("page_size", "").strip()

        if search:
            queryset = queryset.filter(name__icontains=search)
        if code:
            queryset = queryset.filter(code__icontains=code)
        if center_status in {"activo", "inactivo"}:
            queryset = queryset.filter(is_active=center_status == "activo")
        if regent:
            queryset = queryset.filter(regent_id=regent)
        if has_regent in {"true", "false"}:
            queryset = queryset.filter(regent__isnull=has_regent == "false")
        if shift:
            queryset = queryset.filter(shift__iexact=shift)

        if not any([search, code, center_status, regent, has_regent, shift, page_param, page_size_param]):
            return Response(
                EducationalCenterOptionSerializer(queryset.order_by("name"), many=True).data,
                status=status.HTTP_200_OK,
            )

        total = queryset.count()
        page = max(int(page_param or 1), 1)
        page_size = max(min(int(page_size_param or 10), 100), 1)
        start = (page - 1) * page_size
        end = start + page_size
        items = queryset.order_by("-created_at")[start:end]
        total_pages = (total + page_size - 1) // page_size if total else 1

        return Response(
            {
                "count": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "results": EducationalCenterSerializer(items, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = EducationalCenterCreateUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            center = serializer.save()
            detail = self._get_detail(center.id)
            return Response(EducationalCenterDetailSerializer(detail).data, status=status.HTTP_201_CREATED)
        except Exception:
            return Response({"message": "Error al guardar. Intente nuevamente."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_detail(self, center_id: int):
        return EducationalCenter.objects.select_related("regent").annotate(children_count=Count("children", distinct=True)).get(pk=center_id)


class EducationalCenterDetailView(BaseAdminView):
    def get_object(self, center_id: int):
        return (
            EducationalCenter.objects.select_related("regent")
            .annotate(children_count=Count("children", distinct=True))
            .filter(pk=center_id)
            .first()
        )

    def get(self, request, center_id: int):
        center = self.get_object(center_id)
        if not center:
            return Response({"message": "Centro educativo no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        return Response(EducationalCenterDetailSerializer(center).data, status=status.HTTP_200_OK)

    def put(self, request, center_id: int):
        center = self.get_object(center_id)
        if not center:
            return Response({"message": "Centro educativo no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        serializer = EducationalCenterCreateUpdateSerializer(instance=center, data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            updated_center = serializer.save()
            detail = self.get_object(updated_center.id)
            return Response(EducationalCenterDetailSerializer(detail).data, status=status.HTTP_200_OK)
        except Exception:
            return Response({"message": "Error al guardar. Intente nuevamente."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request, center_id: int):
        center = self.get_object(center_id)
        if not center:
            return Response({"message": "Centro educativo no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        if center.children.exists():
            return Response(
                {"message": "No se puede eliminar un centro educativo con niños asociados."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        center.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EducationalCenterStatusView(BaseAdminView):
    def patch(self, request, center_id: int):
        center = EducationalCenter.objects.filter(pk=center_id).first()
        if not center:
            return Response({"message": "Centro educativo no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        serializer = EducationalCenterStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        next_status = serializer.validated_data["status"]
        reason = serializer.validated_data.get("motivo_desactivacion", "").strip()
        center.is_active = next_status == "activo"
        center.deactivation_reason = "" if center.is_active else reason
        center.save(update_fields=["is_active", "deactivation_reason", "updated_at"])
        detail = EducationalCenter.objects.select_related("regent").annotate(children_count=Count("children", distinct=True)).get(pk=center_id)
        return Response(EducationalCenterDetailSerializer(detail).data, status=status.HTTP_200_OK)


class EducationalCenterStatsView(BaseAdminView):
    def get(self, request):
        queryset = EducationalCenter.objects.all()
        return Response(
            {
                "total_centros": queryset.count(),
                "activos": queryset.filter(is_active=True).count(),
                "inactivos": queryset.filter(is_active=False).count(),
                "con_regente_asignado": queryset.filter(regent__isnull=False).count(),
                "sin_regente_asignado": queryset.filter(regent__isnull=True).count(),
            },
            status=status.HTTP_200_OK,
        )


def get_regent_queryset():
    return User.objects.select_related("role").prefetch_related(
        Prefetch("assigned_educational_centers", queryset=EducationalCenter.objects.order_by("name"))
    ).filter(
        Q(rol=UserRole.REGENTE) | Q(role__name__iexact="Regente")
    ).distinct()


class RegentOptionsView(BaseAdminView):
    def get(self, request):
        regents = get_regent_queryset().filter(is_active=True).order_by("nombre")
        return Response(RegentOptionSerializer(regents, many=True).data, status=status.HTTP_200_OK)


class RegentEducationalCenterOptionsView(BaseAdminView):
    def get(self, request):
        centers = EducationalCenter.objects.filter(is_active=True).order_by("name")
        return Response(RegentEducationalCenterSerializer(centers, many=True).data, status=status.HTTP_200_OK)


class RegentListCreateView(BaseAdminView):
    def get(self, request):
        queryset = get_regent_queryset()

        search = request.query_params.get("search", "").strip()
        educational_center_id = request.query_params.get("educational_center_id", "").strip()
        is_active = request.query_params.get("is_active", "").strip().lower()

        if search:
            queryset = queryset.filter(
                Q(nombre__icontains=search) | Q(last_name__icontains=search) | Q(email__icontains=search)
            )
        if educational_center_id:
            queryset = queryset.filter(assigned_educational_centers__id=educational_center_id)
        if is_active in {"true", "false", "activo", "inactivo"}:
            queryset = queryset.filter(is_active=is_active in {"true", "activo"})

        total = queryset.count()
        page = max(int(request.query_params.get("page", "1") or 1), 1)
        page_size = max(min(int(request.query_params.get("page_size", "10") or 10), 100), 1)
        start = (page - 1) * page_size
        end = start + page_size
        items = queryset.order_by("-date_joined", "-id")[start:end]
        total_pages = (total + page_size - 1) // page_size if total else 1

        return Response(
            {
                "count": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "results": RegentListSerializer(items, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = RegentWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            regent = serializer.save()
            detail = self._get_detail(regent.id)
            return Response(RegentDetailSerializer(detail).data, status=status.HTTP_201_CREATED)
        except Exception:
            logger.exception("Regent create failed")
            return Response({"message": "Error al guardar. Intente nuevamente."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_detail(self, regent_id: int):
        return get_regent_queryset().get(pk=regent_id)


class RegentDetailView(BaseAdminView):
    def get_object(self, regent_id: int):
        return get_regent_queryset().filter(pk=regent_id).first()

    def get(self, request, regent_id: int):
        regent = self.get_object(regent_id)
        if not regent:
            return Response({"message": "Regente no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        return Response(RegentDetailSerializer(regent).data, status=status.HTTP_200_OK)

    def put(self, request, regent_id: int):
        regent = self.get_object(regent_id)
        if not regent:
            return Response({"message": "Regente no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        serializer = RegentWriteSerializer(instance=regent, data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            updated_regent = serializer.save()
            detail = self.get_object(updated_regent.id)
            return Response(RegentDetailSerializer(detail).data, status=status.HTTP_200_OK)
        except Exception:
            logger.exception("Regent update failed for regent_id=%s", regent_id)
            return Response({"message": "Error al guardar. Intente nuevamente."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request, regent_id: int):
        regent = self.get_object(regent_id)
        if not regent:
            return Response({"message": "Regente no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        if request.user.id == regent.id:
            return Response({"message": "No puede inactivar su propio usuario."}, status=status.HTTP_400_BAD_REQUEST)

        regent.is_active = False
        regent.save(update_fields=["is_active"])
        detail = self.get_object(regent.id)
        return Response(
            {
                "message": "Regente inactivado correctamente.",
                "regent": RegentDetailSerializer(detail).data,
            },
            status=status.HTTP_200_OK,
        )


class RegentStatusView(BaseAdminView):
    def patch(self, request, regent_id: int):
        regent = get_regent_queryset().filter(pk=regent_id).first()
        if not regent:
            return Response({"message": "Regente no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        serializer = RegentStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        next_status = serializer.validated_data["is_active"]
        if request.user.id == regent.id and not next_status:
            return Response({"message": "No puede inactivar su propio usuario."}, status=status.HTTP_400_BAD_REQUEST)

        regent.is_active = next_status
        regent.save(update_fields=["is_active"])
        detail = get_regent_queryset().get(pk=regent_id)
        return Response(RegentDetailSerializer(detail).data, status=status.HTTP_200_OK)


class RegentStatsView(BaseAdminView):
    def get(self, request):
        regents = User.objects.filter(Q(rol=UserRole.REGENTE) | Q(role__name__iexact="Regente")).distinct()
        centers = EducationalCenter.objects.all()
        return Response(
            {
                "total_regentes": regents.count(),
                "activos": regents.filter(is_active=True).count(),
                "inactivos": regents.filter(is_active=False).count(),
                "centros_con_regente": centers.filter(regent__isnull=False).count(),
                "centros_sin_regente": centers.filter(regent__isnull=True).count(),
            },
            status=status.HTTP_200_OK,
        )


class RiskZoneListCreateView(BaseAdminView):
    def get(self, request):
        queryset = RiskZone.objects.select_related(
            "educational_center",
            "educational_center__regent",
            "created_by",
            "updated_by",
        ).filter(deleted_at__isnull=True)

        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(description__icontains=search))

        center_id = request.query_params.get("educational_center_id", "").strip()
        if center_id:
            if center_id.upper() == "GENERAL":
                queryset = queryset.filter(educational_center__isnull=True)
            else:
                queryset = queryset.filter(educational_center_id=center_id)

        risk_type = request.query_params.get("risk_type", "").strip().upper()
        if risk_type:
            queryset = queryset.filter(risk_type=risk_type)

        risk_level = request.query_params.get("risk_level", "").strip().upper()
        risk_level = {"ALTA": "ALTO", "MEDIA": "MEDIO", "BAJA": "BAJO"}.get(risk_level, risk_level)
        if risk_level:
            queryset = queryset.filter(severity=risk_level)

        status_filter = request.query_params.get("status", "").strip().lower()
        if status_filter in {"activo", "activa", "true", "1"}:
            queryset = queryset.filter(is_active=True)
        elif status_filter in {"inactivo", "inactiva", "false", "0"}:
            queryset = queryset.filter(is_active=False)

        total = queryset.count()
        page = max(int(request.query_params.get("page", 1) or 1), 1)
        page_size = max(min(int(request.query_params.get("page_size", 10) or 10), 100), 1)
        start = (page - 1) * page_size
        end = start + page_size
        total_pages = (total + page_size - 1) // page_size if total else 1
        items = queryset.order_by("-updated_at", "-created_at")[start:end]

        return Response(
            {
                "count": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "results": RiskZoneSerializer(items, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = RiskZoneCreateUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            polygon_data = validate_and_measure_polygon(serializer.validated_data["polygon"])
            center_data = calculate_polygon_center(parse_polygon_payload(serializer.validated_data["polygon"]))
        except ValueError as error:
            return Response({"message": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        risk_zone = RiskZone.objects.create(
            educational_center=serializer.validated_data.get("educational_center"),
            name=serializer.validated_data["name"],
            description=serializer.validated_data.get("description", ""),
            risk_type=serializer.validated_data["risk_type"],
            severity=serializer.validated_data["severity"],
            polygon=polygon_data["polygon"],
            center_latitude=center_data["center_latitude"],
            center_longitude=center_data["center_longitude"],
            area_m2=polygon_data["area_m2"],
            perimeter_m=polygon_data["perimeter_m"],
            is_active=serializer.validated_data.get("is_active", True),
            created_by=request.user,
            updated_by=request.user,
        )
        detail = self._get_detail(risk_zone.id)
        return Response(RiskZoneSerializer(detail).data, status=status.HTTP_201_CREATED)

    def _get_detail(self, risk_zone_id: int):
        return RiskZone.objects.select_related(
            "educational_center",
            "educational_center__regent",
            "created_by",
            "updated_by",
        ).get(pk=risk_zone_id, deleted_at__isnull=True)


class RiskZoneDetailView(BaseAdminView):
    def get_object(self, risk_zone_id: int):
        return RiskZone.objects.select_related(
            "educational_center",
            "educational_center__regent",
            "created_by",
            "updated_by",
        ).filter(pk=risk_zone_id, deleted_at__isnull=True).first()

    def get(self, request, risk_zone_id: int):
        risk_zone = self.get_object(risk_zone_id)
        if not risk_zone:
            return Response({"message": "Zona de riesgo no encontrada."}, status=status.HTTP_404_NOT_FOUND)
        return Response(RiskZoneSerializer(risk_zone).data, status=status.HTTP_200_OK)

    def put(self, request, risk_zone_id: int):
        risk_zone = self.get_object(risk_zone_id)
        if not risk_zone:
            return Response({"message": "Zona de riesgo no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        serializer = RiskZoneCreateUpdateSerializer(instance=risk_zone, data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            polygon_data = validate_and_measure_polygon(serializer.validated_data["polygon"])
            center_data = calculate_polygon_center(parse_polygon_payload(serializer.validated_data["polygon"]))
        except ValueError as error:
            return Response({"message": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        risk_zone.educational_center = serializer.validated_data.get("educational_center")
        risk_zone.name = serializer.validated_data["name"]
        risk_zone.description = serializer.validated_data.get("description", "")
        risk_zone.risk_type = serializer.validated_data["risk_type"]
        risk_zone.severity = serializer.validated_data["severity"]
        risk_zone.polygon = polygon_data["polygon"]
        risk_zone.center_latitude = center_data["center_latitude"]
        risk_zone.center_longitude = center_data["center_longitude"]
        risk_zone.area_m2 = polygon_data["area_m2"]
        risk_zone.perimeter_m = polygon_data["perimeter_m"]
        risk_zone.is_active = serializer.validated_data.get("is_active", True)
        risk_zone.updated_by = request.user
        risk_zone.save()

        detail = self.get_object(risk_zone.id)
        return Response(RiskZoneSerializer(detail).data, status=status.HTTP_200_OK)

    def delete(self, request, risk_zone_id: int):
        risk_zone = self.get_object(risk_zone_id)
        if not risk_zone:
            return Response({"message": "Zona de riesgo no encontrada."}, status=status.HTTP_404_NOT_FOUND)
        risk_zone.is_active = False
        risk_zone.updated_by = request.user
        risk_zone.deleted_by = request.user
        risk_zone.deleted_at = timezone.now()
        risk_zone.save(update_fields=["is_active", "updated_by", "deleted_by", "deleted_at", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class RiskZoneStatusView(BaseAdminView):
    def patch(self, request, risk_zone_id: int):
        risk_zone = RiskZone.objects.filter(pk=risk_zone_id, deleted_at__isnull=True).first()
        if not risk_zone:
            return Response({"message": "Zona de riesgo no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        serializer = RiskZoneStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        risk_zone.is_active = serializer.validated_data["is_active"]
        risk_zone.updated_by = request.user
        risk_zone.save(update_fields=["is_active", "updated_by", "updated_at"])
        detail = RiskZone.objects.select_related(
            "educational_center",
            "educational_center__regent",
            "created_by",
            "updated_by",
        ).get(pk=risk_zone_id, deleted_at__isnull=True)
        return Response(RiskZoneSerializer(detail).data, status=status.HTTP_200_OK)


class RiskZoneStatsView(BaseAdminView):
    def get(self, request):
        queryset = RiskZone.objects.filter(deleted_at__isnull=True)
        return Response(
            {
                "total_zones": queryset.count(),
                "activas": queryset.filter(is_active=True).count(),
                "inactivas": queryset.filter(is_active=False).count(),
                "zonas_generales": queryset.filter(educational_center__isnull=True).count(),
                "zonas_por_centro": queryset.filter(educational_center__isnull=False).count(),
                "by_type": {key: queryset.filter(risk_type=key).count() for key, _ in RiskZone._meta.get_field("risk_type").choices},
                "by_level": {key: queryset.filter(severity=key).count() for key, _ in RiskZone._meta.get_field("severity").choices},
            },
            status=status.HTTP_200_OK,
        )


class RiskZoneValidatePolygonView(BaseAdminView):
    def post(self, request):
        serializer = RiskZonePolygonPayloadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            polygon_data = validate_and_measure_polygon(serializer.validated_data["polygon"])
            return Response(polygon_data, status=status.HTTP_200_OK)
        except ValueError as error:
            return Response({"message": str(error)}, status=status.HTTP_400_BAD_REQUEST)


class RiskZoneCalculateView(BaseAdminView):
    def post(self, request):
        serializer = RiskZonePolygonPayloadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            points = parse_polygon_payload(serializer.validated_data["polygon"])
            metrics = calculate_polygon_metrics(points)
            center_data = calculate_polygon_center(points)
            return Response({**metrics, **center_data}, status=status.HTTP_200_OK)
        except ValueError as error:
            return Response({"message": str(error)}, status=status.HTTP_400_BAD_REQUEST)


class SafeAreaListCreateView(BaseAdminView):
    def get(self, request):
        queryset = SafeArea.objects.select_related("educational_center").filter(
            Q(educational_center__name__icontains=request.query_params.get("search", "").strip())
            if request.query_params.get("search", "").strip()
            else Q()
        )

        status_value = request.query_params.get("status", "").strip().upper()
        if status_value in {SafeAreaStatus.ACTIVA, SafeAreaStatus.INACTIVA}:
            queryset = queryset.filter(status=status_value)

        total = queryset.count()
        page = max(int(request.query_params.get("page", 1) or 1), 1)
        page_size = max(min(int(request.query_params.get("page_size", 10) or 10), 100), 1)
        start = (page - 1) * page_size
        end = start + page_size
        items = queryset.order_by("-updated_at")[start:end]
        total_pages = (total + page_size - 1) // page_size if total else 1

        return Response(
            {
                "count": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "results": SafeAreaSerializer(items, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = SafeAreaCreateUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            polygon_data = validate_and_measure_polygon(serializer.validated_data["polygon"])
        except ValueError as error:
            return Response({"message": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        center = serializer.validated_data["educational_center"]
        previous_active = SafeArea.objects.filter(
            educational_center=center,
            status=SafeAreaStatus.ACTIVA,
            is_active=True,
        ).first()

        if previous_active:
            previous_active.status = SafeAreaStatus.INACTIVA
            previous_active.is_active = False
            previous_active.updated_by = request.user
            previous_active.save(update_fields=["status", "is_active", "updated_by", "updated_at"])
            create_safe_area_history(
                safe_area=previous_active,
                educational_center=center,
                action=SafeAreaHistoryAction.REEMPLAZO,
                user=request.user,
                previous_polygon=previous_active.polygon,
                new_polygon=polygon_data["polygon"],
                previous_area_m2=previous_active.area_m2,
                new_area_m2=polygon_data["area_m2"],
                previous_perimeter_m=previous_active.perimeter_m,
                new_perimeter_m=polygon_data["perimeter_m"],
                points_count=polygon_data["points_count"],
            )

        safe_area = SafeArea.objects.create(
            educational_center=center,
            name=serializer.validated_data["name"],
            status=serializer.validated_data["status"],
            polygon=polygon_data["polygon"],
            area_m2=polygon_data["area_m2"],
            perimeter_m=polygon_data["perimeter_m"],
            points_count=polygon_data["points_count"],
            created_by=request.user,
            updated_by=request.user,
            is_active=serializer.validated_data["status"] == SafeAreaStatus.ACTIVA,
        )
        create_safe_area_history(
            safe_area=safe_area,
            educational_center=center,
            action=SafeAreaHistoryAction.CREACION,
            user=request.user,
            new_polygon=safe_area.polygon,
            new_area_m2=safe_area.area_m2,
            new_perimeter_m=safe_area.perimeter_m,
            points_count=safe_area.points_count,
        )
        detail = self._get_detail(safe_area.id)
        return Response(SafeAreaDetailSerializer(detail).data, status=status.HTTP_201_CREATED)

    def _get_detail(self, safe_area_id: int):
        return SafeArea.objects.select_related("educational_center__regent").get(pk=safe_area_id)


class SafeAreaDetailView(BaseAdminView):
    def get_object(self, safe_area_id: int):
        return SafeArea.objects.select_related("educational_center__regent").filter(pk=safe_area_id).first()

    def get(self, request, safe_area_id: int):
        safe_area = self.get_object(safe_area_id)
        if not safe_area:
            return Response({"message": "Área segura no encontrada."}, status=status.HTTP_404_NOT_FOUND)
        return Response(SafeAreaDetailSerializer(safe_area).data, status=status.HTTP_200_OK)

    def put(self, request, safe_area_id: int):
        safe_area = self.get_object(safe_area_id)
        if not safe_area:
            return Response({"message": "Área segura no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        serializer = SafeAreaCreateUpdateSerializer(instance=safe_area, data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            polygon_data = validate_and_measure_polygon(serializer.validated_data["polygon"])
        except ValueError as error:
            return Response({"message": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        previous_polygon = safe_area.polygon
        previous_area_m2 = safe_area.area_m2
        previous_perimeter_m = safe_area.perimeter_m

        safe_area.educational_center = serializer.validated_data["educational_center"]
        safe_area.name = serializer.validated_data["name"]
        safe_area.status = serializer.validated_data["status"]
        safe_area.is_active = serializer.validated_data["status"] == SafeAreaStatus.ACTIVA
        safe_area.polygon = polygon_data["polygon"]
        safe_area.area_m2 = polygon_data["area_m2"]
        safe_area.perimeter_m = polygon_data["perimeter_m"]
        safe_area.points_count = polygon_data["points_count"]
        safe_area.updated_by = request.user
        safe_area.save()

        create_safe_area_history(
            safe_area=safe_area,
            educational_center=safe_area.educational_center,
            action=SafeAreaHistoryAction.ACTUALIZACION,
            user=request.user,
            previous_polygon=previous_polygon,
            new_polygon=safe_area.polygon,
            previous_area_m2=previous_area_m2,
            new_area_m2=safe_area.area_m2,
            previous_perimeter_m=previous_perimeter_m,
            new_perimeter_m=safe_area.perimeter_m,
            points_count=safe_area.points_count,
        )

        detail = self.get_object(safe_area.id)
        return Response(SafeAreaDetailSerializer(detail).data, status=status.HTTP_200_OK)

    def delete(self, request, safe_area_id: int):
        safe_area = self.get_object(safe_area_id)
        if not safe_area:
            return Response({"message": "Área segura no encontrada."}, status=status.HTTP_404_NOT_FOUND)
        create_safe_area_history(
            safe_area=safe_area,
            educational_center=safe_area.educational_center,
            action=SafeAreaHistoryAction.ELIMINACION,
            user=request.user,
            previous_polygon=safe_area.polygon,
            previous_area_m2=safe_area.area_m2,
            previous_perimeter_m=safe_area.perimeter_m,
            points_count=safe_area.points_count,
        )
        safe_area.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SafeAreaStatusView(BaseAdminView):
    def patch(self, request, safe_area_id: int):
        safe_area = SafeArea.objects.filter(pk=safe_area_id).first()
        if not safe_area:
            return Response({"message": "Área segura no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        serializer = SafeAreaStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        safe_area.status = serializer.validated_data["status"]
        safe_area.is_active = safe_area.status == SafeAreaStatus.ACTIVA
        safe_area.updated_by = request.user
        safe_area.save(update_fields=["status", "is_active", "updated_by", "updated_at"])
        detail = SafeArea.objects.select_related("educational_center__regent").get(pk=safe_area_id)
        return Response(SafeAreaDetailSerializer(detail).data, status=status.HTTP_200_OK)


class SafeAreaStatsView(BaseAdminView):
    def get(self, request):
        safe_areas = SafeArea.objects.all()
        centers_count = EducationalCenter.objects.count()
        centers_with_area = SafeArea.objects.filter(is_active=True).values("educational_center_id").distinct().count()
        return Response(
            {
                "total_areas": safe_areas.count(),
                "activas": safe_areas.filter(status=SafeAreaStatus.ACTIVA, is_active=True).count(),
                "inactivas": safe_areas.filter(status=SafeAreaStatus.INACTIVA).count(),
                "centros_con_area": centers_with_area,
                "centros_sin_area": max(centers_count - centers_with_area, 0),
            },
            status=status.HTTP_200_OK,
        )


class SafeAreaByCenterView(BaseAdminView):
    def get(self, request, center_id: int):
        center = EducationalCenter.objects.select_related("regent").filter(pk=center_id).first()
        if not center:
            return Response({"message": "Centro educativo no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        safe_area = (
            SafeArea.objects.select_related("educational_center__regent")
            .filter(educational_center_id=center_id)
            .order_by("-is_active", "-updated_at")
            .first()
        )
        if not safe_area:
            return Response({"message": "Área segura no encontrada."}, status=status.HTTP_404_NOT_FOUND)
        return Response(SafeAreaDetailSerializer(safe_area).data, status=status.HTTP_200_OK)


class SafeAreaHistoryView(BaseAdminView):
    def get(self, request, safe_area_id: int):
        safe_area = SafeArea.objects.filter(pk=safe_area_id).first()
        if not safe_area:
            return Response({"message": "Área segura no encontrada."}, status=status.HTTP_404_NOT_FOUND)
        history = safe_area.history_entries.select_related("user").all()
        return Response(SafeAreaHistorySerializer(history, many=True).data, status=status.HTTP_200_OK)


class SafeAreaValidatePolygonView(BaseAdminView):
    def post(self, request):
        serializer = SafeAreaPolygonPayloadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            return Response(validate_and_measure_polygon(serializer.validated_data["polygon"]), status=status.HTTP_200_OK)
        except ValueError as error:
            return Response({"message": str(error)}, status=status.HTTP_400_BAD_REQUEST)


class SafeAreaCalculateView(BaseAdminView):
    def post(self, request):
        serializer = SafeAreaPolygonPayloadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            data = validate_and_measure_polygon(serializer.validated_data["polygon"])
            return Response(
                {
                    "area_m2": data["area_m2"],
                    "perimeter_m": data["perimeter_m"],
                    "points_count": data["points_count"],
                    "is_valid": data["is_valid"],
                },
                status=status.HTTP_200_OK,
            )
        except ValueError as error:
            return Response({"message": str(error)}, status=status.HTTP_400_BAD_REQUEST)


def get_gps_device_queryset():
    return GPSDevice.objects.select_related("created_by", "updated_by").prefetch_related("children").order_by("code")


class GPSDeviceListCreateView(BaseAdminView):
    def get(self, request):
        queryset = get_gps_device_queryset()

        search = request.query_params.get("search", "").strip()
        status_value = request.query_params.get("status", "").strip().upper()
        is_active = request.query_params.get("is_active", "").strip().lower()
        assigned = request.query_params.get("assigned", "").strip().lower()
        battery_low = request.query_params.get("battery_low", "").strip().lower()

        if search:
            queryset = queryset.filter(
                Q(code__icontains=search)
                | Q(serial_number__icontains=search)
                | Q(imei__icontains=search)
                | Q(phone_number__icontains=search)
                | Q(brand__icontains=search)
                | Q(model__icontains=search)
            )
        if status_value in {choice for choice, _ in GPSDeviceStatus.choices}:
            queryset = queryset.filter(status=status_value)
        if is_active in {"true", "false", "activo", "inactivo"}:
            queryset = queryset.filter(is_active=is_active in {"true", "activo"})
        if assigned in {"true", "false"}:
            queryset = queryset.filter(children__status=ChildStatus.ACTIVO).distinct() if assigned == "true" else queryset.exclude(children__status=ChildStatus.ACTIVO)
        if battery_low in {"true", "false"}:
            queryset = queryset.filter(battery_level__lte=20) if battery_low == "true" else queryset.filter(battery_level__gt=20)

        total = queryset.count()
        page = max(int(request.query_params.get("page", "1") or 1), 1)
        page_size = max(min(int(request.query_params.get("page_size", "10") or 10), 100), 1)
        start = (page - 1) * page_size
        end = start + page_size
        items = queryset.order_by("code")[start:end]
        total_pages = (total + page_size - 1) // page_size if total else 1

        return Response(
            {
                "count": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "results": GPSDeviceSerializer(items, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = GPSDeviceWriteSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            gps_device = serializer.save()
            gps_device.refresh_from_db()
            create_gps_device_history(
                gps_device=gps_device,
                action=GPSDeviceHistoryAction.CREACION,
                user=request.user,
                detail="Dispositivo GPS creado.",
                new_status=gps_device.status,
                new_child=gps_device.assigned_child,
                new_is_active=gps_device.is_active,
            )
            return Response(GPSDeviceSerializer(gps_device).data, status=status.HTTP_201_CREATED)
        except Exception:
            logger.exception("GPS device create failed")
            return Response({"message": "Error al guardar. Intente nuevamente."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GPSDeviceDetailView(BaseAdminView):
    def get_object(self, gps_device_id: int):
        return get_gps_device_queryset().filter(pk=gps_device_id).first()

    def get(self, request, gps_device_id: int):
        gps_device = self.get_object(gps_device_id)
        if not gps_device:
            return Response({"message": "Dispositivo GPS no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        return Response(GPSDeviceSerializer(gps_device).data, status=status.HTTP_200_OK)

    def put(self, request, gps_device_id: int):
        gps_device = self.get_object(gps_device_id)
        if not gps_device:
            return Response({"message": "Dispositivo GPS no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        previous_status = gps_device.status
        previous_child = gps_device.assigned_child
        previous_is_active = gps_device.is_active

        serializer = GPSDeviceWriteSerializer(instance=gps_device, data=request.data, context={"request": request})
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            updated_device = serializer.save()
            updated_device.refresh_from_db()
            new_child = updated_device.assigned_child
            action = GPSDeviceHistoryAction.EDICION
            detail = "Dispositivo GPS actualizado."
            if previous_child != new_child:
                action = GPSDeviceHistoryAction.ASIGNACION if new_child else GPSDeviceHistoryAction.DESASIGNACION
                detail = "Asignación de niño actualizada."
            elif previous_status != updated_device.status:
                action = GPSDeviceHistoryAction.CAMBIO_ESTADO
                detail = "Estado del dispositivo actualizado."
            create_gps_device_history(
                gps_device=updated_device,
                action=action,
                user=request.user,
                detail=detail,
                previous_status=previous_status,
                new_status=updated_device.status,
                previous_child=previous_child,
                new_child=new_child,
                previous_is_active=previous_is_active,
                new_is_active=updated_device.is_active,
            )
            return Response(GPSDeviceSerializer(updated_device).data, status=status.HTTP_200_OK)
        except Exception:
            logger.exception("GPS device update failed for gps_device_id=%s", gps_device_id)
            return Response({"message": "Error al guardar. Intente nuevamente."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request, gps_device_id: int):
        gps_device = self.get_object(gps_device_id)
        if not gps_device:
            return Response({"message": "Dispositivo GPS no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        if gps_device.assigned_child:
            return Response(
                {"message": "No se puede eliminar un dispositivo GPS asignado a un niño activo."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        previous_status = gps_device.status
        previous_is_active = gps_device.is_active
        gps_device.is_active = False
        gps_device.status = GPSDeviceStatus.INACTIVO
        gps_device.updated_by = request.user
        gps_device.save(update_fields=["is_active", "status", "updated_by", "updated_at"])
        create_gps_device_history(
            gps_device=gps_device,
            action=GPSDeviceHistoryAction.ELIMINACION_CONTROLADA,
            user=request.user,
            detail="Dispositivo GPS inactivado por eliminación controlada.",
            previous_status=previous_status,
            new_status=gps_device.status,
            previous_is_active=previous_is_active,
            new_is_active=gps_device.is_active,
        )
        return Response(
            {"message": "Dispositivo GPS inactivado correctamente.", "device": GPSDeviceSerializer(gps_device).data},
            status=status.HTTP_200_OK,
        )


class GPSDeviceStatusView(BaseAdminView):
    def patch(self, request, gps_device_id: int):
        gps_device = get_gps_device_queryset().filter(pk=gps_device_id).first()
        if not gps_device:
            return Response({"message": "Dispositivo GPS no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        serializer = GPSDeviceStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        next_status = serializer.validated_data["status"]
        next_is_active = serializer.validated_data.get("is_active", next_status != GPSDeviceStatus.INACTIVO)
        if gps_device.assigned_child and next_status != GPSDeviceStatus.ASIGNADO:
            return Response(
                {"message": "No puede cambiar el estado mientras el dispositivo siga asignado a un niño activo."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        previous_status = gps_device.status
        previous_is_active = gps_device.is_active
        gps_device.status = next_status
        gps_device.is_active = next_is_active
        gps_device.updated_by = request.user
        gps_device.save(update_fields=["status", "is_active", "updated_by", "updated_at"])
        create_gps_device_history(
            gps_device=gps_device,
            action=GPSDeviceHistoryAction.CAMBIO_ESTADO,
            user=request.user,
            detail="Estado del dispositivo actualizado.",
            previous_status=previous_status,
            new_status=gps_device.status,
            previous_child=gps_device.assigned_child,
            new_child=gps_device.assigned_child,
            previous_is_active=previous_is_active,
            new_is_active=gps_device.is_active,
        )
        return Response(GPSDeviceSerializer(gps_device).data, status=status.HTTP_200_OK)


class GPSDeviceStatsView(BaseAdminView):
    def get(self, request):
        queryset = GPSDevice.objects.all()
        now = timezone.now()
        signal_limit = now - timedelta(hours=24)
        return Response(
            {
                "total_dispositivos": queryset.count(),
                "disponibles": queryset.filter(status=GPSDeviceStatus.DISPONIBLE).count(),
                "asignados": queryset.filter(status=GPSDeviceStatus.ASIGNADO).count(),
                "en_mantenimiento": queryset.filter(status=GPSDeviceStatus.EN_MANTENIMIENTO).count(),
                "perdidos": queryset.filter(status=GPSDeviceStatus.PERDIDO).count(),
                "inactivos": queryset.filter(status=GPSDeviceStatus.INACTIVO).count(),
                "bateria_baja": queryset.filter(battery_level__lte=20).count(),
                "sin_senal": queryset.filter(Q(last_seen_at__isnull=True) | Q(last_seen_at__lte=signal_limit)).count(),
            },
            status=status.HTTP_200_OK,
        )


class GPSDeviceAvailableView(BaseAdminView):
    def get(self, request):
        devices = (
            GPSDevice.objects.filter(is_active=True, status=GPSDeviceStatus.DISPONIBLE)
            .exclude(children__status=ChildStatus.ACTIVO)
            .distinct()
            .order_by("code")
        )
        return Response(GPSDeviceSerializer(devices, many=True).data, status=status.HTTP_200_OK)


class GPSDeviceHistoryView(BaseAdminView):
    def get(self, request, gps_device_id: int):
        gps_device = GPSDevice.objects.filter(pk=gps_device_id).first()
        if not gps_device:
            return Response({"message": "Dispositivo GPS no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        history = gps_device.history_entries.select_related("user", "previous_child", "new_child").all()
        return Response(GPSDeviceHistorySerializer(history, many=True).data, status=status.HTTP_200_OK)


class MobileLocationContextView(BaseMobileView):
    def get(self, request):
        children = list(get_mobile_accessible_children(request.user))
        default_child = children[0] if children else None

        return Response(
            {
                "success": True,
                "message": "Contexto móvil obtenido correctamente.",
                "data": {
                    "user": {
                        "id": request.user.id,
                        "email": request.user.email,
                        "nombre": request.user.nombre,
                        "rol": request.user.rol,
                    },
                    "children": [
                        {
                            "id": child.id,
                            "code": child.code,
                            "nombre_completo": f"{child.nombres} {child.apellidos}",
                            "curso": child.curso,
                            "centro_educativo": child.centro_educativo.name,
                            "dispositivo_id": child.dispositivo_gps.code if child.dispositivo_gps else None,
                        }
                        for child in children
                    ],
                    "default_child_id": default_child.id if default_child else None,
                    "backend_status": "ONLINE",
                },
            },
            status=status.HTTP_200_OK,
        )


class MobilePickupChildrenView(BaseMobileView):
    def get(self, request):
        children = list(get_mobile_children_scope(request.user).filter(status=ChildStatus.ACTIVO))

        return Response(
            {
                "success": True,
                "message": "Listado de niños para retiro obtenido correctamente.",
                "data": [
                    {
                        "id": child.id,
                        "full_name": child.nombre_completo,
                        "course": child.curso,
                        "educational_center": child.centro_educativo.name,
                        "connection_status": "Disponible",
                        "last_updated_at": child.fecha_actualizacion.isoformat(),
                        "photo_url": request.build_absolute_uri(child.foto.url) if child.foto else None,
                        "status": {
                            "code": child.status,
                            "label": child.get_status_display(),
                            "description": "Disponible para retiro",
                            "distance_to_safe_area_m": 0,
                        },
                    }
                    for child in children
                ],
            },
            status=status.HTTP_200_OK,
        )


class MobileAccessChildrenView(BaseMobileView):
    def get(self, request):
        if request.user.rol != UserRole.REGENTE:
            return mobile_error_response(
                "Solo el regente puede consultar niños para ingreso y asistencia.",
                "ROL_NO_PERMITIDO",
                status.HTTP_403_FORBIDDEN,
            )

        children = list(get_mobile_children_scope(request.user).filter(status=ChildStatus.ACTIVO))
        return Response(
            {
                "success": True,
                "message": "Listado de niños para control obtenido correctamente.",
                "data": [
                    {
                        "id": child.id,
                        "full_name": child.nombre_completo,
                        "course": child.curso,
                        "educational_center": child.centro_educativo.name,
                        "connection_status": "Disponible",
                        "last_updated_at": child.fecha_actualizacion.isoformat(),
                        "photo_url": request.build_absolute_uri(child.foto.url) if child.foto else None,
                        "status": {
                            "code": child.status,
                            "label": child.get_status_display(),
                            "description": "Disponible para control",
                            "distance_to_safe_area_m": 0,
                        },
                    }
                    for child in children
                ],
            },
            status=status.HTTP_200_OK,
        )


class MobileAccessControlRegisterView(BaseMobileView):
    def post(self, request):
        if request.user.rol != UserRole.REGENTE:
            return mobile_error_response(
                "Solo el regente puede registrar ingresos o asistencias.",
                "ROL_NO_PERMITIDO",
                status.HTTP_403_FORBIDDEN,
            )

        serializer = AccessControlRecordRegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Datos inválidos.",
                    "code": "DATOS_INVALIDOS",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        child = (
            get_mobile_children_scope(request.user)
            .filter(id=serializer.validated_data["child_id"], status=ChildStatus.ACTIVO)
            .first()
        )
        if child is None:
            return mobile_error_response(
                "No tiene permisos para registrar este niño.",
                "NINO_NO_PERMITIDO",
                status.HTTP_403_FORBIDDEN,
            )

        record = AccessControlRecord.objects.create(
            child=child,
            recorded_by=request.user,
            record_type=serializer.validated_data["record_type"],
            note=serializer.validated_data.get("note", "").strip(),
            source_platform="mobile",
        )
        return Response(
            {
                "success": True,
                "message": "Registro guardado correctamente.",
                "data": AccessControlRecordSerializer(record).data,
            },
            status=status.HTTP_201_CREATED,
        )


class MobileAccessControlHistoryView(BaseMobileView):
    def get(self, request):
        if request.user.rol != UserRole.REGENTE:
            return mobile_error_response(
                "Solo el regente puede consultar estos registros.",
                "ROL_NO_PERMITIDO",
                status.HTTP_403_FORBIDDEN,
            )

        queryset = AccessControlRecord.objects.select_related("child__centro_educativo", "recorded_by")
        queryset = queryset.filter(child__centro_educativo__regent=request.user)

        child_id = request.query_params.get("child_id")
        record_type = request.query_params.get("record_type", "").strip().upper()
        raw_date = request.query_params.get("date")

        if child_id:
            queryset = queryset.filter(child_id=child_id)
        if record_type in {AccessControlRecordType.INGRESO, AccessControlRecordType.ASISTENCIA}:
            queryset = queryset.filter(record_type=record_type)
        queryset, date_error = filter_access_records_by_date(queryset, raw_date)
        if date_error:
            return Response(
                {"success": False, "message": date_error, "code": "FECHA_INVALIDA"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "success": True,
                "message": "Historial de control obtenido correctamente.",
                "data": AccessControlRecordSerializer(queryset[:100], many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class MobilePickupConfirmView(BaseMobileView):
    def post(self, request):
        if request.user.rol != UserRole.TUTOR:
            return mobile_error_response(
                "Solo los tutores pueden confirmar retiros.",
                "ROL_NO_PERMITIDO",
                status.HTTP_403_FORBIDDEN,
            )

        serializer = PickupConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Datos inválidos.",
                    "code": "DATOS_INVALIDOS",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        tutor = Tutor.objects.filter(
            correo_acceso__iexact=request.user.email,
            estado=TutorStatus.ACTIVO,
        ).first()
        if tutor is None:
            return mobile_error_response(
                "Tutor no encontrado o inactivo.",
                "TUTOR_NO_ENCONTRADO",
                status.HTTP_404_NOT_FOUND,
            )

        child = (
            get_mobile_children_scope(request.user)
            .filter(id=serializer.validated_data["child_id"], status=ChildStatus.ACTIVO)
            .first()
        )
        if child is None:
            return mobile_error_response(
                "No tiene permisos para confirmar el retiro de este niño.",
                "NINO_NO_PERMITIDO",
                status.HTTP_403_FORBIDDEN,
                {"child_id": serializer.validated_data["child_id"]},
            )

        pickup = PickupRecord.objects.create(
            child=child,
            tutor=tutor,
            confirmed_by=request.user,
            biometric_method=serializer.validated_data["biometric_method"],
            source_platform="mobile",
            note=serializer.validated_data.get("note", "").strip(),
        )

        return Response(
            {
                "success": True,
                "message": "Retiro confirmado correctamente.",
                "data": PickupRecordSerializer(pickup).data,
            },
            status=status.HTTP_201_CREATED,
        )


class MobilePickupHistoryView(BaseMobileView):
    def get(self, request):
        child_id = request.query_params.get("child_id")
        raw_date = request.query_params.get("date")
        queryset = PickupRecord.objects.select_related("child__centro_educativo", "tutor")

        if request.user.rol == UserRole.TUTOR:
            tutor = Tutor.objects.filter(correo_acceso__iexact=request.user.email).first()
            if tutor is None:
                return Response({"success": True, "data": []}, status=status.HTTP_200_OK)
            queryset = queryset.filter(tutor=tutor)
        elif request.user.rol == UserRole.REGENTE:
            queryset = queryset.filter(child__centro_educativo__regent=request.user)
        else:
            return mobile_error_response(
                "Rol no permitido para consultar retiros.",
                "ROL_NO_PERMITIDO",
                status.HTTP_403_FORBIDDEN,
            )

        if child_id:
            queryset = queryset.filter(child_id=child_id)
        queryset, date_error = filter_pickups_by_date(queryset, raw_date)
        if date_error:
            return Response(
                {
                    "success": False,
                    "message": date_error,
                    "code": "FECHA_INVALIDA",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "success": True,
                "message": "Historial de retiros obtenido correctamente.",
                "data": PickupRecordSerializer(queryset[:50], many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class PickupRecordListView(BaseAdminOrRegentView):
    def get(self, request):
        queryset = PickupRecord.objects.select_related("child__centro_educativo", "tutor")

        child_id = request.query_params.get("child_id")
        tutor_id = request.query_params.get("tutor_id")
        raw_date = request.query_params.get("date")
        if request.user.rol == UserRole.REGENTE:
            queryset = queryset.filter(child__centro_educativo__regent=request.user)
        if child_id:
            queryset = queryset.filter(child_id=child_id)
        if tutor_id:
            queryset = queryset.filter(tutor_id=tutor_id)
        queryset, date_error = filter_pickups_by_date(queryset, raw_date)
        if date_error:
            return Response({"message": date_error}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "message": "Retiros obtenidos correctamente.",
                "data": PickupRecordSerializer(queryset[:100], many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class AccessControlRecordListView(BaseAdminOrRegentView):
    def get(self, request):
        queryset = AccessControlRecord.objects.select_related("child__centro_educativo", "recorded_by")
        if request.user.rol == UserRole.REGENTE:
            queryset = queryset.filter(child__centro_educativo__regent=request.user)

        child_id = request.query_params.get("child_id")
        record_type = request.query_params.get("record_type", "").strip().upper()
        raw_date = request.query_params.get("date")

        if child_id:
            queryset = queryset.filter(child_id=child_id)
        if record_type in {AccessControlRecordType.INGRESO, AccessControlRecordType.ASISTENCIA}:
            queryset = queryset.filter(record_type=record_type)
        queryset, date_error = filter_access_records_by_date(queryset, raw_date)
        if date_error:
            return Response({"message": date_error}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "message": "Registros obtenidos correctamente.",
                "data": AccessControlRecordSerializer(queryset[:100], many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class GeographicLocationRegisterView(BaseMobileView):
    @transaction.atomic
    def post(self, request):
        payload = request.data.copy()
        alias_map = {
            "device_id": "dispositivo_id",
            "child_id": "nino_id",
            "latitude": "latitud",
            "longitude": "longitud",
            "accuracy": "precision",
            "speed": "velocidad",
            "timestamp": "fecha_hora",
            "delivery_status": "estado_envio",
        }
        for source_key, target_key in alias_map.items():
            if source_key in payload and target_key not in payload:
                payload[target_key] = payload[source_key]

        serializer = GeographicLocationRegisterSerializer(data=payload)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Datos inválidos.",
                    "code": "DATOS_INVALIDOS",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = serializer.validated_data
        device = GPSDevice.objects.filter(code=data["dispositivo_id"]).first()
        if device is None:
            return mobile_error_response(
                "Dispositivo no encontrado",
                "DISPOSITIVO_NO_ENCONTRADO",
                status.HTTP_404_NOT_FOUND,
                {"dispositivo_id": data["dispositivo_id"]},
            )

        child = Child.objects.select_related("centro_educativo", "dispositivo_gps").filter(id=data["nino_id"]).first()
        if child is None:
            return mobile_error_response(
                "Niño no encontrado",
                "NINO_NO_ENCONTRADO",
                status.HTTP_404_NOT_FOUND,
                {"nino_id": data["nino_id"]},
            )

        if child.status != ChildStatus.ACTIVO:
            return mobile_error_response(
                "Niño inactivo",
                "NINO_INACTIVO",
                status.HTTP_410_GONE,
                {"nino_id": child.id},
            )

        if child.dispositivo_gps_id != device.id:
            return mobile_error_response(
                "Dispositivo no asignado a un niño activo",
                "DISPOSITIVO_NO_ASIGNADO",
                status.HTTP_409_CONFLICT,
                {"dispositivo_id": device.code},
            )

        if not get_mobile_accessible_children(request.user).filter(id=child.id).exists():
            return mobile_error_response(
                "Rol no permitido para registrar la ubicación de este niño",
                "ROL_NO_PERMITIDO",
                status.HTTP_403_FORBIDDEN,
                {"nino_id": child.id},
            )

        if GeographicLocation.objects.filter(device=device, device_timestamp=data["fecha_hora"]).exists():
            return mobile_error_response(
                "Ya existe una ubicación registrada para este dispositivo en la misma fecha y hora",
                "UBICACION_DUPLICADA",
                status.HTTP_409_CONFLICT,
                {
                    "dispositivo_id": device.code,
                    "fecha_hora": data["fecha_hora"].isoformat(),
                },
            )

        safe_area = get_active_safe_area(child)
        inside_safe_area = (
            point_inside_polygon(data["longitud"], data["latitud"], safe_area.polygon)
            if safe_area
            else None
        )

        try:
            location = GeographicLocation.objects.create(
                device=device,
                child=child,
                latitude=Decimal(str(data["latitud"])),
                longitude=Decimal(str(data["longitud"])),
                precision=data["precision"],
                speed=data.get("velocidad"),
                device_timestamp=data["fecha_hora"],
                delivery_status=data.get("estado_envio", LocationDeliveryStatus.ENVIADO),
                inside_safe_area=inside_safe_area,
                created_by=request.user,
                source_ip=get_client_ip(request),
                source_host=request.get_host()[:120],
            )
        except IntegrityError:
            return mobile_error_response(
                "Ya existe una ubicación registrada para este dispositivo en la misma fecha y hora",
                "UBICACION_DUPLICADA",
                status.HTTP_409_CONFLICT,
            )

        response_data = GeographicLocationSerializer(location).data
        return Response(
            {
                "success": True,
                "message": "Ubicación registrada correctamente",
                "data": {
                    "ubicacion_id": response_data["id"],
                    "nino_id": response_data["nino_id"],
                    "dispositivo_id": response_data["dispositivo_id"],
                    "fecha_hora": response_data["fecha_hora"],
                    "punto": response_data["punto"],
                    "dentro_area_segura": response_data["dentro_area_segura"],
                },
                "ubicacion": {
                    "id": response_data["id"],
                    "child_id": response_data["nino_id"],
                    "device_id": response_data["dispositivo_id"],
                    "timestamp": response_data["fecha_hora"],
                    "inside_safe_area": response_data["dentro_area_segura"],
                },
            },
            status=status.HTTP_201_CREATED,
        )


class GeographicLocationHistoryView(BaseMobileView):
    def get(self, request):
        queryset = GeographicLocation.objects.select_related("child", "device", "created_by")
        child_id = request.query_params.get("nino_id", "").strip()

        accessible_children = get_mobile_accessible_children(request.user)
        queryset = queryset.filter(child__in=accessible_children)

        if child_id:
            queryset = queryset.filter(child_id=child_id)

        return Response(
            {
                "success": True,
                "message": "Historial de ubicaciones obtenido correctamente.",
                "data": GeographicLocationHistorySerializer(queryset[:100], many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class GeographicLocationByChildView(BaseMobileView):
    def get(self, request, nino_id: int):
        accessible_children = get_mobile_accessible_children(request.user)
        if not accessible_children.filter(id=nino_id).exists():
            return mobile_error_response(
                "No tiene acceso al historial de este niño",
                "ROL_NO_PERMITIDO",
                status.HTTP_403_FORBIDDEN,
                {"nino_id": nino_id},
            )

        queryset = GeographicLocation.objects.select_related("child", "device", "created_by").filter(child_id=nino_id)
        return Response(
            {
                "success": True,
                "message": "Historial del niño obtenido correctamente.",
                "data": GeographicLocationHistorySerializer(queryset[:100], many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class MonitoringAnalyzeView(BaseMonitoringView):
    @transaction.atomic
    def post(self, request):
        payload = request.data.copy()
        if "location_id" in payload and "ubicacion_id" not in payload:
            payload["ubicacion_id"] = payload["location_id"]

        serializer = MonitoringAnalyzeSerializer(data=payload)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Datos inválidos.",
                    "code": "DATOS_INVALIDOS",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        location = (
            GeographicLocation.objects.select_related("child", "child__centro_educativo", "device")
            .filter(id=serializer.validated_data["ubicacion_id"])
            .first()
        )
        if location is None:
            return mobile_error_response(
                "Ubicación no encontrada",
                "UBICACION_NO_ENCONTRADA",
                status.HTTP_404_NOT_FOUND,
                {"ubicacion_id": serializer.validated_data["ubicacion_id"]},
            )

        accessible_children = get_monitoring_accessible_children(request.user)
        if not accessible_children.filter(id=location.child_id).exists():
            return mobile_error_response(
                "No tiene permiso para monitorear este niño",
                "ROL_NO_PERMITIDO",
                status.HTTP_403_FORBIDDEN,
                {"nino_id": location.child_id},
            )

        history = ensure_monitoring_history(location)
        return Response(
            {
                "success": True,
                "message": "Ubicación analizada correctamente.",
                "data": {
                    "ubicacion_id": location.id,
                    "nino_id": location.child_id,
                    "estado": history.status,
                    "motivo": history.reason,
                    "dentro_area_segura": location.inside_safe_area,
                    "distancia_perimetro_m": history.distance_to_perimeter_m,
                    "zona_riesgo": history.risk_zone.name if history.risk_zone else None,
                    "alerta_generada": bool(history.alert_id),
                    "alerta_id": history.alert_id,
                    "fecha_hora": location.device_timestamp,
                },
            },
            status=status.HTTP_200_OK,
        )


class MonitoringHistoryView(BaseMonitoringView):
    def get(self, request):
        child_id = (request.query_params.get("nino_id") or request.query_params.get("child_id") or "").strip()
        accessible_children = get_monitoring_accessible_children(request.user)
        queryset = MonitoringHistory.objects.select_related(
            "child",
            "location_record",
            "risk_zone",
            "alert",
        ).filter(child__in=accessible_children)

        if child_id:
            queryset = queryset.filter(child_id=child_id)

        return Response(
            {
                "success": True,
                "message": "Historial de monitoreo obtenido correctamente.",
                "data": MonitoringHistorySerializer(queryset[:100], many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class MonitoringCurrentStatusView(BaseMonitoringView):
    def get(self, request, child_id: int):
        accessible_children = get_monitoring_accessible_children(request.user)
        child = accessible_children.select_related("centro_educativo", "dispositivo_gps").filter(id=child_id).first()
        if child is None:
            return mobile_error_response(
                "No tiene acceso al estado actual de este niño",
                "ROL_NO_PERMITIDO",
                status.HTTP_403_FORBIDDEN,
                {"nino_id": child_id},
            )

        last_history = (
            MonitoringHistory.objects.select_related("location_record", "alert")
            .filter(child=child)
            .order_by("-created_at")
            .first()
        )
        if last_history is None:
            return mobile_error_response(
                "No existe historial de monitoreo para este niño",
                "MONITOREO_NO_DISPONIBLE",
                status.HTTP_404_NOT_FOUND,
                {"nino_id": child_id},
            )

        payload = MonitoringCurrentStatusSerializer(
            {
                "child_id": child.id,
                "nombre": f"{child.nombres} {child.apellidos}",
                "estado_actual": last_history.status,
                "motivo": last_history.reason,
                "fecha_hora": last_history.location_record.device_timestamp,
                "ubicacion": {
                    "latitud": float(last_history.location_record.latitude),
                    "longitud": float(last_history.location_record.longitude),
                    "precision": last_history.location_record.precision,
                },
                "alerta_activa": bool(last_history.alert and last_history.alert.active),
            }
        ).data
        return Response(
            {
                "success": True,
                "message": "Estado actual obtenido correctamente.",
                "data": payload,
            },
            status=status.HTTP_200_OK,
        )


class MonitoringConfigView(BaseAdminView):
    def get(self, request):
        serializer = MonitoringConfigSerializer(get_monitoring_config())
        return Response(
            {
                "success": True,
                "message": "Configuración de monitoreo obtenida correctamente.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @transaction.atomic
    def patch(self, request):
        config = get_monitoring_config()
        serializer = MonitoringConfigSerializer(config, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Datos inválidos.",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer.save()
        return Response(
            {
                "success": True,
                "message": "Configuración de monitoreo actualizada correctamente.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class MonitoringMetricsView(BaseAdminView):
    def get(self, request):
        today = timezone.localdate()
        today_history = MonitoringHistory.objects.filter(created_at__date=today)
        active_alerts = MonitoringAlert.objects.filter(active=True)
        payload = {
            "fecha": today.isoformat(),
            "total_registros_hoy": today_history.count(),
            "seguros": today_history.filter(status=MonitoringStatus.SEGURO).count(),
            "fuera_area": today_history.filter(status=MonitoringStatus.FUERA_AREA).count(),
            "zona_riesgo": today_history.filter(status=MonitoringStatus.ZONA_RIESGO).count(),
            "pendientes": today_history.filter(status=MonitoringStatus.PENDIENTE).count(),
            "errores": today_history.filter(status=MonitoringStatus.ERROR).count(),
            "alertas_activas": active_alerts.count(),
            "ultimas_alertas": [
                {
                    "id": alert.id,
                    "child_id": alert.child_id,
                    "tipo": alert.alert_type,
                    "estado": alert.status,
                    "fecha_hora": alert.created_at,
                }
                for alert in active_alerts[:10]
            ],
            "disponibilidad_servicio": "LOCAL_OK",
        }
        return Response(
            {
                "success": True,
                "message": "Métricas de monitoreo obtenidas correctamente.",
                "data": payload,
            },
            status=status.HTTP_200_OK,
        )


class SecurityAlertsView(BaseMonitoringView):
    def get(self, request):
        queryset = get_security_alerts_scope(request.user)
        status_filter = (request.query_params.get("status") or "").strip()
        priority = (request.query_params.get("priority") or "").strip()
        alert_type = (request.query_params.get("alert_type") or "").strip()
        child_id = (request.query_params.get("child_id") or "").strip()
        educational_center_id = (request.query_params.get("educational_center_id") or "").strip()
        search = (request.query_params.get("search") or "").strip()
        date_from = parse_date((request.query_params.get("date_from") or "").strip())
        date_to = parse_date((request.query_params.get("date_to") or "").strip())
        page = max(int(request.query_params.get("page", 1) or 1), 1)
        page_size = min(max(int(request.query_params.get("page_size", 10) or 10), 1), 100)

        if status_filter:
            queryset = queryset.filter(workflow_status=status_filter)
        if priority:
            queryset = queryset.filter(priority=priority)
        if alert_type:
            queryset = queryset.filter(alert_type=alert_type)
        if child_id:
            queryset = queryset.filter(child_id=child_id)
        if educational_center_id:
            queryset = queryset.filter(educational_center_id=educational_center_id)
        if date_from:
            queryset = queryset.filter(event_datetime__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(event_datetime__date__lte=date_to)
        if search:
            queryset = queryset.filter(
                Q(child__nombres__icontains=search)
                | Q(child__apellidos__icontains=search)
                | Q(code__icontains=search)
                | Q(title__icontains=search)
                | Q(description__icontains=search)
                | Q(educational_center__name__icontains=search)
            )

        total_count = queryset.count()
        total_pages = max(1, math.ceil(total_count / page_size)) if total_count else 1
        alerts = queryset[((page - 1) * page_size) : page * page_size]

        return Response(
            {
                "count": total_count,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "results": [build_security_alert_list_payload(alert) for alert in alerts],
            },
            status=status.HTTP_200_OK,
        )

    @transaction.atomic
    def post(self, request):
        if request.user.rol != UserRole.ADMIN:
            return Response(
                {"message": "Solo el administrador puede crear alertas manualmente."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = SecurityAlertCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": "Datos inválidos.", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = serializer.validated_data
        child = Child.objects.select_related("centro_educativo", "dispositivo_gps").filter(id=data["child_id"]).first()
        location = GeographicLocation.objects.select_related("device", "child").filter(id=data["location_record_id"]).first()
        monitoring_history = MonitoringHistory.objects.filter(id=data.get("monitoring_history_id")).first()
        if child is None or location is None or location.child_id != child.id:
            return Response(
                {"message": "La ubicación o el niño no son válidos."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        config = get_monitoring_config()
        cutoff = timezone.now() - timedelta(minutes=config.min_time_between_alerts_min)
        existing_alert = MonitoringAlert.objects.filter(
            child=child,
            alert_type=data["alert_type"],
            reason=data["description"],
            detected_at__gte=cutoff,
            is_active=True,
        ).first()
        if existing_alert is not None:
            return Response(
                {
                    "message": "Ya existe una alerta equivalente dentro del intervalo mínimo permitido.",
                    "alert": {
                        "id": existing_alert.id,
                        "code": existing_alert.code or f"AL-{existing_alert.id:06d}",
                        "status": existing_alert.workflow_status,
                        "priority": existing_alert.priority,
                        "alert_type": existing_alert.alert_type,
                    },
                },
                status=status.HTTP_200_OK,
            )

        alert = MonitoringAlert.objects.create(
            child=child,
            educational_center=child.centro_educativo,
            gps_device=child.dispositivo_gps,
            location_record=location,
            monitoring_history=monitoring_history,
            risk_zone=monitoring_history.risk_zone if monitoring_history else None,
            alert_type=data["alert_type"],
            priority=data["priority"],
            workflow_status=SecurityAlertStatus.PENDIENTE,
            title=data["title"],
            description=data["description"],
            reason=data["description"],
            status=monitoring_history.status if monitoring_history else MonitoringStatus.PENDIENTE,
            latitude=data["latitude"],
            longitude=data["longitude"],
            accuracy=data.get("accuracy"),
            speed=data.get("speed"),
            event_datetime=data["event_datetime"],
            detected_at=timezone.now(),
            created_by=request.user,
            active=True,
            is_active=True,
        )
        create_security_alert_history(
            alert=alert,
            action=SecurityAlertHistoryAction.CREADA,
            previous_status=None,
            new_status=SecurityAlertStatus.PENDIENTE,
            comment="Alerta creada manualmente.",
            changed_by=request.user,
        )
        return Response(
            {
                "message": "Alerta de seguridad creada correctamente.",
                "alert": {
                    "id": alert.id,
                    "code": alert.code,
                    "status": alert.workflow_status,
                    "priority": alert.priority,
                    "alert_type": alert.alert_type,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class SecurityAlertDetailView(BaseMonitoringView):
    def get(self, request, alert_id: int):
        alert, error_response = get_security_alert_by_access(request.user, alert_id)
        if error_response:
            return error_response
        create_security_alert_history(
            alert=alert,
            action=SecurityAlertHistoryAction.VISTA,
            previous_status=alert.workflow_status,
            new_status=alert.workflow_status,
            comment="Consulta de detalle.",
            changed_by=request.user,
        )
        return Response(build_security_alert_payload(alert), status=status.HTTP_200_OK)


class SecurityAlertStatusUpdateView(BaseMonitoringView):
    @transaction.atomic
    def patch(self, request, alert_id: int):
        alert, error_response = get_security_alert_by_access(request.user, alert_id)
        if error_response:
            return error_response

        serializer = SecurityAlertStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": "Datos inválidos.", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        new_status = serializer.validated_data["status"]
        comment = serializer.validated_data.get("comment", "")

        if request.user.rol == UserRole.TUTOR:
            return Response(
                {"message": "El tutor no puede cambiar el estado de alertas."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if request.user.rol == UserRole.REGENTE and new_status != SecurityAlertStatus.ATENDIDA:
            return Response(
                {"message": "El regente solo puede marcar alertas como atendidas."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if new_status == SecurityAlertStatus.CERRADA and request.user.rol != UserRole.ADMIN:
            return Response(
                {"message": "Solo el administrador puede cerrar alertas."},
                status=status.HTTP_403_FORBIDDEN,
            )

        previous_status = alert.workflow_status
        alert = update_security_alert_status(
            alert=alert,
            new_status=new_status,
            comment=comment,
            user=request.user,
        )
        return Response(
            {
                "message": "Estado de alerta actualizado correctamente.",
                "alert": {
                    "id": alert.id,
                    "code": alert.code,
                    "previous_status": previous_status,
                    "status": alert.workflow_status,
                },
            },
            status=status.HTTP_200_OK,
        )


class SecurityAlertHistoryView(BaseMonitoringView):
    def get(self, request, alert_id: int):
        alert, error_response = get_security_alert_by_access(request.user, alert_id)
        if error_response:
            return error_response
        history = alert.security_history_entries.select_related("changed_by").all()
        return Response(
            {
                "alert_id": alert.id,
                "code": alert.code,
                "history": [serialize_security_alert_history_entry(entry) for entry in history],
            },
            status=status.HTTP_200_OK,
        )


class SecurityAlertStatsView(BaseMonitoringView):
    def get(self, request):
        queryset = get_security_alerts_scope(request.user)
        today = timezone.localdate()
        last_30_days = timezone.now() - timedelta(days=30)
        payload = {
            "active_alerts": queryset.filter(workflow_status__in=[SecurityAlertStatus.PENDIENTE, SecurityAlertStatus.ATENDIDA]).count(),
            "pending": queryset.filter(workflow_status=SecurityAlertStatus.PENDIENTE).count(),
            "attended_today": queryset.filter(workflow_status=SecurityAlertStatus.ATENDIDA, attended_at__date=today).count(),
            "closed_today": queryset.filter(workflow_status=SecurityAlertStatus.CERRADA, closed_at__date=today).count(),
            "total_30_days": queryset.filter(created_at__gte=last_30_days).count(),
            "by_type": {choice: queryset.filter(alert_type=choice).count() for choice, _ in AlertType.choices},
            "by_priority": {choice: queryset.filter(priority=choice).count() for choice, _ in SecurityAlertPriority.choices},
            "by_status": {choice: queryset.filter(workflow_status=choice).count() for choice, _ in SecurityAlertStatus.choices},
        }
        return Response(payload, status=status.HTTP_200_OK)


class BullyingSimulationVideoOptionsView(BaseAdminOrRegentView):
    def get(self, request):
        children = get_bullying_simulation_children_scope(request.user).order_by("apellidos", "nombres")
        return Response(
            {
                "message": "Opciones de simulación obtenidas correctamente.",
                "data": {
                    "folder": str(get_bullying_simulation_directory()),
                    "videos": [serialize_bullying_simulation_video(path) for path in list_bullying_simulation_video_paths()],
                    "children": [
                        {
                            "id": child.id,
                            "code": child.code,
                            "nombre_completo": child.nombre_completo,
                            "curso": child.curso,
                            "centro_educativo": child.centro_educativo.name,
                        }
                        for child in children
                    ],
                },
            },
            status=status.HTTP_200_OK,
        )


class MobileDeviceTokenView(BaseMobileView):
    def post(self, request):
        serializer = MobileDeviceTokenSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": "Datos inválidos.", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request.user.mobile_push_token = serializer.validated_data["token"].strip()
        request.user.mobile_push_platform = serializer.validated_data.get("platform", "").strip()
        request.user.mobile_push_updated_at = timezone.now()
        request.user.save(update_fields=["mobile_push_token", "mobile_push_platform", "mobile_push_updated_at"])

        return Response(
            {"message": "Token del dispositivo registrado correctamente."},
            status=status.HTTP_200_OK,
        )

    def delete(self, request):
        request.user.mobile_push_token = ""
        request.user.mobile_push_platform = ""
        request.user.mobile_push_updated_at = timezone.now()
        request.user.save(update_fields=["mobile_push_token", "mobile_push_platform", "mobile_push_updated_at"])
        return Response({"message": "Token del dispositivo eliminado correctamente."}, status=status.HTTP_200_OK)


class BullyingSimulationAnalysisView(BaseAdminOrRegentView):
    def get_queryset(self, user: User):
        queryset = BullyingVideoAnalysis.objects.select_related(
            "child",
            "educational_center",
            "generated_alert",
        )
        if user.rol == UserRole.REGENTE:
            queryset = queryset.filter(educational_center__regent=user)
        return queryset

    def get(self, request):
        queryset = self.get_queryset(request.user)
        child_id = (request.query_params.get("child_id") or "").strip()
        result = (request.query_params.get("result") or "").strip()
        if child_id:
            queryset = queryset.filter(child_id=child_id)
        if result:
            queryset = queryset.filter(result=result)
        serializer = BullyingVideoAnalysisSerializer(queryset[:100], many=True)
        return Response(
            {
                "message": "Historial de simulaciones obtenido correctamente.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @transaction.atomic
    def post(self, request):
        if request.user.rol != UserRole.ADMIN:
            return Response(
                {"message": "Solo el administrador puede procesar videos de simulación."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = BullyingVideoSimulationProcessSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": "Datos inválidos.", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        child = get_bullying_simulation_children_scope(request.user).filter(
            id=serializer.validated_data["child_id"]
        ).first()
        if child is None:
            return Response({"message": "Estudiante no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        video_path = resolve_bullying_simulation_video(serializer.validated_data["video_name"])
        if video_path is None:
            return Response(
                {"message": "El video seleccionado no existe en la carpeta configurada."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        analysis, generated_alert, error_message = execute_bullying_simulation_analysis(
            child=child,
            video_path=video_path,
            user=request.user,
        )
        if error_message:
            return Response({"message": error_message}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "message": (
                    "Video procesado y alerta de bullying generada correctamente."
                    if generated_alert is not None
                    else "Video procesado. No se detectaron incidentes de bullying."
                ),
                "data": BullyingVideoAnalysisSerializer(analysis).data,
            },
            status=status.HTTP_201_CREATED,
        )


class SecurityAlertsByChildView(BaseMonitoringView):
    def get(self, request, child_id: int):
        alerts = get_security_alerts_scope(request.user).filter(child_id=child_id)
        return Response(
            {
                "count": alerts.count(),
                "results": [build_security_alert_list_payload(alert) for alert in alerts[:100]],
            },
            status=status.HTTP_200_OK,
        )


class MobileSecurityAlertsView(BaseMobileView):
    def get(self, request):
        queryset = get_security_alerts_scope(request.user)
        status_filter = (request.query_params.get("status") or "").strip()
        child_id = (request.query_params.get("child_id") or "").strip()
        if status_filter:
            queryset = queryset.filter(workflow_status=status_filter)
        if child_id:
            queryset = queryset.filter(child_id=child_id)
        alerts = queryset[:100]
        return Response(
            {
                "success": True,
                "message": "Alertas de seguridad obtenidas correctamente.",
                "data": [build_security_alert_list_payload(alert) for alert in alerts],
            },
            status=status.HTTP_200_OK,
        )


class MobileSecurityAlertDetailView(BaseMobileView):
    def get(self, request, alert_id: int):
        alert, error_response = get_security_alert_by_access(request.user, alert_id)
        if error_response:
            return error_response
        create_security_alert_history(
            alert=alert,
            action=SecurityAlertHistoryAction.VISTA,
            previous_status=alert.workflow_status,
            new_status=alert.workflow_status,
            comment="Consulta de detalle móvil.",
            changed_by=request.user,
        )
        return Response(
            {
                "success": True,
                "message": "Detalle de alerta obtenido correctamente.",
                "data": build_security_alert_payload(alert),
            },
            status=status.HTTP_200_OK,
        )


class MobileSecurityAlertStatsView(BaseMobileView):
    def get(self, request):
        queryset = get_security_alerts_scope(request.user)
        return Response(
            {
                "success": True,
                "message": "Contadores de alertas obtenidos correctamente.",
                "data": {
                    "pending": queryset.filter(workflow_status=SecurityAlertStatus.PENDIENTE).count(),
                    "attended": queryset.filter(workflow_status=SecurityAlertStatus.ATENDIDA).count(),
                    "closed": queryset.filter(workflow_status=SecurityAlertStatus.CERRADA).count(),
                    "total": queryset.count(),
                },
            },
            status=status.HTTP_200_OK,
        )


class MobileSecurityAlertStatusUpdateView(BaseMobileView):
    @transaction.atomic
    def patch(self, request, alert_id: int):
        alert, error_response = get_security_alert_by_access(request.user, alert_id)
        if error_response:
            return error_response
        serializer = SecurityAlertStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": "Datos inválidos.", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        new_status = serializer.validated_data["status"]
        comment = serializer.validated_data.get("comment", "")
        if request.user.rol != UserRole.REGENTE or new_status != SecurityAlertStatus.ATENDIDA:
            return Response(
                {"message": "Solo el regente puede marcar alertas como atendidas desde móvil."},
                status=status.HTTP_403_FORBIDDEN,
            )
        previous_status = alert.workflow_status
        alert = update_security_alert_status(
            alert=alert,
            new_status=new_status,
            comment=comment,
            user=request.user,
        )
        return Response(
            {
                "success": True,
                "message": "Estado de alerta actualizado correctamente.",
                "data": {
                    "id": alert.id,
                    "code": alert.code,
                    "previous_status": previous_status,
                    "status": alert.workflow_status,
                },
            },
            status=status.HTTP_200_OK,
        )


class MobileChildrenListView(BaseMobileView):
    def get(self, request):
        children = get_mobile_accessible_children(request.user)
        return Response(
            {
                "success": True,
                "message": "Listado de niños obtenido correctamente.",
                "data": [build_child_card_payload(child) for child in children],
            },
            status=status.HTTP_200_OK,
        )


class MobileChildMapSummaryView(BaseMobileView):
    def get(self, request, child_id: int):
        child, error_response = get_child_by_access(request.user, child_id)
        if error_response:
            return error_response
        return Response(
            {
                "success": True,
                "message": "Resumen del mapa obtenido correctamente.",
                "data": build_map_summary_payload(child),
            },
            status=status.HTTP_200_OK,
        )


class MobileChildLocationHistoryView(BaseMobileView):
    def get(self, request, child_id: int):
        child, error_response = get_child_by_access(request.user, child_id)
        if error_response:
            return error_response

        selected_date = (request.query_params.get("date") or "").strip()
        locations = GeographicLocation.objects.filter(child=child).order_by("-device_timestamp", "-created_at")
        if selected_date:
            parsed_date = parse_date(selected_date)
            if parsed_date is not None:
                locations = locations.filter(device_timestamp__date=parsed_date)

        response_data = []
        for location in locations[:100]:
            monitoring_entry = MonitoringHistory.objects.filter(location_record=location).order_by("-created_at").first()
            response_data.append(
                {
                    "id": location.id,
                    "recorded_at": location.device_timestamp,
                    "latitude": float(location.latitude),
                    "longitude": float(location.longitude),
                    "accuracy": location.precision,
                    "speed": location.speed,
                    "status": monitoring_entry.status if monitoring_entry else None,
                    "status_label": monitoring_entry.reason if monitoring_entry else None,
                }
            )

        return Response(
            {
                "success": True,
                "message": "Historial de ubicaciones obtenido correctamente.",
                "data": response_data,
            },
            status=status.HTTP_200_OK,
        )


class MobileChildAlertsView(BaseMobileView):
    def get(self, request, child_id: int):
        child, error_response = get_child_by_access(request.user, child_id)
        if error_response:
            return error_response

        alerts = (
            MonitoringAlert.objects.filter(child=child)
            .select_related("location_record")
            .order_by("-created_at")
        )
        response_data = []
        for alert in alerts[:100]:
            history_entry = MonitoringHistory.objects.filter(alert=alert).order_by("-created_at").first()
            response_data.append(
                {
                    "id": alert.id,
                    "type": alert.alert_type,
                    "title": alert.title or alert.alert_type.replace("_", " ").title(),
                    "description": alert.description or alert.reason,
                    "created_at": alert.created_at,
                    "status": alert.workflow_status,
                    "child": {
                        "id": child.id,
                        "full_name": f"{child.nombres} {child.apellidos}",
                    },
                    "distance_m": history_entry.distance_to_perimeter_m if history_entry else None,
                    "latitude": float(alert.latitude),
                    "longitude": float(alert.longitude),
                }
            )

        return Response(
            {
                "success": True,
                "message": "Alertas del niño obtenidas correctamente.",
                "data": response_data,
            },
            status=status.HTTP_200_OK,
        )


class MobileChildLocationHistorySearchView(BaseMobileView):
    def get(self, request, child_id: int):
        child, error_response = get_child_by_access(request.user, child_id)
        if error_response:
            return error_response
        if child.status != ChildStatus.ACTIVO:
            return Response(
                {"message": "El niño se encuentra inactivo."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        start_date = parse_history_datetime(request.query_params.get("start_date"))
        end_date = parse_history_datetime(request.query_params.get("end_date"), end_of_day=True)
        start_time_value = parse_time((request.query_params.get("start_time") or "").strip())
        end_time_value = parse_time((request.query_params.get("end_time") or "").strip())
        estado = (request.query_params.get("estado") or "").strip()
        zona = (request.query_params.get("zona") or "").strip()
        page = max(int(request.query_params.get("page", 1) or 1), 1)
        page_size = min(max(int(request.query_params.get("page_size", 25) or 25), 1), 100)

        if start_date and end_date and start_date > end_date:
            return Response(
                {"message": "La fecha de inicio no puede ser mayor a la fecha de fin."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if start_time_value and end_time_value and start_time_value > end_time_value:
            return Response(
                {"message": "La hora de inicio no puede ser mayor a la hora de fin."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if start_date and end_date and (end_date - start_date) > timedelta(days=30):
            return Response(
                {"message": "El rango máximo permitido es de 30 días."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = (
            GeographicLocation.objects.select_related("child", "device")
            .filter(child=child)
            .order_by("device_timestamp", "created_at")
        )
        if start_date:
            queryset = queryset.filter(device_timestamp__gte=start_date)
        if end_date:
            queryset = queryset.filter(device_timestamp__lte=end_date)
        if start_time_value:
            queryset = queryset.filter(device_timestamp__time__gte=start_time_value)
        if end_time_value:
            queryset = queryset.filter(device_timestamp__time__lte=end_time_value)

        records = []
        for location in queryset:
            detail = build_location_detail_payload(location)
            if estado and detail["estado_monitoreo"] != estado:
                continue
            if zona:
                zone_id = str(detail["zona_riesgo"]["id"]) if detail["zona_riesgo"] else ""
                if zone_id != zona:
                    continue
            records.append(
                {
                    "id": location.id,
                    "location_code": detail["location_code"],
                    "fecha_hora": detail["fecha_hora"],
                    "latitude": detail["latitude"],
                    "longitude": detail["longitude"],
                    "accuracy": detail["accuracy"],
                    "speed": detail["speed"],
                    "device_code": detail["device_code"],
                    "source": detail["source"],
                    "estado_monitoreo": detail["estado_monitoreo"],
                    "direccion_aproximada": detail["direccion_aproximada"],
                    "observacion": detail["observacion"],
                    "distancia_perimetro_m": detail["distancia_perimetro_m"],
                    "zona_riesgo": detail["zona_riesgo"],
                }
            )

        total_count = len(records)
        total_pages = max(1, math.ceil(total_count / page_size)) if total_count else 1
        start_index = (page - 1) * page_size
        end_index = start_index + page_size
        paginated_records = records[start_index:end_index]

        safe_count = sum(1 for record in records if record["estado_monitoreo"] == MonitoringStatus.SEGURO)
        outside_count = sum(1 for record in records if record["estado_monitoreo"] == MonitoringStatus.FUERA_AREA)
        risk_count = sum(1 for record in records if record["estado_monitoreo"] == MonitoringStatus.ZONA_RIESGO)
        pending_count = sum(1 for record in records if record["estado_monitoreo"] == MonitoringStatus.PENDIENTE)
        error_count = sum(1 for record in records if record["estado_monitoreo"] == MonitoringStatus.ERROR)

        distance_km = 0.0
        for index in range(1, len(records)):
            distance_km += distance_meters_between_points(
                records[index - 1]["latitude"],
                records[index - 1]["longitude"],
                records[index]["latitude"],
                records[index]["longitude"],
            ) / 1000

        time_total = 0.0
        if records:
            time_total = (
                records[-1]["fecha_hora"] - records[0]["fecha_hora"]
            ).total_seconds()

        speeds_m_s = [record["speed"] for record in records if record["speed"] is not None]
        average_speed_kmh = ((sum(speeds_m_s) / len(speeds_m_s)) * 3.6) if speeds_m_s else 0.0
        max_speed_kmh = (max(speeds_m_s) * 3.6) if speeds_m_s else 0.0

        return Response(
            {
                "child": {
                    "id": child.id,
                    "nombre_completo": f"{child.nombres} {child.apellidos}",
                    "grado": child.curso,
                    "centro_educativo": child.centro_educativo.name,
                    "dispositivo_gps": child.dispositivo_gps.code if child.dispositivo_gps else None,
                },
                "filters": {
                    "start_date": start_date.isoformat() if start_date else None,
                    "end_date": end_date.isoformat() if end_date else None,
                    "start_time": start_time_value.strftime("%H:%M") if start_time_value else None,
                    "end_time": end_time_value.strftime("%H:%M") if end_time_value else None,
                    "estado": estado or None,
                    "zona": zona or None,
                },
                "count": total_count,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "results": paginated_records,
                "summary": {
                    "total_registros": total_count,
                    "dentro_area": safe_count,
                    "fuera_area": outside_count,
                    "zona_riesgo": risk_count,
                    "pendientes": pending_count,
                    "errores": error_count,
                    "distancia_recorrida_km": round(distance_km, 2),
                    "tiempo_total": format_duration(time_total),
                    "velocidad_promedio_kmh": round(average_speed_kmh, 2),
                    "velocidad_maxima_kmh": round(max_speed_kmh, 2),
                },
            },
            status=status.HTTP_200_OK,
        )


class MobileLocationHistoryDetailView(BaseMobileView):
    def get(self, request, location_id: int):
        location = (
            GeographicLocation.objects.select_related("child", "device", "child__centro_educativo")
            .filter(id=location_id)
            .first()
        )
        if location is None:
            return Response({"message": "Ubicación no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        child, error_response = get_child_by_access(request.user, location.child_id)
        if error_response:
            return error_response
        if child.status != ChildStatus.ACTIVO:
            return Response(
                {"message": "El niño se encuentra inactivo."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(build_location_detail_payload(location), status=status.HTTP_200_OK)


class MobileChildMapContextView(BaseMobileView):
    def get(self, request, child_id: int):
        child, error_response = get_child_by_access(request.user, child_id)
        if error_response:
            return error_response
        if child.status != ChildStatus.ACTIVO:
            return Response(
                {"message": "El niño se encuentra inactivo."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(build_history_map_context(child), status=status.HTTP_200_OK)


class MobileChildLocationHistoryExportView(BaseMobileView):
    def get(self, request, child_id: int):
        child, error_response = get_child_by_access(request.user, child_id)
        if error_response:
            return error_response
        if child.status != ChildStatus.ACTIVO:
            return Response(
                {"message": "El niño se encuentra inactivo."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        export_format = (request.query_params.get("format") or "").strip().lower()
        return Response(
            {
                "message": f"La exportación en formato {export_format or 'desconocido'} aún no está disponible en móvil.",
                "available": False,
                "child_id": child.id,
            },
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )


class ChildListCreateView(BaseAdminView):
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]

    def get(self, request):
        queryset = Child.objects.select_related("centro_educativo", "dispositivo_gps")

        search = request.query_params.get("search", "").strip()
        center = request.query_params.get("centro_educativo", "").strip()
        course = request.query_params.get("curso", "").strip()
        child_status = request.query_params.get("status", "").strip()
        gps = request.query_params.get("dispositivo_gps", "").strip()
        registered_at = request.query_params.get("fecha_registro", "").strip()

        if search:
            queryset = queryset.filter(
                Q(nombres__icontains=search) | Q(apellidos__icontains=search) | Q(code__icontains=search)
            )
        if center:
            queryset = queryset.filter(centro_educativo_id=center)
        if course:
            queryset = queryset.filter(curso__icontains=course)
        if child_status in {ChildStatus.ACTIVO, ChildStatus.INACTIVO}:
            queryset = queryset.filter(status=child_status)
        if gps:
            if gps == "none":
                queryset = queryset.filter(dispositivo_gps__isnull=True)
            else:
                queryset = queryset.filter(dispositivo_gps_id=gps)
        if registered_at:
            parsed_date = parse_date(registered_at)
            if parsed_date:
                queryset = queryset.filter(fecha_registro__date=parsed_date)

        total = queryset.count()
        page = max(int(request.query_params.get("page", 1) or 1), 1)
        page_size = max(min(int(request.query_params.get("page_size", 10) or 10), 100), 1)
        start = (page - 1) * page_size
        end = start + page_size
        items = queryset.order_by("-fecha_registro")[start:end]
        total_pages = (total + page_size - 1) // page_size if total else 1

        return Response(
            {
                "count": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "results": ChildListSerializer(items, many=True, context={"request": request}).data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = ChildWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            child = serializer.save()
            detail = Child.objects.select_related("centro_educativo", "dispositivo_gps").get(pk=child.id)
            return Response(ChildDetailSerializer(detail, context={"request": request}).data, status=status.HTTP_201_CREATED)
        except Exception:
            return Response({"message": "Error al guardar. Intente nuevamente."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ChildDetailView(BaseAdminView):
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]

    def get_object(self, child_id: int):
        return Child.objects.select_related("centro_educativo", "dispositivo_gps").filter(pk=child_id).first()

    def get(self, request, child_id: int):
        child = self.get_object(child_id)
        if not child:
            return Response({"message": "Niño no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ChildDetailSerializer(child, context={"request": request}).data, status=status.HTTP_200_OK)

    def put(self, request, child_id: int):
        child = self.get_object(child_id)
        if not child:
            return Response({"message": "Niño no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ChildWriteSerializer(instance=child, data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            updated_child = serializer.save()
            detail = self.get_object(updated_child.id)
            return Response(ChildDetailSerializer(detail, context={"request": request}).data, status=status.HTTP_200_OK)
        except Exception:
            return Response({"message": "Error al guardar. Intente nuevamente."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request, child_id: int):
        child = self.get_object(child_id)
        if not child:
            return Response({"message": "Niño no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        # Placeholder for future dependent history checks.
        has_dependent_history = False
        if has_dependent_history:
            return Response(
                {"message": "No se puede eliminar el niño porque tiene historial dependiente."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        child.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChildStatusView(BaseAdminView):
    def patch(self, request, child_id: int):
        child = Child.objects.filter(pk=child_id).first()
        if not child:
            return Response({"message": "Niño no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ChildStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        next_status = serializer.validated_data["status"]
        motivo = serializer.validated_data.get("motivo_desactivacion", "").strip()

        if next_status == ChildStatus.ACTIVO:
            if child.dispositivo_gps:
                conflict = Child.objects.filter(
                    dispositivo_gps=child.dispositivo_gps,
                    status=ChildStatus.ACTIVO,
                ).exclude(pk=child.id)
                if conflict.exists():
                    return Response(
                        {"message": "El dispositivo GPS ya está asignado a otro niño activo."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            child.motivo_desactivacion = ""
        else:
            child.motivo_desactivacion = motivo

        child.status = next_status
        child.save(update_fields=["status", "motivo_desactivacion", "fecha_actualizacion"])
        detail = Child.objects.select_related("centro_educativo", "dispositivo_gps").get(pk=child_id)
        return Response(ChildDetailSerializer(detail, context={"request": request}).data, status=status.HTTP_200_OK)


class ChildStatsView(BaseAdminView):
    def get(self, request):
        return Response(
            {
                "total_ninos": Child.objects.count(),
                "activos": Child.objects.filter(status=ChildStatus.ACTIVO).count(),
                "inactivos": Child.objects.filter(status=ChildStatus.INACTIVO).count(),
                "con_gps_asignado": Child.objects.filter(dispositivo_gps__isnull=False).count(),
                "sin_gps_asignado": Child.objects.filter(dispositivo_gps__isnull=True).count(),
            },
            status=status.HTTP_200_OK,
        )


def get_student_queryset_for_user(user: User):
    queryset = Child.objects.select_related("centro_educativo", "dispositivo_gps", "created_by", "updated_by", "deleted_by").filter(
        deleted_at__isnull=True
    )
    if user.rol == UserRole.REGENTE:
        queryset = queryset.filter(centro_educativo__regent=user)
    return queryset


def serialize_student_snapshot(student: Child | None):
    if student is None:
        return {}
    return {
        "id": student.id,
        "code": student.code,
        "nombres": student.nombres,
        "apellidos": student.apellidos,
        "nombre_completo": student.nombre_completo,
        "fecha_nacimiento": student.fecha_nacimiento.isoformat(),
        "edad": student.edad,
        "genero": student.genero,
        "ci": student.ci,
        "rude": student.rude,
        "curso": student.curso,
        "paralelo": student.paralelo,
        "nivel": student.nivel,
        "turno": student.turno,
        "direccion": student.direccion,
        "telefono_contacto": student.telefono_contacto,
        "nombre_contacto_emergencia": student.nombre_contacto_emergencia,
        "telefono_contacto_emergencia": student.telefono_contacto_emergencia,
        "educational_center": {
            "id": student.centro_educativo_id,
            "code": student.centro_educativo.code if student.centro_educativo_id else None,
            "name": student.centro_educativo.name if student.centro_educativo_id else None,
        },
        "gps_device": {
            "id": student.dispositivo_gps_id,
            "code": student.dispositivo_gps.code if student.dispositivo_gps_id else None,
            "status": student.dispositivo_gps.status if student.dispositivo_gps_id else None,
        }
        if student.dispositivo_gps_id
        else None,
        "status": student.status.upper(),
        "motivo_desactivacion": student.motivo_desactivacion,
        "desactivado_en": student.desactivado_en.isoformat() if student.desactivado_en else None,
    }


def create_student_history(*, student: Child, action: str, description: str, performed_by=None, previous_data=None, new_data=None):
    StudentHistory.objects.create(
        student=student,
        action=action,
        description=description,
        previous_data=previous_data or {},
        new_data=new_data or {},
        performed_by=performed_by,
    )


class BaseStudentView(BaseAdminView):
    permission_classes = [IsAdminOrRegentRole]

    def ensure_write_allowed(self, request):
        if request.user.rol != UserRole.ADMIN:
            return Response({"detail": "No tiene permisos para realizar esta acción."}, status=status.HTTP_403_FORBIDDEN)
        return None


class StudentListCreateView(BaseStudentView):
    def get(self, request):
        queryset = get_student_queryset_for_user(request.user)

        search = request.query_params.get("search", "").strip()
        student_status = request.query_params.get("status", "").strip().upper()
        educational_center = request.query_params.get("educational_center", "").strip()
        nivel = request.query_params.get("nivel", "").strip().upper()
        curso = request.query_params.get("curso", "").strip()
        paralelo = request.query_params.get("paralelo", "").strip()
        turno = request.query_params.get("turno", "").strip().upper()
        genero = request.query_params.get("genero", "").strip().upper()
        has_gps = request.query_params.get("has_gps", "").strip().lower()

        if search:
            queryset = queryset.filter(
                Q(nombres__icontains=search)
                | Q(apellidos__icontains=search)
                | Q(code__icontains=search)
                | Q(ci__icontains=search)
                | Q(rude__icontains=search)
            )
        if student_status in {"ACTIVO", "INACTIVO"}:
            queryset = queryset.filter(status=ChildStatus.ACTIVO if student_status == "ACTIVO" else ChildStatus.INACTIVO)
        if educational_center:
            queryset = queryset.filter(centro_educativo_id=educational_center)
        if nivel:
            queryset = queryset.filter(nivel=nivel)
        if curso:
            queryset = queryset.filter(curso__icontains=curso)
        if paralelo:
            queryset = queryset.filter(paralelo__icontains=paralelo)
        if turno:
            queryset = queryset.filter(turno=turno)
        if genero:
            queryset = queryset.filter(genero=genero)
        if has_gps in {"true", "false"}:
            queryset = queryset.filter(dispositivo_gps__isnull=has_gps == "false")

        total = queryset.count()
        page = max(int(request.query_params.get("page", "1") or 1), 1)
        page_size = max(min(int(request.query_params.get("page_size", "10") or 10), 100), 1)
        start = (page - 1) * page_size
        end = start + page_size
        items = queryset.order_by("apellidos", "nombres", "id")[start:end]
        total_pages = (total + page_size - 1) // page_size if total else 1

        return Response(
            {
                "count": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "results": StudentListSerializer(items, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    @transaction.atomic
    def post(self, request):
        forbidden = self.ensure_write_allowed(request)
        if forbidden:
            return forbidden

        serializer = StudentWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student = serializer.save(created_by=request.user, updated_by=request.user)
        detail = Child.objects.select_related("centro_educativo", "dispositivo_gps", "created_by", "updated_by").get(pk=student.id)
        create_student_history(
            student=detail,
            action=StudentHistoryAction.CREACION,
            description="Estudiante creado.",
            performed_by=request.user,
            new_data=serialize_student_snapshot(detail),
        )
        return Response(StudentDetailSerializer(detail).data, status=status.HTTP_201_CREATED)


class StudentDetailView(BaseStudentView):
    def get_object(self, request, student_id: int):
        return get_student_queryset_for_user(request.user).filter(pk=student_id).first()

    def get(self, request, student_id: int):
        student = self.get_object(request, student_id)
        if not student:
            return Response({"message": "Estudiante no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        return Response(StudentDetailSerializer(student).data, status=status.HTTP_200_OK)

    @transaction.atomic
    def put(self, request, student_id: int):
        forbidden = self.ensure_write_allowed(request)
        if forbidden:
            return forbidden

        student = self.get_object(request, student_id)
        if not student:
            return Response({"message": "Estudiante no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        previous_data = serialize_student_snapshot(student)
        previous_device_id = student.dispositivo_gps_id

        serializer = StudentWriteSerializer(instance=student, data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated_student = serializer.save(updated_by=request.user)
        if updated_student.status == ChildStatus.INACTIVO and updated_student.dispositivo_gps_id:
            released_device = updated_student.dispositivo_gps
            updated_student.dispositivo_gps = None
            updated_student.save(update_fields=["dispositivo_gps", "fecha_actualizacion", "updated_by"])
            released_device.sync_status_with_assignment()
            released_device.save(update_fields=["status", "updated_at"])

        detail = Child.objects.select_related("centro_educativo", "dispositivo_gps", "created_by", "updated_by", "deleted_by").get(pk=updated_student.id)
        action = StudentHistoryAction.EDICION
        description = "Estudiante actualizado."
        if previous_device_id != detail.dispositivo_gps_id:
            action = StudentHistoryAction.ASIGNACION_GPS if detail.dispositivo_gps_id else StudentHistoryAction.LIBERACION_GPS
            description = "Asignación de GPS actualizada."
        create_student_history(
            student=detail,
            action=action,
            description=description,
            performed_by=request.user,
            previous_data=previous_data,
            new_data=serialize_student_snapshot(detail),
        )
        return Response(StudentDetailSerializer(detail).data, status=status.HTTP_200_OK)

    @transaction.atomic
    def delete(self, request, student_id: int):
        forbidden = self.ensure_write_allowed(request)
        if forbidden:
            return forbidden

        student = self.get_object(request, student_id)
        if not student:
            return Response({"message": "Estudiante no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        previous_data = serialize_student_snapshot(student)
        released_device = student.dispositivo_gps
        student.status = ChildStatus.INACTIVO
        student.motivo_desactivacion = student.motivo_desactivacion or "Baja lógica del estudiante."
        student.desactivado_en = timezone.now()
        student.deleted_at = timezone.now()
        student.deleted_by = request.user
        student.updated_by = request.user
        student.dispositivo_gps = None
        student.save(
            update_fields=[
                "status",
                "motivo_desactivacion",
                "desactivado_en",
                "deleted_at",
                "deleted_by",
                "updated_by",
                "dispositivo_gps",
                "fecha_actualizacion",
            ]
        )
        if released_device:
            released_device.sync_status_with_assignment()
            released_device.save(update_fields=["status", "updated_at"])

        create_student_history(
            student=student,
            action=StudentHistoryAction.ELIMINACION,
            description="Estudiante eliminado lógicamente.",
            performed_by=request.user,
            previous_data=previous_data,
            new_data=serialize_student_snapshot(student),
        )
        return Response({"message": "Estudiante eliminado correctamente."}, status=status.HTTP_200_OK)


class StudentStatusView(BaseStudentView):
    @transaction.atomic
    def patch(self, request, student_id: int):
        forbidden = self.ensure_write_allowed(request)
        if forbidden:
            return forbidden

        student = get_student_queryset_for_user(request.user).filter(pk=student_id).first()
        if not student:
            return Response({"message": "Estudiante no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        serializer = StudentStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        previous_data = serialize_student_snapshot(student)
        next_status = serializer.validated_data["status"]
        motivo = serializer.validated_data.get("motivo_desactivacion", "").strip()

        if next_status == "ACTIVO":
            student.status = ChildStatus.ACTIVO
            student.motivo_desactivacion = ""
            student.desactivado_en = None
        else:
            student.status = ChildStatus.INACTIVO
            student.motivo_desactivacion = motivo
            student.desactivado_en = timezone.now()
            if student.dispositivo_gps:
                released_device = student.dispositivo_gps
                student.dispositivo_gps = None
                released_device.sync_status_with_assignment()
                released_device.save(update_fields=["status", "updated_at"])

        student.updated_by = request.user
        student.save(update_fields=["status", "motivo_desactivacion", "desactivado_en", "dispositivo_gps", "updated_by", "fecha_actualizacion"])
        detail = Child.objects.select_related("centro_educativo", "dispositivo_gps", "created_by", "updated_by", "deleted_by").get(pk=student_id)
        create_student_history(
            student=detail,
            action=StudentHistoryAction.CAMBIO_ESTADO,
            description="Estado del estudiante actualizado.",
            performed_by=request.user,
            previous_data=previous_data,
            new_data=serialize_student_snapshot(detail),
        )
        return Response(StudentDetailSerializer(detail).data, status=status.HTTP_200_OK)


class StudentStatsView(BaseStudentView):
    def get(self, request):
        queryset = get_student_queryset_for_user(request.user)
        return Response(
            {
                "total_estudiantes": queryset.count(),
                "activos": queryset.filter(status=ChildStatus.ACTIVO).count(),
                "inactivos": queryset.filter(status=ChildStatus.INACTIVO).count(),
                "con_gps": queryset.filter(dispositivo_gps__isnull=False).count(),
                "sin_gps": queryset.filter(dispositivo_gps__isnull=True).count(),
                "por_nivel": {
                    "INICIAL": queryset.filter(nivel="INICIAL").count(),
                    "PRIMARIA": queryset.filter(nivel="PRIMARIA").count(),
                    "SECUNDARIA": queryset.filter(nivel="SECUNDARIA").count(),
                },
                "por_turno": {
                    "MANANA": queryset.filter(turno="MANANA").count(),
                    "TARDE": queryset.filter(turno="TARDE").count(),
                    "NOCHE": queryset.filter(turno="NOCHE").count(),
                },
                "por_genero": {
                    "MASCULINO": queryset.filter(genero="MASCULINO").count(),
                    "FEMENINO": queryset.filter(genero="FEMENINO").count(),
                    "OTRO": queryset.filter(genero="OTRO").count(),
                },
                "por_centro": [
                    {
                        "id": row["centro_educativo_id"],
                        "name": row["centro_educativo__name"],
                        "count": row["count"],
                    }
                    for row in queryset.values("centro_educativo_id", "centro_educativo__name").annotate(count=Count("id")).order_by("centro_educativo__name")
                ],
            },
            status=status.HTTP_200_OK,
        )


class StudentByCenterView(BaseStudentView):
    def get(self, request, center_id: int):
        queryset = get_student_queryset_for_user(request.user).filter(centro_educativo_id=center_id)
        return Response(StudentListSerializer(queryset.order_by("apellidos", "nombres"), many=True).data, status=status.HTTP_200_OK)


class StudentHistoryView(BaseStudentView):
    def get(self, request, student_id: int):
        student = get_student_queryset_for_user(request.user).filter(pk=student_id).first()
        if not student:
            return Response({"message": "Estudiante no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        history = student.history_entries.select_related("performed_by").all()
        return Response(StudentHistorySerializer(history, many=True).data, status=status.HTTP_200_OK)


class StudentActiveView(BaseStudentView):
    def get(self, request):
        queryset = get_student_queryset_for_user(request.user).filter(status=ChildStatus.ACTIVO)
        return Response(StudentListSerializer(queryset.order_by("apellidos", "nombres"), many=True).data, status=status.HTTP_200_OK)


class StudentWithoutGpsView(BaseStudentView):
    def get(self, request):
        queryset = get_student_queryset_for_user(request.user).filter(dispositivo_gps__isnull=True)
        return Response(StudentListSerializer(queryset.order_by("apellidos", "nombres"), many=True).data, status=status.HTTP_200_OK)


class TutorListCreateView(BaseAdminView):
    def get(self, request):
        queryset = Tutor.objects.prefetch_related("children").annotate(children_count=Count("children", distinct=True))

        search = request.query_params.get("search", "").strip()
        parentesco = request.query_params.get("parentesco", "").strip()
        tutor_status = request.query_params.get("estado", "").strip()
        child_id = request.query_params.get("child_id", "").strip()
        cuenta_movil_estado = request.query_params.get("cuenta_movil_estado", "").strip()
        fecha_registro = request.query_params.get("fecha_registro", "").strip()

        if search:
            queryset = queryset.filter(
                Q(nombres__icontains=search)
                | Q(apellidos__icontains=search)
                | Q(correo_electronico__icontains=search)
                | Q(telefono__icontains=search)
            )
        if parentesco:
            queryset = queryset.filter(parentesco__iexact=parentesco)
        if tutor_status in {TutorStatus.ACTIVO, TutorStatus.INACTIVO}:
            queryset = queryset.filter(estado=tutor_status)
        if child_id:
            queryset = queryset.filter(children__id=child_id)
        if cuenta_movil_estado in {
            MobileAccountStatus.ACTIVA,
            MobileAccountStatus.INACTIVA,
            MobileAccountStatus.SIN_CUENTA,
        }:
            queryset = queryset.filter(cuenta_movil_estado=cuenta_movil_estado)
        if fecha_registro:
            parsed_date = parse_date(fecha_registro)
            if parsed_date:
                queryset = queryset.filter(fecha_registro__date=parsed_date)

        total = queryset.count()
        page = max(int(request.query_params.get("page", 1) or 1), 1)
        page_size = max(min(int(request.query_params.get("page_size", 10) or 10), 100), 1)
        start = (page - 1) * page_size
        end = start + page_size
        items = queryset.order_by("-fecha_registro")[start:end]
        total_pages = (total + page_size - 1) // page_size if total else 1

        return Response(
            {
                "count": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "results": TutorListSerializer(items, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = TutorWriteSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            tutor = serializer.save()
            detail = self._get_detail(tutor.id)
            return Response(TutorDetailSerializer(detail).data, status=status.HTTP_201_CREATED)
        except Exception:
            return Response({"message": "Error al guardar la información. Intente nuevamente."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_detail(self, tutor_id: int):
        return (
            Tutor.objects.select_related("creado_por", "actualizado_por")
            .prefetch_related("children__centro_educativo")
            .annotate(children_count=Count("children", distinct=True))
            .get(pk=tutor_id)
        )


class TutorDetailView(BaseAdminView):
    def get_object(self, tutor_id: int):
        return (
            Tutor.objects.select_related("creado_por", "actualizado_por")
            .prefetch_related("children__centro_educativo")
            .annotate(children_count=Count("children", distinct=True))
            .filter(pk=tutor_id)
            .first()
        )

    def get(self, request, tutor_id: int):
        tutor = self.get_object(tutor_id)
        if not tutor:
            return Response({"message": "Tutor no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        return Response(TutorDetailSerializer(tutor).data, status=status.HTTP_200_OK)

    def put(self, request, tutor_id: int):
        tutor = self.get_object(tutor_id)
        if not tutor:
            return Response({"message": "Tutor no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        serializer = TutorWriteSerializer(instance=tutor, data=request.data, context={"request": request})
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            updated_tutor = serializer.save()
            detail = self.get_object(updated_tutor.id)
            return Response(TutorDetailSerializer(detail).data, status=status.HTTP_200_OK)
        except Exception:
            return Response({"message": "Error al guardar la información. Intente nuevamente."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request, tutor_id: int):
        tutor = self.get_object(tutor_id)
        if not tutor:
            return Response({"message": "Tutor no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        if tutor.children.exists():
            return Response(
                {"message": "No se puede eliminar el tutor porque tiene niños asociados."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        tutor.estado = TutorStatus.INACTIVO
        tutor.cuenta_movil_estado = MobileAccountStatus.INACTIVA
        tutor.actualizado_por = request.user
        tutor.save(update_fields=["estado", "cuenta_movil_estado", "actualizado_por", "fecha_actualizacion"])
        return Response({"message": "Tutor desactivado de forma lógica."}, status=status.HTTP_200_OK)


class TutorStatusView(BaseAdminView):
    def patch(self, request, tutor_id: int):
        tutor = Tutor.objects.filter(pk=tutor_id).first()
        if not tutor:
            return Response({"message": "Tutor no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        serializer = TutorStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        next_status = serializer.validated_data["estado"]
        motivo = serializer.validated_data.get("motivo_desactivacion", "").strip()

        tutor.estado = next_status
        tutor.motivo_desactivacion = "" if next_status == TutorStatus.ACTIVO else motivo
        tutor.cuenta_movil_estado = (
            MobileAccountStatus.INACTIVA
            if next_status == TutorStatus.INACTIVO and tutor.cuenta_movil_estado != MobileAccountStatus.SIN_CUENTA
            else tutor.cuenta_movil_estado
        )
        tutor.actualizado_por = request.user
        tutor.save(
            update_fields=[
                "estado",
                "motivo_desactivacion",
                "cuenta_movil_estado",
                "actualizado_por",
                "fecha_actualizacion",
            ]
        )
        detail = (
            Tutor.objects.select_related("creado_por", "actualizado_por")
            .prefetch_related("children__centro_educativo")
            .annotate(children_count=Count("children", distinct=True))
            .get(pk=tutor_id)
        )
        return Response(TutorDetailSerializer(detail).data, status=status.HTTP_200_OK)


class TutorStatsView(BaseAdminView):
    def get(self, request):
        return Response(
            {
                "total_tutores": Tutor.objects.count(),
                "activos": Tutor.objects.filter(estado=TutorStatus.ACTIVO).count(),
                "inactivos": Tutor.objects.filter(estado=TutorStatus.INACTIVO).count(),
                "con_cuenta_movil": Tutor.objects.exclude(cuenta_movil_estado=MobileAccountStatus.SIN_CUENTA).count(),
                "sin_cuenta_movil": Tutor.objects.filter(cuenta_movil_estado=MobileAccountStatus.SIN_CUENTA).count(),
            },
            status=status.HTTP_200_OK,
        )


class TutorChildrenView(BaseAdminView):
    def get_object(self, tutor_id: int):
        return Tutor.objects.prefetch_related("children__centro_educativo").filter(pk=tutor_id).first()

    def get(self, request, tutor_id: int):
        tutor = self.get_object(tutor_id)
        if not tutor:
            return Response({"message": "Tutor no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "id": tutor.id,
                "nombre_completo": tutor.nombre_completo,
                "children": TutorChildSerializer(tutor.children.all().order_by("nombres", "apellidos"), many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request, tutor_id: int):
        tutor = self.get_object(tutor_id)
        if not tutor:
            return Response({"message": "Tutor no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        serializer = TutorChildrenUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tutor.children.set(Child.objects.filter(id__in=serializer.validated_data["child_ids"]))
        tutor.actualizado_por = request.user
        tutor.save(update_fields=["actualizado_por", "fecha_actualizacion"])
        return Response(
            {
                "id": tutor.id,
                "nombre_completo": tutor.nombre_completo,
                "children": TutorChildSerializer(tutor.children.all().order_by("nombres", "apellidos"), many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class TutorMobileAccountView(BaseAdminView):
    def get(self, request, tutor_id: int):
        tutor = Tutor.objects.filter(pk=tutor_id).first()
        if not tutor:
            return Response({"message": "Tutor no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "id": tutor.id,
                "estado": tutor.cuenta_movil_estado,
                "correo_acceso": tutor.correo_acceso,
                "ultimo_acceso": tutor.ultimo_acceso,
                "rol_app": "Tutor",
            },
            status=status.HTTP_200_OK,
        )


class TutorResetPasswordView(BaseAdminView):
    def patch(self, request, tutor_id: int):
        tutor = Tutor.objects.filter(pk=tutor_id).first()
        if not tutor:
            return Response({"message": "Tutor no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        if tutor.cuenta_movil_estado == MobileAccountStatus.SIN_CUENTA:
            return Response({"message": "El tutor no tiene cuenta móvil registrada."}, status=status.HTTP_400_BAD_REQUEST)
        tutor.actualizado_por = request.user
        tutor.save(update_fields=["actualizado_por", "fecha_actualizacion"])
        return Response(
            {
                "message": "Se restableció la contraseña de la cuenta móvil.",
                "temporary_password": "Tutor1234",
            },
            status=status.HTTP_200_OK,
        )


class ChildTutorAssociationListCreateView(BaseAdminView):
    def get_queryset(self):
        return ChildTutorAssociation.objects.select_related(
            "child__centro_educativo",
            "child__dispositivo_gps",
            "tutor",
        )

    def get(self, request):
        queryset = self.get_queryset()
        search = request.query_params.get("search", "").strip()
        is_active = request.query_params.get("is_active", "").strip().lower()
        child_id = request.query_params.get("child_id", "").strip()
        tutor_id = request.query_params.get("tutor_id", "").strip()
        parentesco = request.query_params.get("parentesco", "").strip()

        if search:
            queryset = queryset.filter(
                Q(child__nombres__icontains=search)
                | Q(child__apellidos__icontains=search)
                | Q(child__curso__icontains=search)
                | Q(child__centro_educativo__name__icontains=search)
                | Q(child__dispositivo_gps__code__icontains=search)
                | Q(tutor__nombres__icontains=search)
                | Q(tutor__apellidos__icontains=search)
                | Q(tutor__correo_electronico__icontains=search)
                | Q(tutor__telefono__icontains=search)
            )
        if is_active in {"true", "false"}:
            queryset = queryset.filter(is_active=is_active == "true")
        if child_id:
            queryset = queryset.filter(child_id=child_id)
        if tutor_id:
            queryset = queryset.filter(tutor_id=tutor_id)
        if parentesco:
            queryset = queryset.filter(tutor__parentesco__iexact=parentesco)

        total = queryset.count()
        page = max(int(request.query_params.get("page", 1) or 1), 1)
        page_size = max(min(int(request.query_params.get("page_size", 10) or 10), 100), 1)
        start = (page - 1) * page_size
        end = start + page_size
        items = queryset.order_by("-updated_at")[start:end]
        total_pages = (total + page_size - 1) // page_size if total else 1

        return Response(
            {
                "count": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "results": ChildTutorAssociationSerializer(items, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    @transaction.atomic
    def post(self, request):
        serializer = ChildTutorAssociationCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.extract_error_message(serializer.errors), "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        child = Child.objects.get(pk=serializer.validated_data["child_id"])
        tutors = list(Tutor.objects.filter(id__in=serializer.validated_data["tutor_ids"]).order_by("id"))
        if child.status != ChildStatus.ACTIVO:
            return Response(
                {
                    "message": "El niño debe estar activo.",
                    "errors": {"child_id": ["El niño debe estar activo."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        inactive_tutors = [tutor for tutor in tutors if tutor.estado != TutorStatus.ACTIVO]
        if inactive_tutors:
            return Response(
                {
                    "message": "Todos los tutores deben estar activos.",
                    "errors": {"tutor_ids": ["Todos los tutores deben estar activos."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        duplicated_ids = list(
            ChildTutorAssociation.objects.filter(
                child=child,
                tutor_id__in=[tutor.id for tutor in tutors],
                is_active=True,
            ).values_list("tutor_id", flat=True)
        )
        if duplicated_ids:
            return Response(
                {
                    "message": "Este tutor ya está asociado a este niño.",
                    "errors": {"tutor_ids": ["Este tutor ya está asociado a este niño."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        created_associations = []

        for tutor in tutors:
            association, created = ChildTutorAssociation.objects.get_or_create(
                child=child,
                tutor=tutor,
                defaults={"created_by": request.user, "is_active": True},
            )
            if created:
                create_child_tutor_history(
                    association=association,
                    action=ChildTutorAssociationAction.CREACION,
                    detail="Asociación creada correctamente.",
                    user=request.user,
                )
            else:
                association.is_active = True
                association.deactivated_at = None
                association.deactivated_by = None
                association.save(update_fields=["is_active", "deactivated_at", "deactivated_by", "updated_at"])
                create_child_tutor_history(
                    association=association,
                    action=ChildTutorAssociationAction.REACTIVACION,
                    detail="Asociación reactivada correctamente.",
                    user=request.user,
                )

            sync_tutor_children_mirror(tutor)
            created_associations.append(association)

        refresh_child_tutor_reference(child)
        created_associations = self.get_queryset().filter(id__in=[association.id for association in created_associations])
        return Response(
            {
                "message": "Asociación guardada correctamente.",
                "child_id": child.id,
                "associations": ChildTutorAssociationSerializer(created_associations, many=True).data,
            },
            status=status.HTTP_201_CREATED,
        )


class ChildTutorAssociationDetailView(BaseAdminView):
    def get_object(self, association_id: int):
        return (
            ChildTutorAssociation.objects.select_related(
                "child__centro_educativo",
                "child__dispositivo_gps",
                "tutor",
            )
            .filter(pk=association_id)
            .first()
        )

    def get(self, request, association_id: int):
        association = self.get_object(association_id)
        if not association:
            return Response({"message": "Asociación no encontrada."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ChildTutorAssociationSerializer(association).data, status=status.HTTP_200_OK)

    @transaction.atomic
    def delete(self, request, association_id: int):
        association = self.get_object(association_id)
        if not association:
            return Response({"message": "Asociación no encontrada."}, status=status.HTTP_404_NOT_FOUND)
        deactivate_child_tutor_association(
            association,
            user=request.user,
            detail="Asociación eliminada de forma lógica.",
        )
        return Response({"message": "Asociación eliminada correctamente."}, status=status.HTTP_200_OK)


class ChildTutorAssociationStatsView(BaseAdminView):
    def get(self, request):
        active_associations = ChildTutorAssociation.objects.filter(is_active=True)
        latest_association = ChildTutorAssociation.objects.order_by("-updated_at").first()
        children_without_tutor = Child.objects.filter(status=ChildStatus.ACTIVO).exclude(
            child_tutor_associations__is_active=True
        )
        return Response(
            {
                "ninos_activos": Child.objects.filter(status=ChildStatus.ACTIVO).count(),
                "tutores_activos": Tutor.objects.filter(estado=TutorStatus.ACTIVO).count(),
                "asociaciones_activas": active_associations.count(),
                "ninos_sin_tutor_asignado": children_without_tutor.distinct().count(),
                "ultima_actualizacion": latest_association.updated_at if latest_association else None,
            },
            status=status.HTTP_200_OK,
        )


class ChildTutorAssociationByChildView(BaseAdminView):
    def get(self, request, child_id: int):
        child = Child.objects.filter(pk=child_id).first()
        if not child:
            return Response({"message": "El niño seleccionado no existe."}, status=status.HTTP_404_NOT_FOUND)
        associations = (
            ChildTutorAssociation.objects.select_related("child__centro_educativo", "child__dispositivo_gps", "tutor")
            .filter(child_id=child_id, is_active=True)
            .order_by("tutor__nombres", "tutor__apellidos")
        )
        return Response(ChildTutorAssociationSerializer(associations, many=True).data, status=status.HTTP_200_OK)


class ChildTutorAssociationByTutorView(BaseAdminView):
    def get(self, request, tutor_id: int):
        tutor = Tutor.objects.filter(pk=tutor_id).first()
        if not tutor:
            return Response({"message": "Tutor no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        associations = (
            ChildTutorAssociation.objects.select_related("child__centro_educativo", "child__dispositivo_gps", "tutor")
            .filter(tutor_id=tutor_id, is_active=True)
            .order_by("child__nombres", "child__apellidos")
        )
        return Response(ChildTutorAssociationSerializer(associations, many=True).data, status=status.HTTP_200_OK)


class ChildTutorAssociationHistoryView(BaseAdminView):
    def get(self, request, association_id: int):
        association = ChildTutorAssociation.objects.filter(pk=association_id).first()
        if not association:
            return Response({"message": "Asociación no encontrada."}, status=status.HTTP_404_NOT_FOUND)
        history = association.history_entries.select_related("user").all()
        return Response(ChildTutorAssociationHistorySerializer(history, many=True).data, status=status.HTTP_200_OK)
