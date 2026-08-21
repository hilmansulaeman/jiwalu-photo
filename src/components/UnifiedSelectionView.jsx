import { useState, useEffect } from 'react';
import { PHOTO_MODES } from '../utils/photoConfig.js';
import { fetchCustomFrames, recordFrameUsage } from '../utils/customFrameConfig.js';

const PREMIUM_FRAME_PRICE = 5000;
const SPECIAL_FRAME_PRICE = 10000;

export default function UnifiedSelectionView({ onNext, onBack }) {
  const [selectedMode, setSelectedMode] = useState(PHOTO_MODES[1]); // default 4 shots
  const [allFrames, setAllFrames] = useState([]);
  const [selectedFrame, setSelectedFrame] = useState(null);

  useEffect(() => {
    const loadCustomFrames = async () => {
      const fetched = await fetchCustomFrames();
      const custom = fetched.map(f => ({
        ...f,
        type: 'custom'
      }));
      setAllFrames(custom);
      if (custom.length > 0) {
        setSelectedFrame(custom[0]);
      }
    };
    loadCustomFrames();
  }, []);

  const handleNext = () => {
    if (!selectedFrame) return;
    let addonPrice = 0;
    if (selectedFrame.type === 'premium') addonPrice += PREMIUM_FRAME_PRICE;
    if (selectedFrame.type === 'special') addonPrice += SPECIAL_FRAME_PRICE;
    recordFrameUsage(selectedFrame.id);

    onNext({ template: selectedMode, frame: selectedFrame, addonPrice });
  };

  return (
    <section className="wizard-step" aria-label="Select Template and Frame">
      <header className="wizard-header">
        <button className="back-button" onClick={onBack}>← Back</button>
        <h2>Pilih Template & Bingkai</h2>
        <p className="subtitle">Sesuaikan gayamu dengan berbagai pilihan gratis & berbayar</p>
      </header>

      <div className="template-content">
        <div className="selector-group">
          <h3>1. Pilih Layout Foto</h3>
          <div className="selector-grid">
            {PHOTO_MODES.map((mode) => {
              const isSelected = selectedMode.id === mode.id;
              return (
                <button
                  key={mode.id}
                  className={`selector-card ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedMode(mode)}
                >
                  <div className="filter-preview" />
                  <span>{mode.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="selector-group">
          <h3>2. Pilih Bingkai (Frame)</h3>
          <div className="frame-grid">
            {allFrames.map((frame) => {
              const isSelected = selectedFrame?.id === frame.id;
              const isPremium = frame.type === 'premium';
              const isSpecial = frame.type === 'special';
              const isCustom = frame.type === 'custom';
              
              return (
                <button
                  key={frame.id}
                  className={`selector-card frame-card ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedFrame(frame)}
                >
                  {isPremium && <div className="premium-badge">+5k</div>}
                  {isSpecial && <div className="premium-badge" style={{ background: '#10b981' }}>+10k</div>}
                  {isCustom && <div className="premium-badge" style={{ background: '#8b5cf6' }}>Custom</div>}
                  
                  {isCustom ? (
                    <div className="frame-preview relative" style={{ background: '#e9ecef', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div className="relative w-full h-full flex items-center justify-center">
                        <img src={frame.url} alt={frame.name} className="absolute inset-0 m-auto max-w-full max-h-full object-contain z-10" />
                        <div className="absolute inset-0 m-auto z-20 pointer-events-none" style={{ aspectRatio: '1080/1920', maxHeight: '100%', maxWidth: '100%', height: '100%' }}>
                          {(() => {
                            try {
                              const slots = JSON.parse(frame.slotJson || '[]');
                              return slots.map((s, i) => (
                                <div 
                                  key={i}
                                  className="absolute flex items-center justify-center text-gray-500 font-black text-2xl drop-shadow-md"
                                  style={{
                                    left: `${(s.x / 1080) * 100}%`,
                                    top: `${(s.y / 1920) * 100}%`,
                                    width: `${(s.width / 1080) * 100}%`,
                                    height: `${(s.height / 1920) * 100}%`,
                                  }}
                                >
                                  {i + 1}
                                </div>
                              ));
                            } catch(e) { return null; }
                          })()}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="frame-preview" 
                      style={{ borderColor: frame.tone, outlineColor: frame.accent }}
                    ></div>
                  )}
                  <span>{frame.name}</span>
                  <span className="addon-price">
                    {frame.type === 'basic' || frame.type === 'custom' ? 'Gratis' : 
                     frame.type === 'premium' ? `+ Rp ${PREMIUM_FRAME_PRICE.toLocaleString('id-ID')}` : 
                     `+ Rp ${SPECIAL_FRAME_PRICE.toLocaleString('id-ID')}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="wizard-footer">
        <button className="primary-action" onClick={handleNext} disabled={!selectedFrame}>Lanjut ke Harga</button>
      </footer>
    </section>
  );
}
