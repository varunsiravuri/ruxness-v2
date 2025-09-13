import { prisma, Side } from "@ruxness/db";

export type CreatePositionCmd = {
  userId: string;
  asset: string;
  type: "long" | "short";
  margin: number; // in cents
  leverage: number;
  slippage?: number;
};

export async function createPosition(cmd: CreatePositionCmd) {
  const user = await prisma.user.findUnique({ where: { id: cmd.userId } });
  if (!user) throw new Error("user not found");

  const asset = await prisma.asset.findUnique({
    where: { symbol: cmd.asset.toUpperCase() },
  });
  if (!asset) throw new Error("asset not supported");

  if (!Number.isFinite(cmd.margin) || cmd.margin <= 0)
    throw new Error("invalid margin");
  if (!Number.isFinite(cmd.leverage) || cmd.leverage <= 0)
    throw new Error("invalid leverage");
  if (user.usdBalanceCents < cmd.margin) throw new Error("insufficient USD");
  await prisma.user.update({
    where: { id: user.id },
    data: { usdBalanceCents: { decrement: cmd.margin } },
  });

  const trade = await prisma.existingTrade.create({
    data: {
      openPrice: 0,
      leverage: cmd.leverage,
      qty: 0,
      marginCents: cmd.margin,
      userId: user.id,
      assetId: asset.id,
      side: cmd.type as Side,
    },
    select: { id: true },
  });

  return { orderId: trade.id };
}
