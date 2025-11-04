import { z } from "zod";

export const GetCandlesQuerySchema = z.object({
  ts: z.string(),
  startTime: z.union([z.string(), z.number()]),
  endTime: z.union([z.string(), z.number()]),
  asset: z.string(),
});
