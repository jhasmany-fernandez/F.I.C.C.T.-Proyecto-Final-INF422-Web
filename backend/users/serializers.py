from datetime import date

from django.db import transaction
from rest_framework import serializers

from .models import (
    Child,
    ChildStatus,
    EducationalCenter,
    GPSDevice,
    MobileAccountStatus,
    Module,
    Permission,
    Role,
    RolePermission,
    Tutor,
    TutorStatus,
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


class EducationalCenterSerializer(serializers.ModelSerializer):
    class Meta:
        model = EducationalCenter
        fields = ("id", "code", "name", "is_active")


class GPSDeviceSerializer(serializers.ModelSerializer):
    assignment_status = serializers.CharField(read_only=True)

    class Meta:
        model = GPSDevice
        fields = ("id", "code", "model", "imei", "is_active", "assignment_status")


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
