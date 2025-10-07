// frontend/src/components/ImageItem.tsx
type Props = { name: string };

export default function ImageItem({ name }: Props) {
    const API_BASE = import.meta.env.VITE_API_BASE ?? ""; // devは空文字でOK（/api は Vite が 4000へ）
    const src = `${API_BASE}/api/images/${encodeURIComponent(name)}`;
    return (
        <img
            src={src}
            alt={name}
            style={{ maxWidth: "100%", height: "auto" }}
            onError={() => console.error("image load failed:", src)}
        />
    );
}
