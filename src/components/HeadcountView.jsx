import { useState } from 'react';

export default function HeadcountView({ onNext, onBack, orderDetails }) {
  const [headCount, setHeadCount] = useState(1);
  const [isCustom, setIsCustom] = useState(false);

  const handleSelect = (num) => {
    setHeadCount(num);
    setIsCustom(false);
  };

  const handleCustomSelect = () => {
    setHeadCount(3);
    setIsCustom(true);
  };

  const basePrice = headCount * orderDetails.tier.pricePerHead;
  const totalPrice = basePrice;

  const handleNext = () => {
    onNext({ headCount, basePrice, totalPrice });
  };

  return (
    <section className="wizard-step" aria-label="Select Headcount">
      <header className="wizard-header">
        <button className="back-button" onClick={onBack}>← Back</button>
        <h2>Berapa Orang yang Berfoto?</h2>
        <p className="subtitle">Pilih jumlah orang untuk paket {orderDetails.tier.name}</p>
      </header>

      <div className="headcount-grid">
        <button 
          className={`headcount-btn ${headCount === 1 && !isCustom ? 'active' : ''}`}
          onClick={() => handleSelect(1)}
        >
          1
        </button>
        <button 
          className={`headcount-btn ${headCount === 2 && !isCustom ? 'active' : ''}`}
          onClick={() => handleSelect(2)}
        >
          2
        </button>
        <button 
          className={`headcount-btn ${isCustom || headCount >= 3 ? 'active' : ''}`}
          onClick={handleCustomSelect}
        >
          3+
        </button>
      </div>

      {isCustom && (
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Masukkan Jumlah Orang:</label>
          <input 
            type="number" 
            min="3" 
            max="20" 
            value={headCount}
            onChange={(e) => setHeadCount(Math.max(3, parseInt(e.target.value) || 3))}
            style={{ padding: '0.5rem 1rem', fontSize: '1.2rem', width: '100px', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--line)' }}
          />
        </div>
      )}

      <div className="summary-card">
        <h3>Ringkasan Pesanan</h3>
        
        <div className="summary-row">
          <span>Paket {orderDetails.tier.name}</span>
          <span>Rp {orderDetails.tier.pricePerHead.toLocaleString('id-ID')} / org</span>
        </div>

        <div className="summary-row">
          <span>Jumlah Orang</span>
          <span>{headCount} Orang</span>
        </div>

        <div className="summary-row total">
          <span>Total Bayar</span>
          <span>Rp {totalPrice.toLocaleString('id-ID')}</span>
        </div>
      </div>

      <footer className="wizard-footer">
        <button className="primary-action" onClick={handleNext}>Lanjut ke Pembayaran</button>
      </footer>
    </section>
  );
}
