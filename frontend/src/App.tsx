import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useAnnotationStore } from './hooks/useAnnotationStore';
import {
  AnnotationDocument,
  AnnotationLayer,
  AnnotationShape,
  ImageSummary,
  NormalizedPoint,
} from './types/annotations';
import CanvasStage from './components/CanvasStage';
import LayerPanel from './components/LayerPanel';
import ColorPalette from './components/ColorPalette';
import ImagePager from './components/ImagePager';
import ShapeList from './components/ShapeList';

const AUTOSAVE_INTERVAL = 15000;
const FREEHAND_SAMPLES = 36;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const generateShapeId = () => `ann-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const convertCircleToFreehand = (
  shape: any,
  docSize: { w: number; h: number }
): AnnotationShape => {
  const centerX = clamp01(Number(shape?.center?.x) || 0.5);
  const centerY = clamp01(Number(shape?.center?.y) || 0.5);
  const radiusNorm = typeof shape?.radius === 'number' ? shape.radius : 0.05;
  const radiusPx = radiusNorm * docSize.w;
  const points: NormalizedPoint[] = [];
  for (let i = 0; i < FREEHAND_SAMPLES; i += 1) {
    const angle = (2 * Math.PI * i) / FREEHAND_SAMPLES;
    const px = centerX * docSize.w + Math.cos(angle) * radiusPx;
    const py = centerY * docSize.h + Math.sin(angle) * radiusPx;
    points.push({
      x: clamp01(px / docSize.w),
      y: clamp01(py / docSize.h),
    });
  }
  const createdAt = shape?.created_at ?? new Date().toISOString();
  return {
    id: shape?.id ?? generateShapeId(),
    type: 'freehand',
    points,
    color: shape?.color ?? '#FF3B30',
    label: shape?.label ?? null,
    created_at: createdAt,
    updated_at: shape?.updated_at ?? createdAt,
    closed: true,
  };
};

const ensureFreehandShape = (
  shape: any,
  docSize: { w: number; h: number }
): AnnotationShape => {
  if (shape?.type === 'freehand' && Array.isArray(shape.points)) {
    const sanitized = (shape.points as any[])
      .map((pt) => ({
        x: clamp01(Number(pt?.x) || 0),
        y: clamp01(Number(pt?.y) || 0),
      }))
      .filter((pt, idx, arr) => idx === 0 || pt.x !== arr[idx - 1].x || pt.y !== arr[idx - 1].y);
    if (sanitized.length >= 2) {
      const createdAt = shape?.created_at ?? new Date().toISOString();
      return {
        id: shape?.id ?? generateShapeId(),
        type: 'freehand',
        points: sanitized,
        color: shape?.color ?? '#FF3B30',
        label: shape?.label ?? null,
        created_at: createdAt,
        updated_at: shape?.updated_at ?? createdAt,
        closed: shape?.closed !== false,
      };
    }
  }
  return convertCircleToFreehand(shape, docSize);
};

const upgradeDocument = (image: ImageSummary, doc: AnnotationDocument): AnnotationDocument => {
  const size = doc.image_size ?? { w: image.width, h: image.height };
  const layers = doc.layers.map((layer, index) => {
    const incomingLayer = layer as AnnotationLayer & { shapes: any[] };
    return {
      ...incomingLayer,
      visible: incomingLayer.visible ?? true,
      z: incomingLayer.z ?? index + 1,
      shapes: (incomingLayer.shapes ?? []).map((shape: any) => ensureFreehandShape(shape, size)),
    };
  });
  return { ...doc, image_size: size, layers };
};

const defaultDocument = (image: ImageSummary): AnnotationDocument => ({
  image_id: image.id,
  image_size: { w: image.width, h: image.height },
  layers: [
    {
      id: `layer-${Date.now()}`,
      name: 'default',
      visible: true,
      z: 1,
      shapes: [],
    },
  ],
  meta: {
    device: 'iPadOS',
    revision: 1,
  },
});

function App() {
  const store = useAnnotationStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const autosaveTimer = useRef<number>();
  const toastTimer = useRef<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);
  const [resetViewportKey, setResetViewportKey] = useState(0);

  const deleteSelectedShape = () => {
    if (!store.selectedLayerId || !store.selectedShapeId) {
      return;
    }
    store.deleteShape(store.selectedLayerId, store.selectedShapeId);
    showToast('図形を削除しました');
  };

  useEffect(() => {
    let mounted = true;
    const fetchImages = async () => {
      try {
        const res = await axios.get<{ items: ImageSummary[]; nextCursor?: string }>(
          '/api/images?limit=100'
        );
        if (!mounted) return;
        store.setImages(res.data.items);
        if (res.data.items.length > 0) {
          await loadDocumentForIndex(0);
        }
      } catch (err) {
        console.error(err);
        setError('画像リストの取得に失敗しました');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void fetchImages();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (autosaveTimer.current) {
      window.clearInterval(autosaveTimer.current);
    }
    autosaveTimer.current = window.setInterval(() => {
      if (store.document && store.isDirty) {
        void saveDocument(store.document, true);
      }
    }, AUTOSAVE_INTERVAL);
    return () => {
      if (autosaveTimer.current) {
        window.clearInterval(autosaveTimer.current);
      }
    };
  }, [store.document, store.isDirty]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        window.clearTimeout(toastTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    // 一覧はあるのにdocumentがまだ無い場合の保険
    if (!store.document && store.images.length > 0) {
      void loadDocumentForIndex(store.currentImageIndex || 0);
    }
  }, [store.images]);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };

  const loadDocumentForIndex = async (index: number) => {
    const image = store.images[index];
    if (!image) return;
    setLoading(true);
    try {
      store.setCurrentImageIndex(index);
      const res = await axios.get<AnnotationDocument | null>(`/api/annotations/${image.id}`);
      const doc = upgradeDocument(image, res.data ?? defaultDocument(image));
      store.setDocument(doc);
      store.selectShape(doc.layers[0]?.id ?? null, null);
      store.markDirty(false);
      prefetchNeighbors(index);
      await prefetchImage(image.id);
    } catch (err) {
      console.error(err);
      // フォールバック: 注釈が読めなくても空ドキュメントで開く
      store.setCurrentImageIndex(index);
      const doc = defaultDocument(image);
      store.setDocument(doc);
      store.selectShape(doc.layers[0]?.id ?? null, null);
      store.markDirty(false);
    } finally {
      setLoading(false);
    }
  };

  const saveDocument = async (doc: AnnotationDocument, isAutosave = false) => {
    try {
      const target = isAutosave ? `/api/annotations/${doc.image_id}/autosave` : `/api/annotations/${doc.image_id}`;
      await axios.post(target, doc);
      if (!isAutosave) {
        showToast('保存しました');
      }
      store.markDirty(false);
    } catch (err) {
      console.error(err);
      if (!isAutosave) {
        setError('保存に失敗しました');
      }
    }
  };

  const prefetchImage = async (imageId: string) => {
    try {
      const img = new Image();
      img.src = `/api/images/${encodeURIComponent(imageId)}`;
      await img.decode().catch(() => undefined);
    } catch (err) {
      console.warn('prefetch failed', err);
    }
  };

  const prefetchNeighbors = (index: number) => {
    const prev = store.images[index - 1];
    const next = store.images[index + 1];
    if (prev) void prefetchImage(prev.id);
    if (next) void prefetchImage(next.id);
  };

  const onNext = () => {
    const nextIndex = store.currentImageIndex + 1;
    if (nextIndex < store.images.length) {
      void loadDocumentForIndex(nextIndex);
    }
  };

  const onPrev = () => {
    const prevIndex = store.currentImageIndex - 1;
    if (prevIndex >= 0) {
      void loadDocumentForIndex(prevIndex);
    }
  };

  const currentImage = useMemo(
    () => store.images[store.currentImageIndex],
    [store.images, store.currentImageIndex]
  );

  const currentLayer: AnnotationLayer | undefined = useMemo(() => {
    if (!store.document) return undefined;
    return store.document.layers.find((l) => l.id === store.selectedLayerId) ?? store.document.layers[0];
  }, [store.document, store.selectedLayerId]);

  if (loading && !store.document) {
    return <div className="app-shell">読み込み中...</div>;
  }

  if (error) {
    return <div className="app-shell">{error}</div>;
  }

  if (!store.document || !currentImage) {
    return <div className="app-shell">画像がありません</div>;
  }

  return (
    <div className="app-shell">
      <div className="toolbar" role="toolbar">
        <div className="toolbar-row">
          <div className="toolbar-group">
            <span>
              {store.currentImageIndex + 1}/{store.images.length} : {currentImage.name}
            </span>
          </div>
          <div className="toolbar-group pager-group">
            <ImagePager
              onPrev={onPrev}
              onNext={onNext}
              hasPrev={store.currentImageIndex > 0}
              hasNext={store.currentImageIndex < store.images.length - 1}
            />
          </div>
        </div>
        <div className="toolbar-row wrap">
          <div className="toolbar-group">
            <ColorPalette
              colors={store.palette}
              selectedColor={store.drawingColor}
              onColorChange={(color) => store.setDrawingColor(color)}
              onPaletteChange={store.setPalette}
            />
          </div>
          <div className="toolbar-group">
            <label className="layer-select">
              <span>アクティブレイヤー</span>
              <select
                value={currentLayer?.id ?? ''}
                onChange={(e) => store.selectShape(e.target.value, null)}
              >
                {store.document.layers.map((layer) => (
                  <option key={layer.id} value={layer.id}>
                    {layer.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="control-button"
              onClick={() => {
                const newLayer: AnnotationLayer = {
                  id: `layer-${Date.now()}`,
                  name: `Layer ${store.document.layers.length + 1}`,
                  visible: true,
                  z: store.document.layers.length + 1,
                  shapes: [],
                };
                store.addLayer(newLayer);
              }}
            >
              レイヤー追加
            </button>
          </div>
          <div className="toolbar-group">
            <button
              className={`control-button ${store.tool === 'draw' ? 'active' : ''}`}
              onClick={() => store.setTool('draw')}
            >
              描画
            </button>
            <button
              className={`control-button ${store.tool === 'select' ? 'active' : ''}`}
              onClick={() => store.setTool('select')}
            >
              選択
            </button>
            <button
              className={`control-button ${store.tool === 'pan' ? 'active' : ''}`}
              onClick={() => store.setTool('pan')}
            >
              パン
            </button>
            <button
              className={`control-button ${store.tool === 'erase' ? 'active' : ''}`}
              onClick={() => store.setTool('erase')}
            >
              消しゴム
            </button>
          </div>
          <div className="toolbar-group">
            <button className="control-button" onClick={() => store.undo()} disabled={!store.canUndo}>
              Undo
            </button>
            <button className="control-button" onClick={() => store.redo()} disabled={!store.canRedo}>
              Redo
            </button>
            <button
              className="control-button"
              onClick={deleteSelectedShape}
              disabled={!store.selectedLayerId || !store.selectedShapeId}
            >
              選択削除
            </button>
            <button className="control-button" onClick={() => setResetViewportKey((v) => v + 1)}>
              ズームリセット
            </button>
            <button className="control-button" onClick={() => saveDocument(store.document!)}>
              保存
            </button>
            <button className="control-button" onClick={() => setInfoPanelOpen((v) => !v)}>
              {infoPanelOpen ? '情報パネルを閉じる' : '情報パネルを開く'}
            </button>
          </div>
        </div>
      </div>
      <div className="workspace">
        <div className="canvas-container">
          <CanvasStage
            key={store.document.image_id}
            imageId={store.document.image_id}
            imageSize={store.document.image_size}
            layers={store.document.layers}
            activeLayerId={currentLayer?.id ?? null}
            drawingColor={store.drawingColor}
            tool={store.tool}
            selectedLayerId={store.selectedLayerId}
            selectedShapeId={store.selectedShapeId}
            resetViewportKey={resetViewportKey}
            onAddShape={(layerId, shape) => store.addShape(layerId, shape)}
            onUpdateShape={(layerId, shape) => store.updateShape(layerId, shape)}
            onSelect={(layerId, shapeId) => store.selectShape(layerId, shapeId)}
            onDeleteShape={(layerId, shapeId) => store.deleteShape(layerId, shapeId)}
            onShapeRejected={showToast}
          />
          {toast && <div className="toast">{toast}</div>}
        </div>
        {infoPanelOpen && (
          <div className="info-panel">
            <LayerPanel
              layers={store.document.layers}
              selectedLayerId={currentLayer?.id ?? null}
              onToggleVisibility={(layerId) => {
                const layer = store.document.layers.find((l) => l.id === layerId);
                if (!layer) return;
                store.updateLayer({ ...layer, visible: !layer.visible });
              }}
              onToggleLock={(layerId) => {
                const layer = store.document.layers.find((l) => l.id === layerId);
                if (!layer) return;
                store.updateLayer({ ...layer, locked: !layer.locked });
              }}
              onRename={(layerId, name) => {
                const layer = store.document.layers.find((l) => l.id === layerId);
                if (!layer) return;
                store.updateLayer({ ...layer, name });
              }}
              onDelete={(layerId) => store.removeLayer(layerId)}
            />
            <ShapeList
              layers={store.document.layers}
              selectedLayerId={store.selectedLayerId}
              selectedShapeId={store.selectedShapeId}
              onSelect={(layerId, shapeId) => store.selectShape(layerId, shapeId)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
