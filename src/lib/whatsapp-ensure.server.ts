import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const STATUS_PORT = 3100;
const STATUS_HOST = "127.0.0.1";

export function isVercelRuntime() {
  return Boolean(process.env.VERCEL);
}

function serviceDir() {
  return path.join(process.cwd(), "whatsapp-service");
}

function serviceEntry() {
  return path.join(serviceDir(), "src", "index.js");
}

export function probeWhatsAppStatus(timeoutMs = 2000): Promise<unknown | null> {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: STATUS_HOST,
        port: STATUS_PORT,
        path: "/status",
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            resolve(json && typeof json === "object" ? json : null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

export async function postWhatsAppAction(pathname: string, timeoutMs = 8000) {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const req = http.request(
      {
        host: STATUS_HOST,
        port: STATUS_PORT,
        path: pathname,
        method: "POST",
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            resolve(json);
          } catch {
            resolve({ ok: res.statusCode === 200 });
          }
        });
      }
    );
    req.on("error", (err) => resolve({ ok: false, error: err.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    req.end();
  });
}

function installWindowsAutostart() {
  if (process.platform !== "win32") return;
  try {
    const startupDir = path.join(
      process.env.APPDATA || "",
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      "Startup"
    );
    if (!startupDir || !fs.existsSync(startupDir)) return;

    const vbsPath = path.join(startupDir, "consultorio-pamela-whatsapp.vbs");
    const nodePath = process.execPath.replace(/"/g, '""');
    const entry = serviceEntry().replace(/"/g, '""');
    const cwd = serviceDir().replace(/"/g, '""');
    const vbs = [
      `Set sh = CreateObject("WScript.Shell")`,
      `sh.CurrentDirectory = "${cwd}"`,
      `sh.Run """${nodePath}"" ""${entry}""", 0, False`,
      "",
    ].join("\r\n");
    fs.writeFileSync(vbsPath, vbs, "utf8");
  } catch {
    // no bloquear el panel si no se puede instalar el autostart
  }
}

export async function ensureWhatsAppService(): Promise<{
  running: boolean;
  started: boolean;
  status: unknown | null;
  error?: string;
}> {
  if (isVercelRuntime()) {
    const status = await probeWhatsAppStatus();
    return {
      running: Boolean(status),
      started: false,
      status,
      error: status
        ? undefined
        : "El sitio está en la nube; el servicio WhatsApp corre en esta PC.",
    };
  }

  const existing = await probeWhatsAppStatus();
  if (existing) {
    installWindowsAutostart();
    return { running: true, started: false, status: existing };
  }

  const entry = serviceEntry();
  if (!fs.existsSync(entry)) {
    return {
      running: false,
      started: false,
      status: null,
      error: "No se encontró whatsapp-service.",
    };
  }

  try {
    installWindowsAutostart();
    const child = spawn(process.execPath, [entry], {
      cwd: serviceDir(),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env },
    });
    child.unref();
  } catch (err) {
    return {
      running: false,
      started: false,
      status: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const status = await probeWhatsAppStatus();
    if (status) return { running: true, started: true, status };
  }

  return {
    running: false,
    started: true,
    status: null,
    error: "El servicio se inició pero todavía no responde. Esperá el QR.",
  };
}
