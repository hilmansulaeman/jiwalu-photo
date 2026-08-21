import { TIERS } from '../utils/photoConfig.js';

export default function PackageTierView({ onNext, onBack }) {
  return (
    <section className="wizard-step" aria-label="Select Package Tier">
      <header className="wizard-header">
        {onBack && <button className="back-button" onClick={onBack}>← Back</button>}
        <h2>Pilih Paket Foto</h2>
        <p className="subtitle">Makin tinggi paketnya, makin puas fotonya!</p>
      </header>

      <div className="package-grid">
        {TIERS.map((tier) => {
          const isPremium = tier.id === 'premium';
          
          return (
            <button
              key={tier.id}
              className={`package-card ${isPremium ? 'premium-tier' : ''}`}
              onClick={() => onNext(tier)}
            >
              {isPremium && <div className="premium-badge">BEST VALUE</div>}
              
              <h3 style={{ fontSize: '1.8rem', color: isPremium ? '#d97706' : 'var(--accent)', marginBottom: '0' }}>
                {tier.name}
              </h3>
              
              <div className="package-price-wrap">
                <div className="package-price">
                  <span className="package-price-currency">Rp</span>
                  {tier.pricePerHead.toLocaleString('id-ID')}
                  <span className="package-price-suffix">/ org</span>
                </div>
              </div>
              
              <ul className="package-features">
                <li className="highlight">
                  <span style={{ fontSize: '1.2rem' }}>📸</span> <strong>{tier.poseLimit}</strong> Pose Foto
                </li>
                <li>
                  <span style={{ fontSize: '1.2rem' }}>🖨️</span> <strong>{tier.printLimit}x</strong> Cetak per Orang
                </li>
                <li>
                  <span style={{ fontSize: '1.2rem' }}>🖼️</span> 1 Bingkai Dasar Gratis
                </li>
                <li>
                  <span style={{ fontSize: '1.2rem' }}>💾</span> Soft File (QR Code)
                </li>
              </ul>
            </button>
          );
        })}
      </div>
    </section>
  );
}
