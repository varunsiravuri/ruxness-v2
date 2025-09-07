import { prisma } from "@ruxness/db";
export async function getBalanceUsd() {
  const u = await prisma.user.findFirst({ select: { usdBalanceCents: true } });
  return { balance: u?.usdBalanceCents ?? 0 };
}
