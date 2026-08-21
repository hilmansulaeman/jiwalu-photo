import { useEffect, useState } from 'react';
import { composePhotoOutputs } from '../utils/photoConfig.js';
import { QRCodeSVG } from 'qrcode.react';
import { backendRequest, reportMonitoringError } from '../utils/backendApi.js';
import { getKioskSettings, getPublicGalleryBaseUrl } from '../utils/kioskConfig.js';
import { saveRecoverySession } from '../utils/sessionRecovery.js';
import { queueHardwarePrint } from '../utils/dslr.js';

const DUMMY_COMMENTS = [
  "Wah, seru banget eventnya! 🔥",
  "Keren banget fotonya, guys!",
  "Urbanmenphoto emang the best! 📸",
  "Seru abis, makasih fotonya!",
  "Aesthetic banget! ✨",
];

const getInitialComments = () => DUMMY_COMMENTS.slice(0, 2).map((text, index) => ({
  id: `initial-${index}`,
  text,
}));

const createLocalGalleryId = () => `local-${Date.now()}`;
const MAX_BACKEND_IMAGE_BYTES = 7.5 * 1024 * 1024;

const decodedDataUrlSize = (dataUrl = '') => {
  const base64 = String(dataUrl).split(',')[1] || '';
  if (!base64) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

const compactDataUrls = (items = []) => (
  items
    .filter((item) => typeof item === 'string' && item.startsWith('data:image/') && decodedDataUrlSize(item) > 0)
    .filter((item, index, all) => all.indexOf(item) === index)
);

const loadDataUrlImage = (dataUrl) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Gagal membaca gambar untuk upload backend.'));
  image.src = dataUrl;
});

