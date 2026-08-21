import { useEffect, useState } from 'react';
import LandingPage from './components/LandingPage.jsx';
import PackageTierView from './components/PackageTierView.jsx';
import HeadcountView from './components/HeadcountView.jsx';
import PaymentView from './components/PaymentView.jsx';
import CameraView from './components/CameraView.jsx';
import StudioEditorView from './components/StudioEditorView.jsx';
import LiveWallView from './components/LiveWallView.jsx';
import ThankYouScreen from './components/ThankYouScreen.jsx';
import FilterPanel from './components/FilterPanel.jsx';
import { FILTERS } from './utils/photoConfig.js';
import MobileGalleryView from './components/MobileGalleryView.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import { syncKioskSettings } from './utils/kioskConfig.js';
import logoJiwalu from './assets/logo-jiwalu.svg';

const STEPS = {
  IDLE: 'IDLE',
  PACKAGE_TIER: 'PACKAGE_TIER',
  HEADCOUNT: 'HEADCOUNT',
  PAYMENT_1: 'PAYMENT_1', // Initial payment
  CAMERA: 'CAMERA',
  STUDIO_EDITOR: 'STUDIO_EDITOR',
  PAYMENT_2: 'PAYMENT_2', // Upsell payment
  LIVE_WALL_SHARE: 'LIVE_WALL_SHARE',
  THANK_YOU: 'THANK_YOU',
};

const SESSION_DURATION_MS = 5 * 60 * 1000;

function formatRemainingTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}


