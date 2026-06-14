import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0006_expand_educationalcenter_cu6"),
    ]

    operations = [
        migrations.CreateModel(
            name="SafeArea",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=150)),
                ("status", models.CharField(choices=[("ACTIVA", "Activa"), ("INACTIVA", "Inactiva")], default="ACTIVA", max_length=10)),
                ("polygon", models.JSONField()),
                ("area_m2", models.DecimalField(decimal_places=2, max_digits=12)),
                ("perimeter_m", models.DecimalField(decimal_places=2, max_digits=12)),
                ("points_count", models.PositiveIntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="safe_areas_created", to="users.user")),
                ("educational_center", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="safe_areas", to="users.educationalcenter")),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="safe_areas_updated", to="users.user")),
            ],
            options={"ordering": ("-updated_at",)},
        ),
        migrations.CreateModel(
            name="SafeAreaHistory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(choices=[("CREACION", "Creacion"), ("ACTUALIZACION", "Actualizacion"), ("ELIMINACION", "Eliminacion"), ("REEMPLAZO", "Reemplazo")], max_length=20)),
                ("previous_polygon", models.JSONField(blank=True, null=True)),
                ("new_polygon", models.JSONField(blank=True, null=True)),
                ("previous_area_m2", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("new_area_m2", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("previous_perimeter_m", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("new_perimeter_m", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("points_count", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("educational_center", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="safe_area_history_entries", to="users.educationalcenter")),
                ("safe_area", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="history_entries", to="users.safearea")),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="safe_area_history_actions", to="users.user")),
            ],
            options={"ordering": ("-created_at",)},
        ),
    ]
