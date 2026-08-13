export type AdminNotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  icon: "pending" | "today" | "patient" | "whatsapp";
};
