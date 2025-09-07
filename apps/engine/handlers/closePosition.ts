import type { ClosePositionCmd } from "../types";
import { prisma } from "@ruxness/db";

export async function closePosition(
  cmd: ClosePositionCmd,
  getPx: (a: string) => Promise<number>
) {
  const tr = await prisma.existingTrade.findUnique({
    where: { id: cmd.orderId },
    include: { asset: true, user: true },
  });
  if (!tr) throw new Error("trade not found");
  if (tr.closePrice !== null) throw new Error("already closed");

  const px = await getPx(tr.asset.symbol);
  const pnl = (tr.side === "long" ? 1 : -1) * (px - tr.openPrice) * tr.qty;

  await prisma.existingTrade.update({
    where: { id: tr.id },
    data: { closePrice: px, pnl },
  });

  await prisma.user.update({
    where: { id: tr.userId },
    data: { usdBalanceCents: { increment: Math.round(pnl * 100) } },
  });

  return { pnl };
}
