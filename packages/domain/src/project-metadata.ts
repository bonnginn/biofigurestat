import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "./ids";

export const ProjectMetadataSchema = z.object({
  projectId: EntityIdSchema,
  projectName: z.string().min(1),
  experimentDate: z.iso.date().or(z.literal("")),
  operator: z.string().optional(),
  batch: z.string().optional(),
  note: z.string().optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;
