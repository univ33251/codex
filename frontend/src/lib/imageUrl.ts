// 画像URL生成ユーティリティ（/api/images/:name を返す）
export function imageUrl(name: string) {
    const base = import.meta.env.VITE_API_BASE ?? "";
    return `${base}/api/images/${encodeURIComponent(name)}`;
}
