import fs from 'fs/promises';
import path from 'path';

export interface StorageAdapter {
  listImages: (cursor?: string, limit?: number) => Promise<{ items: StorageImage[]; nextCursor?: string }>;
  getImageStreamPath: (id: string) => Promise<string>;
  readAnnotation: (id: string) => Promise<string | null>;
  writeAnnotation: (id: string, body: string) => Promise<void>;
  ensureReady: () => Promise<void>;
}

export interface StorageImage {
  id: string;
  name: string;
  width: number;
  height: number;
  path: string;
}

export interface FsAdapterOptions {
  imageRoot: string;
  annotationRoot: string;
  readOnly?: boolean;
}

async function readImageMetadata(filePath: string): Promise<{ width: number; height: number }> {
  const buffer = await fs.readFile(filePath);
  try {
    const sizeOf = (await import('image-size')).imageSize;
    const size = sizeOf(buffer);
    if (!size.width || !size.height) {
      throw new Error('Missing dimension');
    }
    return { width: size.width, height: size.height };
  } catch (error) {
    throw new Error(`Failed to read image metadata: ${(error as Error).message}`);
  }
}

export const createFsAdapter = ({ imageRoot, annotationRoot, readOnly }: FsAdapterOptions): StorageAdapter => {
  const resolveImagePath = (id: string) => path.join(imageRoot, id);
  const resolveAnnotationPath = (id: string) => path.join(annotationRoot, `${id}.json`);

  const ensureDir = async (dir: string) => {
    await fs.mkdir(dir, { recursive: true });
  };

  return {
    async ensureReady() {
      await ensureDir(imageRoot);
      await ensureDir(annotationRoot);
    },
    async listImages(cursor = '', limit = 50) {
      const files = await fs.readdir(imageRoot);
      const sorted = files.sort();
      let startIndex = 0;
      if (cursor) {
        const idx = sorted.indexOf(cursor);
        startIndex = idx >= 0 ? idx + 1 : 0;
      }
      const slice = sorted.slice(startIndex, startIndex + limit);
      const items: StorageImage[] = [];
      for (const file of slice) {
        const filePath = resolveImagePath(file);
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) continue;
        const { width, height } = await readImageMetadata(filePath);
        items.push({ id: file, name: file, width, height, path: filePath });
      }
      const nextCursor = slice.length === limit ? slice[slice.length - 1] : undefined;
      return { items, nextCursor };
    },
    async getImageStreamPath(id: string) {
      const filePath = resolveImagePath(id);
      await fs.access(filePath);
      return filePath;
    },
    async readAnnotation(id: string) {
      const annotationPath = resolveAnnotationPath(id);
      try {
        const body = await fs.readFile(annotationPath, 'utf-8');
        return body;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return null;
        }
        throw error;
      }
    },
    async writeAnnotation(id: string, body: string) {
      if (readOnly) {
        throw new Error('Storage adapter is read-only');
      }
      const annotationPath = resolveAnnotationPath(id);
      await ensureDir(path.dirname(annotationPath));
      const tmpPath = `${annotationPath}.tmp-${process.pid}`;
      await fs.writeFile(tmpPath, body, 'utf-8');
      await fs.rename(tmpPath, annotationPath);
    },
  };
};
