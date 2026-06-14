from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def migrate_risk_zone_severity_forward(apps, schema_editor):
    RiskZone = apps.get_model("users", "RiskZone")
    mapping = {
        "ALTA": "ALTO",
        "MEDIA": "MEDIO",
        "BAJA": "BAJO",
    }
    for previous_value, next_value in mapping.items():
        RiskZone.objects.filter(severity=previous_value).update(severity=next_value)


def migrate_risk_zone_severity_backward(apps, schema_editor):
    RiskZone = apps.get_model("users", "RiskZone")
    mapping = {
        "ALTO": "ALTA",
        "MEDIO": "MEDIA",
        "BAJO": "BAJA",
    }
    for previous_value, next_value in mapping.items():
        RiskZone.objects.filter(severity=previous_value).update(severity=next_value)


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0012_riskzone_area_m2_riskzone_center_latitude_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="riskzone",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="riskzone",
            name="deleted_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="risk_zones_deleted",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(
            migrate_risk_zone_severity_forward,
            migrate_risk_zone_severity_backward,
        ),
        migrations.AlterField(
            model_name="riskzone",
            name="severity",
            field=models.CharField(
                choices=[
                    ("INFORMATIVO", "Informativo"),
                    ("BAJO", "Bajo"),
                    ("MEDIO", "Medio"),
                    ("ALTO", "Alto"),
                ],
                default="MEDIO",
                max_length=12,
            ),
        ),
    ]
