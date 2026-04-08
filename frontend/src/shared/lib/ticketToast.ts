export const TICKET_TOAST_EVENT = "foresight:ticket-toast";

export type TicketToastEventDetail = {
  message?: string;
  cooldownSeconds?: number;
};

export function emitTicketToast(detail: TicketToastEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<TicketToastEventDetail>(TICKET_TOAST_EVENT, { detail }));
}
