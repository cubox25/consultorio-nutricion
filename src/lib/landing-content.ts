import type { ServiceItem } from "@/types";
import {
  LANDING_PHOTO_MARKER,
  publicServices,
} from "@/lib/landing-photo-settings";
import { PRICE_SYSTEM_MARKERS } from "@/lib/price-settings";

export const LANDING_META_MARKER = "__landing_meta__";

export const LANDING_SERVICE_ICONS = [
  "apple",
  "scale",
  "salad",
  "heart",
  "trending-down",
  "trending-up",
] as const;

export type LandingServiceIcon = (typeof LANDING_SERVICE_ICONS)[number];

export type LandingService = {
  title: string;
  description: string;
  icon: LandingServiceIcon;
};

export type LandingContent = {
  hero_title: string;
  hero_subtitle: string;
  hero_card_eyebrow: string;
  hero_card_tagline: string;
  professional_title: string;
  about_section_label: string;
  about_section_title: string;
  about_section_body: string;
  about_highlights: string[];
  services_section_label: string;
  services_section_title: string;
  services: LandingService[];
  clinics_section_label: string;
  clinics_section_title: string;
  cta_title: string;
  cta_subtitle: string;
};

export const DEFAULT_LANDING_CONTENT: LandingContent = {
  hero_title: "Nutrición con calidez, claridad y acompañamiento real",
  hero_subtitle:
    "Te acompaño a mejorar tu relación con la alimentación con propuestas realistas, seguimiento cercano y un enfoque profesional.",
  hero_card_eyebrow: "Consultorio de nutrición",
  hero_card_tagline: "Bienestar · Salud · Hábitos",
  professional_title: "",
  about_section_label: "Sobre mí",
  about_section_title: "Un espacio para cuidar tu alimentación con tranquilidad",
  about_section_body:
    "Trabajo con educación nutricional y antropometría, priorizando la escucha y el seguimiento continuo.",
  about_highlights: [
    "Atención personalizada",
    "Propuestas adaptadas a tu rutina",
    "Seguimiento cercano",
  ],
  services_section_label: "Servicios",
  services_section_title: "Acompañamiento nutricional para cada objetivo",
  services: [
    {
      icon: "apple",
      title: "Educación nutricional",
      description:
        "Herramientas claras para entender tu alimentación y construir hábitos sostenibles.",
    },
    {
      icon: "scale",
      title: "Evaluación antropométrica",
      description:
        "Mediciones precisas para conocer tu composición corporal y seguir tu evolución.",
    },
    {
      icon: "salad",
      title: "Acompañamiento nutricional personalizado",
      description:
        "Propuestas adaptadas a tu rutina, gustos, objetivos y estilo de vida.",
    },
    {
      icon: "heart",
      title: "Abordaje en patologías",
      description:
        "Abordaje nutricional en diabetes, hipertensión, dislipemias, hipotiroidismo y más.",
    },
    {
      icon: "trending-down",
      title: "Descenso de peso",
      description:
        "Acompañamiento realista, sin extremos, con foco en bienestar y constancia.",
    },
    {
      icon: "trending-up",
      title: "Ascenso de peso",
      description:
        "Estrategias nutricionales para ganar peso de forma saludable y supervisada.",
    },
  ],
  clinics_section_label: "Consultorios",
  clinics_section_title: "Dónde y cuándo atendemos",
  cta_title: "¿Lista/o para dar el primer paso?",
  cta_subtitle:
    "Reservá tu turno online o escribinos por WhatsApp. Estoy para acompañarte.",
};

const SYSTEM_MARKERS = new Set([
  LANDING_PHOTO_MARKER,
  LANDING_META_MARKER,
  ...PRICE_SYSTEM_MARKERS,
]);

function isLandingIcon(value: unknown): value is LandingServiceIcon {
  return (
    typeof value === "string" &&
    (LANDING_SERVICE_ICONS as readonly string[]).includes(value)
  );
}

function normalizeHighlights(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_LANDING_CONTENT.about_highlights;
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return items.length ? items : DEFAULT_LANDING_CONTENT.about_highlights;
}

function normalizeServices(value: unknown): LandingService[] {
  if (!Array.isArray(value) || !value.length) {
    return DEFAULT_LANDING_CONTENT.services;
  }
  const services: LandingService[] = [];
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const description =
      typeof item.description === "string" ? item.description.trim() : "";
    if (!title || SYSTEM_MARKERS.has(title)) continue;
    services.push({
      title,
      description:
        description ||
        DEFAULT_LANDING_CONTENT.services[index]?.description ||
        "",
      icon: isLandingIcon(item.icon)
        ? item.icon
        : DEFAULT_LANDING_CONTENT.services[index]?.icon || "apple",
    });
  }
  return services.length ? services : DEFAULT_LANDING_CONTENT.services;
}

