import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { AnnotationDocument, AnnotationLayer, AnnotationCircle, ImageSummary } from '../types/annotations';

export type ToolMode = 'draw' | 'select' | 'pan';

export interface AnnotationState {
  document: AnnotationDocument | null;
  images: ImageSummary[];
  currentImageIndex: number;
  tool: ToolMode;
  drawingColor: string;
  palette: string[];
  selectedLayerId: string | null;
  selectedShapeId: string | null;
  isDirty: boolean;
  setDocument: (doc: AnnotationDocument | null) => void;
  setImages: (items: ImageSummary[]) => void;
  setCurrentImageIndex: (index: number) => void;
  setTool: (tool: ToolMode) => void;
  setDrawingColor: (color: string) => void;
  setPalette: (colors: string[]) => void;
  ensureLayer: (name?: string) => AnnotationLayer;
  addLayer: (layer: AnnotationLayer) => void;
  updateLayer: (layer: AnnotationLayer) => void;
  removeLayer: (layerId: string) => void;
  addShape: (layerId: string, shape: AnnotationCircle) => void;
  updateShape: (layerId: string, shape: AnnotationCircle) => void;
  deleteShape: (layerId: string, shapeId: string) => void;
  selectShape: (layerId: string | null, shapeId: string | null) => void;
  markDirty: (dirty: boolean) => void;
}

const defaultPalette = ['#FF3B30', '#34C759', '#007AFF', '#FF9500', '#AF52DE', '#5AC8FA', '#FFCC00'];

export const useAnnotationStore = create<AnnotationState>()(
  devtools((set, get) => ({
    document: null,
    images: [],
    currentImageIndex: 0,
    tool: 'draw',
    drawingColor: defaultPalette[0],
    palette: defaultPalette,
    selectedLayerId: null,
    selectedShapeId: null,
    isDirty: false,
    setDocument: (document) => set({ document }),
    setImages: (images) => set({ images }),
    setCurrentImageIndex: (currentImageIndex) => set({ currentImageIndex }),
    setTool: (tool) => set({ tool }),
    setDrawingColor: (drawingColor) => set({ drawingColor }),
    setPalette: (palette) => set({ palette }),
    ensureLayer: (name = 'layer') => {
      const { document, addLayer } = get();
      if (!document) {
        throw new Error('Document not loaded');
      }
      if (document.layers.length === 0) {
        const layer: AnnotationLayer = {
          id: `layer-${Date.now()}`,
          name,
          visible: true,
          z: 1,
          shapes: [],
        };
        addLayer(layer);
        return layer;
      }
      const { selectedLayerId } = get();
      const active = document.layers.find((l) => l.id === selectedLayerId && !l.locked);
      if (active) {
        return active;
      }
      return document.layers[0];
    },
    addLayer: (layer) =>
      set((state) => {
        if (!state.document) return state;
        const layers = [...state.document.layers, layer].sort((a, b) => a.z - b.z);
        return {
          document: { ...state.document, layers },
          selectedLayerId: layer.id,
          isDirty: true,
        };
      }),
    updateLayer: (layer) =>
      set((state) => {
        if (!state.document) return state;
        const layers = state.document.layers.map((l) => (l.id === layer.id ? layer : l));
        return { document: { ...state.document, layers }, isDirty: true };
      }),
    removeLayer: (layerId) =>
      set((state) => {
        if (!state.document) return state;
        const layers = state.document.layers.filter((l) => l.id !== layerId);
        return {
          document: { ...state.document, layers },
          selectedLayerId: layers[0]?.id ?? null,
          isDirty: true,
        };
      }),
    addShape: (layerId, shape) =>
      set((state) => {
        if (!state.document) return state;
        const layers = state.document.layers.map((layer) =>
          layer.id === layerId
            ? { ...layer, shapes: [...layer.shapes, shape] }
            : layer
        );
        return {
          document: { ...state.document, layers },
          selectedLayerId: layerId,
          selectedShapeId: shape.id,
          isDirty: true,
        };
      }),
    updateShape: (layerId, shape) =>
      set((state) => {
        if (!state.document) return state;
        const layers = state.document.layers.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                shapes: layer.shapes.map((s) => (s.id === shape.id ? shape : s)),
              }
            : layer
        );
        return { document: { ...state.document, layers }, isDirty: true };
      }),
    deleteShape: (layerId, shapeId) =>
      set((state) => {
        if (!state.document) return state;
        const layers = state.document.layers.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                shapes: layer.shapes.filter((shape) => shape.id !== shapeId),
              }
            : layer
        );
        return {
          document: { ...state.document, layers },
          selectedShapeId: null,
          isDirty: true,
        };
      }),
    selectShape: (layerId, shapeId) => set({ selectedLayerId: layerId, selectedShapeId: shapeId }),
    markDirty: (dirty) => set({ isDirty: dirty }),
  }))
);
