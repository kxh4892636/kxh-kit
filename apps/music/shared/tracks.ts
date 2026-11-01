import { z } from "zod";

export const trackSchema = z.object({
  id: z.string().min(1),
  composer: z.string(),
  work: z.string(),
  movement: z.string(),
  trackNo: z.string(),
  title: z.string(),
  artist: z.string(),
  format: z.string(),
  bytes: z.number().int().nonnegative(),
  seconds: z.number().nonnegative(),
  sampleRate: z.number().int().nonnegative(),
  bits: z.number().int().nonnegative(),
  audio: z.string().startsWith("media/"),
  cover: z.string().startsWith("media/"),
  mask: z.string().startsWith("waves/").nullable(),
  sourceUrl: z.string().url(),
  md5: z.string(),
  license: z.string(),
});

export const librarySchema = z.object({
  item: z.string().min(1),
  license: z.string().min(1),
  source: z.string().url(),
  library: z.object({
    tracks: z.number().int().nonnegative(),
    works: z.number().int().nonnegative(),
  }),
  tracks: z.array(trackSchema),
});

export type Track = z.infer<typeof trackSchema>;
export type Library = z.infer<typeof librarySchema>;
