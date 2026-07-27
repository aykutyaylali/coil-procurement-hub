import { StateTransitionError } from "@/lib/errors";

/**
 * Durum makineleri. Geçersiz geçişler BACKEND'de engellenir.
 * Yalnızca frontend kontrolüne asla güvenilmez.
 */

type Transitions = Record<string, string[]>;

export const REQUISITION_TRANSITIONS: Transitions = {
  DRAFT: ["PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "DRAFT"],
  APPROVED: ["ASSIGNED", "IN_RFQ", "ORDERED", "CANCELLED"],
  REJECTED: ["DRAFT"],
  ASSIGNED: ["IN_RFQ", "ORDERED", "CANCELLED"],
  IN_RFQ: ["ORDERED", "APPROVED", "CANCELLED"],
  ORDERED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export const RFQ_TRANSITIONS: Transitions = {
  DRAFT: ["PENDING_APPROVAL", "APPROVED", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "DRAFT", "CANCELLED"],
  APPROVED: ["SENT", "CANCELLED"],
  SENT: ["OPEN", "CANCELLED"],
  OPEN: ["CLARIFICATION", "EVALUATION", "CANCELLED"],
  CLARIFICATION: ["OPEN", "EVALUATION", "CANCELLED"],
  EVALUATION: ["NEGOTIATION", "AWARDED", "CANCELLED"],
  NEGOTIATION: ["EVALUATION", "AWARDED", "CANCELLED"],
  AWARDED: ["CLOSED"],
  CANCELLED: [],
  CLOSED: [],
};

export const ORDER_TRANSITIONS: Transitions = {
  DRAFT: ["PENDING_APPROVAL", "APPROVED", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "DRAFT", "CANCELLED"],
  APPROVED: ["SENT", "CANCELLED"],
  SENT: ["ACKNOWLEDGED", "PARTIALLY_CONFIRMED", "CONFIRMED", "CANCELLED"],
  ACKNOWLEDGED: ["PARTIALLY_CONFIRMED", "CONFIRMED", "CANCELLED"],
  PARTIALLY_CONFIRMED: ["CONFIRMED", "PARTIALLY_SHIPPED", "CANCELLED"],
  CONFIRMED: ["PARTIALLY_SHIPPED", "SHIPPED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  PARTIALLY_SHIPPED: ["SHIPPED", "PARTIALLY_RECEIVED", "RECEIVED"],
  SHIPPED: ["PARTIALLY_RECEIVED", "RECEIVED"],
  PARTIALLY_RECEIVED: ["RECEIVED", "INVOICED"],
  RECEIVED: ["INVOICED", "CLOSED"],
  INVOICED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export const INVOICE_TRANSITIONS: Transitions = {
  DRAFT: ["MATCHING", "CANCELLED"],
  MATCHING: ["MATCHED", "BLOCKED", "CANCELLED"],
  MATCHED: ["APPROVED", "BLOCKED"],
  BLOCKED: ["MATCHING", "APPROVED", "CANCELLED"],
  APPROVED: ["PAID"],
  PAID: [],
  CANCELLED: [],
};

export const SUPPLIER_TRANSITIONS: Transitions = {
  DRAFT: ["ONBOARDING", "PENDING_APPROVAL", "INACTIVE"],
  ONBOARDING: ["PENDING_APPROVAL", "DRAFT"],
  PENDING_APPROVAL: ["ACTIVE", "REJECTED"],
  ACTIVE: ["BLACKLISTED", "INACTIVE"],
  REJECTED: ["DRAFT"],
  BLACKLISTED: ["ACTIVE"],
  INACTIVE: ["ACTIVE"],
};

export function canTransition(map: Transitions, from: string, to: string): boolean {
  return map[from]?.includes(to) ?? false;
}

export function assertTransition(
  map: Transitions,
  from: string,
  to: string,
  label = "kayıt",
): void {
  if (from === to) return;
  if (!canTransition(map, from, to)) {
    throw new StateTransitionError(
      `Geçersiz durum geçişi: ${label} "${from}" durumundan "${to}" durumuna geçemez.`,
    );
  }
}
