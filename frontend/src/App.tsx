import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useAnnotationStore } from './hooks/useAnnotationStore';
import { AnnotationDocument, AnnotationLayer, ImageSummary } from './types/annotations';
import CanvasStage from './components/CanvasStage';
import LayerPanel from './components/LayerPanel';
import ColorPalette from './components/ColorPalette';
import ImagePager from './components/ImagePager';
import ShapeList from './components/ShapeList';

const AUTOSAVE_INTERVAL = 15000;

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
    fetchImages();
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
    // 一覧はあるのにdocumentがまだ無い場合の保険
    if (!store.document && store.images.length > 0) {
      void loadDocumentForIndex(store.currentImageIndex || 0);
    }
  }, [store.images]);

  const loadDocumentForIndex = async (index: number) => {
    const image = store.images[index];
    if (!image) return;
    setLoading(true);
    try {
      store.setCurrentImageIndex(index);
      const res = await axios.get<AnnotationDocument | null>(`/api/annotations/${image.id}`);
      const doc = res.data ?? defaultDocument(image);
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

  const currentImage = useMemo(() => store.images[store.currentImageIndex], [store.images, store.currentImageIndex]);

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
        <div>
          {store.currentImageIndex + 1}/{store.images.length} : {currentImage.name}
        </div>
        <ColorPalette
          colors={store.palette}
          selectedColor={store.drawingColor}
          onColorChange={(color) => store.setDrawingColor(color)}
          onPaletteChange={store.setPalette}
        />
        <div className="layer-dropdown">
          <LayerSelect
            layers={store.document.layers}
            selectedLayerId={currentLayer?.id ?? null}
            onSelect={(layerId) => store.selectShape(layerId, null)}
            onCreate={() => {
              const newLayer: AnnotationLayer = {
                id: `layer-${Date.now()}`,
                name: `Layer ${store.document.layers.length + 1}`,
                visible: true,
                z: store.document.layers.length + 1,
                shapes: [],
              };
              store.addLayer(newLayer);
            }}
          />
        </div>
        <button className="control-button" onClick={() => store.setTool('draw')}>描画</button>
        <button className="control-button" onClick={() => store.setTool('select')}>選択</button>
        <button className="control-button" onClick={() => store.setTool('pan')}>パン</button>
        <button className="control-button" onClick={() => saveDocument(store.document!)}>保存</button>
        <div className="spacer" />
        <ImagePager onPrev={onPrev} onNext={onNext} hasPrev={store.currentImageIndex > 0} hasNext={store.currentImageIndex < store.images.length - 1} />
      </div>
      <div className="app-main">
        <div className="canvas-container">
          <CanvasStage
            key={store.document.image_id}
            imageId={store.document.image_id}
            imageSize={store.document.image_size}
            layers={store.document.layers}
            activeLayerId={currentLayer?.id ?? null}
            drawingColor={store.drawingColor}
            tool={store.tool}
            onAddShape={(layerId, shape) => store.addShape(layerId, shape)}
            onUpdateShape={(layerId, shape) => store.updateShape(layerId, shape)}
            onSelect={(layerId, shapeId) => store.selectShape(layerId, shapeId)}
            onDeleteShape={(layerId, shapeId) => store.deleteShape(layerId, shapeId)}
          />
        </div>
        <aside className="sidebar">
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
            selectedLayerId={currentLayer?.id ?? null}
            selectedShapeId={store.selectedShapeId}
            onSelect={(layerId, shapeId) => store.selectShape(layerId, shapeId)}
          />
        </aside>
      </div>
    </div>
  );
}

function LayerSelect({
  layers,
  selectedLayerId,
  onSelect,
  onCreate,
}: {
  layers: AnnotationLayer[];
  selectedLayerId: string | null;
  onSelect: (layerId: string) => void;
  onCreate: () => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  return (
    <div>
      <button className="control-button" onClick={() => setDropdownOpen((v) => !v)}>
        レイヤー
      </button>
      {dropdownOpen && (
        <div className="layer-panel" style={{ position: 'absolute', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <button className="control-button" onClick={() => onCreate()}>レイヤー追加</button>
          </div>
          {layers.map((layer) => (
            <div key={layer.id} className="layer-item">
              <button
                className="control-button"
                style={{ background: layer.id === selectedLayerId ? '#d1eaff' : '#f0f0f0' }}
                onClick={() => {
                  onSelect(layer.id);
                  setDropdownOpen(false);
                }}
              >
                {layer.name}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
