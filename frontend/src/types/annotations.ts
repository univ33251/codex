export type AnnotationCircle = {
  id: string;
  type: 'circle';
  center: { x: number; y: number };
  radius: number;
  color: string;
  label: string | null;
  created_at: string;
  updated_at: string;
};

export type AnnotationLayer = {
  id: string;
  name: string;
  visible: boolean;
  z: number;
  shapes: AnnotationCircle[];
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
