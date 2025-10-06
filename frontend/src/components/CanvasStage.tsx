import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer as KonvaLayer, Circle, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import { AnnotationCircle, AnnotationLayer } from '../types/annotations';
import { ToolMode } from '../hooks/useAnnotationStore';

interface CanvasStageProps {
  imageId: string;
  imageSize: { w: number; h: number };
  layers: AnnotationLayer[];
  activeLayerId: string | null;
  drawingColor: string;
  tool: ToolMode;
  onAddShape: (layerId: string, shape: AnnotationCircle) => void;
  onUpdateShape: (layerId: string, shape: AnnotationCircle) => void;
  onSelect: (layerId: string | null, shapeId: string | null) => void;
  onDeleteShape: (layerId: string, shapeId: string) => void;
}

const CanvasStage = ({
  imageId,
  imageSize,
  layers,
  activeLayerId,
  drawingColor,
  tool,
  onAddShape,
  onUpdateShape,
  onSelect,
  onDeleteShape,
}: CanvasStageProps) => {
  const stageRef = useRef<Konva.Stage>(null);
  const [stageScale, setStageScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [imageNode, setImageNode] = useState<HTMLImageElement | null>(null);
  const [draftCircle, setDraftCircle] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
  const [selected, setSelected] = useState<{ layerId: string; shapeId: string } | null>(null);

  useEffect(() => {
    onSelect(selected?.layerId ?? null, selected?.shapeId ?? null);
  }, [selected]);

  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = `/api/images/${encodeURIComponent(imageId)}`;
    img.onload = () => setImageNode(img);
  }, [imageId]);

  useEffect(() => {
    setSelected(null);
    setDraftCircle(null);
  }, [imageId]);

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stageScale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const scaleBy = 1.05;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    setStageScale(newScale);
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    setStagePosition(newPos);
  }, [stageScale]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.on('wheel', handleWheel as any);
    return () => {
      stage.off('wheel', handleWheel as any);
    };
  }, [handleWheel]);

  const size = useMemo(() => {
    const ratio = imageSize.w / imageSize.h;
    const container = stageRef.current?.container();
    const width = container?.clientWidth ?? window.innerWidth;
    const height = container?.clientHeight ?? window.innerHeight;
    const stageWidth = width;
    const stageHeight = width / ratio;
    if (stageHeight > height) {
      return { width: height * ratio, height };
    }
    return { width: stageWidth, height: stageHeight };
  }, [imageSize, stageScale, stagePosition]);

  const normalize = useCallback((point: { x: number; y: number }) => ({
    x: Math.max(0, Math.min(1, point.x / imageSize.w)),
    y: Math.max(0, Math.min(1, point.y / imageSize.h)),
  }), [imageSize]);

  const denormalize = useCallback((point: { x: number; y: number }) => ({
    x: point.x * imageSize.w,
    y: point.y * imageSize.h,
  }), [imageSize]);

  const toImageCoords = (stagePoint: { x: number; y: number }) => {
    return {
      x: (stagePoint.x - stagePosition.x) / stageScale,
      y: (stagePoint.y - stagePosition.y) / stageScale,
    };
  };

  const handlePointerDown = (evt: Konva.KonvaEventObject<PointerEvent>) => {
    const pointerType = evt.evt.pointerType;
    if (pointerType === 'touch' && evt.evt.touches && evt.evt.touches.length > 1) {
      return;
    }
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    if (tool === 'draw') {
      const pos = toImageCoords(pointer);
      setDraftCircle({ start: pos, current: pos });
    } else if (tool === 'select') {
      setSelected(null);
    }
  };

  const handlePointerMove = (_evt: Konva.KonvaEventObject<PointerEvent>) => {
    if (!draftCircle) return;
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const pos = toImageCoords(pointer);
    setDraftCircle((prev) => (prev ? { ...prev, current: pos } : prev));
  };

  const handlePointerUp = () => {
    if (!draftCircle) return;
    const layerId = activeLayerId ?? layers[0]?.id;
    if (!layerId) {
      setDraftCircle(null);
      return;
    }
    const dx = draftCircle.current.x - draftCircle.start.x;
    const dy = draftCircle.current.y - draftCircle.start.y;
    const radius = Math.sqrt(dx * dx + dy * dy);
    if (radius < 5) {
      setDraftCircle(null);
      return;
    }
    const now = new Date().toISOString();
    const normalizedCenter = normalize(draftCircle.start);
    const normalizedRadius = radius / imageSize.w;
    const shape: AnnotationCircle = {
      id: `ann-${Date.now()}`,
      type: 'circle',
      center: normalizedCenter,
      radius: normalizedRadius,
      color: drawingColor,
      label: null,
      created_at: now,
      updated_at: now,
    };
    onAddShape(layerId, shape);
    setSelected({ layerId, shapeId: shape.id });
    setDraftCircle(null);
  };

  const handleDeleteSelected = () => {
    if (!selected) return;
    onDeleteShape(selected.layerId, selected.shapeId);
    setSelected(null);
  };

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
  }, [selected]);

  const renderLayers = () => {
    return layers
      .filter((layer) => layer.visible !== false)
      .map((layer) => (
        <KonvaLayer key={layer.id} listening={tool !== 'pan'}>
          {layer.shapes.map((shape) => {
            const center = denormalize(shape.center);
            const radius = shape.radius * imageSize.w;
            const isActive = selected?.shapeId === shape.id;
            return (
              <Circle
                key={shape.id}
                x={center.x}
                y={center.y}
                radius={radius}
                stroke={shape.color}
                strokeWidth={isActive ? 6 : 4}
                dash={layer.locked ? [10, 4] : undefined}
                opacity={layer.locked ? 0.6 : 1}
                draggable={tool === 'select' && !layer.locked}
                onClick={(e) => {
                  e.cancelBubble = true;
                  setSelected({ layerId: layer.id, shapeId: shape.id });
                }}
                onTap={(e) => {
                  e.cancelBubble = true;
                  setSelected({ layerId: layer.id, shapeId: shape.id });
                }}
                onDragMove={(e) => {
                  if (tool !== 'select') return;
                  const position = {
                    x: e.target.x(),
                    y: e.target.y(),
                  };
                  const updated: AnnotationCircle = {
                    ...shape,
                    center: normalize(position),
                    updated_at: new Date().toISOString(),
                  };
                  onUpdateShape(layer.id, updated);
                }}
                onTransformEnd={(e) => {
                  const node = e.target as Konva.Circle;
                  const scaleX = node.scaleX();
                  node.scaleX(1);
                  node.scaleY(1);
                  const updated: AnnotationCircle = {
                    ...shape,
                    radius: (node.radius() * scaleX) / imageSize.w,
                    updated_at: new Date().toISOString(),
                  };
                  onUpdateShape(layer.id, updated);
                }}
                listening={tool !== 'pan'}
              />
            );
          })}
        </KonvaLayer>
      ));
  };

  return (
    <Stage
      ref={stageRef}
      width={size.width}
      height={size.height}
      scaleX={stageScale}
      scaleY={stageScale}
      x={stagePosition.x}
      y={stagePosition.y}
      draggable={tool === 'pan'}
      onDragEnd={(e) => {
        setStagePosition({ x: e.target.x(), y: e.target.y() });
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ touchAction: 'none', background: '#000' }}
    >
      <KonvaLayer listening={false}>
        {imageNode && <KonvaImage image={imageNode} width={imageSize.w} height={imageSize.h} />}
        {draftCircle && (
          <Circle
            x={draftCircle.start.x}
            y={draftCircle.start.y}
            radius={Math.sqrt(
              Math.pow(draftCircle.current.x - draftCircle.start.x, 2) +
                Math.pow(draftCircle.current.y - draftCircle.start.y, 2)
            )}
            stroke={drawingColor}
            strokeWidth={3 / stageScale}
            dash={[8, 4]}
          />
        )}
      </KonvaLayer>
      {renderLayers()}
    </Stage>
  );
};

export default CanvasStage;
