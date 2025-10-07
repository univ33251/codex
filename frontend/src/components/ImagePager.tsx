interface ImagePagerProps {
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

const ImagePager = ({ onPrev, onNext, hasPrev, hasNext }: ImagePagerProps) => {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button className="control-button" onClick={onPrev} disabled={!hasPrev}>
        前へ
      </button>
      <button className="control-button" onClick={onNext} disabled={!hasNext}>
        次へ
      </button>
    </div>
  );
};

export default ImagePager;
