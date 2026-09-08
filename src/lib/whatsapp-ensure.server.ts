import "server-only";

import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

const STATUS_PORT = 3100;
const STATUS_HOST = "127.0.0.1";

export function isVercelRuntime() {
  return Boolean(process.env.VERCEL);
}

/** Solo permitir spawn/kill local fuera de hosts cloud. */
export function canControlLocalWhatsAppProcess() {
  if (isVercelRuntime()) return false;
  if (process.env.WHATSAPP_LOCAL_CONTROL === "0") return false;
  if (process.env.WHATSAPP_LOCAL_CONTROL === "1") return true;
  // Bloquear otros PaaS comunes aunque no sean Vercel
  if (
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.FLY_APP_NAME ||
    process.env.RENDER ||
    process.env.CF_PAGES
  ) {
    return false;
  }
  // PC local / self-host: solo si el worker está en el repo
  return fs.existsSync(serviceEntry());
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

export async function publishQrToSupabase(status: unknown) {
  const qrDataUrl =
    status &&
    typeof status === "object" &&
    "qrDataUrl" in status &&
    typeof (status as { qrDataUrl?: unknown }).qrDataUrl === "string"
      ? (status as { qrDataUrl: string }).qrDataUrl
      : null;
  if (!qrDataUrl?.startsWith("data:")) return;

  const { createServiceClient } = await import("@/lib/supabase/admin");
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("whatsapp_service_status")
    .select("details")
    .eq("id", 1)
    .maybeSingle();
  const prev =
    data?.details && typeof data.details === "object"
      ? (data.details as Record<string, unknown>)
      : {};
  await supabase.from("whatsapp_service_status").upsert(
    {
      id: 1,
      updated_at: new Date().toISOString(),
      state: "QR_REQUIRED",
      qr_required: true,
      details: { ...prev, qrDataUrl },
    },
    { onConflict: "id" }
  );
}

async function killPort3100() {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "TCP"], {
        encoding: "utf8",
      });
      const pids = new Set<string>();
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.includes(`:${STATUS_PORT}`) || !line.includes("LISTENING")) {
          continue;
        }
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
      }
      for (const pid of pids) {
        try {
          await execFileAsync("taskkill", ["/F", "/PID", pid]);
        } catch {
          // ignore
        }
      }
    } else {
      try {
        const { stdout } = await execFileAsync("lsof", [
          "-ti",
          `tcp:${STATUS_PORT}`,
        ]);
        for (const pid of stdout.trim().split(/\s+/).filter(Boolean)) {
          try {
            process.kill(Number(pid), "SIGTERM");
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

function statusNeedsRestart(status: unknown) {
  if (!status || typeof status !== "object") return false;
  const s = status as { state?: string; qrDataUrl?: unknown };
  return s.state === "QR_REQUIRED" && typeof s.qrDataUrl !== "string";
}

async function spawnWhatsAppService() {
  const entry = serviceEntry();
  if (!fs.existsSync(entry)) {
    throw new Error("No se encontró whatsapp-service.");
  }
  installWindowsAutostart();
  const env = { ...process.env };
  if (/cursor-sandbox-cache/i.test(env.PUPPETEER_CACHE_DIR || "")) {
    env.PUPPETEER_CACHE_DIR = path.join(os.homedir(), ".cache", "puppeteer");
  }
  const child = spawn(process.execPath, [entry], {
    cwd: serviceDir(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env,
  });
  child.unref();
}

export async function ensureWhatsAppService(): Promise<{
  running: boolean;
  started: boolean;
  status: unknown | null;
  error?: string;
}> {
  if (!canControlLocalWhatsAppProcess()) {
    return {
      running: false,
      started: false,
      status: null,
      error:
        "Control local de WhatsApp deshabilitado en este entorno. Usá la PC del consultorio con WHATSAPP_LOCAL_CONTROL=1 o el worker whatsapp-service.",
    };
  }

  let existing = await probeWhatsAppStatus();
  if (existing && statusNeedsRestart(existing)) {
    await killPort3100();
    await new Promise((r) => setTimeout(r, 1200));
    existing = null;
  }

  if (existing) {
    installWindowsAutostart();
    try {
      await publishQrToSupabase(existing);
    } catch (err) {
      console.error("[whatsapp] publishQrToSupabase", err);
    }
    return { running: true, started: false, status: existing };
  }

  try {
    await spawnWhatsAppService();
  } catch (err) {
    return {
      running: false,
      started: false,
      status: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const status = await probeWhatsAppStatus();
    if (status) {
      try {
        await publishQrToSupabase(status);
      } catch (err) {
        console.error("[whatsapp] publishQrToSupabase", err);
      }
      return { running: true, started: true, status };
    }
  }

  return {
    running: false,
    started: true,
    status: null,
    error: "El servicio se inició pero todavía no responde. Esperá el QR.",
  };
}

export async function queueWhatsAppCommand(command: "show-qr" | "disconnect") {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("whatsapp_service_status")
    .select("details")
    .eq("id", 1)
    .maybeSingle();
  const prev =
    data?.details && typeof data.details === "object"
      ? (data.details as Record<string, unknown>)
      : {};
  const { error } = await supabase.from("whatsapp_service_status").upsert(
    {
      id: 1,
      updated_at: new Date().toISOString(),
      details: {
        ...prev,
        command,
        commandAt: new Date().toISOString(),
      },
    },
    { onConflict: "id" }
  );
  if (error) throw error;
  return { ok: true, queued: true as const };
}