export default function App() {
  // Simple router for client gallery and admin
  const isGalleryRoute = window.location.pathname.startsWith('/gallery/');
  const sessionId = isGalleryRoute ? window.location.pathname.split('/gallery/')[1] : null;

  const isAdminRoute = window.location.pathname.startsWith('/admin');

  useEffect(() => {
    syncKioskSettings();
  }, []);

  if (isGalleryRoute && sessionId) {
    return <MobileGalleryView sessionId={sessionId} />;
  }

  if (isAdminRoute) {
    return <AdminDashboard />;
  }

  const [currentStep, setCurrentStep] = useState(STEPS.IDLE);

  const [orderDetails, setOrderDetails] = useState({
    tier: null,
    headCount: 1,
    basePrice: 0,
    totalPrice: 0,
    filter: FILTERS[0]
  });

  const [upsellDetails, setUpsellDetails] = useState({
    variants: [],
    upsellPrice: 0,
    upsellItems: []
  });

  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [remainingSessionMs, setRemainingSessionMs] = useState(SESSION_DURATION_MS);
  const [backendSession, setBackendSession] = useState(null);
  const [backendPayment, setBackendPayment] = useState(null);

  useEffect(() => {
    if (!sessionExpiresAt) return undefined;

    const updateRemaining = () => {
      const remaining = sessionExpiresAt - Date.now();
      if (remaining <= 0) {
        setRemainingSessionMs(0);
        resetApp();
        return;
      }
      setRemainingSessionMs(remaining);
    };

    updateRemaining();
    const timerId = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timerId);
  }, [sessionExpiresAt]);

  const resetApp = () => {
    setCurrentStep(STEPS.IDLE);
    setOrderDetails({
      tier: null,
      headCount: 1,
      basePrice: 0,
      totalPrice: 0,
      filter: FILTERS[0]
    });
    setUpsellDetails({
      variants: [],
      upsellPrice: 0,
      upsellItems: []
    });
    setCapturedPhotos([]);
    setSelectedPhotos([]);
    setSessionExpiresAt(null);
    setRemainingSessionMs(SESSION_DURATION_MS);
    setBackendSession(null);
    setBackendPayment(null);
  };

  const startTimedSession = ({ session, payment } = {}) => {
    setBackendSession(session || null);
    setBackendPayment(payment || null);
    setSessionExpiresAt(Date.now() + SESSION_DURATION_MS);
    setRemainingSessionMs(SESSION_DURATION_MS);
    setCurrentStep(STEPS.CAMERA);
  };

  const renderStep = () => {
    switch (currentStep) {
      case STEPS.IDLE:
        return <LandingPage onStart={() => {
          setOrderDetails(prev => ({
            ...prev,
            tier: { id: 'basic', name: 'Basic Session', poseLimit: 1, printLimit: 1, price: 35000 },
            headCount: null,
            basePrice: 35000,
            totalPrice: 35000
          }));
          setCurrentStep(STEPS.PAYMENT_1);
        }} />;

      case STEPS.PACKAGE_TIER:
        return (
          <PackageTierView
            onNext={(tier) => {
              setOrderDetails(prev => ({ ...prev, tier }));
              setCurrentStep(STEPS.HEADCOUNT);
            }}
            onBack={() => setCurrentStep(STEPS.IDLE)}
          />
        );

      case STEPS.HEADCOUNT:
        return (
          <HeadcountView
            orderDetails={orderDetails}
            onNext={({ headCount, basePrice, totalPrice }) => {
              setOrderDetails(prev => ({ ...prev, headCount, basePrice, totalPrice }));
              setCurrentStep(STEPS.PAYMENT_1);
            }}
            onBack={() => setCurrentStep(STEPS.PACKAGE_TIER)}
          />
        );

      case STEPS.PAYMENT_1:
        return (
          <PaymentView
            title="Mulai Sesi Photobooth"
            orderDetails={orderDetails}
            onPaymentSuccess={startTimedSession}
            onBack={() => setCurrentStep(STEPS.IDLE)}
            showFeatures={true}
          />
        );

      case STEPS.CAMERA:
        return (
          <CameraView
            filter={orderDetails.filter}
            poseLimit={5}
            onFinishSession={(photos) => {
              setCapturedPhotos(photos);
              setCurrentStep(STEPS.STUDIO_EDITOR);
            }}
          />
        );

      case STEPS.STUDIO_EDITOR:
        return (
          <StudioEditorView
            photos={capturedPhotos}
            onNext={(result) => {
              const upsellItems = result.upsellPrice > 0 ? [{ name: `Tambah ${result.variants.length - 1} Varian Cetak`, price: result.upsellPrice }] : [];
              const firstVariant = result.variants?.[0];
              setOrderDetails(prev => ({
                ...prev,
                layoutId: firstVariant?.template?.id,
                paperSize: firstVariant?.paperSize?.id,
                frameId: firstVariant?.frame?.id,
              }));
              setUpsellDetails({
                variants: result.variants,
                upsellPrice: result.upsellPrice,
                upsellItems
              });
              setSessionExpiresAt(null);

              if (result.upsellPrice > 0) {
                setCurrentStep(STEPS.PAYMENT_2);
              } else {
                setCurrentStep(STEPS.LIVE_WALL_SHARE);
              }
            }}
          />
        );

      case STEPS.PAYMENT_2:
        return (
          <PaymentView
            title="Pembayaran Tambahan (Upsell)"
            description="Anda menambahkan frame/template premium. Silakan selesaikan pembayaran."
            orderDetails={{
              backendSession,
              totalPrice: upsellDetails.upsellPrice,
              upsellDetails: upsellDetails.upsellItems
            }}
            onPaymentSuccess={({ payment } = {}) => {
              if (payment) setBackendPayment(payment);
              setCurrentStep(STEPS.LIVE_WALL_SHARE);
            }}
            onBack={() => setCurrentStep(STEPS.UPSELL)}
          />
        );

      case STEPS.LIVE_WALL_SHARE:
        return (
          <LiveWallView
            orderDetails={orderDetails}
            upsellDetails={upsellDetails}
            capturedPhotos={capturedPhotos}
            backendSession={backendSession}
            backendPayment={backendPayment}
            onNext={() => setCurrentStep(STEPS.THANK_YOU)}
          />
        );

      case STEPS.THANK_YOU:
        return <ThankYouScreen onReset={resetApp} />;

      default:
        return <LandingPage onStart={() => {
          setOrderDetails(prev => ({
            ...prev,
            tier: { id: 'basic', name: 'Basic Session', poseLimit: 20, printLimit: 1, price: 35000 },
            headCount: null,
            basePrice: 35000,
            totalPrice: 35000
          }));
          setCurrentStep(STEPS.PAYMENT_1);
        }} />;
    }
  };

  return (
    <main className="app-shell wizard-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={resetApp}>
          <img src={logoJiwalu} alt="Jiwalu Photobooth" style={{ height: '58px', width: 'auto' }} />
        </button>
        {sessionExpiresAt ? (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            border: '1px solid var(--line)',
            borderRadius: '999px',
            padding: '0.55rem 0.9rem',
            background: remainingSessionMs <= 30000 ? '#fee2e2' : 'rgba(255,255,255,0.78)',
            color: remainingSessionMs <= 30000 ? '#991b1b' : 'var(--ink)',
            fontWeight: 900,
            fontVariantNumeric: 'tabular-nums'
          }}>
            <span>Sisa sesi</span>
            <span>{formatRemainingTime(remainingSessionMs)}</span>
          </div>
        ) : null}
      </header>


      {renderStep()}
    </main>
  );
}
