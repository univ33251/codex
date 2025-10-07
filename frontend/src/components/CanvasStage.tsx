import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer as KonvaLayer, Line, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import { AnnotationLayer, AnnotationShape, NormalizedPoint } from '../types/annotations';
import { ToolMode } from '../hooks/useAnnotationStore';

interface CanvasStageProps {
  imageId: string;
  imageSize: { w: number; h: number };
  layers: AnnotationLayer[];
  activeLayerId: string | null;
  drawingColor: string;
  tool: ToolMode;
  selectedLayerId: string | null;
  selectedShapeId: string | null;
  resetViewportKey: number;
  onAddShape: (layerId: string, shape: AnnotationShape) => void;
  onUpdateShape: (layerId: string, shape: AnnotationShape) => void;
  onSelect: (layerId: string | null, shapeId: string | null) => void;
  onDeleteShape: (layerId: string, shapeId: string) => void;
  onShapeRejected?: (reason: string) => void;
}

const CanvasStage = ({
  imageId,
  imageSize,
  layers,
  activeLayerId,
  drawingColor,
  tool,
  selectedLayerId,
  selectedShapeId,
  resetViewportKey,
  onAddShape,
  onUpdateShape,
  onSelect,
  onDeleteShape,
  onShapeRejected,
}: CanvasStageProps) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [stageScale, setStageScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [imageNode, setImageNode] = useState<HTMLImageElement | null>(null);
  const [draftPath, setDraftPath] = useState<{ points: { x: number; y: number }[] } | null>(null);
  const stageScaleRef = useRef(stageScale);
  const stagePositionRef = useRef(stagePosition);
  const pinchDistanceRef = useRef<number | null>(null);
  const pinchCenterRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  const clampStagePosition = useCallback(
    (pos: { x: number; y: number }, scale = stageScale) => {
      if (!containerSize.width || !containerSize.height) {
        return pos;
      }
      const scaledWidth = imageSize.w * scale;
      const scaledHeight = imageSize.h * scale;

      const availableX = containerSize.width - scaledWidth;
      const availableY = containerSize.height - scaledHeight;

      const x = availableX >= 0
        ? availableX / 2
        : Math.min(0, Math.max(availableX, pos.x));
      const y = availableY >= 0
        ? availableY / 2
        : Math.min(0, Math.max(availableY, pos.y));

      return { x, y };
    },
    [containerSize.width, containerSize.height, imageSize.w, imageSize.h, stageScale]
  );

  useEffect(() => {
    if (!containerSize.width || !containerSize.height) return;
    const scale = 1;
    const nextPosition = clampStagePosition(
      {
        x: (containerSize.width - imageSize.w * scale) / 2,
        y: (containerSize.height - imageSize.h * scale) / 2,
      },
      scale
    );
    setStageScale(scale);
    setStagePosition(nextPosition);
    stageScaleRef.current = scale;
    stagePositionRef.current = nextPosition;
  }, [clampStagePosition, containerSize.height, containerSize.width, imageSize.h, imageSize.w, resetViewportKey]);

  useEffect(() => {
    setStagePosition((prev) => clampStagePosition(prev));
  }, [clampStagePosition, stageScale]);

  useEffect(() => {
    stageScaleRef.current = stageScale;
  }, [stageScale]);

  useEffect(() => {
    stagePositionRef.current = stagePosition;
  }, [stagePosition]);

  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = `/api/images/${encodeURIComponent(imageId)}`;
    img.onload = () => setImageNode(img);
  }, [imageId]);

  useEffect(() => {
    setDraftPath(null);
  }, [imageId]);

  const applyZoom = useCallback(
    (pointer: { x: number; y: number }, scale: number) => {
      const nextScale = clampScale(scale);
      const stagePos = stagePositionRef.current;
      const oldScale = stageScaleRef.current;
      const focus = {
        x: (pointer.x - stagePos.x) / oldScale,
        y: (pointer.y - stagePos.y) / oldScale,
      };
      const newPos = {
        x: pointer.x - focus.x * nextScale,
        y: pointer.y - focus.y * nextScale,
      };
      const clampedPos = clampStagePosition(newPos, nextScale);
      setStageScale(nextScale);
      setStagePosition(clampedPos);
      stageScaleRef.current = nextScale;
      stagePositionRef.current = clampedPos;
    },
    [clampStagePosition]
  );

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const direction = e.evt.deltaY > 0 ? 1 : -1;
      const factor = direction > 0 ? 1 / WHEEL_SCALE_STEP : WHEEL_SCALE_STEP;
      const targetScale = stageScaleRef.current * factor;
      applyZoom(pointer, targetScale);
    },
    [applyZoom]
  );

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const nextPos = clampStagePosition({ x: e.target.x(), y: e.target.y() });
      setStagePosition(nextPos);
      stagePositionRef.current = nextPos;
    },
    [clampStagePosition]
  );

  const normalize = useCallback(
    (point: { x: number; y: number }): NormalizedPoint => ({
      x: Math.max(0, Math.min(1, point.x / imageSize.w)),
      y: Math.max(0, Math.min(1, point.y / imageSize.h)),
    }),
    [imageSize]
  );

  const denormalize = useCallback(
    (point: NormalizedPoint) => ({
      x: point.x * imageSize.w,
      y: point.y * imageSize.h,
    }),
    [imageSize]
  );

  const toImageCoords = useCallback(
    (stagePoint: { x: number; y: number }) => {
      return {
        x: (stagePoint.x - stagePosition.x) / stageScale,
        y: (stagePoint.y - stagePosition.y) / stageScale,
      };
    },
    [stagePosition, stageScale]
  );

  const clampToImage = useCallback(
    (point: { x: number; y: number }) => ({
      x: Math.max(0, Math.min(imageSize.w, point.x)),
      y: Math.max(0, Math.min(imageSize.h, point.y)),
    }),
    [imageSize]
  );

  const getActiveLayer = () => {
    if (!layers.length) return undefined;
    const layer = layers.find((l) => l.id === (activeLayerId ?? selectedLayerId ?? l.id));
    return layer ?? layers[0];
  };

  const handlePointerDown = (evt: Konva.KonvaEventObject<PointerEvent>) => {
    evt.evt.preventDefault();
    if ('touches' in evt.evt && evt.evt.touches && evt.evt.touches.length > 1) {
      return;
    }
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    if (tool === 'draw') {
      const activeLayer = getActiveLayer();
      if (!activeLayer) return;
      if (activeLayer.locked) {
        onShapeRejected?.('ロックされたレイヤーには描画できません');
        return;
      }
      onSelect(activeLayer.id, null);
      const pos = clampToImage(toImageCoords(pointer));
      setDraftPath({ points: [pos] });
    } else if (tool === 'select') {
      if (evt.target === stage) {
        onSelect(null, null);
      }
    }
  };

  const handlePointerMove = (evt: Konva.KonvaEventObject<PointerEvent>) => {
    if (!draftPath) return;
    if ('touches' in evt.evt && evt.evt.touches && evt.evt.touches.length > 1) {
      return;
    }
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const pos = clampToImage(toImageCoords(pointer));
    setDraftPath((prev) => {
      if (!prev) return prev;
      const lastPoint = prev.points[prev.points.length - 1];
      const distance = Math.hypot(pos.x - lastPoint.x, pos.y - lastPoint.y);
      if (distance < MIN_POINT_DISTANCE) {
        return prev;
      }
      return { points: [...prev.points, pos] };
    });
  };

  const polygonArea = (points: NormalizedPoint[]) => {
    if (points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area) / 2;
  };

  const finalizeDraft = () => {
    if (!draftPath) return;
    const layer = getActiveLayer();
    if (!layer) {
      setDraftPath(null);
      return;
    }
    const points = draftPath.points;
    if (points.length < 3) {
      setDraftPath(null);
      return;
    }
    const first = points[0];
    const last = points[points.length - 1];
    const distance = Math.hypot(last.x - first.x, last.y - first.y);
    if (distance > CLOSE_THRESHOLD) {
      setDraftPath(null);
      onShapeRejected?.('始点と終点が閉じていないため図形を作成できませんでした');
      return;
    }
    const normalizedPoints = points.map(normalize);
    const area = polygonArea(normalizedPoints);
    if (area < MIN_POLYGON_AREA) {
      setDraftPath(null);
      onShapeRejected?.('囲まれた面積が小さすぎるため無効化しました');
      return;
    }
    const now = new Date().toISOString();
    const shape: AnnotationShape = {
      id: `ann-${Date.now()}`,
      type: 'freehand',
      points: normalizedPoints,
      color: drawingColor,
      label: null,
      created_at: now,
      updated_at: now,
      closed: true,
    };
    onAddShape(layer.id, shape);
    onSelect(layer.id, shape.id);
    setDraftPath(null);
  };

  const handlePointerUp = () => {
    pinchDistanceRef.current = null;
    pinchCenterRef.current = null;
    finalizeDraft();
  };

  const handlePointerCancel = () => {
    pinchDistanceRef.current = null;
    pinchCenterRef.current = null;
    setDraftPath(null);
  };

  const handleTouchStart = useCallback((evt: Konva.KonvaEventObject<TouchEvent>) => {
    if (evt.evt.touches.length === 2) {
      pinchDistanceRef.current = distanceBetweenTouches(evt.evt.touches[0], evt.evt.touches[1]);
      pinchCenterRef.current = centerOfTouches(evt.evt.touches[0], evt.evt.touches[1]);
    }
  }, []);

  const handleTouchMove = useCallback(
    (evt: Konva.KonvaEventObject<TouchEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;
      if (evt.evt.touches.length !== 2) return;
      evt.evt.preventDefault();
      const [touch1, touch2] = [evt.evt.touches[0], evt.evt.touches[1]];
      const distance = distanceBetweenTouches(touch1, touch2);
      const center = centerOfTouches(touch1, touch2);
      const containerRect = stage.container().getBoundingClientRect();
      const pointer = {
        x: center.x - containerRect.left,
        y: center.y - containerRect.top,
      };
      if (pinchDistanceRef.current) {
        const scaleBy = distance / pinchDistanceRef.current;
        const targetScale = stageScaleRef.current * scaleBy;
        applyZoom(pointer, targetScale);
      }
      if (pinchCenterRef.current) {
        const dx = center.x - pinchCenterRef.current.x;
        const dy = center.y - pinchCenterRef.current.y;
        if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
          const nextPos = clampStagePosition(
            {
              x: stagePositionRef.current.x + dx,
              y: stagePositionRef.current.y + dy,
            },
            stageScaleRef.current
          );
          setStagePosition(nextPos);
          stagePositionRef.current = nextPos;
        }
      }
      pinchDistanceRef.current = distance;
      pinchCenterRef.current = center;
    },
    [applyZoom, clampStagePosition]
  );

  const handleTouchEnd = useCallback(() => {
    pinchDistanceRef.current = null;
    pinchCenterRef.current = null;
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedLayerId || !selectedShapeId) return;
    onDeleteShape(selectedLayerId, selectedShapeId);
    onSelect(selectedLayerId, null);
  }, [onDeleteShape, onSelect, selectedLayerId, selectedShapeId]);

  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        handleDeleteSelected();
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === '0') {
        setStageScale(1);
        setStagePosition({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDeleteSelected]);

  const renderLayers = () =>
    layers
      .filter((layer) => layer.visible !== false)
      .map((layer) => (
        <KonvaLayer key={layer.id} listening={tool !== 'pan'}>
          {layer.shapes.map((shape) => {
            const points = shape.points
              .map(denormalize)
              .flatMap((pt) => [pt.x, pt.y]);
            const isActive = layer.id === selectedLayerId && shape.id === selectedShapeId;
            return (
              <Line
                key={shape.id}
                points={points}
                closed={shape.closed}
                stroke={shape.color}
                strokeWidth={isActive ? 6 / stageScale : 4 / stageScale}
                fill={`${shape.color}22`}
                opacity={layer.locked ? 0.6 : 1}
                dash={layer.locked ? [12, 6] : undefined}
                draggable={tool === 'select' && !layer.locked}
                onPointerDown={(e) => {
                  if (tool === 'erase') {
                    e.cancelBubble = true;
                    if (layer.locked) {
                      onShapeRejected?.('ロックされたレイヤーの図形は削除できません');
                      return;
                    }
                    onDeleteShape(layer.id, shape.id);
                    return;
                  }
                  if (tool === 'select') {
                    e.cancelBubble = true;
                    onSelect(layer.id, shape.id);
                  }
                }}
                onDragEnd={(e) => {
                  if (tool !== 'select' || layer.locked) return;
                  const node = e.target as Konva.Line;
                  const dx = node.x();
                  const dy = node.y();
                  const newPoints = [] as NormalizedPoint[];
                  for (let i = 0; i < shape.points.length; i += 1) {
                    const original = denormalize(shape.points[i]);
                    const moved = clampToImage({ x: original.x + dx, y: original.y + dy });
                    newPoints.push(normalize(moved));
                  }
                  node.x(0);
                  node.y(0);
                  const updated: AnnotationShape = {
                    ...shape,
                    points: newPoints,
                    updated_at: new Date().toISOString(),
                  };
                  onUpdateShape(layer.id, updated);
                }}
                listening={tool !== 'pan'}
                hitStrokeWidth={Math.max(TOUCH_HIT_STROKE / stageScale, 12)}
              />
            );
          })}
        </KonvaLayer>
      ));

  if (!containerSize.width || !containerSize.height) {
    return <div className="stage-wrapper" ref={wrapperRef} />;
  }

  return (
    <div className="stage-wrapper" ref={wrapperRef}>
      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePosition.x}
        y={stagePosition.y}
        draggable={tool === 'pan'}
        dragBoundFunc={(pos) => clampStagePosition(pos)}
        onDragMove={handleDragMove}
        onDragEnd={(e) => {
          const nextPos = clampStagePosition({ x: e.target.x(), y: e.target.y() });
          setStagePosition(nextPos);
          stagePositionRef.current = nextPos;
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        style={{ touchAction: 'none', background: '#000' }}
      >
        <KonvaLayer listening={false}>
          {imageNode && <KonvaImage image={imageNode} width={imageSize.w} height={imageSize.h} />}
          {draftPath && (
            <Line
              points={draftPath.points.flatMap((pt) => [pt.x, pt.y])}
              stroke={drawingColor}
              strokeWidth={3 / stageScale}
              dash={[10, 6]}
              closed={false}
            />
          )}
        </KonvaLayer>
        {renderLayers()}
      </Stage>
    </div>
  );
};

export default CanvasStage;

const MIN_POINT_DISTANCE = 4;
const CLOSE_THRESHOLD = 32;
const MIN_POLYGON_AREA = 0.0002;
const MIN_STAGE_SCALE = 0.05;
const MAX_STAGE_SCALE = 8;
const WHEEL_SCALE_STEP = 1.05;
const TOUCH_HIT_STROKE = 36;

const clampScale = (value: number) => Math.max(MIN_STAGE_SCALE, Math.min(value, MAX_STAGE_SCALE));

const distanceBetweenTouches = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

const centerOfTouches = (a: Touch, b: Touch) => ({
  x: (a.clientX + b.clientX) / 2,
  y: (a.clientY + b.clientY) / 2,
});
