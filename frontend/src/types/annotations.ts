export type NormalizedPoint = {
  x: number;
  y: number;
};

export type AnnotationFreehand = {
  id: string;
  type: 'freehand';
  points: NormalizedPoint[];
  color: string;
  label: string | null;
  created_at: string;
  updated_at: string;
  closed: boolean;
};

export type AnnotationShape = AnnotationFreehand;

export type AnnotationLayer = {
  id: string;
  name: string;
  visible: boolean;
  z: number;
  shapes: AnnotationShape[];
  locked?: boolean;
};

export type AnnotationDocument = {
  image_id: string;
  image_size: { w: number; h: number };
  layers: AnnotationLayer[];
  meta: Record<string, unknown> & {
    annotator?: string;
    device?: string;
    revision?: number;
  };
};

export type ImageSummary = {
  id: string;
  name: string;
  width: number;
  height: number;
};
