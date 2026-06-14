from datetime import date

from django.db import transaction
from django.db.models import Max
from rest_framework import serializers

from .models import (
    Child,
    ChildStatus,
    ChildTutorAssociation,
    ChildTutorAssociationAction,
    ChildTutorAssociationHistory,
    EducationalCenter,
    GPSDevice,
    MobileAccountStatus,
    Module,
    Permission,
    Role,
    RolePermission,
    SafeArea,
    SafeAreaHistory,
    GeographicLocation,
    MonitoringAlert,
    MonitoringConfig,
    MonitoringHistory,
    MonitoringStatus,
    LocationDeliveryStatus,
    SecurityAlertHistory,
    SecurityAlertHistoryAction,
    SecurityAlertPriority,
    SecurityAlertStatus,
    SafeAreaStatus,
    RiskZone,
    RiskZoneSeverity,
    RiskZoneType,
    Tutor,
    TutorStatus,
    User,
    UserRole,
)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, write_only=True, trim_whitespace=False)


class ModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = ("id", "name", "code", "is_active")


class PermissionSerializer(serializers.ModelSerializer):
    module = ModuleSerializer(read_only=True)

    class Meta:
        model = Permission
        fields = ("id", "module", "action", "code")


class RoleListSerializer(serializers.ModelSerializer):
    users_count = serializers.IntegerField(read_only=True)
    permissions_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Role
        fields = (
            "id",
            "name",
            "description",
            "is_active",
            "created_at",
            "updated_at",
            "users_count",
            "permissions_count",
        )


class RoleDetailSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()
    users = serializers.SerializerMethodField()
    permissions_summary = serializers.SerializerMethodField()
    modules_with_permissions = serializers.SerializerMethodField()
    users_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Role
        fields = (
            "id",
            "name",
            "description",
            "is_active",
            "created_at",
            "updated_at",
            "users_count",
            "permissions",
            "users",
            "permissions_summary",
            "modules_with_permissions",
        )

    def get_permissions(self, obj: Role):
        permissions = Permission.objects.filter(permission_roles__role=obj).select_related("module")
        return PermissionSerializer(permissions, many=True).data

    def get_users(self, obj: Role):
        return [
            {
                "id": user.id,
                "nombre": user.nombre,
                "email": user.email,
                "is_active": user.is_active,
            }
            for user in obj.users.all().order_by("nombre")
        ]

    def get_permissions_summary(self, obj: Role):
        permissions = Permission.objects.filter(permission_roles__role=obj).select_related("module")
        return {
            "total_permissions": permissions.count(),
            "total_modules": permissions.values("module_id").distinct().count(),
            "actions": sorted(permissions.values_list("action", flat=True).distinct()),
        }

    def get_modules_with_permissions(self, obj: Role):
        permissions = Permission.objects.filter(permission_roles__role=obj).select_related("module")
        summary: dict[str, dict] = {}
        for permission in permissions:
            key = permission.module.code
            if key not in summary:
                summary[key] = {
                    "id": permission.module.id,
                    "name": permission.module.name,
                    "code": permission.module.code,
                    "actions": [],
                }
            summary[key]["actions"].append(permission.action)
        return list(summary.values())


class RoleWriteSerializer(serializers.ModelSerializer):
    permission_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        write_only=True,
    )

    class Meta:
        model = Role
        fields = ("id", "name", "description", "is_active", "permission_ids")

    def validate_name(self, value: str):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("El nombre del rol es obligatorio.")
        qs = Role.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un rol con ese nombre.")
        return value

    def validate_description(self, value: str):
        if len(value) > 200:
            raise serializers.ValidationError("La descripción no puede exceder 200 caracteres.")
        return value

    def validate_permission_ids(self, value):
        if not value:
            raise serializers.ValidationError("Debe asignar al menos un permiso.")
        found_ids = set(Permission.objects.filter(id__in=value).values_list("id", flat=True))
        missing = [permission_id for permission_id in value if permission_id not in found_ids]
        if missing:
            raise serializers.ValidationError("Debe asignar permisos válidos.")
        return list(dict.fromkeys(value))

    @transaction.atomic
    def create(self, validated_data):
        permission_ids = validated_data.pop("permission_ids")
        role = Role.objects.create(**validated_data)
        self._set_permissions(role, permission_ids)
        return role

    @transaction.atomic
    def update(self, instance, validated_data):
        permission_ids = validated_data.pop("permission_ids")
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        self._set_permissions(instance, permission_ids)
        return instance

    def _set_permissions(self, role: Role, permission_ids: list[int]):
        RolePermission.objects.filter(role=role).delete()
        RolePermission.objects.bulk_create(
            [RolePermission(role=role, permission_id=permission_id) for permission_id in permission_ids]
        )


class RoleStatusSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()


class RegentOptionSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="nombre", read_only=True)

    class Meta:
        model = User
        fields = ("id", "full_name", "email")


class EducationalCenterOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = EducationalCenter
        fields = ("id", "code", "name", "is_active")


class EducationalCenterSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    regent = RegentOptionSerializer(read_only=True)
    children_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = EducationalCenter
        fields = (
            "id",
            "code",
            "name",
            "address",
            "phone",
            "email",
            "shift",
            "status",
            "is_active",
            "regent",
            "children_count",
            "created_at",
            "updated_at",
        )

    def get_status(self, obj: EducationalCenter):
        return obj.status


class EducationalCenterDetailSerializer(EducationalCenterSerializer):
    class Meta(EducationalCenterSerializer.Meta):
        fields = EducationalCenterSerializer.Meta.fields + (
            "description",
            "latitude",
            "longitude",
            "deactivation_reason",
        )


class EducationalCenterCreateUpdateSerializer(serializers.ModelSerializer):
    regent_id = serializers.PrimaryKeyRelatedField(
        source="regent",
        queryset=User.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    status = serializers.ChoiceField(choices=(("activo", "Activo"), ("inactivo", "Inactivo")))

    class Meta:
        model = EducationalCenter
        fields = (
            "id",
            "code",
            "name",
            "address",
            "phone",
            "email",
            "shift",
            "description",
            "latitude",
            "longitude",
            "status",
            "deactivation_reason",
            "regent_id",
        )

    def validate_code(self, value: str):
        value = value.strip()
        if not value:
            return value
        qs = EducationalCenter.objects.filter(code__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un centro educativo con ese código.")
        return value.upper()

    def validate_name(self, value: str):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("El nombre del centro educativo es obligatorio.")
        qs = EducationalCenter.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un centro educativo con ese nombre.")
        return value

    def validate_address(self, value: str):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("La dirección es obligatoria.")
        return value

    def validate_phone(self, value: str):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("El teléfono es obligatorio.")
        if len(value) < 7 or not all(char.isdigit() or char in {" ", "+", "-"} for char in value):
            raise serializers.ValidationError("El teléfono debe tener formato válido.")
        return value

    def validate_email(self, value: str):
        value = value.strip().lower()
        if not value:
            raise serializers.ValidationError("El correo electrónico es obligatorio.")
        return value

    def validate_description(self, value: str):
        return value.strip()

    def validate_deactivation_reason(self, value: str):
        return value.strip()

    def validate_regent(self, value: User | None):
        if value is None:
            return value
        is_regent = value.rol == UserRole.REGENTE or (value.role and value.role.name.strip().lower() == "regente")
        if not is_regent:
            raise serializers.ValidationError("Solo puede asignar usuarios con rol Regente.")
        return value

    def validate(self, attrs):
        status_value = attrs.get("status", self.instance.status if self.instance else "activo")
        reason = attrs.get("deactivation_reason", getattr(self.instance, "deactivation_reason", ""))
        if status_value == "inactivo" and len(reason) > 200:
            raise serializers.ValidationError(
                {"deactivation_reason": ["El motivo de desactivación no puede exceder 200 caracteres."]}
            )
        if status_value == "activo":
            attrs["deactivation_reason"] = ""
        return attrs

    def create(self, validated_data):
        status_value = validated_data.pop("status")
        validated_data["is_active"] = status_value == "activo"
        validated_data["code"] = validated_data.get("code") or self._generate_code()
        return super().create(validated_data)

    def update(self, instance, validated_data):
        status_value = validated_data.pop("status")
        validated_data["is_active"] = status_value == "activo"
        if validated_data["is_active"]:
            validated_data["deactivation_reason"] = ""
        return super().update(instance, validated_data)

    def _generate_code(self) -> str:
        max_code = EducationalCenter.objects.filter(code__startswith="CEN-").aggregate(max_code=Max("code"))["max_code"]
        if not max_code:
            return "CEN-0001"
        try:
            next_number = int(max_code.split("-")[1]) + 1
        except (IndexError, ValueError):
            next_number = EducationalCenter.objects.count() + 1
        return f"CEN-{next_number:04d}"


class EducationalCenterStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=(("activo", "Activo"), ("inactivo", "Inactivo")))
    motivo_desactivacion = serializers.CharField(required=False, allow_blank=True, max_length=200)


class SafeAreaCenterSerializer(serializers.ModelSerializer):
    regente = serializers.SerializerMethodField()

    class Meta:
        model = EducationalCenter
        fields = ("id", "name", "address", "phone", "regente")

    def get_regente(self, obj: EducationalCenter):
        return obj.regent.nombre if obj.regent else None


class SafeAreaSerializer(serializers.ModelSerializer):
    educational_center = SafeAreaCenterSerializer(read_only=True)

    class Meta:
        model = SafeArea
        fields = (
            "id",
            "educational_center",
            "status",
            "area_m2",
            "perimeter_m",
            "points_count",
            "created_at",
            "updated_at",
        )


class SafeAreaDetailSerializer(SafeAreaSerializer):
    polygon = serializers.JSONField(read_only=True)
    name = serializers.CharField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta(SafeAreaSerializer.Meta):
        fields = SafeAreaSerializer.Meta.fields + ("name", "polygon", "is_active")


class SafeAreaCreateUpdateSerializer(serializers.ModelSerializer):
    educational_center_id = serializers.PrimaryKeyRelatedField(
        source="educational_center",
        queryset=EducationalCenter.objects.all(),
    )

    class Meta:
        model = SafeArea
        fields = ("id", "educational_center_id", "name", "status", "polygon", "is_active")

    def validate_name(self, value: str):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("El nombre del área segura es obligatorio.")
        return value

    def validate_polygon(self, value):
        if not value:
            raise serializers.ValidationError("El polígono es obligatorio.")
        return value

    def validate_status(self, value):
        if value not in {SafeAreaStatus.ACTIVA, SafeAreaStatus.INACTIVA}:
            raise serializers.ValidationError("Estado inválido.")
        return value


class SafeAreaStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=SafeAreaStatus.choices)


class SafeAreaHistorySerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()

    class Meta:
        model = SafeAreaHistory
        fields = (
            "id",
            "action",
            "previous_polygon",
            "new_polygon",
            "previous_area_m2",
            "new_area_m2",
            "previous_perimeter_m",
            "new_perimeter_m",
            "points_count",
            "user",
            "created_at",
        )

    def get_user(self, obj: SafeAreaHistory):
        return obj.user.nombre if obj.user else None


class SafeAreaPolygonPayloadSerializer(serializers.Serializer):
    polygon = serializers.JSONField(required=True)

class GPSDeviceSerializer(serializers.ModelSerializer):
    assignment_status = serializers.CharField(read_only=True)

    class Meta:
        model = GPSDevice
        fields = ("id", "code", "model", "imei", "is_active", "assignment_status")


class GeographicLocationRegisterSerializer(serializers.Serializer):
    dispositivo_id = serializers.CharField(required=True, max_length=40)
    nino_id = serializers.IntegerField(required=True, min_value=1)
    latitud = serializers.FloatField(required=True)
    longitud = serializers.FloatField(required=True)
    precision = serializers.FloatField(required=True)
    velocidad = serializers.FloatField(required=False, allow_null=True)
    fecha_hora = serializers.DateTimeField(required=True)
    estado_envio = serializers.ChoiceField(
        choices=LocationDeliveryStatus.choices,
        required=False,
        default=LocationDeliveryStatus.ENVIADO,
    )

    def validate_latitud(self, value: float):
        if value < -90 or value > 90:
            raise serializers.ValidationError("La latitud debe estar entre -90 y 90.")
        return value

    def validate_longitud(self, value: float):
        if value < -180 or value > 180:
            raise serializers.ValidationError("La longitud debe estar entre -180 y 180.")
        return value

    def validate_precision(self, value: float):
        if value <= 0 or value > 1000:
            raise serializers.ValidationError("La precisión GPS está fuera del rango aceptable.")
        return value

    def validate_velocidad(self, value: float | None):
        if value is not None and value < 0:
            raise serializers.ValidationError("La velocidad no puede ser negativa.")
        return value


class GeographicLocationSerializer(serializers.ModelSerializer):
    nino_id = serializers.IntegerField(source="child.id", read_only=True)
    dispositivo_id = serializers.CharField(source="device.code", read_only=True)
    fecha_hora = serializers.DateTimeField(source="device_timestamp", read_only=True)
    punto = serializers.SerializerMethodField()
    dentro_area_segura = serializers.BooleanField(source="inside_safe_area", read_only=True, allow_null=True)

    class Meta:
        model = GeographicLocation
        fields = (
            "id",
            "nino_id",
            "dispositivo_id",
            "fecha_hora",
            "punto",
            "dentro_area_segura",
            "precision",
            "speed",
            "delivery_status",
            "server_received_at",
        )

    def get_punto(self, obj: GeographicLocation):
        return f"POINT({obj.longitude} {obj.latitude})"


