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
  imageExtensions?: string[];
}

const DEFAULT_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp'];

const normalizeExtension = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
};

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

export const createFsAdapter = ({ imageRoot, annotationRoot, readOnly, imageExtensions }: FsAdapterOptions): StorageAdapter => {
  const allowedExtensions = new Set(
    (imageExtensions && imageExtensions.length > 0
      ? imageExtensions
      : DEFAULT_IMAGE_EXTENSIONS
    )
      .map(normalizeExtension)
      .filter((ext): ext is string => Boolean(ext))
  );

  const resolveImagePath = (id: string) => path.join(imageRoot, id);
  const resolveAnnotationPath = (id: string) => path.join(annotationRoot, `${id}.json`);

  const ensureDir = async (dir: string) => {
    await fs.mkdir(dir, { recursive: true });
  };

  const collectImageCandidates = async () => {
    const results: string[] = [];
    const queue: { absPath: string; relPath: string }[] = [{ absPath: imageRoot, relPath: '' }];
    while (queue.length > 0) {
      const { absPath, relPath } = queue.shift()!;
      const entries = await fs.readdir(absPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryRelPath = relPath ? path.join(relPath, entry.name) : entry.name;
        const entryAbsPath = path.join(absPath, entry.name);
        if (entry.isDirectory()) {
          queue.push({ absPath: entryAbsPath, relPath: entryRelPath });
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (allowedExtensions.size && !allowedExtensions.has(ext)) {
          continue;
        }
        results.push(entryRelPath);
      }
    }
    return results.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  };

  return {
    async ensureReady() {
      try {
        const stat = await fs.stat(imageRoot);
        if (!stat.isDirectory()) {
          throw new Error(`IMAGE_ROOT must point to a directory: ${imageRoot}`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`IMAGE_ROOT does not exist: ${imageRoot}`);
        }
        throw error;
      }
      await ensureDir(annotationRoot);
    },
    async listImages(cursor = '', limit = 50) {
      const files = await collectImageCandidates();
      if (files.length === 0) {
        return { items: [], nextCursor: undefined };
      }
      let startIndex = 0;
      if (cursor) {
        const idx = files.indexOf(cursor);
        startIndex = idx >= 0 ? idx + 1 : 0;
      }
      const slice = files.slice(startIndex, startIndex + limit);
      const items: StorageImage[] = [];
      for (const relativePath of slice) {
        const filePath = resolveImagePath(relativePath);
        try {
          const { width, height } = await readImageMetadata(filePath);
          items.push({ id: relativePath, name: path.basename(relativePath), width, height, path: filePath });
        } catch (error) {
          console.warn(`Skipping unreadable image: ${filePath}`, error);
        }
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
