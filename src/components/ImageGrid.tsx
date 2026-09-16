import { useRef } from "react";
import type { UploadedImage } from "@/lib/types";
import { uid } from "@/lib/store";

interface Props {
  images: UploadedImage[];
  onChange: (next: UploadedImage[]) => void;
  max: number;
  size?: number;
}

export function ImageGrid({ images, onChange, max, size = 76 }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const full = images.length >= max;

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    const room = max - images.length;
    const added = Array.from(files)
      .slice(0, room)
      .map((f) => ({ id: uid(), url: URL.createObjectURL(f), name: f.name, file: f }));
    onChange([...images, ...added]);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {images.map((p) => (
        <div
          key={p.id}
          style={{
            position: "relative",
            width: size,
            height: size,
            borderRadius: 12,
            overflow: "hidden",
            background: "var(--rd-grey-light)",
          }}
        >
          <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <button
            onClick={() => onChange(images.filter((x) => x.id !== p.id))}
            aria-label="Foto verwijderen"
            style={{
              position: "absolute",
              top: 3,
              right: 3,
              width: 22,
              height: 22,
              borderRadius: 99,
              border: 0,
              background: "rgba(47,33,65,.72)",
              color: "#fff",
              fontSize: 13,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
      ))}
      {!full && (
        <button
          onClick={() => fileRef.current?.click()}
          aria-label="Foto toevoegen"
          style={{
            width: size,
            height: size,
            borderRadius: 12,
            border: "1.5px dashed var(--rd-lavender-mid)",
            background: "var(--rd-offwhite)",
            color: "var(--rd-aubergine)",
            fontSize: 26,
            cursor: "pointer",
          }}
        >
          +
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
