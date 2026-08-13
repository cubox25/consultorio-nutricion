# Servicio WhatsApp — Consultorio Pamela Guerrero

Servicio **independiente** de Next.js / Vercel que envía confirmaciones y recordatorios de turnos por **WhatsApp Web** (`whatsapp-web.js` + Puppeteer + LocalAuth).

No usa WhatsApp Business API ni Meta Cloud API.

## 1. Instalar dependencias

Desde la raíz del proyecto:

```bash
cd whatsapp-service
npm install
```

## 2. Variables de entorno

Copiá el ejemplo:

```bash
copy .env.example .env
```

Completá al menos:

- `NEXT_PUBLIC_SUPABASE_URL` — la misma del proyecto
- `SUPABASE_SERVICE_ROLE_KEY` — service role (nunca en el frontend)

Podés copiar esos dos valores desde `../.env.local`.

Si no existe `whatsapp-service/.env`, el servicio también intenta leer `../.env.local`.

Opciones útiles:

| Variable | Default | Descripción |
|----------|---------|-------------|
| `WHATSAPP_CONFIRMATION_ENABLED` | `true` | Confirmación al crear turno |
| `WHATSAPP_REMINDER_24H_ENABLED` | `true` | Recordatorio ~24 h antes |
| `WHATSAPP_REMINDER_2H_ENABLED` | `false` | Recordatorio ~2 h antes |
| `WHATSAPP_POLL_INTERVAL` | `60000` | Polling en ms |
| `WHATSAPP_STATUS_PORT` | `3100` | API local de estado |

## 3. Migración SQL (obligatoria una vez)

En Supabase → **SQL Editor**, ejecutá el archivo:

`supabase/migrations/005_whatsapp_notifications.sql`

Eso agrega:

- `appointments.reminder_2h_sent` / `reminder_2h_sent_at`
- tabla `whatsapp_service_status`
- amplía `notifications` para canal `whatsapp_web` y tipo `recordatorio_2h`
- marca turnos **históricos** como ya confirmados (para no spamear al activar)

## 4. Iniciar el servicio

Desde la raíz:

```bash
npm run whatsapp
```

O:

```bash
cd whatsapp-service
npm start
```

Modo watch:

```bash
npm run whatsapp:dev
```

## 5. Cómo aparece el QR

La primera vez verás en la terminal:

```text
[WHATSAPP] Esperando QR...
[WHATSAPP] QR generado — escanealo con WhatsApp → Dispositivos vinculados
```

Y un QR en ASCII.

## 6. Vincular WhatsApp

1. Abrí WhatsApp en el teléfono
2. **Dispositivos vinculados** → **Vincular un dispositivo**
3. Escaneá el QR de la terminal
4. Cuando diga `[WHATSAPP] WhatsApp conectado`, ya está listo

## 7. Dónde se guarda la sesión

Por defecto (recomendado, fuera de OneDrive):

```text
%LOCALAPPDATA%\consultorio-pamela-whatsapp-session
```

Ejemplo: `C:\Users\TU_USUARIO\AppData\Local\consultorio-pamela-whatsapp-session`

Podés cambiarla con `WHATSAPP_SESSION_PATH` en `.env`.

**No uses una carpeta dentro de OneDrive** (rompe Chromium).

Está en `.gitignore` / no se sube a GitHub.

## 8. Reiniciar el servicio

```bash
# Ctrl+C para detener
npm run whatsapp
```

Con LocalAuth **no** pedirá QR de nuevo (salvo logout o sesión inválida).

## 9. Cerrar / desvincular la sesión

```bash
cd whatsapp-service
npm run logout
```

Luego reiniciá el servicio y escaneá un QR nuevo.

También podés desvincular desde el teléfono: Dispositivos vinculados → eliminar este equipo.

## 10. Probar el envío

1. Servicio en estado `READY`
2. Sacá un turno desde `/turnos` con **tu** número de WhatsApp
3. En ≤ 60 s deberías ver logs:

```text
[WHATSAPP] Buscando turnos pendientes...
[WHATSAPP] Enviando confirmación para turno #...
[WHATSAPP] Mensaje enviado correctamente
```

4. El turno queda con `confirmation_sent = true` (no se reenvía al reiniciar)

## 11. Si WhatsApp se desconecta

El servicio registra `DISCONNECTED` / `ERROR`, intenta reconectar y actualiza `whatsapp_service_status`.

Si no vuelve solo:

1. Revisá que el PC esté online
2. Reiniciá `npm run whatsapp`
3. Si pide QR, escaneá de nuevo
4. Si la sesión está corrupta: `npm run logout` y volvé a vincular

## 12. Confirmaciones

- Busca turnos con `confirmation_sent = false` y `status <> 'cancelado'`
- Teléfono: `guest_phone` o `patients.phone`
- Normaliza a formato AR para WhatsApp (sin cambiar el valor en DB)
- Envía el mensaje y **recién entonces** marca `confirmation_sent`

## 13. Recordatorios

- **24 h**: flag `reminder_sent` (ventana configurable)
- **2 h**: flag `reminder_2h_sent` (desactivado por default)

Activá/desactivá con las variables `WHATSAPP_REMINDER_*`.

## 14. Estado / panel admin

- Logs en consola
- HTTP local: `http://127.0.0.1:3100/status`
- Tabla Supabase `whatsapp_service_status` → página **Admin → WhatsApp**

## 15. Seguridad

- Nunca subas `.whatsapp-session` ni `.env`
- Usá solo `SUPABASE_SERVICE_ROLE_KEY` en este servicio (servidor)
- No corras `whatsapp-web.js` dentro de Vercel ni en API Routes de Next.js

## Arquitectura

```text
Paciente reserva → Supabase appointments
                         ↑
whatsapp-service (poller 60s) → WhatsApp Web → paciente
                         ↓
            confirmation_sent / reminder_* / notifications
```
