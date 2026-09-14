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
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp Business Account ID |

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
WHATSAPP_BUSINESS_ACCOUNT_ID=...
WHATSAPP_TEMPLATE_LANG=es
WHATSAPP_TEMPLATE_CONFIRMATION=turno_confirmado
WHATSAPP_TEMPLATE_REMINDER_24H=recordatorio_24h
WHATSAPP_TEMPLATE_REMINDER_2H=recordatorio_2h
CRON_SECRET=poné-un-string-largo-aleatorio
SUPABASE_SERVICE_ROLE_KEY=...   # ya debería existir
```

Redeploy después de guardar.

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

```
Hola {{1}}

Te recordamos tu turno con {{2}} en aproximadamente 2 horas.

Fecha: {{3}}
Hora: {{4}}
Consultorio: {{5}}

Te esperamos.
```

Enviá a revisión y esperá estado **Approved** (horas o 1–2 días).

## 5. Destinatarios de prueba

Mientras uses el número de prueba de Meta, agregá tu celular en **API Setup → To**.
Con número real ya aprobado, podés mandar a cualquier paciente.

## 6. Cron (recordatorios)

- Vercel (Hobby) corre `/api/cron/whatsapp` **1 vez por día** (`vercel.json`).
- Para recordatorios 24h/2h a tiempo, configurá un cron externo cada 5–15 min en [cron-job.org](https://cron-job.org):

  - URL: `https://TU-DOMINIO/api/cron/whatsapp`
  - Header: `Authorization: Bearer TU_CRON_SECRET`

- Las **confirmaciones** se disparan al reservar un turno (sin esperar el cron).
- En el panel: **Procesar cola ahora**.

## 7. Cortar WhatsApp Web (PC)

Cuando Cloud API mande bien:

1. `WHATSAPP_CLOUD_ENABLED=true` en Vercel.
2. En la PC del consultorio: dejá de usar el instalador / cerrá el worker.
3. En `whatsapp-service/.env` local podés poner `WHATSAPP_CLOUD_ENABLED=true` para que el worker no envíe si alguien lo enciende por error.

## 8. Panel admin

**Admin → WhatsApp**: debe decir **Cloud API configurada**.
Botón **Procesar cola ahora** fuerza un ciclo de envío.
