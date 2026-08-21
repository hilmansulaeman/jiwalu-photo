export default function ThankYouScreen({ onReset }) {
  return (
    <section className="wizard-step" aria-label="Thank You">
      <div className="thank-you-content">
        <h1>Terima Kasih!</h1>
        <p className="subtitle" style={{ marginBottom: '2rem' }}>
          Semoga kamu menikmati momen di Urbanmenphoto.
        </p>
        
        <button className="primary-action" onClick={onReset}>
          Selesai (Kembali ke Awal)
        </button>

        <p className="reset-note">
          Sistem akan reset secara otomatis.
        </p>
      </div>
    </section>
  );
}
