import type { OrderStatus, PaymentStatus } from "@/generated/prisma/client";

export type AdminTransitionTarget =
  "PREPARING" | "READY_FOR_PICKUP" | "COMPLETED";

export interface AdminTransitionRule {
  /** Fulfillment statuses the order may currently have for the step to apply. */
  from: readonly OrderStatus[];
  /** Payment status the order must currently have, when the step depends on it. */
  requiredPayment?: PaymentStatus;
}

/**
 * Fulfillment steps an admin can take, keyed by the status being moved to.
 * Mirrors the buttons in OrderStatusButtons. There is no admin cancel step.
 * Key order is the order in which the buttons are displayed.
 *
 * READY_FOR_PICKUP is reachable from PENDING as a shortcut so the bulk action
 * stays useful for orders that skip the preparation step.
 *
 * COMPLETED deliberately ignores payment: an order that was already
 * READY_FOR_PICKUP and is later refunded, charged back or never collected
 * must still be closable by the admin.
 */
const ADMIN_TRANSITIONS: Record<AdminTransitionTarget, AdminTransitionRule> = {
  PREPARING: { from: ["PENDING"], requiredPayment: "PAID" },
  READY_FOR_PICKUP: {
    from: ["PENDING", "PREPARING"],
    requiredPayment: "PAID",
  },
  COMPLETED: { from: ["READY_FOR_PICKUP"] },
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
    rule.from.includes(current) &&
    (rule.requiredPayment === undefined || payment === rule.requiredPayment)
  );
}

/** Every step the UI should offer for this order, in display order. */
export function availableAdminTransitions(
  current: OrderStatus,
  payment: PaymentStatus,
): AdminTransitionTarget[] {
  const targets = Object.keys(ADMIN_TRANSITIONS) as AdminTransitionTarget[];
  return targets.filter((t) => canAdminTransition(current, payment, t));
}

/** The first step offered for this order, if any. */
export function nextAdminStatus(
  current: OrderStatus,
  payment: PaymentStatus,
): AdminTransitionTarget | null {
  return availableAdminTransitions(current, payment)[0] ?? null;
}