const optimizeDataUrlForBackend = async (dataUrl, options = {}) => {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return '';
  if (dataUrl.startsWith('data:image/gif')) return dataUrl;

  const {
    maxWidth = 1400,
    maxHeight = 1800,
    quality = 0.82,
  } = options;

  try {
    const image = await loadDataUrlImage(dataUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return dataUrl;

    const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const optimized = canvas.toDataURL('image/jpeg', quality);
    return decodedDataUrlSize(optimized) < decodedDataUrlSize(dataUrl) ? optimized : dataUrl;
  } catch (err) {
    console.warn('Gagal mengoptimasi gambar untuk backend, memakai data asli.', err);
    return dataUrl;
  }
};

const optimizeDataUrlsForBackend = async (items = [], options = {}) => (
  Promise.all(items.map((item) => optimizeDataUrlForBackend(item, options)))
);

const createAnimatedGIF = (photos = []) => {
  const frames = photos.flatMap(photo => (
    photo.frames && photo.frames.length > 0 ? photo.frames : [photo.src]
  )).filter(Boolean).slice(0, 24);
  if (frames.length < 2) return Promise.resolve('');

  return new Promise((resolve) => {
    import('gifshot').then((module) => {
      const gifshot = module.default || module;
    gifshot.createGIF({
      images: frames,
      gifWidth: 640,
      gifHeight: 640,
      interval: 0.14,
      numFrames: frames.length,
      frameDuration: 1,
      sampleInterval: 10,
    }, (result) => {
      if (result?.error) {
        console.error('Failed to create GIF', result.errorMsg || result.error);
        resolve('');
        return;
      }
      resolve(result?.image || '');
    });
    }).catch((err) => {
      console.error('Failed to load GIF generator', err);
      resolve('');
    });
  });
};

export default function LiveWallView({ orderDetails, upsellDetails, capturedPhotos = [], backendSession, onNext }) {
  const [kioskSettings] = useState(() => getKioskSettings());
  const galleryBaseUrl = getPublicGalleryBaseUrl(kioskSettings);
  const galleryUrlFor = (id) => `${galleryBaseUrl}/gallery/${id}`;
  const [finalImages, setFinalImages] = useState([]);
  const [printImages, setPrintImages] = useState([]);
  const [printMeta, setPrintMeta] = useState(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [comments, setComments] = useState(getInitialComments);
  const [localGalleryId] = useState(createLocalGalleryId);
  const [downloadUrl, setDownloadUrl] = useState(() => galleryUrlFor(localGalleryId));
  const [waInput, setWaInput] = useState('');
  const [emailInput, setEmailInput] = useState(backendSession?.email || '');
  const [driveLinkInput, setDriveLinkInput] = useState('');
  const [gifFrameIndex, setGifFrameIndex] = useState(0);
  const [deliveryMessage, setDeliveryMessage] = useState('');
  const [backendSaveStatus, setBackendSaveStatus] = useState(backendSession?.id ? 'waiting' : 'local');
  const [backendSaveError, setBackendSaveError] = useState('');
  const [backendFinalizePayload, setBackendFinalizePayload] = useState(null);
  const [isConsentPending, setIsConsentPending] = useState(true);

  const persistRecoverySession = (updates = {}) => {
    saveRecoverySession({
      id: backendSession?.id || localGalleryId,
      backendSessionId: backendSession?.id || '',
      customerToken: backendSession?.customerToken || '',
      localGalleryId,
      downloadUrl,
      printImage: (printImages.length > 0 ? printImages : finalImages)[0] || '',
      finalImage: finalImages[0] || '',
      printMeta,
      status: backendSaveStatus,
      error: backendSaveError,
      createdAt: new Date().toISOString(),
      ...updates,
    });
  };

  const safePrint = async (trigger = 'manual', imageUrl = '') => {
    try {
      if (!kioskSettings.printerName) throw new Error('Pilih printer HiTi terlebih dahulu di Admin → Kiosk.');
      if (!imageUrl) throw new Error('Gambar hasil foto belum siap untuk dicetak.');
      await queueHardwarePrint({ printerName: kioskSettings.printerName, imageUrl, copies: 1 });
    } catch (err) {
      reportMonitoringError({
        category: 'print',
        sessionId: backendSession?.id || localGalleryId,
        message: err.message || 'Gagal membuka dialog print.',
        source: 'livewall',
        metadata: {
          trigger,
          printerName: kioskSettings.printerName || '',
          autoPrintEnabled: Boolean(kioskSettings.autoPrintEnabled),
        },
      });
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setComments(prev => {
        const newComment = {
          id: Date.now(),
          text: DUMMY_COMMENTS[Math.floor(Math.random() * DUMMY_COMMENTS.length)],
        };
        const next = [newComment, ...prev];
        return next.slice(0, 5);
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const previewGifFrames = capturedPhotos.flatMap((photo) => (
    photo.frames && photo.frames.length > 0 ? photo.frames : [photo.src]
  )).filter(Boolean);
  const previewGifSrc = previewGifFrames.length > 0
    ? previewGifFrames[gifFrameIndex % previewGifFrames.length]
    : capturedPhotos[0]?.src;

  useEffect(() => {
    if (previewGifFrames.length <= 1) return undefined;
    const interval = setInterval(() => {
      setGifFrameIndex(prev => prev + 1);
    }, 150);
    return () => clearInterval(interval);
  }, [previewGifFrames.length]);

  const saveBackendGallery = async (finalizePayload) => {
    if (!backendSession?.id || !backendSession?.customerToken || !finalizePayload) {
      setBackendSaveStatus('local');
      return null;
    }

    setBackendSaveStatus('saving');
    setBackendSaveError('');
    try {
      let finalized;
      try {
        finalized = await backendRequest(`/api/sessions/${backendSession.id}/finalize`, null, {
          method: 'POST',
          sessionToken: backendSession.customerToken,
          body: JSON.stringify(finalizePayload),
        });
      } catch (finalizeErr) {
        if (!finalizePayload.animatedImage) {
          throw finalizeErr;
        }
        console.warn('Backend finalize with GIF failed; retrying static images only.', finalizeErr);
        finalized = await backendRequest(`/api/sessions/${backendSession.id}/finalize`, null, {
          method: 'POST',
          sessionToken: backendSession.customerToken,
          body: JSON.stringify({ ...finalizePayload, animatedImage: '' }),
        });
      }

      const finalizedHasMedia = Boolean(
        finalized?.animatedImage?.url ||
        finalized?.finalImage?.url ||
        finalized?.printImage?.url ||
        finalized?.images?.length
      );
      if (!finalizedHasMedia) {
        throw new Error('Backend belum mengembalikan file foto.');
      }

      const publicDownloadUrl = galleryUrlFor(backendSession.id);
      const backendImages = Array.from(new Set([
        finalized.animatedImage?.url,
        finalized.finalImage?.url,
        finalized.printImage?.url,
        ...(finalized.images || []),
      ].filter(Boolean)));
      if (backendImages.length > 0) {
        const backendGalleryPayload = {
          ...finalized,
          id: backendSession.id,
          sessionId: backendSession.id,
          backendSessionId: backendSession.id,
          localGalleryId,
          images: backendImages,
          downloadUrl: publicDownloadUrl,
          createdAt: finalized.createdAt || new Date().toISOString(),
          finalizedAt: new Date().toISOString(),
        };
        try {
          window.localStorage.setItem(`potobox_gallery_${backendSession.id}`, JSON.stringify(backendGalleryPayload));
          window.localStorage.setItem(`potobox_gallery_${localGalleryId}`, JSON.stringify({
            ...backendGalleryPayload,
            id: localGalleryId,
          }));
        } catch (cacheErr) {
          console.warn('Failed to refresh backend gallery cache', cacheErr);
        }
      }
      setDownloadUrl(publicDownloadUrl);
      setBackendSaveStatus('saved');
      persistRecoverySession({
        status: 'saved',
        error: '',
        downloadUrl: publicDownloadUrl,
        backendDownloadUrl: finalized.downloadUrl || '',
        finalizedAt: new Date().toISOString(),
      });
      return finalized;
    } catch (upErr) {
      console.error("Backend finalize failed", upErr);
      reportMonitoringError({
        category: 'save_photo',
        sessionId: backendSession?.id || localGalleryId,
        message: upErr.message || 'Gagal menyimpan hasil ke backend.',
        source: 'livewall',
        metadata: {
          hasFinalImage: Boolean(finalizePayload.finalImage),
          hasPrintImage: Boolean(finalizePayload.printImage),
          hasAnimatedImage: Boolean(finalizePayload.animatedImage),
          imageCount: Array.isArray(finalizePayload.images) ? finalizePayload.images.length : 0,
        },
      });
      setBackendSaveStatus('failed');
      setBackendSaveError(upErr.message || 'Gagal menyimpan hasil ke backend.');
      persistRecoverySession({
        status: 'failed',
        error: upErr.message || 'Gagal menyimpan hasil ke backend.',
      });
      return null;
    }
  };

  const handleRetrySave = async () => {
    if (!backendFinalizePayload || backendSaveStatus === 'saving') return;
    await saveBackendGallery(backendFinalizePayload);
  };

  const isCustomerGalleryReady = backendSession?.id
    ? backendSaveStatus === 'saved'
    : backendSaveStatus === 'local';
  const shareUrl = driveLinkInput.trim() || downloadUrl;

  useEffect(() => {
    let active = true;

    async function processPhotos() {
      try {
        const images = [];
        const printImages = [];
        let firstPrintMeta = null;
        let animatedImage = '';
        // Loop over all created variants from studio editor
        for (const variant of upsellDetails.variants) {
          try {
            const output = await composePhotoOutputs({
              photos: variant.photos,
              filterId: orderDetails.filter.id,
              frameId: variant.frame.id,
              frame: variant.frame,
              frameConfig: variant.frameConfig,
              slotState: variant.slotState,
              modeId: variant.template.id,
              paperSizeId: variant.paperSize?.id,
            });
            const image = output.digitalImage;
            const printImage = output.printImage || image;
            if (!firstPrintMeta && output.printMeta) {
              firstPrintMeta = output.printMeta;
            }
            if (image) {
              images.push(image);
            }
            if (printImage) {
              printImages.push(printImage);
            }
            if (active && image) {
              setFinalImages([...images]);
            }
          } catch (composeErr) {
            console.error('Failed to compose photo output', composeErr);
          }
        }

        if (active) {
          const originalImages = capturedPhotos.map(photo => photo.src).filter(Boolean);
          if (images.length === 0 && originalImages.length > 0) {
            images.push(originalImages[0]);
            printImages.push(originalImages[0]);
          }
          animatedImage = await createAnimatedGIF(capturedPhotos);
          if (decodedDataUrlSize(animatedImage) > MAX_BACKEND_IMAGE_BYTES) {
            console.warn('Animated GIF is too large for backend upload; keeping static gallery images.');
            animatedImage = '';
          }
          setFinalImages(images);
          setPrintImages(printImages);
          setPrintMeta(firstPrintMeta);
          const primaryPrintImage = (printImages.length > 0 ? printImages : images)[0] || '';
          try {
            const localImages = [
              animatedImage,
              ...images,
              ...capturedPhotos.map(photo => photo.src).filter(Boolean),
            ].filter(Boolean);
            const localGalleryPayload = {
              id: localGalleryId,
              images: localImages,
              createdAt: new Date().toISOString(),
            };
            window.localStorage.setItem(`potobox_gallery_${localGalleryId}`, JSON.stringify(localGalleryPayload));
            if (backendSession?.id) {
              window.localStorage.setItem(`potobox_gallery_${backendSession.id}`, JSON.stringify({
                ...localGalleryPayload,
                id: backendSession.id,
                localGalleryId,
                backendSessionId: backendSession.id,
              }));
            }
            setDownloadUrl(galleryUrlFor(localGalleryId));
            saveRecoverySession({
              id: backendSession?.id || localGalleryId,
              backendSessionId: backendSession?.id || '',
              customerToken: backendSession?.customerToken || '',
              localGalleryId,
              downloadUrl: galleryUrlFor(localGalleryId),
              printImage: primaryPrintImage,
              finalImage: images[0] || primaryPrintImage,
              printMeta: firstPrintMeta,
              status: backendSession?.id ? 'waiting' : 'local',
              error: '',
              createdAt: new Date().toISOString(),
            });
          } catch (storageErr) {
            console.error('Failed to save local gallery preview', storageErr);
          }
          setIsProcessing(false);
          if (kioskSettings.autoPrintEnabled) {
            const printDelay = Math.max(0, Number(kioskSettings.printDelaySeconds || 0)) * 1000;
            setTimeout(() => {
              safePrint('auto', primaryPrintImage);
            }, printDelay);
          }

          if (backendSession?.id && backendSession?.customerToken) {
            try {
              const firstVariant = upsellDetails.variants?.[0];
              const [backendFinalImages, backendPrintImages, backendOriginalImages] = await Promise.all([
                optimizeDataUrlsForBackend(images, { maxWidth: 1400, maxHeight: 2200, quality: 0.84 }),
                optimizeDataUrlsForBackend(printImages, { maxWidth: 1400, maxHeight: 2200, quality: 0.84 }),
                optimizeDataUrlsForBackend(originalImages, { maxWidth: 1280, maxHeight: 1280, quality: 0.8 }),
              ]);
              const galleryImages = compactDataUrls([
                ...backendFinalImages,
                ...backendPrintImages.filter((image, index) => image && image !== backendFinalImages[index]),
                ...backendOriginalImages,
              ]).slice(0, 16);
              const primaryImage = compactDataUrls([backendFinalImages[0], backendPrintImages[0], backendOriginalImages[0]])[0] || '';
              const printImage = compactDataUrls([backendPrintImages[0], primaryImage])[0] || '';
              const finalizePayload = {
                layoutId: firstVariant?.template?.id || orderDetails.layoutId,
                paperSize: firstVariant?.paperSize?.id || orderDetails.paperSize,
                frameId: firstVariant?.frame?.id || orderDetails.frameId,
                finalImage: primaryImage,
                printImage,
                animatedImage,
                images: galleryImages,
              };
              saveRecoverySession({
                id: backendSession.id,
                backendSessionId: backendSession.id,
                customerToken: backendSession.customerToken,
                localGalleryId,
                downloadUrl: galleryUrlFor(localGalleryId),
                printImage: primaryPrintImage,
                finalImage: images[0] || primaryPrintImage,
                printMeta: firstPrintMeta,
                finalizePayload,
                status: 'saving',
                error: '',
                createdAt: new Date().toISOString(),
              });
              console.info('Finalizing backend gallery', {
                images: finalizePayload.images.length,
                finalImageBytes: decodedDataUrlSize(finalizePayload.finalImage),
                printImageBytes: decodedDataUrlSize(finalizePayload.printImage),
                animatedImageBytes: decodedDataUrlSize(finalizePayload.animatedImage),
                totalImageBytes: compactDataUrls([
                  finalizePayload.finalImage,
                  finalizePayload.printImage,
                  finalizePayload.animatedImage,
                  ...finalizePayload.images,
                ]).reduce((total, image) => total + decodedDataUrlSize(image), 0),
              });
              setBackendFinalizePayload(finalizePayload);
              await saveBackendGallery(finalizePayload);
            } catch (upErr) {
              console.error("Backend finalize failed", upErr);
              setBackendSaveStatus('failed');
              setBackendSaveError(upErr.message || 'Gagal menyiapkan hasil untuk backend.');
              saveRecoverySession({
                id: backendSession.id,
                backendSessionId: backendSession.id,
                customerToken: backendSession.customerToken,
                localGalleryId,
                downloadUrl: galleryUrlFor(localGalleryId),
                printImage: primaryPrintImage,
                finalImage: images[0] || primaryPrintImage,
                printMeta: firstPrintMeta,
                status: 'failed',
                error: upErr.message || 'Gagal menyiapkan hasil untuk backend.',
                createdAt: new Date().toISOString(),
              });
            }
          } else {
            setBackendSaveStatus('local');
          }
        }
      } catch (err) {
        console.error('Failed to process photo', err);
        if (active) setIsProcessing(false);
      }
    }

    processPhotos();

    return () => {
      active = false;
    };
  }, [orderDetails, upsellDetails, backendSession?.id, kioskSettings.autoPrintEnabled, kioskSettings.printDelaySeconds]);

  const handleSendWhatsApp = async (e) => {
    e.preventDefault();
    const normalizedNumber = waInput.replace(/[^\d]/g, '').replace(/^0/, '62');
    if (!normalizedNumber) return;
    setDeliveryMessage('');
    if (!isCustomerGalleryReady) {
      setDeliveryMessage('Tunggu sampai status hasil tersimpan, lalu kirim ulang.');
      return;
    }
    if (backendSession?.id) {
      try {
        await backendRequest(`/api/sessions/${backendSession.id}/send-link`, null, {
          method: 'POST',
          sessionToken: backendSession.customerToken,
          body: JSON.stringify({
            channel: 'whatsapp',
            recipient: normalizedNumber,
            downloadUrl: shareUrl,
          }),
        });
        setDeliveryMessage('Link WhatsApp tercatat di backend.');
      } catch (err) {
        reportMonitoringError({
          category: 'whatsapp',
          sessionId: backendSession?.id || localGalleryId,
          message: err.message || 'Gagal mencatat link WhatsApp.',
          source: 'livewall',
          metadata: {
            recipient: normalizedNumber,
            downloadUrl: shareUrl,
          },
        });
        setDeliveryMessage(err.message);
      }
    }
    const message = `Halo! Ini link hasil foto Urbanmenphoto kamu:\n${shareUrl}\n\nLink aktif selama 7 hari.`;
    window.open(`https://wa.me/${normalizedNumber}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    setDeliveryMessage('');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setDeliveryMessage('Format email tidak valid.');
      return;
    }
    if (!isCustomerGalleryReady) {
      setDeliveryMessage('Tunggu sampai status hasil tersimpan, lalu kirim ulang.');
      return;
    }
    if (!backendSession?.id) {
      setDeliveryMessage('Email hanya bisa dicatat setelah sesi tersimpan di backend.');
      return;
    }

    try {
      const message = await backendRequest(`/api/sessions/${backendSession.id}/send-link`, null, {
        method: 'POST',
        sessionToken: backendSession.customerToken,
        body: JSON.stringify({
          channel: 'email',
          recipient: email,
          downloadUrl: shareUrl,
        }),
      });
      setDeliveryMessage(message?.status === 'sent'
        ? 'Link hasil foto berhasil dikirim ke email.'
        : 'Link email tercatat. Isi SMTP backend agar email terkirim otomatis.');
    } catch (err) {
      reportMonitoringError({
        category: 'email',
        sessionId: backendSession?.id || localGalleryId,
        message: err.message || 'Gagal mencatat link email.',
        source: 'livewall',
        metadata: {
          recipient: email,
          downloadUrl: shareUrl,
        },
      });
      setDeliveryMessage(err.message);
    }
  };

  if (isProcessing) {
    const processingPreview = finalImages[0];

    return (
      <div style={{ background: '#fcfaf6', minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '2rem', color: '#1f2937', position: 'fixed', inset: 0, zIndex: 100, overflowY: 'auto' }}>


        {/* Center Content Container */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '4rem', margin: 'auto', width: '100%', maxWidth: '1000px', padding: '2rem 0' }}>

          {/* Left: Polaroid */}
          <div style={{ flex: '0 1 400px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 1rem', color: '#ef4444', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', paddingLeft: '1rem' }}>
              <span style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 8px #ef4444' }}></span>
              LIVE EVENT WALL
            </h3>

            <div style={{ background: 'white', padding: '0.8rem', borderRadius: '12px', transform: 'rotate(-2deg)', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}>
              {processingPreview ? (
                <img src={processingPreview} style={{ width: '100%', maxHeight: '520px', objectFit: 'contain', display: 'block', borderRadius: '6px' }} alt="Final photobooth preview" />
              ) : (
                <div style={{ width: '100%', aspectRatio: '2/3', display: 'grid', placeItems: 'center', borderRadius: '8px', background: '#fff7ed', color: '#2c8ed6', fontWeight: 900 }}>
                  Menyiapkan hasil...
                </div>
              )}
            </div>
          </div>

          {/* Right: Comments */}
          <div style={{ flex: '0 1 400px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {comments.slice(0, 2).map((c, i) => (
              <div key={c.id} style={{
                background: '#bae0f9', // light orange
                padding: '1rem 1.5rem',
                borderRadius: '12px',
                animation: 'floatIn 0.3s ease-out',
                opacity: 1 - (i * 0.2),
                color: '#9a3412', // dark orange text
                fontSize: '0.95rem',
                boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                fontWeight: '500'
              }}>
                {c.text}
              </div>
            ))}
          </div>

        </div>

        {/* Bottom Progress */}
        <div style={{ margin: 'auto auto 0 auto', width: '100%', maxWidth: '640px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ color: '#9ca3af', fontSize: '1.25rem', fontWeight: 700, fontStyle: 'italic', textAlign: 'center' }}>
            Memproses & mencetak karya Anda... ⏳
          </div>
          {/* Progress bar wrapper */}
          <div style={{ width: '100%', height: '28px', background: '#e5e7eb', borderRadius: '999px', overflow: 'hidden', position: 'relative' }}>
            {/* Progress bar fill (simulated via animation) */}
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0,
              background: '#40a3eb',
              borderRadius: '999px',
              animation: 'progressFill 4s ease-out forwards'
            }}></div>
          </div>
        </div>

        </div>
      </div>
    );
  }

  if (isConsentPending) {
    return (
      <div style={{ background: '#fcfaf6', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ background: 'white', borderRadius: '24px', padding: '3rem', display: 'flex', flexWrap: 'wrap', gap: '3rem', maxWidth: '1000px', width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}>
          {/* Left: Photos Grid */}
          <div style={{ width: '320px', flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {capturedPhotos.slice(0, 6).map((p, i) => (
              <img key={i} src={p.src} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: '8px' }} alt={`Preview ${i}`} />
            ))}
          </div>

          {/* Right: Consent Content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: '300px' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0 0 0.5rem', color: '#1f2937' }}>Photo Publication Consent</h2>
            <p style={{ color: '#4b5563', margin: '0 0 2rem', fontSize: '1.1rem' }}>Can we use your photos for publication?</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ width: '24px', height: '24px', background: '#e0f2fe', color: '#40A3EB', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>✓</div>
                <span style={{ color: '#4b5563', fontSize: '1rem', lineHeight: '1.4' }}>May be featured on our social media or website</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ width: '24px', height: '24px', background: '#e0f2fe', color: '#40A3EB', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>✓</div>
                <span style={{ color: '#4b5563', fontSize: '1rem', lineHeight: '1.4' }}>Let your unique style and creativity inspire others to try our photobooth experience</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ width: '24px', height: '24px', background: '#e0f2fe', color: '#40A3EB', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>✓</div>
                <span style={{ color: '#4b5563', fontSize: '1rem', lineHeight: '1.4' }}>No personal information will be shared publicly</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <button
                onClick={() => setIsConsentPending(false)}
                style={{ background: '#40A3EB', color: 'white', border: 'none', padding: '1rem', borderRadius: '30px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', transition: 'opacity 0.2s' }}
                onMouseOver={(e) => e.target.style.opacity = 0.9}
                onMouseOut={(e) => e.target.style.opacity = 1}
              >
                Yes, I'd love to!
              </button>
              <button
                onClick={() => setIsConsentPending(false)}
                style={{ background: 'white', color: '#40A3EB', border: '2px solid #40A3EB', padding: '1rem', borderRadius: '30px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', transition: 'background 0.2s' }}
                onMouseOver={(e) => e.target.style.background = '#f0f9ff'}
                onMouseOut={(e) => e.target.style.background = 'white'}
              >
                No, thanks
              </button>
            </div>

            <p style={{ color: '#9ca3af', fontSize: '0.85rem', textAlign: 'center', margin: '1.5rem 0 0', lineHeight: '1.4' }}>
              You can change this preference anytime by contacting our support team<br/>at dreamboothstudio.com.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const primaryPrintImage = (printImages.length > 0 ? printImages : finalImages)[0];
  const saveStatusInfo = {
    waiting: {
      label: 'Menunggu hasil',
      detail: 'Hasil sedang disiapkan sebelum dikirim ke backend.',
      background: 'rgba(148, 163, 184, 0.16)',
      border: 'rgba(148, 163, 184, 0.35)',
      color: '#cbd5e1',
    },
    saving: {
      label: 'Menyimpan hasil...',
      detail: 'Jangan tutup layar ini sampai status berubah menjadi tersimpan.',
      background: 'rgba(249, 115, 22, 0.16)',
      border: 'rgba(249, 115, 22, 0.45)',
      color: '#bae0f9',
    },
    saved: {
      label: 'Hasil tersimpan',
      detail: 'QR dan link sudah memakai gallery backend customer.',
      background: 'rgba(34, 197, 94, 0.16)',
      border: 'rgba(34, 197, 94, 0.45)',
      color: '#bbf7d0',
    },
    failed: {
      label: 'Gagal menyimpan',
      detail: backendSaveError || 'Tekan retry untuk menyimpan ulang tanpa foto ulang.',
      background: 'rgba(239, 68, 68, 0.16)',
      border: 'rgba(239, 68, 68, 0.45)',
      color: '#fecaca',
    },
    local: {
      label: 'Tersimpan lokal',
      detail: 'Backend belum aktif untuk sesi ini, link hanya tersedia di perangkat ini.',
      background: 'rgba(148, 163, 184, 0.16)',
      border: 'rgba(148, 163, 184, 0.35)',
      color: '#cbd5e1',
    },
  }[backendSaveStatus] || {};

  return (
    <div className="live-wall-print-root" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#fcfaf6', color: '#1f2937' }}>
      {/* Hidden Print Area */}
      <div className="print-area">
        {printMeta && (
          <style>{`
            @page {
              size: ${printMeta.inchWidth}in ${printMeta.inchHeight}in;
              margin: 0;
            }
          `}</style>
        )}
        {primaryPrintImage && (
          <img
            src={primaryPrintImage}
            alt="Print utama"
            className="print-output-image"
            style={{
              width: printMeta ? `${printMeta.inchWidth}in` : '4in',
              height: printMeta ? `${printMeta.inchHeight}in` : '6in',
            }}
          />
        )}
      </div>

      {/* Main Content Area */}
      <main style={{ flex: 1, position: 'relative', width: '100%', overflow: 'hidden', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>

        {/* Tiled background */}
        <div style={{ position: 'absolute', inset: -20, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', opacity: 0.15, filter: 'blur(4px)' }}>
          {Array(15).fill(capturedPhotos[0]?.src).map((src, i) => (
            <img key={i} src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="bg" />
          ))}
        </div>

        {/* Glassmorphism Card */}
        <div style={{
          position: 'relative',
          background: 'rgba(20, 20, 20, 0.65)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '32px',
          padding: '2.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '3rem',
          maxWidth: '1100px',
          width: '100%',
          zIndex: 10,
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
        }}>

          {/* Col 1: Photostrip */}
          <div style={{ width: '220px', flexShrink: 0 }}>
            <img src={finalImages[0] || capturedPhotos[0]?.src} style={{ width: '100%', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} alt="Photostrip" />
          </div>

          {/* Col 2: GIF & Combo */}
          <div style={{ width: '260px', display: 'flex', flexDirection: 'column', gap: '1.5rem', flexShrink: 0 }}>
            {/* GIF Preview */}
            <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
              <img src={previewGifSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="GIF Preview" />
              <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', color: '#ef4444', fontSize: '0.65rem', padding: '4px 10px', borderRadius: '999px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 6, height: 6, background: '#ef4444', borderRadius: '50%' }}></span> GIF
              </div>
            </div>

            {/* Combo Preview */}
            <div style={{ position: 'relative', width: '100%', background: 'white', padding: '6px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
              <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', color: '#10b981', fontSize: '0.65rem', padding: '4px 10px', borderRadius: '999px', fontWeight: 'bold', zIndex: 10, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 6, height: 6, background: '#10b981', borderRadius: '50%' }}></span> PHOTO STRIP COMBO
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                {capturedPhotos.slice(0, 8).map((p, i) => (
                  <img key={i} src={p.src} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: '4px' }} alt={`Combo ${i}`} />
                ))}
              </div>
            </div>
          </div>

          {/* Col 3: Details & Actions */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white', paddingLeft: '1rem', minWidth: '280px' }}>
            <p style={{ fontSize: '0.85rem', textAlign: 'center', color: '#9ca3af', marginBottom: '1.5rem', maxWidth: '80%', lineHeight: '1.5' }}>
              Use your phone to scan this QR code and access your photos anytime.
            </p>

            <div style={{ background: 'white', padding: '1.2rem', borderRadius: '24px', marginBottom: '1.5rem', width: '190px', height: '190px', display: 'grid', placeItems: 'center' }}>
              {isCustomerGalleryReady ? (
                <QRCodeSVG value={shareUrl} size={150} />
              ) : (
                <div style={{ width: 150, height: 150, borderRadius: '18px', background: '#f3f4f6', color: '#64748b', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '1rem', fontWeight: 900, fontSize: '0.78rem', lineHeight: 1.35 }}>
                  QR siap setelah hasil tersimpan
                </div>
              )}
            </div>

            <div style={{
              width: '100%',
              maxWidth: '320px',
              marginBottom: '1.25rem',
              padding: '0.85rem 1rem',
              borderRadius: '14px',
              border: `1px solid ${saveStatusInfo.border}`,
              background: saveStatusInfo.background,
              color: saveStatusInfo.color,
              textAlign: 'center',
              boxShadow: backendSaveStatus === 'saving' ? '0 0 24px rgba(249, 115, 22, 0.12)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 900, fontSize: '0.9rem' }}>
                {backendSaveStatus === 'saving' && (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#40a3eb', boxShadow: '0 0 10px #40a3eb', display: 'inline-block' }} />
                )}
                {saveStatusInfo.label}
              </div>
              <p style={{ margin: '0.35rem 0 0', color: '#9ca3af', fontSize: '0.74rem', lineHeight: 1.4 }}>
                {saveStatusInfo.detail}
              </p>
              {backendSaveStatus === 'failed' && (
                <button
                  type="button"
                  onClick={handleRetrySave}
                  disabled={!backendFinalizePayload}
                  style={{
                    marginTop: '0.75rem',
                    width: '100%',
                    border: 'none',
                    borderRadius: '999px',
                    padding: '0.7rem 1rem',
                    background: backendFinalizePayload ? '#40a3eb' : '#374151',
                    color: 'white',
                    fontWeight: 900,
                    cursor: backendFinalizePayload ? 'pointer' : 'not-allowed',
                  }}
                >
                  Retry Save
                </button>
              )}
            </div>

            <p style={{ fontSize: '0.7rem', color: '#6b7280', letterSpacing: '2px', fontWeight: 'bold', marginBottom: '0.5rem' }}>OR VISIT</p>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1.3rem', maxWidth: '320px', overflowWrap: 'anywhere', textAlign: 'center' }}>{shareUrl}</p>

            <form onSubmit={handleSendEmail} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', width: '100%', maxWidth: '280px', marginBottom: '0.8rem' }}>
              <input
                type="email"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                placeholder="Email customer"
                style={{
                  width: '100%',
                  background: '#111827',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.12)',
                  padding: '1rem',
                  borderRadius: '12px',
                  fontWeight: 'bold',
                  outline: 'none'
                }}
              />
              <button type="submit" disabled={!isCustomerGalleryReady} style={{ background: isCustomerGalleryReady ? '#40a3eb' : '#374151', color: 'white', border: 'none', padding: '1rem', borderRadius: '999px', fontWeight: 'bold', cursor: isCustomerGalleryReady ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                KIRIM VIA EMAIL
              </button>
              {deliveryMessage && <div style={{ color: '#9ca3af', fontSize: '0.75rem', textAlign: 'center' }}>{deliveryMessage}</div>}
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', width: '100%', maxWidth: '280px' }}>
              <button onClick={onNext} style={{ background: 'white', color: 'black', border: 'none', padding: '1rem', borderRadius: '999px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                📸 TAKE PHOTO AGAIN
              </button>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.8rem' }}>IG</div>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.8rem' }}>TK</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
