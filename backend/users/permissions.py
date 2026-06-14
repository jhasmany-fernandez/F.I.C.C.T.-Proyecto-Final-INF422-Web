from rest_framework.permissions import BasePermission

from .models import UserRole


class IsAdminRole(BasePermission):
    message = "No tiene permisos para realizar esta acción."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and (user.rol == UserRole.ADMIN or (user.role and user.role.name.strip().lower() == "administrador"))
        )


class IsMobileRole(BasePermission):
    message = "Rol no permitido para la aplicación móvil."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and user.rol in {UserRole.TUTOR, UserRole.REGENTE}
        )


class IsMonitoringRole(BasePermission):
    message = "Rol no permitido para monitoreo."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and user.rol in {UserRole.ADMIN, UserRole.TUTOR, UserRole.REGENTE}
        )
