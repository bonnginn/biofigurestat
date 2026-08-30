import { z } from "zod";

export const EntityIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "Invalid stable entity ID");

export type EntityId = z.infer<typeof EntityIdSchema>;

export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
