export type AdminNotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  icon: "pending" | "today" | "patient" | "whatsapp";
  /** Si es false, no se puede ocultar al hacer click (sigue pendiente de acción). */
  dismissible: boolean;
};
