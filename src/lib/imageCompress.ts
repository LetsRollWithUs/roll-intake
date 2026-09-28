// Verkleint telefoonfoto's voor het uploaden. Moderne camera's maken al snel foto's van 8 MB of meer,
// terwijl de opslag maximaal 8 MB per foto toestaat en een styliste aan 2400 px ruim genoeg heeft.
// Lukt verkleinen niet (bijv. HEIC op Android), dan gaat het origineel mee.

const MAX_SIDE = 2400;
const QUALITY = 0.85;
const SKIP_BELOW = 1.5 * 1024 * 1024;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= SKIP_BELOW) { bitmap.close(); return file; }
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
