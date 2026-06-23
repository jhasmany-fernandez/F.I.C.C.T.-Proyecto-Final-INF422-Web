from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0018_bullyingvideoanalysis_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="mobile_push_platform",
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name="user",
            name="mobile_push_token",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="user",
            name="mobile_push_updated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
