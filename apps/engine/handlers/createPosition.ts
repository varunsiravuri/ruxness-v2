// no import of lib/bus types here

export type CreatePositionCmd = {
  userId: string;
  asset: string; // "BTC", "ETH", ...
  type: "long" | "short";
  margin: number; // dollars (or cents, but be consistent end-to-end)
  leverage: number;
  slippage?: number; // bps (100 = 1%)
};

export async function createPosition(bus: any, cmd: CreatePositionCmd) {
  const { userId, asset, type, margin, leverage, slippage } = cmd;

  if (
    !userId ||
    !asset ||
    !["long", "short"].includes(type) ||
    !Number.isFinite(margin) ||
    margin <= 0 ||
    !Number.isFinite(leverage) ||
    leverage <= 0
  ) {
    throw new Error(
      "asset, type('long'|'short'), margin>0, leverage>0 required"
    );
  }

  const ack = await bus.send("trade-open", {
    id: Date.now().toString(), // simple unique-ish id; your bus adds its own too
    userId,
    asset: String(asset).toUpperCase(),
    type,
    margin,
    leverage,
    slippage,
  });

  if (ack?.status === "accepted" && ack?.orderId)
    return { orderId: ack.orderId };
  if (ack?.orderId) return { orderId: ack.orderId };
  throw new Error(ack?.error || "engine rejected order (no price yet?)");
}
