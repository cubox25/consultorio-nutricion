# WhatsApp Cloud API (Meta) — Setup del consultorio

Guía para la **Parte 1** del plan: cuenta Meta + plantillas.
El código del sistema ya está listo; sin estos datos en Vercel no se envían mensajes.

## 1. Cuenta y app

1. Entrá a [Meta for Developers](https://developers.facebook.com/) con la cuenta del consultorio.
2. **My Apps → Create App → Other → Business**.
3. Agregá el producto **WhatsApp** → **API Setup** / Cloud API.
4. Vinculá o creá un **Meta Business Portfolio** si lo pide.

## 2. Número

1. En WhatsApp → API Setup, usá el **número de prueba** de Meta para pruebas, o agregá el **número real** del consultorio.
2. Completá la verificación por SMS/llamada.
3. Anotá estos valores (pantalla API Setup):

| Variable Vercel | Dónde está |
|-----------------|------------|
| `WHATSAPP_TOKEN` | Temporary access token (después generá uno permanente en System Users) |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID (no es el número en sí) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp Business Account ID (**opcional**, no bloquea el envío) |

Token permanente recomendado:

1. Meta Business Suite → **Business settings** → **Users → System users**.
2. Crear system user → Assign assets (app + WABA) → Generate token (WhatsApp permissions).
3. Ese token va en `WHATSAPP_TOKEN`.

## 3. Variables en Vercel

Project → Settings → Environment Variables (Production):

```
WHATSAPP_CLOUD_ENABLED=true
WHATSAPP_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
# Opcional:
# WHATSAPP_BUSINESS_ACCOUNT_ID=...
WHATSAPP_TEMPLATE_LANG=es_AR
WHATSAPP_TEMPLATE_CONFIRMATION=turno_confirmado
WHATSAPP_TEMPLATE_REMINDER_24H=recordatorio_24h
# Recordatorio 2h desactivado en el panel / system_settings
CRON_SECRET=poné-un-string-largo-aleatorio
WHATSAPP_VERIFY_TOKEN=consultorio-pamela-wa-verify-2026
SUPABASE_SERVICE_ROLE_KEY=...   # ya debería existir
```

Redeploy después de guardar.

### Webhook en Meta (recomendado / a veces obligatorio en el setup)

1. Esperá a que Vercel tenga el deploy con `/api/whatsapp/webhook`.
2. En la app Meta → **WhatsApp → Configuration → Webhook**:
   - **Callback URL:** `https://consultorio-nutricion-fxok.vercel.app/api/whatsapp/webhook`
     (si usás otro dominio, reemplazá solo esa parte; el path tiene que ser `/api/whatsapp/webhook`)
   - **Verify token:** `consultorio-pamela-wa-verify-2026`
   - Certificado de cliente: **off**
3. Click **Verify and save**.
4. Suscribí al menos: `messages`.

El sistema **manda** turnos sin leer el webhook; el webhook sirve para que Meta valide la app y, más adelante, estados de entrega.

## 4. Plantillas (Message templates)

En **WhatsApp Manager → Message templates → Create template**.
Categoría: **Utility**. Idioma: **Spanish** (`es`) o `es_AR` (debe coincidir con `WHATSAPP_TEMPLATE_LANG`).

### `turno_confirmado`

**Body:**

```
Hola {{1}}

Tu turno con {{2}} fue confirmado.

Fecha: {{3}}
Hora: {{4}}
Consultorio: {{5}}

Si necesitás cancelar o modificar tu turno, por favor comunicate con nosotros.

Te esperamos.
```

Ejemplos de variables: `María` / `Pamela Guerrero, Lic. En Nutrición` / `14/09/2026` / `09:00` / `Aguilares — calle sarmiento`

### `recordatorio_24h`

```
Hola {{1}}

Te recordamos tu turno con {{2}}.

Fecha: {{3}}
Hora: {{4}}
Consultorio: {{5}}

Te esperamos.
```

### `recordatorio_2h`

**No la creamos** para este consultorio. El toggle `whatsapp_reminder_2h_enabled` queda en `false`.

## 5. Destinatarios de prueba

Mientras uses el número de prueba de Meta, agregá tu celular en **API Setup → To**.
Con número real ya aprobado, podés mandar a cualquier paciente.

## 6. Envío automático (sin apretar el panel)

**Confirmación:** se manda sola cuando alguien reserva (no hace falta “Procesar cola”).

**Recordatorio 24 h:** Vercel Hobby solo corre el cron **1 vez al día**, y se puede perder la ventana. Hay que crear un cron gratis cada 10 minutos:

1. Entrá a [https://cron-job.org](https://cron-job.org) y creá una cuenta.
2. **Create cronjob**:
   - Title: `WhatsApp consultorio`
   - URL: `https://consultorio-nutricion-fxok.vercel.app/api/cron/whatsapp?secret=TU_CRON_SECRET`
     (`TU_CRON_SECRET` = el mismo valor que `CRON_SECRET` en Vercel, ej. `consultorio-wa-cron-178075`)
   - Schedule: every **10 minutes**
   - Enabled: on
3. Save.

Eso procesa la cola solo, 24/7, sin PC y sin el botón.

El botón **Procesar cola ahora** queda por si un día algo quedó trabado.

## 7. Cortar WhatsApp Web (PC)

Cuando Cloud API mande bien:

1. `WHATSAPP_CLOUD_ENABLED=true` en Vercel.
2. En la PC del consultorio: dejá de usar el instalador / cerrá el worker.
3. En `whatsapp-service/.env` local podés poner `WHATSAPP_CLOUD_ENABLED=true` para que el worker no envíe si alguien lo enciende por error.

## 8. Panel admin

**Admin → WhatsApp**: debe decir **Cloud API configurada**.
Botón **Procesar cola ahora** fuerza un ciclo de envío.
