# Consultorio de Nutrición

Plataforma web profesional para gestión de consultorio nutricional.

Incluye:

- Sitio público configurable
- Reserva de turnos online (`/turnos`)
- Panel administrativo (`/admin`)
- Agenda, pacientes, historias clínicas, antropometría, archivos, planes alimentarios
- Dos o más consultorios configurables
- Estadísticas, backups y exportación
- Autenticación, RLS y Storage privado con Supabase

Stack: **Next.js (App Router) + TypeScript + Tailwind CSS + Supabase**.

---

## 1. Requisitos

- Node.js 20+
- Cuenta de [Supabase](https://supabase.com)
- Cuenta de [Vercel](https://vercel.com) (para despliegue)

---

## 2. Instalación local

```bash
cd CONSULTORIO-NUTRICION
npm install
cp .env.example .env.local
```

Completá `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

> **Importante:** `SUPABASE_SERVICE_ROLE_KEY` solo se usa en servidor. Nunca la expongas en el cliente ni la subas al repositorio.

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

---

## 3. Configurar Supabase

### 3.1 Crear proyecto

1. Creá un proyecto en Supabase.
2. Copiá URL, `anon key` y `service_role key` desde **Project Settings → API**.

### 3.2 Ejecutar migraciones

En el SQL Editor de Supabase, ejecutá en orden:

1. `supabase/migrations/001_initial_schema.sql`  
   Crea tablas, índices, triggers, RLS, RPCs públicas de turnos y el bucket privado `patient-files`.

2. `supabase/migrations/002_security_hardening.sql` **(obligatorio)**  
   Endurece roles, impide escalada de privilegios, cierra bypass de turnos públicos, evita solapes y ajusta DNI/archivos clínicos.

3. (Opcional, solo demo) `supabase/seed/demo_data.sql`  
   Inserta 2 consultorios, 10 pacientes, turnos y mediciones de ejemplo.  
   **No lo uses en producción con datos reales.**

### 3.3 Auth

1. En **Authentication → Providers → Email**, **desactivá el registro público** (Disable sign ups).
2. Creá el primer usuario administrador:

**Opción A — Dashboard**

1. Authentication → Users → Add user
2. Email + contraseña
3. El trigger crea el perfil con rol `pending`
4. Promové a admin en SQL:

```sql
update public.profiles
set role = 'admin', full_name = 'Administradora'
where email = 'tu@email.com';
```

**Importante:** el campo `role` no puede cambiarse desde el cliente; solo con service role / SQL.
### 3.4 Storage

La migración crea el bucket privado `patient-files` con políticas solo para staff autenticado.

Estructura:

```text
patient-files/
  {patient-id}/
    anthropometry/
    studies/
    analysis/
    photos/
    nutrition-plans/
    other/
```

Los archivos se sirven con **URLs firmadas**, nunca de forma pública.

---

## 4. Seguridad (RLS)

- Datos clínicos, pacientes, archivos, planes y backups: **solo staff/admin** (`is_staff()`)
- Nuevos usuarios Auth nacen como `pending` (sin acceso clínico)
- El rol no es editable desde el frontend
- Público (anon):
  - leer configuración y consultorios activos
  - leer horarios/bloqueos (sin notas internas)
  - solicitar turnos **solo** vía RPC `create_public_appointment`
  - consultar slots ocupados vía RPC `get_occupied_slots` (sin datos personales)
- El panel `/admin` requiere sesión **y** rol staff/admin (middleware fail-closed)
---

## 5. Rutas principales

| Ruta | Descripción |
|------|-------------|
| `/` | Sitio público |
| `/turnos` | Reserva de turnos |
| `/login` | Acceso profesional |
| `/admin` | Dashboard |
| `/admin/agenda` | Agenda día/semana/mes |
| `/admin/pacientes` | Pacientes |
| `/admin/pacientes/[id]` | Ficha del paciente |
| `/admin/historias` | Historias clínicas |
| `/admin/antropometria` | Antropometría y gráficos |
| `/admin/planes` | Planes alimentarios + PDF |
| `/admin/archivos` | Archivos (Storage privado) |
| `/admin/consultorios` | Consultorios y horarios |
| `/admin/configuracion` | Perfil, turnos, notificaciones, sistema |
| `/admin/backups` | Respaldos y exportación |

---

## 6. Scripts

```bash
npm run dev      # desarrollo
npm run build    # build de producción
npm run start    # servir build
npm run lint     # ESLint
```

---

## 7. Despliegue en Vercel

1. Subí el repositorio a GitHub/GitLab.
2. Importá el proyecto en Vercel.
3. Configurá las mismas variables de entorno.
4. En `NEXT_PUBLIC_SITE_URL` usá la URL definitiva (ej. `https://tudominio.com`).
5. Deploy.

Después del deploy:

1. Ejecutá la migración SQL si aún no lo hiciste.
2. Creá el usuario admin.
3. Configurá perfil, consultorios y horarios en `/admin/configuracion` y `/admin/consultorios`.

---

## 8. Backups

Supabase es el **sistema principal**.

Los backups del panel generan copias externas (JSON/CSV) para recuperación ante errores.  
**Un backup local no reemplaza** las copias automáticas de Supabase ni un plan de retención del proveedor.

Los archivos de Storage quedan referenciados por `storage_path` para poder respaldarlos externamente.

---

## 9. Recordatorios (WhatsApp Business API)

El sistema deja preparada la arquitectura:

- consentimiento de comunicación en pacientes
- campos de recordatorio en turnos
- tabla `notifications`
- configuración de recordatorios en sistema

No se integra WhatsApp Web no oficial. La integración futura debe usar **WhatsApp Business Platform / API oficial**.

---

## 10. Datos demo

```text
supabase/seed/demo_data.sql
```

Solo para pruebas. Separado de la migración de producción.

---

## 11. Estructura del código

```text
src/
  app/           # rutas App Router
  components/    # UI pública y admin
  lib/           # supabase, validaciones, utilidades
  services/      # acceso a datos
  types/         # tipos TypeScript
supabase/
  migrations/    # SQL de producción
  seed/          # datos demo opcionales
```

---

## 12. Checklist post-instalación

- [ ] Variables de entorno cargadas
- [ ] Migración `001_initial_schema.sql` ejecutada
- [ ] Usuario admin creado
- [ ] Login funciona
- [ ] Consultorios y horarios configurados
- [ ] Reserva pública `/turnos` funciona
- [ ] Pacientes / agenda / historia / antropometría / archivos / planes OK
- [ ] Bucket `patient-files` privado
- [ ] `npm run build` OK
- [ ] Deploy en Vercel
