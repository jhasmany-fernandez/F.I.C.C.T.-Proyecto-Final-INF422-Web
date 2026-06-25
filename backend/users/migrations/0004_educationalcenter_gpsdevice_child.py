import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0003_alter_user_options_alter_user_username"),
    ]

    operations = [
        migrations.CreateModel(
            name="EducationalCenter",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=30, unique=True)),
                ("name", models.CharField(max_length=150, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ("name",)},
        ),
        migrations.CreateModel(
            name="GPSDevice",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=40, unique=True)),
                ("model", models.CharField(max_length=120)),
                ("imei", models.CharField(max_length=30, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ("code",)},
        ),
        migrations.CreateModel(
            name="Child",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=20, unique=True)),
                ("nombres", models.CharField(max_length=150)),
                ("apellidos", models.CharField(max_length=150)),
                ("fecha_nacimiento", models.DateField()),
                ("curso", models.CharField(max_length=100)),
                ("foto", models.ImageField(blank=True, null=True, upload_to="children/")),
                ("status", models.CharField(choices=[("activo", "Activo"), ("inactivo", "Inactivo")], default="activo", max_length=10)),
                ("motivo_desactivacion", models.CharField(blank=True, max_length=200)),
                ("tutor_reference", models.CharField(blank=True, max_length=120)),
                ("fecha_registro", models.DateTimeField(auto_now_add=True)),
                ("fecha_actualizacion", models.DateTimeField(auto_now=True)),
                (
                    "centro_educativo",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="children", to="users.educationalcenter"),
                ),
                (
                    "dispositivo_gps",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="children", to="users.gpsdevice"),
                ),
            ],
            options={"ordering": ("-fecha_registro",)},
        ),
    ]
