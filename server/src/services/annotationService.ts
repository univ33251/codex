import { StorageAdapter } from '../adapters/fsAdapter';

export class AnnotationService {
  constructor(private readonly storage: StorageAdapter) {}

  async listImages(cursor?: string, limit?: number) {
    return this.storage.listImages(cursor, limit);
  }

  async getImagePath(id: string) {
    return this.storage.getImageStreamPath(id);
  }

  async getAnnotation(id: string) {
    const raw = await this.storage.readAnnotation(id);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  async saveAnnotation(id: string, payload: unknown) {
    const body = JSON.stringify(payload, null, 2);
    await this.storage.writeAnnotation(id, body);
  }
}
