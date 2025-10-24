// apps/backend/handlers/closePosition.ts
export async function closePosition(bus: any, userId: string, orderId: string) {
  if (!userId) throw new Error("userId required");
  if (!orderId) throw new Error("orderId required");

  const ack = await bus.send("trade-close", {
    id: Date.now().toString(),
    userId,
    orderId,
  });

  if (ack?.status === "closed" || ack?.ok === true) {
    // Engine typically returns: { status: "closed", orderId, pnl4, userBalanceCents, ... }
    return {
      ok: true,
      orderId: ack.orderId ?? orderId,
      pnl4: ack.pnl4 ?? null,
      balance_usd:
        typeof ack.userBalanceCents === "number"
          ? ack.userBalanceCents / 100
          : undefined,
    };
  }

  throw new Error(ack?.error || "engine rejected");
}
