import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0005_tutor"),
    ]

    operations = [
        migrations.AddField(
            model_name="educationalcenter",
            name="address",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="educationalcenter",
            name="deactivation_reason",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="educationalcenter",
            name="description",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="educationalcenter",
            name="email",
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name="educationalcenter",
            name="latitude",
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
        ),
        migrations.AddField(
            model_name="educationalcenter",
            name="longitude",
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
        ),
        migrations.AddField(
            model_name="educationalcenter",
            name="phone",
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name="educationalcenter",
            name="regent",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="assigned_educational_centers", to="users.user"),
        ),
        migrations.AddField(
            model_name="educationalcenter",
            name="shift",
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name="educationalcenter",
            name="updated_at",
            field=models.DateTimeField(auto_now=True, null=True),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name="educationalcenter",
            name="code",
            field=models.CharField(blank=True, max_length=30, unique=True),
        ),
    ]
