// src/lib/schema.ts
import { z } from "zod";

export const AnswerReq = z.object({
  question: z.string().min(2),
  mode: z.enum(["borrower", "public"]).default("borrower"),
  intent: z.enum(["purchase", "refi", "investor"]).optional(),
  loanAmount: z.number().int().positive().max(5_000_000).optional(),
});

export type AnswerReqT = z.infer<typeof AnswerReq>;