class GeographicLocationHistorySerializer(serializers.ModelSerializer):
    nino = serializers.SerializerMethodField()
    dispositivo = serializers.SerializerMethodField()
    punto = serializers.SerializerMethodField()
    creado_por = serializers.SerializerMethodField()

    class Meta:
        model = GeographicLocation
        fields = (
            "id",
            "nino",
            "dispositivo",
            "latitude",
            "longitude",
            "precision",
            "speed",
            "device_timestamp",
            "server_received_at",
            "delivery_status",
            "inside_safe_area",
            "punto",
            "creado_por",
            "source_ip",
            "source_host",
        )

    def get_nino(self, obj: GeographicLocation):
        return {
            "id": obj.child.id,
            "code": obj.child.code,
            "nombre_completo": f"{obj.child.nombres} {obj.child.apellidos}",
        }

    def get_dispositivo(self, obj: GeographicLocation):
        return {
            "id": obj.device.id,
            "code": obj.device.code,
            "model": obj.device.model,
        }

    def get_punto(self, obj: GeographicLocation):
        return f"POINT({obj.longitude} {obj.latitude})"

    def get_creado_por(self, obj: GeographicLocation):
        return obj.created_by.nombre if obj.created_by else None


class MonitoringAnalyzeSerializer(serializers.Serializer):
    ubicacion_id = serializers.IntegerField(required=True, min_value=1)


class MonitoringAlertSerializer(serializers.ModelSerializer):
    child_id = serializers.IntegerField(source="child.id", read_only=True)
    ubicacion_id = serializers.IntegerField(source="location_record.id", read_only=True)
    fecha_hora = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = MonitoringAlert
        fields = (
            "id",
            "child_id",
            "alert_type",
            "reason",
            "ubicacion_id",
            "status",
            "latitude",
            "longitude",
            "fecha_hora",
            "active",
        )


class SecurityAlertStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=SecurityAlertStatus.choices)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=255)


class SecurityAlertCreateSerializer(serializers.Serializer):
    child_id = serializers.IntegerField(min_value=1)
    location_record_id = serializers.IntegerField(min_value=1)
    monitoring_history_id = serializers.IntegerField(min_value=1, required=False)
    alert_type = serializers.ChoiceField(choices=MonitoringAlert._meta.get_field("alert_type").choices)
    priority = serializers.ChoiceField(choices=SecurityAlertPriority.choices)
    title = serializers.CharField(max_length=150)
    description = serializers.CharField(max_length=255)
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    accuracy = serializers.FloatField(required=False, allow_null=True)
    speed = serializers.FloatField(required=False, allow_null=True)
    event_datetime = serializers.DateTimeField()


class SecurityAlertHistorySerializer(serializers.ModelSerializer):
    changed_by = serializers.SerializerMethodField()

    class Meta:
        model = SecurityAlertHistory
        fields = (
            "id",
            "action",
            "previous_status",
            "new_status",
            "comment",
            "changed_by",
            "changed_at",
            "metadata",
        )

    def get_changed_by(self, obj: SecurityAlertHistory):
        return obj.changed_by.nombre if obj.changed_by else None


class RiskZoneSerializer(serializers.ModelSerializer):
    educational_center = SafeAreaCenterSerializer(read_only=True)
    risk_level = serializers.CharField(source="severity", read_only=True)
    center = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()
    updated_by = serializers.SerializerMethodField()

    class Meta:
        model = RiskZone
        fields = (
            "id",
            "code",
            "name",
            "description",
            "educational_center",
            "center",
            "risk_type",
            "risk_level",
            "polygon",
            "center_latitude",
            "center_longitude",
            "area_m2",
            "perimeter_m",
            "is_active",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        )

    def get_center(self, obj: RiskZone):
        if obj.center_longitude is None or obj.center_latitude is None:
            return None
        return {
            "longitude": str(obj.center_longitude),
            "latitude": str(obj.center_latitude),
        }

    def get_created_by(self, obj: RiskZone):
        return obj.created_by.nombre if obj.created_by else None

    def get_updated_by(self, obj: RiskZone):
        return obj.updated_by.nombre if obj.updated_by else None


