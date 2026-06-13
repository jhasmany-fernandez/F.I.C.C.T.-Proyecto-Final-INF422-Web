import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Module",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120, unique=True)),
                (
                    "code",
                    models.CharField(
                        choices=[
                            ("dashboard", "Dashboard"),
                            ("usuarios", "Usuarios"),
                            ("estudiantes", "Estudiantes"),
                            ("regentes", "Regentes"),
                            ("tutores", "Tutores"),
                            ("reportes", "Reportes"),
                            ("configuracion", "Configuración"),
                            ("auditoria", "Auditoría"),
                            ("perfil", "Perfil"),
                        ],
                        max_length=80,
                        unique=True,
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={"ordering": ("id",)},
        ),
        migrations.CreateModel(
            name="Role",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120, unique=True)),
                ("description", models.CharField(blank=True, max_length=200)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ("name",)},
        ),
        migrations.CreateModel(
            name="Permission",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("ver", "Ver"),
                            ("crear", "Crear"),
                            ("editar", "Editar"),
                            ("eliminar", "Eliminar"),
                            ("activar", "Activar"),
                            ("desactivar", "Desactivar"),
                            ("consultar", "Consultar"),
                        ],
                        max_length=20,
                    ),
                ),
                ("code", models.CharField(max_length=120, unique=True)),
                (
                    "module",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="permissions", to="users.module"),
                ),
            ],
            options={"ordering": ("module__id", "action")},
        ),
        migrations.CreateModel(
            name="RolePermission",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "permission",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="permission_roles", to="users.permission"),
                ),
                (
                    "role",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="role_permissions", to="users.role"),
                ),
            ],
            options={"ordering": ("role__name", "permission__module__id", "permission__action")},
        ),
        migrations.AddField(
            model_name="user",
            name="role",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="users",
                to="users.role",
            ),
        ),
        migrations.AddConstraint(
            model_name="permission",
            constraint=models.UniqueConstraint(fields=("module", "action"), name="unique_permission_by_module_action"),
        ),
        migrations.AddConstraint(
            model_name="rolepermission",
            constraint=models.UniqueConstraint(fields=("role", "permission"), name="unique_role_permission"),
        ),
    ]
