from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0016_pickuprecord"),
    ]

    operations = [
        migrations.CreateModel(
            name="AccessControlRecord",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("record_type", models.CharField(choices=[("INGRESO", "Control de ingreso"), ("ASISTENCIA", "Registro de asistencia")], max_length=20)),
                ("source_platform", models.CharField(default="mobile", max_length=20)),
                ("note", models.CharField(blank=True, max_length=255)),
                ("recorded_at", models.DateTimeField(auto_now_add=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("child", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="access_control_records", to="users.child")),
                ("recorded_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="access_control_records", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-recorded_at", "-id")},
        ),
    ]