class RiskZoneCreateUpdateSerializer(serializers.ModelSerializer):
    educational_center_id = serializers.PrimaryKeyRelatedField(
        source="educational_center",
        queryset=EducationalCenter.objects.all(),
        required=False,
        allow_null=True,
    )
    risk_level = serializers.ChoiceField(source="severity", choices=RiskZoneSeverity.choices)

    class Meta:
        model = RiskZone
        fields = (
            "id",
            "educational_center_id",
            "name",
            "description",
            "risk_type",
            "risk_level",
            "polygon",
            "is_active",
        )

    def validate_name(self, value: str):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("El nombre de la zona de riesgo es obligatorio.")
        return value

    def validate_risk_level(self, value: str):
        legacy_map = {
            "ALTA": RiskZoneSeverity.ALTO,
            "MEDIA": RiskZoneSeverity.MEDIO,
            "BAJA": RiskZoneSeverity.BAJO,
        }
        return legacy_map.get(value, value)

    def validate_description(self, value: str):
        return value.strip()

    def validate_polygon(self, value):
        if not value:
            raise serializers.ValidationError("El polígono es obligatorio.")
        return value

    def validate(self, attrs):
        educational_center = attrs.get("educational_center")
        name = attrs.get("name", "").strip()
        queryset = RiskZone.objects.filter(deleted_at__isnull=True)

        if educational_center is None:
            queryset = queryset.filter(educational_center__isnull=True)
        else:
            queryset = queryset.filter(educational_center=educational_center)

        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.filter(name__iexact=name).exists():
            if educational_center is None:
                raise serializers.ValidationError(
                    {"name": "Ya existe una zona general con ese nombre."}
                )
            raise serializers.ValidationError(
                {"name": "Ya existe una zona de riesgo con ese nombre para el centro educativo seleccionado."}
            )

        return attrs


class RiskZoneStatusSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()


class RiskZonePolygonPayloadSerializer(serializers.Serializer):
    polygon = serializers.JSONField(required=True)


class MonitoringHistorySerializer(serializers.ModelSerializer):
    child_id = serializers.IntegerField(source="child.id", read_only=True)
    ubicacion_id = serializers.IntegerField(source="location_record.id", read_only=True)
    zona_riesgo_id = serializers.IntegerField(source="risk_zone.id", read_only=True, allow_null=True)
    alerta_id = serializers.IntegerField(source="alert.id", read_only=True, allow_null=True)

    class Meta:
        model = MonitoringHistory
        fields = (
            "id",
            "child_id",
            "ubicacion_id",
            "status",
            "reason",
            "distance_to_perimeter_m",
            "zona_riesgo_id",
            "alerta_id",
            "created_at",
            "additional_info",
        )


class MonitoringConfigSerializer(serializers.ModelSerializer):
    tiempo_minimo_entre_alertas_min = serializers.IntegerField(source="min_time_between_alerts_min")
    distancia_minima_cambio_estado_m = serializers.IntegerField(source="min_distance_state_change_m")
    precision_gps_maxima_m = serializers.IntegerField(source="max_gps_accuracy_m")
    habilitar_zonas_riesgo = serializers.BooleanField(source="enable_risk_zones")
    registrar_errores_como_pendientes = serializers.BooleanField(source="register_errors_as_pending")

    class Meta:
        model = MonitoringConfig
        fields = (
            "tiempo_minimo_entre_alertas_min",
            "distancia_minima_cambio_estado_m",
            "precision_gps_maxima_m",
            "habilitar_zonas_riesgo",
            "registrar_errores_como_pendientes",
        )


class MonitoringCurrentStatusSerializer(serializers.Serializer):
    child_id = serializers.IntegerField()
    nombre = serializers.CharField()
    estado_actual = serializers.ChoiceField(choices=MonitoringStatus.choices)
    motivo = serializers.CharField()
    fecha_hora = serializers.DateTimeField()
    ubicacion = serializers.DictField()
    alerta_activa = serializers.BooleanField()


class ChildListSerializer(serializers.ModelSerializer):
    edad = serializers.IntegerField(read_only=True)
    nombre_completo = serializers.SerializerMethodField()
    centro_educativo = EducationalCenterSerializer(read_only=True)
    dispositivo_gps = GPSDeviceSerializer(read_only=True)
    foto_url = serializers.SerializerMethodField()

    class Meta:
        model = Child
        fields = (
            "id",
            "code",
            "nombres",
            "apellidos",
            "nombre_completo",
            "fecha_nacimiento",
            "edad",
            "curso",
            "centro_educativo",
            "dispositivo_gps",
            "foto_url",
            "status",
            "motivo_desactivacion",
            "fecha_registro",
            "fecha_actualizacion",
        )

    def get_nombre_completo(self, obj: Child):
        return f"{obj.nombres} {obj.apellidos}"

    def get_foto_url(self, obj: Child):
        request = self.context.get("request")
        if obj.foto and request:
            return request.build_absolute_uri(obj.foto.url)
        if obj.foto:
            return obj.foto.url
        return None


class ChildDetailSerializer(ChildListSerializer):
    tutor_reference = serializers.CharField(read_only=True)

    class Meta(ChildListSerializer.Meta):
        fields = ChildListSerializer.Meta.fields + ("tutor_reference",)


