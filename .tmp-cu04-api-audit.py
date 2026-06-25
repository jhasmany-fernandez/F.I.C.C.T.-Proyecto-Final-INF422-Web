import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8787/api"


def request(method, url, headers=None, body=None):
    headers = headers or {}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read().decode()
            parsed = json.loads(raw) if raw else None
            return {
                "url": url,
                "method": method,
                "headers": headers,
                "body": body,
                "status": response.status,
                "response": parsed,
            }
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        parsed = json.loads(raw) if raw else None
        return {
            "url": url,
            "method": method,
            "headers": headers,
            "body": body,
            "status": exc.code,
            "response": parsed,
        }


login_headers = {"Content-Type": "application/json"}
login_body = {"email": "admin@colegio.com", "password": "12345678"}
login_result = request("POST", f"{BASE}/auth/login/", login_headers, login_body)
token = login_result["response"]["token"]["access"]
auth_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

stats_result = request("GET", f"{BASE}/children/stats/", auth_headers)
list_result = request("GET", f"{BASE}/children/?page=1&page_size=8", auth_headers)
detail_id = list_result["response"]["results"][0]["id"]
detail_result = request("GET", f"{BASE}/children/{detail_id}/", auth_headers)
centers_result = request("GET", f"{BASE}/educational-centers/", auth_headers)
gps_result = request("GET", f"{BASE}/gps-devices/", auth_headers)

centers = centers_result["response"]
devices = gps_result["response"]
available = next((device for device in devices if device["assignment_status"] == "disponible"), None)
used = next((device for device in devices if device["assignment_status"] == "asignado"), None)

create_body = {
    "nombres": "Auditoria",
    "apellidos": "CU04 Real",
    "fecha_nacimiento": "2016-06-12",
    "curso": "5to Primaria",
    "centro_educativo_id": centers[0]["id"],
    "dispositivo_gps_id": available["id"] if available else None,
    "status": "activo",
    "motivo_desactivacion": "",
}
create_result = request("POST", f"{BASE}/children/", auth_headers, create_body)
created_id = create_result["response"]["id"]

edit_body = {
    "nombres": "Auditoria Editada",
    "apellidos": "CU04 Real",
    "fecha_nacimiento": "2016-06-12",
    "curso": "6to Primaria",
    "centro_educativo_id": centers[1]["id"],
    "dispositivo_gps_id": None,
    "status": "activo",
    "motivo_desactivacion": "",
}
edit_result = request("PUT", f"{BASE}/children/{created_id}/", auth_headers, edit_body)

deactivate_body = {
    "status": "inactivo",
    "motivo_desactivacion": "Prueba de auditoría CU04",
}
deactivate_result = request("PATCH", f"{BASE}/children/{created_id}/status/", auth_headers, deactivate_body)

duplicate_body = {
    "nombres": "Auditoria",
    "apellidos": "GPS Duplicado",
    "fecha_nacimiento": "2016-01-01",
    "curso": "5to Primaria",
    "centro_educativo_id": centers[0]["id"],
    "dispositivo_gps_id": used["id"] if used else None,
    "status": "activo",
    "motivo_desactivacion": "",
}
duplicate_result = request("POST", f"{BASE}/children/", auth_headers, duplicate_body)

print(
    json.dumps(
        {
            "autenticacion": login_result,
            "stats": stats_result,
            "listado": {
                **list_result,
                "returned_records": len(list_result["response"]["results"]),
                "total_records": list_result["response"]["count"],
            },
            "detalle": detail_result,
            "crear": create_result,
            "editar": edit_result,
            "desactivar": deactivate_result,
            "validacion_gps_duplicado": duplicate_result,
            "cleanup_target_id": created_id,
        },
        ensure_ascii=False,
        indent=2,
    )
)
