import { useState } from 'react';
import { logTransaction } from '../utils/transactionLogger.js';
import { backendRequest, reportMonitoringError } from '../utils/backendApi.js';

export default function PaymentView({ orderDetails, onPaymentSuccess, onBack, title = "PEMBAYARAN", description = "Scan QRIS di bawah ini menggunakan aplikasi e-wallet Anda", showFeatures = false }) {
  const [isSimulating, setIsSimulating] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [customerEmail] = useState(orderDetails.email || orderDetails.backendSession?.email || '');
  const [voucherCode, setVoucherCode] = useState('');
  const paymentMode = String(import.meta.env.VITE_PAYMENT_MODE || import.meta.env.VITE_MIDTRANS_ENVIRONMENT || 'sandbox').toLowerCase();
  const isDummyPayment = paymentMode === 'dummy';
  const normalizedEmail = customerEmail.trim().toLowerCase();
  const currentTotal = orderDetails.totalPrice || 0;

  const handleSkipPayment = async () => {
    setIsSimulating(true);
    let pkgName = orderDetails.tier?.name || 'Package';
    if (showFeatures) pkgName = 'Basic Package';
    else if (orderDetails.upsellDetails) pkgName = `Upsell: ${orderDetails.upsellDetails.map(u => u.name).join(', ')}`;
    
    try {
      const session = orderDetails.backendSession || await backendRequest('/api/sessions', null, {
        method: 'POST',
        body: JSON.stringify({
          status: 'created',
          email: normalizedEmail || null,
          paperSize: orderDetails.paperSize,
          layoutId: orderDetails.layoutId,
          frameId: orderDetails.frameId,
        }),
      });
      
      onPaymentSuccess({
        session,
        payment: { status: 'settled', amount: currentTotal },
        midtransResult: { transaction_status: 'settlement', payment_type: 'dummy' },
      });
    } catch (err) {
      setPaymentError(err.message || 'Gagal skip pembayaran.');
      setIsSimulating(false);
    }
  };

  const loadMidtransSnap = () => new Promise((resolve, reject) => {
    if (window.snap) {
      resolve(window.snap);
      return;
    }
    const clientKey = import.meta.env.VITE_MIDTRANS_CLIENT_KEY;
    if (!clientKey) {
      reject(new Error('Midtrans client key belum dikonfigurasi.'));
      return;
    }
    const environment = String(import.meta.env.VITE_MIDTRANS_ENVIRONMENT || 'sandbox').toLowerCase();
    const script = document.createElement('script');
    script.src = environment === 'production'
      ? 'https://app.midtrans.com/snap/snap.js'
      : 'https://app.sandbox.midtrans.com/snap/snap.js';
    script.setAttribute('data-client-key', clientKey);
    script.onload = () => window.snap ? resolve(window.snap) : reject(new Error('Midtrans Snap gagal dimuat.'));
    script.onerror = () => reject(new Error('Gagal memuat Midtrans Snap.js.'));
    document.body.appendChild(script);
  });

  const handleMidtransPayment = async () => {
    setIsSimulating(true);
    setPaymentError('');

    let pkgName = orderDetails.tier?.name || 'Package';
    if (showFeatures) {
       pkgName = 'Basic Package';
    } else if (orderDetails.upsellDetails) {
       pkgName = `Upsell: ${orderDetails.upsellDetails.map(u => u.name).join(', ')}`;
    }

    try {
      if (normalizedEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
        throw new Error('Format email tidak valid.');
      }

      const session = orderDetails.backendSession || await backendRequest('/api/sessions', null, {
        method: 'POST',
        body: JSON.stringify({
          status: 'created',
          email: normalizedEmail || null,
          paperSize: orderDetails.paperSize,
          layoutId: orderDetails.layoutId,
          frameId: orderDetails.frameId,
        }),
      });
      if (orderDetails.backendSession?.id && normalizedEmail && orderDetails.backendSession.email !== normalizedEmail) {
        await backendRequest(`/api/sessions/${orderDetails.backendSession.id}`, null, {
          method: 'PATCH',
          sessionToken: orderDetails.backendSession.customerToken,
          body: JSON.stringify({ email: normalizedEmail }),
        });
        session.email = normalizedEmail;
      }
      if (isDummyPayment) {
        const payment = await backendRequest('/api/payments', null, {
          method: 'POST',
          sessionToken: session.customerToken,
          body: JSON.stringify({
            sessionId: session.id,
            provider: 'qris-simulation',
            amount: currentTotal,
            currency: 'IDR',
            voucherCode: voucherCode.trim() || undefined,
          }),
        });
        logTransaction({
          amount: currentTotal,
          packageName: pkgName,
          method: 'Midtrans Dummy',
          status: 'Success'
        });
        onPaymentSuccess({
          session,
          payment,
          midtransResult: {
            transaction_status: 'settlement',
            payment_type: 'dummy',
          },
        });
        return;
      }

      let payment = await backendRequest('/api/payments', null, {
        method: 'POST',
        sessionToken: session.customerToken,
        body: JSON.stringify({
          sessionId: session.id,
          provider: 'midtrans',
          amount: currentTotal,
          currency: 'IDR',
          voucherCode: voucherCode.trim() || undefined,
        }),
      });

      if (payment.status === 'paid' || payment.provider === 'free') {
        logTransaction({
          amount: currentTotal,
          packageName: pkgName,
          method: 'Free',
          status: 'Success'
        });
        onPaymentSuccess({
          session,
          payment,
          midtransResult: {
            transaction_status: 'settlement',
            payment_type: 'free',
          },
        });
        return;
      }

      if (!payment.snapToken) {
        throw new Error('Backend tidak mengembalikan Midtrans Snap token.');
      }

      const snap = await loadMidtransSnap();
      const confirmPayment = async (result, fallbackStatus = '') => {
        const transactionStatus = result?.transaction_status || fallbackStatus;
        return backendRequest(`/api/payments/${payment.id}/confirm`, null, {
          method: 'POST',
          sessionToken: session.customerToken,
          body: JSON.stringify({
            order_id: result?.order_id || payment.id,
            transaction_status: transactionStatus,
            fraud_status: result?.fraud_status || '',
            status_code: result?.status_code || '',
            gross_amount: result?.gross_amount ? String(result.gross_amount) : String(currentTotal),
            payment_type: result?.payment_type || '',
            transaction_id: result?.transaction_id || '',
          }),
        });
      };
      snap.pay(payment.snapToken, {
        onSuccess: async (result) => {
          logTransaction({
            amount: currentTotal,
            packageName: pkgName,
            method: 'Midtrans',
            status: result?.transaction_status || 'Success'
          });
          try {
            payment = await confirmPayment(result, 'settlement');
          } catch (confirmErr) {
            console.warn('Payment confirmation failed; falling back to payment fetch.', confirmErr);
            try {
              payment = await backendRequest(`/api/payments/${payment.id}`, null);
            } catch {
              // Webhook may still be processing; continue with the original payment data.
            }
          }
          onPaymentSuccess({ session, payment, midtransResult: result });
        },
        onPending: async (result) => {
          try {
            payment = await confirmPayment(result, 'pending');
          } catch (confirmErr) {
            console.warn('Pending payment confirmation failed.', confirmErr);
          }
          setIsSimulating(false);
          setPaymentError('Pembayaran masih pending. Selesaikan pembayaran dari aplikasi Anda.');
          console.info('Midtrans pending payment:', result);
        },
        onError: async (result) => {
          reportMonitoringError({
            category: 'payment',
            sessionId: session.id,
            message: 'Midtrans payment error.',
            source: 'payment_view',
            metadata: { result, paymentId: payment.id },
          });
          try {
            payment = await confirmPayment(result, 'failure');
          } catch (confirmErr) {
            console.warn('Failed payment confirmation failed.', confirmErr);
          }
          setIsSimulating(false);
          setPaymentError('Pembayaran gagal. Silakan coba lagi.');
        },
        onClose: () => {
          setIsSimulating(false);
          setPaymentError('Popup pembayaran ditutup sebelum selesai.');
        }
      });
    } catch (err) {
      reportMonitoringError({
        category: 'payment',
        sessionId: orderDetails.backendSession?.id || '',
        message: err.message || 'Gagal memproses payment.',
        source: 'payment_view',
        metadata: {
          amount: currentTotal,
          paperSize: orderDetails.paperSize || '',
          layoutId: orderDetails.layoutId || '',
          frameId: orderDetails.frameId || '',
        },
      });
      setIsSimulating(false);
      setPaymentError(err.message);
    }
  };

  if (isSimulating) {
    return (
      <div className="wizard-step payment-success">
        <div className="success-icon">...</div>
        <h2>Membuka Pembayaran</h2>
        <p className="subtitle">Tunggu sebentar, Midtrans sedang disiapkan...</p>
      </div>
    );
  }

  return (
    <section className="wizard-step payment-step" aria-label="Payment">
      <header className="payment-header">
        {onBack && <button className="payment-back-button" onClick={onBack}>← Back</button>}
        <div className="payment-title-block">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>

      <div className="payment-card">
        <h3>Ringkasan Pesanan</h3>

        {showFeatures ? (
          <div className="payment-feature-box">
            <div>Maks. 5 orang</div>
            <div>5 menit sesi</div>
            <div>QR digital (send email/QR Download foto, link aktif 7 hari)</div>
          </div>
        ) : (
          <div className="payment-detail-list">
            {orderDetails.tier && (
              <div className="summary-row">
                <span>Paket {orderDetails.tier.name}</span>
                <span>Rp {orderDetails.tier.pricePerHead?.toLocaleString('id-ID')} / org</span>
              </div>
            )}

            {orderDetails.headCount && (
              <div className="summary-row">
                <span>Jumlah Orang</span>
                <span>{orderDetails.headCount}x</span>
              </div>
            )}

            {orderDetails.upsellDetails && orderDetails.upsellDetails.map((item, idx) => (
              <div className="summary-row" key={idx}>
                <span>{item.name}</span>
                <span>Rp {item.price.toLocaleString('id-ID')}</span>
              </div>
            ))}
          </div>
        )}

        <div className="payment-total-row">
          <span>Total Bayar</span>
          <span>Rp {currentTotal.toLocaleString('id-ID')}</span>
        </div>

        <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Kode Voucher (Opsional)</label>
          <input
            type="text"
            value={voucherCode}
            onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
            placeholder="Masukkan kode..."
            style={{ width: '100%', padding: '0.8rem', borderRadius: '999px', border: '1px solid #cbd5e1', fontSize: '1rem', textTransform: 'uppercase' }}
          />
          {voucherCode && <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Diskon akan diterapkan saat lanjut bayar.</p>}
        </div>

        <button className="primary-action payment-action-button" onClick={handleMidtransPayment}>
          {isDummyPayment ? 'Simulasikan Bayar Berhasil' : 'Bayar Sekarang'}
        </button>
        <button 
          onClick={handleSkipPayment} 
          style={{ width: '100%', padding: '0.8rem', marginTop: '1rem', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '999px', fontWeight: 800, cursor: 'pointer' }}
        >
          Lewati Pembayaran (Testing)
        </button>
        {paymentError && (
          <p className="payment-error">{paymentError}</p>
        )}
      </div>
    </section>
  );
}
