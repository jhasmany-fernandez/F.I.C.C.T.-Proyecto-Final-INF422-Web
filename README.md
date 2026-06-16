# Sistema Escolar

Arquitectura full stack separada en:

- `frontend`: Next.js + TypeScript + Tailwind CSS
- `backend`: Django + Django REST Framework + SimpleJWT
- `postgres`: PostgreSQL 16 en Docker

## Requisitos

- Docker
- Docker Compose

## Estructura

```text
.
├── db
├── backend
├── frontend
├── docker-compose.yml
└── README.md
```

## Variables de entorno

Backend: [backend/.env](/home/alexanderaav03/F.I.C.C.T.-Proyecto-Final-INF412/backend/.env)

Frontend: [frontend/.env.local](/home/alexanderaav03/F.I.C.C.T.-Proyecto-Final-INF412/frontend/.env.local)

## Levantar el proyecto

```bash
docker compose up --build
```

## Modo desarrollo

- `frontend` y `backend` usan volúmenes montados, así que los cambios locales se reflejan dentro del contenedor.
- Next.js corre en modo `dev` con detección de cambios por polling.
- Django corre con `runserver`, por lo que recarga automáticamente cuando cambias código Python.
- PostgreSQL sincroniza automáticamente la contraseña interna del usuario `postgres` con `POSTGRES_PASSWORD` cada vez que arranca el contenedor `db`.
- Después de este ajuste, ya no necesitas reconstruir ni reiniciar contenedores por cada cambio de código.

Si es la primera vez que aplicas esta configuración, reinicia una vez el stack:

```bash
docker compose down
docker compose up --build
```

## URLs esperadas

- Frontend: `http://35.238.201.88:5656`
- Backend: `http://35.238.201.88:8787`
- Login API: `http://35.238.201.88:8787/api/auth/login/`
- Roles y Permisos: `http://35.238.201.88:5656/roles-permisos`
- Niños Monitoreados: `http://35.238.201.88:5656/ninos-monitoreados`

## Endpoints nuevos CU03

- `GET /api/roles/`
- `POST /api/roles/`
- `GET /api/roles/{id}/`
- `PUT /api/roles/{id}/`
- `PATCH /api/roles/{id}/status/`
- `DELETE /api/roles/{id}/`
- `GET /api/modules/`
- `GET /api/permissions/`
- `GET /api/roles/stats/`

## Endpoints nuevos CU04

- `GET /api/children/`
- `POST /api/children/`
- `GET /api/children/{id}/`
- `PUT /api/children/{id}/`
- `PATCH /api/children/{id}/status/`
- `DELETE /api/children/{id}/`
- `GET /api/children/stats/`
- `GET /api/educational-centers/`
- `GET /api/gps-devices/`

## Credenciales de prueba

- Correo: `admin@colegio.com`
- Contraseña: `12345678`

## Datos seed CU03

Módulos base:

- Dashboard
- Usuarios
- Estudiantes
- Regentes
- Tutores
- Reportes
- Configuración
- Auditoría
- Perfil

Roles base:

- Administrador
- Regente
- Tutor
- Asistente
- Invitado

Acciones base:

- `ver`
- `crear`
- `editar`
- `eliminar`
- `activar`
- `desactivar`
- `consultar`

## Datos seed CU04

Centros educativos de prueba:

- `Centro Educativo San Martín`
- `Unidad Educativa Libertad`
- `Colegio Horizonte`

Dispositivos GPS de prueba:

- `GPS-001`
- `GPS-002`
- `GPS-003`
- `GPS-004`
- `GPS-005`
- `GPS-006`

Niños monitoreados seed:

- `9` registros iniciales
- combinación de activos e inactivos
- combinación de niños con GPS y sin GPS

## Comandos útiles

```bash
docker compose up --build
docker compose down
docker compose logs -f backend
docker compose logs -f frontend
docker compose exec backend python manage.py createsuperuser
```

## Flujo implementado

- El backend ejecuta migraciones al iniciar.
- El backend crea o actualiza automáticamente el usuario administrador semilla.
- El login devuelve JWT usando SimpleJWT.
- El frontend guarda `access` y `refresh` en `localStorage`.
- Si el login es correcto, redirige a `/dashboard`.
- El módulo `Roles y Permisos` consume la API protegida con JWT.
- Solo usuarios con rol `ADMIN` pueden usar los endpoints del CU03.
- El frontend cierra sesión o redirige al login si recibe `401` o `403`.
- El módulo `Niños Monitoreados` consume la API real con filtros, paginación y detalle lateral.
- La foto del niño es opcional y se sirve desde el backend en modo desarrollo.

## CORS y seguridad

- CORS permitido para:
  - `http://35.238.201.88:5656`
  - `http://localhost:5656`
- La API de login usa JWT y `AllowAny`.
- La configuración sensible se carga desde variables de entorno.

## Solución de errores comunes

1. Si el frontend no responde, reconstruya las imágenes:

```bash
docker compose up --build --force-recreate
```

2. Si PostgreSQL tarda en levantar, espere unos segundos y revise:

```bash
docker compose logs -f db
```

Si cambió `POSTGRES_PASSWORD` o sospecha que la base quedó desalineada con el `.env`, reinicie `db` y `backend`:

```bash
docker compose up --build -d db backend
```

3. Si desea volver a crear el usuario administrador:

```bash
docker compose exec backend python manage.py seed_admin
```

4. Si necesita aplicar migraciones manualmente:

```bash
docker compose exec backend python manage.py migrate
```

## Cómo probar CU03

1. Inicie sesión con `admin@colegio.com / 12345678`.
2. Ingrese a `http://35.238.201.88:5656/roles-permisos`.
3. Revise las tarjetas resumen y la tabla de roles.
4. Cree un rol nuevo con al menos un permiso.
5. Edite el rol creado y verifique el panel lateral de detalle.
6. Cambie el estado del rol desde la acción activar o desactivar.
7. Elimine un rol sin usuarios asignados.

## Cómo probar CU04

1. Inicie sesión con `admin@colegio.com / 12345678`.
2. Abra `http://35.238.201.88:5656/ninos-monitoreados`.
3. Revise tarjetas resumen y la tabla paginada.
4. Pruebe filtros por nombre, centro, curso, estado, GPS y fecha.
5. Cree un niño nuevo.
6. Edite el niño creado.
7. Desactive un niño indicando un motivo opcional.
8. Verifique el detalle lateral y la información del GPS.
