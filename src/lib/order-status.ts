import type { OrderStatus, PaymentStatus } from "@/generated/prisma/client";

export type AdminTransitionTarget = "READY_FOR_PICKUP" | "COMPLETED";

export interface AdminTransitionRule {
  /** Fulfillment status the order must currently have. */
  from: OrderStatus;
  /** Payment status the order must currently have, when the step depends on it. */
  requiredPayment?: PaymentStatus;
}

/**
 * Fulfillment steps an admin can take, keyed by the status being moved to.
 * Mirrors the buttons in OrderStatusButtons. There is no admin cancel step.
 *
 * COMPLETED deliberately ignores payment: an order that was already
 * READY_FOR_PICKUP and is later refunded, charged back or never collected
 * must still be closable by the admin.
 */
const ADMIN_TRANSITIONS: Record<AdminTransitionTarget, AdminTransitionRule> = {
  READY_FOR_PICKUP: { from: "PENDING", requiredPayment: "PAID" },
  COMPLETED: { from: "READY_FOR_PICKUP" },
};

/** Returns the rule for an offered step, or null for anything else. */
export function getAdminTransitionRule(
  target: unknown,
): AdminTransitionRule | null {
  // hasOwn keeps inherited keys such as "constructor" or "__proto__" out.
  if (typeof target !== "string" || !Object.hasOwn(ADMIN_TRANSITIONS, target)) {
    return null;
  }
  return ADMIN_TRANSITIONS[target as AdminTransitionTarget];
}

export function canAdminTransition(
  current: OrderStatus,
  payment: PaymentStatus,
  target: unknown,
): boolean {
  const rule = getAdminTransitionRule(target);
  return (
    rule !== null &&
    current === rule.from &&
    (rule.requiredPayment === undefined || payment === rule.requiredPayment)
  );
}

/** The single step the UI should offer for this order, if any. */
export function nextAdminStatus(
  current: OrderStatus,
  payment: PaymentStatus,
): AdminTransitionTarget | null {
  const targets = Object.keys(ADMIN_TRANSITIONS) as AdminTransitionTarget[];
  return targets.find((t) => canAdminTransition(current, payment, t)) ?? null;
}