function pickString(
  raw: Record<string, unknown>,
  key: keyof LandingContent,
  fallback: string
) {
  const value = raw[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function extractLandingMeta(
  services: ServiceItem[] | null | undefined
): Partial<LandingContent> | null {
  if (!Array.isArray(services)) return null;
  const item = services.find((s) => s.title === LANDING_META_MARKER);
  if (!item?.description?.trim()) return null;
  try {
    const parsed = JSON.parse(item.description) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Partial<LandingContent>;
  } catch {
    return null;
  }
}

export function resolveLandingContent(input: {
  services_json?: ServiceItem[] | null;
  description?: string | null;
}): LandingContent {
  const meta = extractLandingMeta(input.services_json) ?? {};
  const fromArray = publicServices(input.services_json).map((service, index) => ({
    title: service.title,
    description: service.description,
    icon: isLandingIcon((service as ServiceItem & { icon?: string }).icon)
      ? ((service as ServiceItem & { icon?: string }).icon as LandingServiceIcon)
      : DEFAULT_LANDING_CONTENT.services[index]?.icon || ("apple" as const),
  }));

  const raw = meta as Record<string, unknown>;
  const servicesFromMeta = normalizeServices(meta.services);
  const services =
    Array.isArray(meta.services) && (meta.services as unknown[]).length
      ? servicesFromMeta
      : fromArray.length
        ? fromArray
        : DEFAULT_LANDING_CONTENT.services;

  return {
    hero_title: pickString(raw, "hero_title", DEFAULT_LANDING_CONTENT.hero_title),
    hero_subtitle:
      (typeof input.description === "string" && input.description.trim()) ||
      pickString(raw, "hero_subtitle", DEFAULT_LANDING_CONTENT.hero_subtitle),
    hero_card_eyebrow: pickString(
      raw,
      "hero_card_eyebrow",
      DEFAULT_LANDING_CONTENT.hero_card_eyebrow
    ),
    hero_card_tagline: pickString(
      raw,
      "hero_card_tagline",
      DEFAULT_LANDING_CONTENT.hero_card_tagline
    ),
    professional_title: (() => {
      const title = pickString(
        raw,
        "professional_title",
        DEFAULT_LANDING_CONTENT.professional_title
      ).trim();
      // Ya no se muestra este título por defecto en la marca.
      if (/^licenciada en nutrici[oó]n$/i.test(title)) return "";
      return title;
    })(),
    about_section_label: pickString(
      raw,
      "about_section_label",
      DEFAULT_LANDING_CONTENT.about_section_label
    ),
    about_section_title: pickString(
      raw,
      "about_section_title",
      DEFAULT_LANDING_CONTENT.about_section_title
    ),
    about_section_body: pickString(
      raw,
      "about_section_body",
      DEFAULT_LANDING_CONTENT.about_section_body
    ),
    about_highlights: normalizeHighlights(meta.about_highlights),
    services_section_label: pickString(
      raw,
      "services_section_label",
      DEFAULT_LANDING_CONTENT.services_section_label
    ),
    services_section_title: pickString(
      raw,
      "services_section_title",
      DEFAULT_LANDING_CONTENT.services_section_title
    ),
    services,
    clinics_section_label: pickString(
      raw,
      "clinics_section_label",
      DEFAULT_LANDING_CONTENT.clinics_section_label
    ),
    clinics_section_title: pickString(
      raw,
      "clinics_section_title",
      DEFAULT_LANDING_CONTENT.clinics_section_title
    ),
    cta_title: pickString(raw, "cta_title", DEFAULT_LANDING_CONTENT.cta_title),
    cta_subtitle: pickString(
      raw,
      "cta_subtitle",
      DEFAULT_LANDING_CONTENT.cta_subtitle
    ),
  };
}

export function withLandingContent(
  services: ServiceItem[] | null | undefined,
  content: LandingContent
): ServiceItem[] {
  const systemItems = Array.isArray(services)
    ? services.filter(
        (s) => SYSTEM_MARKERS.has(s.title) && s.title !== LANDING_META_MARKER
      )
    : [];

  const publicItems: ServiceItem[] = content.services.map((service) => ({
    title: service.title,
    description: service.description,
    icon: service.icon,
  }));

  return [
    ...publicItems,
    ...systemItems,
    {
      title: LANDING_META_MARKER,
      description: JSON.stringify(content),
    },
  ];
}

export function splitProfessionalName(fullName: string | null | undefined) {
  const name = (fullName || "Pamela Guerrero").trim() || "Pamela Guerrero";
  const parts = name.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], rest: "" };
  return { first: parts[0], rest: parts.slice(1).join(" ") };
}