class ChildWriteSerializer(serializers.ModelSerializer):
    centro_educativo_id = serializers.PrimaryKeyRelatedField(
        queryset=EducationalCenter.objects.filter(is_active=True),
        source="centro_educativo",
    )
    dispositivo_gps_id = serializers.PrimaryKeyRelatedField(
        queryset=GPSDevice.objects.filter(is_active=True),
        source="dispositivo_gps",
        required=False,
        allow_null=True,
    )
    edad = serializers.IntegerField(read_only=True)

    class Meta:
        model = Child
        fields = (
            "id",
            "nombres",
            "apellidos",
            "fecha_nacimiento",
            "edad",
            "curso",
            "centro_educativo_id",
            "dispositivo_gps_id",
            "foto",
            "status",
            "motivo_desactivacion",
        )

    def validate_nombres(self, value: str):
        if not value.strip():
            raise serializers.ValidationError("Los nombres son obligatorios.")
        return value.strip()

    def validate_apellidos(self, value: str):
        if not value.strip():
            raise serializers.ValidationError("Los apellidos son obligatorios.")
        return value.strip()

    def validate_fecha_nacimiento(self, value):
        if value > date.today():
            raise serializers.ValidationError("La fecha de nacimiento no puede ser futura.")
        return value

    def validate_curso(self, value: str):
        if not value.strip():
            raise serializers.ValidationError("El curso es obligatorio.")
        return value.strip()

    def validate_status(self, value):
        if value not in {ChildStatus.ACTIVO, ChildStatus.INACTIVO}:
            raise serializers.ValidationError("El estado solo puede ser activo o inactivo.")
        return value

    def validate_motivo_desactivacion(self, value: str):
        if len(value) > 200:
            raise serializers.ValidationError("El motivo de desactivación no puede exceder 200 caracteres.")
        return value.strip()

    def validate_foto(self, value):
        if not value:
            return value
        if value.size > 2 * 1024 * 1024:
            raise serializers.ValidationError("La foto no puede exceder 2 MB.")
        allowed_types = {"image/jpeg", "image/png"}
        if getattr(value, "content_type", "") not in allowed_types:
            raise serializers.ValidationError("La foto debe ser JPG o PNG.")
        return value

    def validate(self, attrs):
        dispositivo = attrs.get("dispositivo_gps", getattr(self.instance, "dispositivo_gps", None))
        status_value = attrs.get("status", getattr(self.instance, "status", ChildStatus.ACTIVO))
        motivo = attrs.get("motivo_desactivacion", getattr(self.instance, "motivo_desactivacion", ""))

        if status_value == ChildStatus.INACTIVO and len(motivo) > 200:
            raise serializers.ValidationError(
                {"motivo_desactivacion": ["El motivo de desactivación no puede exceder 200 caracteres."]}
            )

        if dispositivo and status_value == ChildStatus.ACTIVO:
            qs = Child.objects.filter(dispositivo_gps=dispositivo, status=ChildStatus.ACTIVO)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {"dispositivo_gps_id": ["El dispositivo GPS ya está asignado a otro niño activo."]}
                )

        return attrs

    def create(self, validated_data):
        validated_data.setdefault("status", ChildStatus.ACTIVO)
        validated_data["code"] = self._generate_code()
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if validated_data.get("status") == ChildStatus.ACTIVO:
            validated_data["motivo_desactivacion"] = ""
        return super().update(instance, validated_data)

    def _generate_code(self) -> str:
        last = Child.objects.order_by("-id").first()
        next_id = (last.id + 1) if last else 1
        return f"NIN-{next_id:04d}"


class ChildStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ChildStatus.choices)
    motivo_desactivacion = serializers.CharField(required=False, allow_blank=True, max_length=200)


class TutorChildSerializer(serializers.ModelSerializer):
    nombre_completo = serializers.SerializerMethodField()
    centro_educativo = EducationalCenterSerializer(read_only=True)

    class Meta:
        model = Child
        fields = ("id", "code", "nombre_completo", "curso", "status", "centro_educativo")

    def get_nombre_completo(self, obj: Child):
        return f"{obj.nombres} {obj.apellidos}"


class TutorListSerializer(serializers.ModelSerializer):
    nombre_completo = serializers.SerializerMethodField()
    children_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Tutor
        fields = (
            "id",
            "nombres",
            "apellidos",
            "nombre_completo",
            "correo_electronico",
            "telefono",
            "parentesco",
            "children_count",
            "estado",
            "cuenta_movil_estado",
            "fecha_registro",
            "fecha_actualizacion",
        )

    def get_nombre_completo(self, obj: Tutor):
        return obj.nombre_completo


