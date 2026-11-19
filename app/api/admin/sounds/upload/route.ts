import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { guard } from "@/lib/guard";
import { fail, ok } from "@/lib/http";

const LIMIT = 2_000_000;
const allowed: Record<string, string> = { "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/mp4": "m4a" };

export async function POST(request: Request) {
  const { user, error } = await guard(["ADMIN"], { allowSuspended: true });
  if (!user) return error;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("Choose a sound file to upload.");
  const extension = allowed[file.type];
  if (!extension || !file.size || file.size > LIMIT) return fail("Use a WAV, MP3, OGG, or M4A audio file smaller than 2 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const valid = extension === "wav" ? bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE"
    : extension === "mp3" ? bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
      : extension === "ogg" ? bytes.subarray(0, 4).toString() === "OggS"
        : bytes.subarray(4, 8).toString() === "ftyp";
  if (!valid) return fail("The uploaded file does not match its audio type.");
  const filename = `${randomUUID()}.${extension}`;
  try {
    const directory = path.join(process.cwd(), "public", "uploads", "sounds");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), bytes, { flag: "wx" });
    return ok({ url: `/uploads/sounds/${filename}` }, 201);
  } catch (cause) {
    console.error("[admin-sound-upload]", cause);
    return fail("Could not save this sound file.", 500);
  }
}
