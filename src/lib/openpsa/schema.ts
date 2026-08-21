import { z } from "zod";

export const identifierSchema = z
  .string()
  .min(1, "Identifier is required")
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "Must start with a letter and contain only letters, digits, - or _");

export const gateTypeSchema = z.enum(["and", "or", "atleast", "not", "xor", "nand", "nor", "iff", "cardinality", "null"]);
export const eventKindSchema = z.enum(["basic", "undeveloped", "house", "conditional", "intermediate", "transfer"]);

export const probabilityModelSchema = z.object({
  value: z.number().min(0).max(1).optional(),
  lambda: z.number().min(0).optional(),
  booleanState: z.boolean().optional(),
});

export const parsedNodeSchema = z.object({
  id: z.string(),
  category: z.enum(["gate", "event", "top"]),
  identifier: identifierSchema,
  label: z.string(),
  gateType: gateTypeSchema.optional(),
  votingK: z.number().int().min(0).optional(),
  votingMax: z.number().int().min(0).optional(),
  eventKind: eventKindSchema.optional(),
  probability: probabilityModelSchema.optional(),
  description: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const parsedEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
});

export const parsedModelSchema = z.object({
  nodes: z.array(parsedNodeSchema),
  edges: z.array(parsedEdgeSchema),
});

export type ParsedNode = z.infer<typeof parsedNodeSchema>;
export type ParsedEdge = z.infer<typeof parsedEdgeSchema>;
export type ParsedModel = z.infer<typeof parsedModelSchema>;
