import { AnnotationLayer } from '../types/annotations';

interface ShapeListProps {
  layers: AnnotationLayer[];
  selectedLayerId: string | null;
  selectedShapeId: string | null;
  onSelect: (layerId: string, shapeId: string) => void;
}

const ShapeList = ({ layers, selectedLayerId, selectedShapeId, onSelect }: ShapeListProps) => {
  return (
    <div className="shape-list">
      <h3>円リスト</h3>
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
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: shape.color }} />
                ({shape.center.x.toFixed(3)}, {shape.center.y.toFixed(3)})
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
