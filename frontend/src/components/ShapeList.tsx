import { AnnotationLayer, AnnotationShape } from '../types/annotations';

interface ShapeListProps {
  layers: AnnotationLayer[];
  selectedLayerId: string | null;
  selectedShapeId: string | null;
  onSelect: (layerId: string, shapeId: string) => void;
}

const ShapeList = ({ layers, selectedLayerId, selectedShapeId, onSelect }: ShapeListProps) => {
  const areaOf = (shape: AnnotationShape) => {
    if (shape.points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < shape.points.length; i += 1) {
      const current = shape.points[i];
      const next = shape.points[(i + 1) % shape.points.length];
      area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area) / 2;
  };

  return (
    <div className="shape-list">
      <h3>領域リスト</h3>
      {layers.map((layer) => (
        <div key={layer.id}>
          <h4 style={{ marginBottom: 4 }}>{layer.name}</h4>
          {layer.shapes.map((shape) => (
            <div
              key={shape.id}
              className="shape-row"
              style={{ background: shape.id === selectedShapeId ? '#e6f7ff' : undefined }}
            >
              <span>#{shape.id}</span>
              <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: shape.color }} />
                  {shape.points.length} 点
                </span>
                <span style={{ fontSize: 12, color: '#666' }}>
                  面積: {(areaOf(shape) * 100).toFixed(1)}%
                </span>
              </span>
              <button className="control-button" onClick={() => onSelect(layer.id, shape.id)}>
                フォーカス
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default ShapeList;
