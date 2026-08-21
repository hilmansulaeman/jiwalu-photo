import React, { useState } from 'react';
import DeviceSetupModal from './DeviceSetupModal.jsx';
import { Settings } from './ui/icons.jsx';

const icons = {
  pointer: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 24, height: 24 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672Zm-7.518-.267A8.25 8.25 0 1 1 20.25 10.5M8.288 14.212A5.25 5.25 0 1 1 17.25 10.5" />
    </svg>
  ),
  camera: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 24, height: 24 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
    </svg>
  ),
  wallet: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 24, height: 24 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
    </svg>
  ),
  video: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 24, height: 24 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  ),
  palette: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 24, height: 24 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.879-3.879a1.5 1.5 0 10-2.121-2.121l-3.879 3.879a15.995 15.995 0 00-4.648 4.764z" />
    </svg>
  ),
  download: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 24, height: 24 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  ),
  crop: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 24, height: 24 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
    </svg>
  )
};

const topSteps = [
  { id: 1, title: 'KETUK MULAI', desc: 'Ketuk tombol untuk memulai', icon: icons.pointer, num: 1 },
  { id: 2, title: 'PEMBAYARAN', desc: 'Melakukan Pembayaran', icon: icons.wallet, num: 2 },
  { id: 3, title: 'AMBIL FOTO', desc: 'Ambil 5 foto luar biasa', icon: icons.camera, num: 3 },
];

const bottomSteps = [
  { id: 4, title: 'PILIH BINGKAI', desc: 'Pilih bingkai yang sempurna', icon: icons.crop, num: 4 },
  { id: 5, title: 'EDIT FOTO dan VIDEO', desc: 'Edit foto dan buat loop video yang menyenangkan', icon: icons.video, num: 5 },
  { id: 6, title: 'DOWNLOAD', desc: 'Dapatkan foto Anda secara instan', icon: icons.download, num: 6 },
];

export default function LandingPage({ onStart }) {
  const [showDeviceSetup, setShowDeviceSetup] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [showPinPrompt, setShowPinPrompt] = useState(false);

  const handleOpenSettings = () => {
    setShowPinPrompt(true);
  };

  const handlePinSubmit = (e) => {
    e.preventDefault();
    const storedPin = JSON.parse(localStorage.getItem('potobox_kiosk_settings') || '{}').lockFullscreenPin || '000000';
    if (pinInput === storedPin || storedPin === '') {
      setShowDeviceSetup(true);
      setShowPinPrompt(false);
      setPinInput('');
    } else {
      alert('PIN Salah!');
    }
  };
  return (
    <main className="landing-new">
      <button onClick={handleOpenSettings} style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', background: 'rgba(0,0,0,0.1)', border: 'none', borderRadius: '999px', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#333', zIndex: 9998, boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
        <Settings size={24} />
      </button>

      {showPinPrompt && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <form onSubmit={handlePinSubmit} style={{ background: 'white', padding: '2rem', borderRadius: '12px', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '1rem', color: 'black' }}>Masukkan PIN</h3>
            <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} style={{ fontSize: '1.5rem', padding: '0.5rem', textAlign: 'center', width: '200px', letterSpacing: '0.2em', border: '2px solid #ccc', borderRadius: '999px' }} autoFocus />
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button type="button" onClick={() => setShowPinPrompt(false)} style={{ padding: '0.5rem 1rem', border: '1px solid #ccc', borderRadius: '999px', cursor: 'pointer' }}>Batal</button>
              <button type="submit" style={{ padding: '0.5rem 1rem', background: '#0066ff', color: 'white', border: 'none', borderRadius: '999px', cursor: 'pointer' }}>Masuk</button>
            </div>
          </form>
        </div>
      )}

      {showDeviceSetup && <DeviceSetupModal onClose={() => setShowDeviceSetup(false)} />}

      <section className="how-it-works-section">
        <div className="how-it-works-header">
          <h2>CARA KERJA</h2>
          <p>Bersiaplah untuk momen Anda! Inilah yang perlu Anda lakukan.</p>
        </div>

        <div className="steps-container">
          <div className="steps-row top-row">
            {topSteps.map((step) => (
              <div key={step.id} className="step-card">
                <div className="step-header">
                  <div className="step-icon">
                    {step.icon}
                  </div>
                  <span className="step-number">{step.num}</span>
                </div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="steps-row bottom-row">
            {bottomSteps.map((step) => (
              <div key={step.id} className="step-card">
                <div className="step-header">
                  <div className="step-icon">
                    {step.icon}
                  </div>
                  <span className="step-number">{step.num}</span>
                </div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="start-action-container">
          <button className="primary-action start-btn" type="button" onClick={onStart}>
            Mulai Foto
          </button>
        </div>
      </section>
    </main>
  );
}
