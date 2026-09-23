import { z } from "zod";

/** Bumped whenever a breaking change is made to the message schemas below. */
export const PROTOCOL_VERSION = 1 as const;

export const envelopeSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.string(),
  requestId: z.string().optional(),
  payload: z.unknown(),
});

export type Envelope = z.infer<typeof envelopeSchema>;
