import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  AnnotationDocument,
  AnnotationLayer,
  AnnotationShape,
  ImageSummary,
} from '../types/annotations';

const cloneDocument = (doc: AnnotationDocument): AnnotationDocument => {
  const globalClone = (globalThis as { structuredClone?: <T>(value: T) => T }).structuredClone;
  if (typeof globalClone === 'function') {
    return globalClone(doc);
  }
  return JSON.parse(JSON.stringify(doc));
};

export type ToolMode = 'draw' | 'select' | 'pan' | 'erase';

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
  history: AnnotationDocument[];
  future: AnnotationDocument[];
  canUndo: boolean;
  canRedo: boolean;
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
  addShape: (layerId: string, shape: AnnotationShape) => void;
  updateShape: (layerId: string, shape: AnnotationShape) => void;
  deleteShape: (layerId: string, shapeId: string) => void;
  selectShape: (layerId: string | null, shapeId: string | null) => void;
  markDirty: (dirty: boolean) => void;
  undo: () => void;
  redo: () => void;
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
    history: [],
    future: [],
    canUndo: false,
    canRedo: false,
    setDocument: (document) =>
      set({
        document,
        history: [],
        future: [],
        canUndo: false,
        canRedo: false,
        selectedLayerId: document?.layers[0]?.id ?? null,
        selectedShapeId: null,
        isDirty: false,
      }),
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
        const history = [...state.history, cloneDocument(state.document)];
        const layers = [...state.document.layers, layer].sort((a, b) => a.z - b.z);
        return {
          document: { ...state.document, layers },
          selectedLayerId: layer.id,
          isDirty: true,
          history,
          future: [],
          canUndo: history.length > 0,
          canRedo: false,
        };
      }),
    updateLayer: (layer) =>
      set((state) => {
        if (!state.document) return state;
        const history = [...state.history, cloneDocument(state.document)];
        const layers = state.document.layers.map((l) => (l.id === layer.id ? layer : l));
        return {
          document: { ...state.document, layers },
          isDirty: true,
          history,
          future: [],
          canUndo: history.length > 0,
          canRedo: false,
        };
      }),
    removeLayer: (layerId) =>
      set((state) => {
        if (!state.document) return state;
        const history = [...state.history, cloneDocument(state.document)];
        const layers = state.document.layers.filter((l) => l.id !== layerId);
        return {
          document: { ...state.document, layers },
          selectedLayerId: layers[0]?.id ?? null,
          isDirty: true,
          history,
          future: [],
          canUndo: history.length > 0,
          canRedo: false,
        };
      }),
    addShape: (layerId, shape) =>
      set((state) => {
        if (!state.document) return state;
        const history = [...state.history, cloneDocument(state.document)];
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
          history,
          future: [],
          canUndo: history.length > 0,
          canRedo: false,
        };
      }),
    updateShape: (layerId, shape) =>
      set((state) => {
        if (!state.document) return state;
        const history = [...state.history, cloneDocument(state.document)];
        const layers = state.document.layers.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                shapes: layer.shapes.map((s) => (s.id === shape.id ? shape : s)),
              }
            : layer
        );
        return {
          document: { ...state.document, layers },
          isDirty: true,
          history,
          future: [],
          canUndo: history.length > 0,
          canRedo: false,
        };
      }),
    deleteShape: (layerId, shapeId) =>
      set((state) => {
        if (!state.document) return state;
        const history = [...state.history, cloneDocument(state.document)];
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
          history,
          future: [],
          canUndo: history.length > 0,
          canRedo: false,
        };
      }),
    selectShape: (layerId, shapeId) => set({ selectedLayerId: layerId, selectedShapeId: shapeId }),
    markDirty: (dirty) => set({ isDirty: dirty }),
    undo: () =>
      set((state) => {
        if (!state.document || state.history.length === 0) return state;
        const previous = state.history[state.history.length - 1];
        const history = state.history.slice(0, -1);
        const future = [cloneDocument(state.document), ...state.future];
        return {
          document: cloneDocument(previous),
          history,
          future,
          canUndo: history.length > 0,
          canRedo: true,
          selectedLayerId: previous.layers[0]?.id ?? null,
          selectedShapeId: null,
          isDirty: true,
        };
      }),
    redo: () =>
      set((state) => {
        if (!state.document || state.future.length === 0) return state;
        const [next, ...rest] = state.future;
        const history = [...state.history, cloneDocument(state.document)];
        return {
          document: cloneDocument(next),
          history,
          future: rest,
          canUndo: history.length > 0,
          canRedo: rest.length > 0,
          selectedLayerId: next.layers[0]?.id ?? null,
          selectedShapeId: null,
          isDirty: true,
        };
      }),
  }))
);
