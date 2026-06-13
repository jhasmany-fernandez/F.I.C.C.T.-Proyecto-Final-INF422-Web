from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Child, EducationalCenter, GPSDevice, Module, Permission, Role, RolePermission, Tutor, User


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
    list_display = ("id", "code", "name", "is_active", "created_at")
    search_fields = ("code", "name")
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
