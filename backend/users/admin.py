from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import (
    Child,
    ChildTutorAssociation,
    ChildTutorAssociationHistory,
    EducationalCenter,
    GPSDevice,
    MonitoringAlert,
    MonitoringConfig,
    MonitoringHistory,
    Module,
    Permission,
    RiskZone,
    Role,
    RolePermission,
    SafeArea,
    SafeAreaHistory,
    SecurityAlertHistory,
    Tutor,
    User,
)


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    model = User
    list_display = ("email", "nombre", "rol", "role", "is_active", "is_staff")
    list_filter = ("rol", "role", "is_active", "is_staff")
    ordering = ("email",)
    search_fields = ("email", "nombre")

    fieldsets = (
        (None, {"fields": ("email", "username", "password")}),
        ("Información personal", {"fields": ("nombre", "rol", "role")}),
        ("Permisos", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Fechas importantes", {"fields": ("last_login", "date_joined")}),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "username", "nombre", "rol", "role", "password1", "password2", "is_active", "is_staff"),
            },
        ),
    )


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "is_active", "created_at", "updated_at")
    search_fields = ("name", "description")
    list_filter = ("is_active",)


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "code", "is_active")
    search_fields = ("name", "code")
    list_filter = ("is_active",)


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "module", "action")
    search_fields = ("code", "module__name", "action")
    list_filter = ("module", "action")


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ("id", "role", "permission")
    search_fields = ("role__name", "permission__code")


@admin.register(EducationalCenter)
class EducationalCenterAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "name", "phone", "regent", "is_active", "created_at", "updated_at")
    search_fields = ("code", "name", "address", "phone", "email")
    list_filter = ("is_active",)


@admin.register(GPSDevice)
class GPSDeviceAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "model", "imei", "is_active")
    search_fields = ("code", "model", "imei")
    list_filter = ("is_active",)


@admin.register(Child)
class ChildAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "nombres", "apellidos", "curso", "centro_educativo", "dispositivo_gps", "status")
    search_fields = ("code", "nombres", "apellidos", "curso")
    list_filter = ("status", "curso", "centro_educativo")


@admin.register(Tutor)
class TutorAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "nombres",
        "apellidos",
        "correo_electronico",
        "telefono",
        "parentesco",
        "estado",
        "cuenta_movil_estado",
    )
    search_fields = ("nombres", "apellidos", "correo_electronico", "telefono")
    list_filter = ("estado", "cuenta_movil_estado", "parentesco")
    filter_horizontal = ("children",)


@admin.register(ChildTutorAssociation)
class ChildTutorAssociationAdmin(admin.ModelAdmin):
    list_display = ("id", "child", "tutor", "is_active", "created_at", "updated_at")
    search_fields = ("child__nombres", "child__apellidos", "tutor__nombres", "tutor__apellidos")
    list_filter = ("is_active",)


@admin.register(ChildTutorAssociationHistory)
class ChildTutorAssociationHistoryAdmin(admin.ModelAdmin):
    list_display = ("id", "association", "action", "user", "created_at")
    search_fields = ("child__nombres", "tutor__nombres", "detail")
    list_filter = ("action",)


@admin.register(SafeArea)
class SafeAreaAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "educational_center", "status", "area_m2", "perimeter_m", "updated_at")
    search_fields = ("name", "educational_center__name", "educational_center__code")
    list_filter = ("status", "is_active")


@admin.register(SafeAreaHistory)
class SafeAreaHistoryAdmin(admin.ModelAdmin):
    list_display = ("id", "safe_area", "educational_center", "action", "points_count", "user", "created_at")
    search_fields = ("safe_area__name", "educational_center__name", "user__nombre")
    list_filter = ("action", "created_at")


@admin.register(MonitoringAlert)
class MonitoringAlertAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "child", "alert_type", "priority", "workflow_status", "detected_at")
    search_fields = ("code", "child__nombres", "child__apellidos", "title", "description")
    list_filter = ("alert_type", "priority", "workflow_status", "educational_center")


@admin.register(SecurityAlertHistory)
class SecurityAlertHistoryAdmin(admin.ModelAdmin):
    list_display = ("id", "alert", "action", "previous_status", "new_status", "changed_by", "changed_at")
    search_fields = ("alert__code", "comment", "changed_by__nombre")
    list_filter = ("action", "new_status")


@admin.register(MonitoringHistory)
class MonitoringHistoryAdmin(admin.ModelAdmin):
    list_display = ("id", "child", "status", "risk_zone", "created_at")
    search_fields = ("child__nombres", "child__apellidos", "reason")
    list_filter = ("status", "risk_zone")


@admin.register(MonitoringConfig)
class MonitoringConfigAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "min_time_between_alerts_min",
        "min_distance_state_change_m",
        "max_gps_accuracy_m",
        "enable_risk_zones",
        "updated_at",
    )


@admin.register(RiskZone)
class RiskZoneAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "name", "educational_center", "risk_type", "severity", "is_active", "updated_at")
    search_fields = ("code", "name", "educational_center__name")
    list_filter = ("risk_type", "severity", "is_active")
