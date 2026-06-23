from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0017_accesscontrolrecord"),
    ]

    operations = [
        migrations.AlterField(
            model_name="monitoringalert",
            name="alert_type",
            field=models.CharField(
                choices=[
                    ("SALIDA_AREA_SEGURA", "Salida de area segura"),
                    ("INGRESO_ZONA_RIESGO", "Ingreso a zona de riesgo"),
                    ("ERROR_MONITOREO", "Error de monitoreo"),
                    ("BULLYING_DETECTADO", "Bullying detectado"),
                ],
                max_length=30,
            ),
        ),
        migrations.CreateModel(
            name="BullyingVideoAnalysis",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_video_name", models.CharField(max_length=180)),
                ("source_video_path", models.CharField(max_length=255)),
                ("source_folder", models.CharField(blank=True, max_length=255)),
                ("detector_name", models.CharField(default="Simulador IA Open Source", max_length=120)),
                ("result", models.CharField(choices=[("NORMAL", "Normal"), ("BULLYING_DETECTADO", "Bullying detectado")], max_length=30)),
                ("confidence", models.FloatField(default=0)),
                ("event_timestamp_seconds", models.PositiveIntegerField(blank=True, null=True)),
                ("summary", models.CharField(max_length=255)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("child", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="bullying_video_analyses", to="users.child")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="bullying_video_analyses_created", to="users.user")),
                ("educational_center", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="bullying_video_analyses", to="users.educationalcenter")),
                ("generated_alert", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="bullying_video_analyses", to="users.monitoringalert")),
            ],
            options={
                "ordering": ("-created_at",),
            },
        ),
    ]