class TutorDetailSerializer(TutorListSerializer):
    children = TutorChildSerializer(many=True, read_only=True)
    mobile_account = serializers.SerializerMethodField()
    creado_por = serializers.SerializerMethodField()
    actualizado_por = serializers.SerializerMethodField()

    class Meta(TutorListSerializer.Meta):
        fields = TutorListSerializer.Meta.fields + (
            "direccion",
            "motivo_desactivacion",
            "children",
            "mobile_account",
            "creado_por",
            "actualizado_por",
        )

    def get_mobile_account(self, obj: Tutor):
        return {
            "estado": obj.cuenta_movil_estado,
            "correo_acceso": obj.correo_acceso,
            "ultimo_acceso": obj.ultimo_acceso,
            "rol_app": "Tutor",
        }

    def get_creado_por(self, obj: Tutor):
        return obj.creado_por.nombre if obj.creado_por else None

    def get_actualizado_por(self, obj: Tutor):
        return obj.actualizado_por.nombre if obj.actualizado_por else None


class TutorWriteSerializer(serializers.ModelSerializer):
    child_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        write_only=True,
    )

    class Meta:
        model = Tutor
        fields = (
            "id",
            "nombres",
            "apellidos",
            "correo_electronico",
            "telefono",
            "direccion",
            "parentesco",
            "estado",
            "cuenta_movil_estado",
            "correo_acceso",
            "motivo_desactivacion",
            "child_ids",
        )

    def validate_nombres(self, value: str):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Complete todos los campos obligatorios.")
        return value

    def validate_apellidos(self, value: str):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Complete todos los campos obligatorios.")
        return value

    def validate_direccion(self, value: str):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Complete todos los campos obligatorios.")
        return value

    def validate_parentesco(self, value: str):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Complete todos los campos obligatorios.")
        return value

    def validate_correo_electronico(self, value: str):
        value = value.strip().lower()
        qs = Tutor.objects.filter(correo_electronico__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("El correo electrónico ya está registrado.")
        return value

    def validate_telefono(self, value: str):
        value = value.strip()
        if len(value) < 7:
            raise serializers.ValidationError("El teléfono debe tener formato válido.")
        if not all(char.isdigit() or char in {" ", "+", "-"} for char in value):
            raise serializers.ValidationError("El teléfono debe tener formato válido.")
        qs = Tutor.objects.filter(telefono__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("El número de teléfono ya está registrado.")
        return value

    def validate_motivo_desactivacion(self, value: str):
        if len(value.strip()) > 200:
            raise serializers.ValidationError("La descripción no puede exceder 200 caracteres.")
        return value.strip()

    def validate_child_ids(self, value):
        if not value:
            raise serializers.ValidationError("Debe seleccionar al menos un niño.")
        found = set(Child.objects.filter(id__in=value).values_list("id", flat=True))
        if len(found) != len(set(value)):
            raise serializers.ValidationError("Debe asociar al menos un niño.")
        return list(dict.fromkeys(value))


class ChildTutorAssociationChildSerializer(serializers.ModelSerializer):
    nombre_completo = serializers.SerializerMethodField()
    centro_educativo = EducationalCenterSerializer(read_only=True)
    dispositivo_gps = GPSDeviceSerializer(read_only=True)

    class Meta:
        model = Child
        fields = (
            "id",
            "code",
            "nombre_completo",
            "fecha_nacimiento",
            "edad",
            "curso",
            "centro_educativo",
            "dispositivo_gps",
            "status",
            "tutor_reference",
        )

    def get_nombre_completo(self, obj: Child):
        return f"{obj.nombres} {obj.apellidos}"


class ChildTutorAssociationTutorSerializer(serializers.ModelSerializer):
    nombre_completo = serializers.SerializerMethodField()

    class Meta:
        model = Tutor
        fields = (
            "id",
            "nombre_completo",
            "correo_electronico",
            "telefono",
            "parentesco",
            "estado",
        )

    def get_nombre_completo(self, obj: Tutor):
        return obj.nombre_completo


class ChildTutorAssociationSerializer(serializers.ModelSerializer):
    child = ChildTutorAssociationChildSerializer(read_only=True)
    tutor = ChildTutorAssociationTutorSerializer(read_only=True)

    class Meta:
        model = ChildTutorAssociation
        fields = (
            "id",
            "child",
            "tutor",
            "is_active",
            "created_at",
            "updated_at",
            "deactivated_at",
        )


class ChildTutorAssociationHistorySerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()

    class Meta:
        model = ChildTutorAssociationHistory
        fields = ("id", "action", "detail", "user", "created_at")

    def get_user(self, obj: ChildTutorAssociationHistory):
        return obj.user.nombre if obj.user else None


class ChildTutorAssociationCreateSerializer(serializers.Serializer):
    child_id = serializers.IntegerField(min_value=1)
    tutor_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )

    def validate_child_id(self, value):
        if not Child.objects.filter(pk=value).exists():
            raise serializers.ValidationError("El niño seleccionado no existe.")
        return value

    def validate_tutor_ids(self, value):
        if not value:
            raise serializers.ValidationError("Debe seleccionar al menos un tutor.")
        distinct_ids = list(dict.fromkeys(value))
        found = set(Tutor.objects.filter(id__in=distinct_ids).values_list("id", flat=True))
        if len(found) != len(distinct_ids):
            raise serializers.ValidationError("Debe seleccionar tutores válidos.")
        return distinct_ids

    def validate(self, attrs):
        child = Child.objects.filter(pk=attrs["child_id"]).first()
        if not child:
            raise serializers.ValidationError({"child_id": ["El niño seleccionado no existe."]})
        if child.status != ChildStatus.ACTIVO:
            raise serializers.ValidationError({"child_id": ["El niño debe estar activo."]})

        tutors = list(Tutor.objects.filter(id__in=attrs["tutor_ids"]).order_by("id"))
        inactive_tutors = [tutor.nombre_completo for tutor in tutors if tutor.estado != TutorStatus.ACTIVO]
        if inactive_tutors:
            raise serializers.ValidationError({"tutor_ids": ["Todos los tutores deben estar activos."]})

        duplicated = list(
            ChildTutorAssociation.objects.filter(
                child_id=child.id,
                tutor_id__in=attrs["tutor_ids"],
                is_active=True,
            ).values_list("tutor_id", flat=True)
        )
        if duplicated:
            raise serializers.ValidationError({"tutor_ids": ["Este tutor ya está asociado a este niño."]})

        attrs["child"] = child
        attrs["tutors"] = tutors
        return attrs

    def validate_estado(self, value: str):
        if value not in {TutorStatus.ACTIVO, TutorStatus.INACTIVO}:
            raise serializers.ValidationError("Estado inválido.")
        return value

    def validate_cuenta_movil_estado(self, value: str):
        if value not in {MobileAccountStatus.ACTIVA, MobileAccountStatus.INACTIVA, MobileAccountStatus.SIN_CUENTA}:
            raise serializers.ValidationError("Estado de cuenta móvil inválido.")
        return value

    def validate(self, attrs):
        estado = attrs.get("estado", getattr(self.instance, "estado", TutorStatus.ACTIVO))
        mobile_status = attrs.get(
            "cuenta_movil_estado",
            getattr(self.instance, "cuenta_movil_estado", MobileAccountStatus.SIN_CUENTA),
        )

        if estado == TutorStatus.INACTIVO and mobile_status == MobileAccountStatus.ACTIVA:
            attrs["cuenta_movil_estado"] = MobileAccountStatus.INACTIVA

        if mobile_status != MobileAccountStatus.SIN_CUENTA and not attrs.get(
            "correo_acceso", getattr(self.instance, "correo_acceso", "")
        ):
            attrs["correo_acceso"] = attrs.get("correo_electronico", getattr(self.instance, "correo_electronico", ""))

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        child_ids = validated_data.pop("child_ids")
        request = self.context.get("request")
        tutor = Tutor.objects.create(
            creado_por=getattr(request, "user", None),
            actualizado_por=getattr(request, "user", None),
            **validated_data,
        )
        tutor.children.set(Child.objects.filter(id__in=child_ids))
        return tutor

    @transaction.atomic
    def update(self, instance, validated_data):
        child_ids = validated_data.pop("child_ids")
        request = self.context.get("request")
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.actualizado_por = getattr(request, "user", None)
        instance.save()
        instance.children.set(Child.objects.filter(id__in=child_ids))
        return instance


class TutorStatusSerializer(serializers.Serializer):
    estado = serializers.ChoiceField(choices=TutorStatus.choices)
    motivo_desactivacion = serializers.CharField(required=False, allow_blank=True, max_length=200)


class TutorChildrenUpdateSerializer(serializers.Serializer):
    child_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )

    def validate_child_ids(self, value):
        if not value:
            raise serializers.ValidationError("Debe seleccionar al menos un niño.")
        found = set(Child.objects.filter(id__in=value).values_list("id", flat=True))
        if len(found) != len(set(value)):
            raise serializers.ValidationError("Debe asociar al menos un niño.")
        return list(dict.fromkeys(value))
