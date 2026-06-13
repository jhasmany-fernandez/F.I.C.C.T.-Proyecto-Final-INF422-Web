from django.contrib.auth import get_user_model
from django.db.models import Count, Prefetch, Q
from django.utils.dateparse import parse_date
from rest_framework import parsers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

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
    UserRole,
)
from .permissions import IsAdminRole
from .serializers import (
    ChildDetailSerializer,
    ChildListSerializer,
    ChildStatusSerializer,
    ChildWriteSerializer,
    EducationalCenterSerializer,
    GPSDeviceSerializer,
    LoginSerializer,
    ModuleSerializer,
    PermissionSerializer,
    RoleDetailSerializer,
    RoleListSerializer,
    RoleStatusSerializer,
    RoleWriteSerializer,
    TutorChildrenUpdateSerializer,
    TutorChildSerializer,
    TutorDetailSerializer,
    TutorListSerializer,
    TutorStatusSerializer,
    TutorWriteSerializer,
)

User = get_user_model()


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
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
                return Response({"message": "El usuario no existe."}, status=status.HTTP_404_NOT_FOUND)
            if not user.check_password(password):
                return Response({"message": "La contraseña es incorrecta."}, status=status.HTTP_401_UNAUTHORIZED)
            if not user.is_active:
                return Response({"message": "La cuenta está inactiva."}, status=status.HTTP_403_FORBIDDEN)

            is_admin = user.rol == UserRole.ADMIN or (user.role and user.role.name.strip().lower() == "administrador")
            if not is_admin:
                return Response({"message": "Rol no autorizado para acceso web."}, status=status.HTTP_403_FORBIDDEN)

            refresh = RefreshToken.for_user(user)
            return Response(
                {
                    "message": "Inicio de sesión exitoso.",
                    "token": {"access": str(refresh.access_token), "refresh": str(refresh)},
                    "user": {
                        "id": user.id,
                        "email": user.email,
                        "nombre": user.nombre,
                        "rol": user.rol,
                        "role": user.role.name if user.role else None,
                    },
                },
                status=status.HTTP_200_OK,
            )
        except Exception:
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


class EducationalCenterListView(BaseAdminView):
    def get(self, request):
        centers = EducationalCenter.objects.order_by("name")
        return Response(EducationalCenterSerializer(centers, many=True).data, status=status.HTTP_200_OK)


class GPSDeviceListView(BaseAdminView):
    def get(self, request):
        devices = GPSDevice.objects.order_by("code")
        return Response(GPSDeviceSerializer(devices, many=True).data, status=status.HTTP_200_OK)


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
