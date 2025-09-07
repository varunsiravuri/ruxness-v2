import type { CreatePositionCmd } from "../types";
import { prisma, Side } from "@ruxness/db";

export async function createPosition(
  cmd: CreatePositionCmd,
  getPx: (a: string) => Promise<number>
) {
  const user = await prisma.user.findFirst();
  const asset = await prisma.asset.findUnique({
    where: { symbol: cmd.asset.toUpperCase() },
  });
  if (!user || !asset) throw new Error("user or asset not found");
  if (user.usdBalanceCents < cmd.margin) throw new Error("insufficient USD");

  const px = await getPx(asset.symbol);

  await prisma.user.update({
    where: { id: user.id },
    data: { usdBalanceCents: { decrement: cmd.margin } },
  });

  const trade = await prisma.existingTrade.create({
    data: {
      openPrice: px,
      leverage: cmd.leverage,
      qty: ((cmd.margin / 100) * cmd.leverage) / px,
      marginCents: cmd.margin,
      userId: user.id,
      assetId: asset.id,
      side: cmd.type as Side,
    },
    select: { id: true },
  });

  return { orderId: trade.id };
}
