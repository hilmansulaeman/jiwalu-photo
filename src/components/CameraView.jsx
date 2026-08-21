import { useEffect, useRef, useState, useCallback } from 'react';
import { captureVideoFrame, getCameraStreamForProfile, stopStream } from '../utils/camera.js';
import { getCameraProfiles, getKioskSettings, saveKioskSettings } from '../utils/kioskConfig.js';
import { captureDslrPhoto, listDslrCameras } from '../utils/dslr.js';
import logoJiwalu from '../assets/logo-jiwalu.svg';

const RetakeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

const CameraIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 32, height: 32, color: '#374151' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
  </svg>
);

const UpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: 14, height: 14, color: '#fff' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
  </svg>
);

const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

export default function CameraView({ filter, poseLimit = 5, onFinishSession }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const pickerVideoRefs = useRef({});
  const pickerStreamsRef = useRef({});
  const [cameraSettings] = useState(() => getKioskSettings());
  const [cameraProfiles] = useState(() => getCameraProfiles(getKioskSettings()));
  const [activeCameraId, setActiveCameraId] = useState(() => getCameraProfiles(getKioskSettings())[0]?.id || 'camera-1');
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState('');

  const [flash, setFlash] = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [isRecordingBurst, setIsRecordingBurst] = useState(false);
  const [isAutoCapturing, setIsAutoCapturing] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState(null);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [playbackFrameIdx, setPlaybackFrameIdx] = useState(0);
  // Customer chooses an angle before the first shot and after each completed shot.
  const [isCameraPickerOpen, setIsCameraPickerOpen] = useState(true);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [cameraPreviewReady, setCameraPreviewReady] = useState({});
  const [cameraPreviewErrors, setCameraPreviewErrors] = useState({});
  const activeCamera = cameraProfiles.find(profile => profile.id === activeCameraId) || cameraProfiles[0];
  const isDslr = activeCamera?.captureMode === 'dslr';

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      setIsReady(false);
      setError('');
      stopStream(streamRef.current);

      // Do not request browser permission until the customer picks an angle.
      if (isCameraPickerOpen) return;

      try {
        if (activeCamera?.captureMode === 'dslr') {
          if (!activeCamera.tetherPort) throw new Error('Port DSLR belum dipilih oleh admin.');
          const cameras = await listDslrCameras();
          if (cancelled) return;
          if (!cameras.some(camera => camera.port === activeCamera.tetherPort)) {
            throw new Error('DSLR tidak terdeteksi. Pastikan kamera menyala dan kabel USB data terpasang.');
          }
          setIsReady(true);
          return;
        }
        const resolved = await getCameraStreamForProfile(activeCamera, cameraSettings.defaultCamera || 'user');
        const { stream } = resolved;
        if (cancelled) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        if (resolved.recovered && activeCamera?.id) {
          const latestSettings = getKioskSettings();
          saveKioskSettings({
            ...latestSettings,
            cameraProfiles: latestSettings.cameraProfiles.map(profile => profile.id === activeCamera.id
              ? { ...profile, deviceId: resolved.deviceId, deviceLabel: resolved.deviceLabel }
              : profile),
          });
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsReady(true);
        }
      } catch (cameraError) {
        setError(cameraError.message || 'Kamera tidak bisa diakses.');
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      stopStream(streamRef.current);
    };
  }, [activeCamera?.captureMode, activeCamera?.deviceId, activeCamera?.facingMode, activeCamera?.id, activeCamera?.tetherPort, cameraSettings.defaultCamera, isCameraPickerOpen, cameraAttempt]);

  useEffect(() => {
    if (!isCameraPickerOpen) return undefined;

    let cancelled = false;
    setCameraPreviewReady({});
    setCameraPreviewErrors({});

    const startPreviews = async () => {
      for (const profile of cameraProfiles) {
        try {
          if (profile.captureMode === 'dslr') {
            if (!profile.tetherPort) throw new Error('Port DSLR belum dipilih oleh admin.');
            const cameras = await listDslrCameras();
            if (!cameras.some(camera => camera.port === profile.tetherPort)) throw new Error('DSLR tidak terdeteksi.');
            if (!cancelled) setCameraPreviewReady(previous => ({ ...previous, [profile.id]: true }));
            continue;
          }
          const resolved = await getCameraStreamForProfile(profile, cameraSettings.defaultCamera || 'user');
          if (cancelled) {
            stopStream(resolved.stream);
            return;
          }
          pickerStreamsRef.current[profile.id] = resolved.stream;
          if (resolved.recovered) {
            const latestSettings = getKioskSettings();
            saveKioskSettings({
              ...latestSettings,
              cameraProfiles: latestSettings.cameraProfiles.map(item => item.id === profile.id
                ? { ...item, deviceId: resolved.deviceId, deviceLabel: resolved.deviceLabel }
                : item),
            });
          }
          const preview = pickerVideoRefs.current[profile.id];
          if (preview) {
            preview.srcObject = resolved.stream;
            await preview.play();
            if (!cancelled) setCameraPreviewReady(previous => ({ ...previous, [profile.id]: true }));
          }
        } catch (previewError) {
          if (!cancelled) setCameraPreviewErrors(previous => ({
            ...previous,
            [profile.id]: previewError?.message || 'Kamera tidak dapat dibuka.',
          }));
        }
      }
    };

    startPreviews();

    return () => {
      cancelled = true;
      Object.values(pickerStreamsRef.current).forEach(stopStream);
      pickerStreamsRef.current = {};
    };
  }, [cameraProfiles, cameraSettings.defaultCamera, isCameraPickerOpen]);

  const handleCaptureClick = () => {
    if ((!isDslr && !videoRef.current) || !isReady || isRecordingBurst || countdown !== null) return;
    if (capturedPhotos.length >= poseLimit) return;
    setIsAutoCapturing(true);
  };

  const capturePhoto = useCallback(async () => {
    if (!isReady || isRecordingBurst) return;
    if (capturedPhotos.length >= poseLimit) return;

    setIsRecordingBurst(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    if (isDslr) {
      try {
        const result = await captureDslrPhoto(activeCamera?.tetherPort);
        setCapturedPhotos(prev => {
          const newPhotos = [...prev, {
            src: result.url,
            frames: [result.url],
            cameraId: activeCamera?.id || 'camera-1',
            cameraName: activeCamera?.name || 'Posisi Kamera 1',
          }];
          if (newPhotos.length < poseLimit) setIsCameraPickerOpen(true);
          return newPhotos;
        });
      } catch (captureError) {
        setError(captureError.message || 'DSLR gagal mengambil foto.');
      } finally {
        setIsRecordingBurst(false);
        setIsAutoCapturing(false);
      }
      return;
    }

    if (!videoRef.current) {
      setIsRecordingBurst(false);
      return;
    }

    const burstFrames = [];
    let count = 0;

    // Capture 8 frames at 150ms intervals (~1.2 seconds of animation)
    const interval = setInterval(() => {
      if (videoRef.current) {
        burstFrames.push(captureVideoFrame(videoRef.current, { mirror: activeCamera?.mirror ?? cameraSettings.mirrorCamera }));
      }
      count++;

      if (count >= 8) {
        clearInterval(interval);

        setCapturedPhotos(prev => {
          const newPhotos = [...prev, {
            src: burstFrames[0], // Main static photo is the first frame
            frames: burstFrames, // The GIF animation frames
            mediaWidth: videoRef.current?.videoWidth || 0,
            mediaHeight: videoRef.current?.videoHeight || 0,
            cameraId: activeCamera?.id || 'camera-1',
            cameraName: activeCamera?.name || 'Posisi Kamera 1',
          }];
          if (newPhotos.length < poseLimit) setIsCameraPickerOpen(true);
          return newPhotos;
        });

        setIsRecordingBurst(false);
        setIsAutoCapturing(false);
      }
    }, 150);
  }, [isReady, isDslr, activeCamera?.id, activeCamera?.name, activeCamera?.tetherPort, activeCamera?.mirror, cameraSettings.mirrorCamera, poseLimit, capturedPhotos.length, isRecordingBurst]);

  useEffect(() => {
    if (!isAutoCapturing) return;
    if (capturedPhotos.length >= poseLimit) {
      setIsAutoCapturing(false);
      return;
    }

    // Do not count down while recording the burst or not ready
    if (isRecordingBurst || !isReady) return;

    if (countdown === null) {
      // Start countdown at 3
      setCountdown(3);
      return;
    }

    if (countdown > 0) {
      // Tick down after 1 second
      const timerId = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timerId);
    } else if (countdown === 0) {
      // Reached zero, take photo
      setCountdown(null);
      capturePhoto();
    }
  }, [isAutoCapturing, capturedPhotos.length, poseLimit, countdown, isRecordingBurst, isReady, capturePhoto]);

  const removePhoto = (indexToRemove) => {
    setCapturedPhotos(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const thumbnailSlots = Array.from({ length: poseLimit });

  useEffect(() => {
    setIsPlayingVideo(false);
    setPlaybackFrameIdx(0);
  }, [viewingPhotoIndex]);

  useEffect(() => {
    let interval;
    if (isPlayingVideo && viewingPhotoIndex !== null) {
      const frames = capturedPhotos[viewingPhotoIndex]?.frames;
      if (frames && frames.length > 0) {
        interval = setInterval(() => {
          setPlaybackFrameIdx(prev => (prev + 1) % frames.length);
        }, 150);
      }
    }
    return () => clearInterval(interval);
  }, [isPlayingVideo, viewingPhotoIndex, capturedPhotos]);

  return (
    <section className="camera-fullscreen-workspace" style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) 280px',
      gap: '1.5rem',
      width: 'calc(100% - 2rem)',
      maxWidth: '1600px',
      margin: '0 auto',
      padding: '0'
    }}>

      {/* Big Camera Feed */}
      <div style={{ position: 'relative', background: 'black', borderRadius: '16px', overflow: 'hidden', aspectRatio: '16/11', maxHeight: 'calc(100svh - 120px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isDslr ? (
          <div style={{ color: 'white', textAlign: 'center', padding: '2rem' }}>
            <CameraIcon />
            <p style={{ margin: '1rem 0 .35rem', fontWeight: 800 }}>DSLR Tethering siap</p>
            <p style={{ margin: 0, color: '#d1d5db', fontSize: '.9rem' }}>Tekan tombol kamera untuk mengambil foto.</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            className={(activeCamera?.mirror ?? cameraSettings.mirrorCamera) ? 'is-mirrored' : ''}
            playsInline
            muted
            style={{ filter: filter?.css || 'none', width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}

        {flash && (
          <div style={{
            position: 'absolute', inset: 0, background: 'white', zIndex: 50, opacity: 0.8
          }}></div>
        )}

        {countdown !== null && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: '8rem', fontWeight: 'bold', textShadow: '0 4px 20px rgba(0,0,0,0.5)', zIndex: 40
          }}>
            {countdown}
          </div>
        )}

        {!isReady && !error && <div style={{ position: 'absolute', color: 'white' }}>Menyalakan kamera...</div>}
        {error && (
          <div style={{ position: 'absolute', zIndex: 20, maxWidth: '80%', padding: '1rem', borderRadius: '12px', background: 'rgba(17,24,39,.88)', color: 'white', textAlign: 'center' }}>
            <div style={{ marginBottom: '0.8rem', color: '#fecaca' }}>{error}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.6rem' }}>
              <button type="button" onClick={() => setCameraAttempt(value => value + 1)} style={{ padding: '0.55rem .8rem', border: 0, borderRadius: '999px', background: '#40a3eb', color: 'white', fontWeight: 800, cursor: 'pointer' }}>Coba lagi</button>
              <button type="button" onClick={() => setIsCameraPickerOpen(true)} style={{ padding: '0.55rem .8rem', border: 0, borderRadius: '999px', background: 'white', color: '#111827', fontWeight: 800, cursor: 'pointer' }}>Ganti kamera</button>
            </div>
          </div>
        )}

        {/* Center Capture Button */}
        {isReady && capturedPhotos.length < poseLimit && !isAutoCapturing && !isCameraPickerOpen && (
          <>
            <button
              onClick={handleCaptureClick}
              disabled={isRecordingBurst || countdown !== null}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '80px',
                height: '80px',
                borderRadius: '999px',
                background: isRecordingBurst ? 'rgba(239, 68, 68, 0.7)' : 'rgba(156, 163, 175, 0.7)', // Red when recording
                backdropFilter: 'blur(4px)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                transition: 'transform 0.1s'
              }}
              onMouseDown={(e) => e.currentTarget.style.transform = 'translate(-50%, -50%) scale(0.95)'}
              onMouseUp={(e) => e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)'}
            >
              <CameraIcon />
            </button>

            {/* Small Arrow Button */}
            <button
              style={{
                position: 'absolute',
                bottom: '40px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '32px',
                height: '32px',
                borderRadius: '999px',
                background: 'rgba(0, 0, 0, 0.6)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10
              }}
            >
              <UpIcon />
            </button>
          </>
        )}

        {capturedPhotos.length >= poseLimit && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', zIndex: 20
          }}>
            <button onClick={() => onFinishSession(capturedPhotos)} style={{
              padding: '1rem 3rem', background: 'white', color: 'black', borderRadius: '999px', fontSize: '1.2rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
            }}>
              LANJUTKAN
            </button>
          </div>
        )}
      </div>

      {/* Thumbnails Sidebar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', height: '100%' }}>
        {thumbnailSlots.map((_, idx) => {
          const photo = capturedPhotos[idx];
          return (
            <div key={idx} style={{
              position: 'relative',
              flex: 1,
              background: photo ? 'transparent' : '#e5e7eb',
              borderRadius: '16px',
              border: photo ? '4px solid #374151' : '4px dashed #9ca3af',
              overflow: 'hidden',
              minHeight: '80px',
              cursor: photo ? 'pointer' : 'default'
            }} onClick={() => { if (photo) setViewingPhotoIndex(idx); }}>
              {photo && (
                <>
                  <img src={photo.src} alt={`Shot ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {/* Retake Button (stopPropagation to prevent viewing modal) */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removePhoto(idx); }}
                    style={{
                      position: 'absolute',
                      top: '0',
                      right: '0',
                      background: 'white',
                      border: 'none',
                      borderBottomLeftRadius: '12px',
                      padding: '4px 6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '-2px 2px 5px rgba(0,0,0,0.1)'
                    }}
                  >
                    <RetakeIcon />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Fullscreen Viewer Modal */}
      {viewingPhotoIndex !== null && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column', color: 'white' }}>
          {/* Top Bar */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '1.5rem', gap: '1.5rem', alignItems: 'center' }}>
            <button onClick={() => { removePhoto(viewingPhotoIndex); setViewingPhotoIndex(null); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', color: 'white', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>
              <RetakeIcon /> Retake
            </button>
            <button onClick={() => setIsPlayingVideo(!isPlayingVideo)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', color: 'white', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>
              <PlayIcon /> {isPlayingVideo ? 'Stop Video' : 'Play Video'}
            </button>

            <button onClick={() => setViewingPhotoIndex(null)} style={{ background: 'transparent', color: '#9ca3af', border: 'none', cursor: 'pointer', fontSize: '1.5rem', marginLeft: '1rem' }}>
              ✕
            </button>
          </div>

          {/* Main Image View */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <button
              onClick={() => setViewingPhotoIndex(prev => Math.max(0, prev - 1))}
              style={{ position: 'absolute', left: '3rem', background: 'transparent', border: 'none', color: 'white', fontSize: '2.5rem', cursor: 'pointer', opacity: viewingPhotoIndex > 0 ? 1 : 0.2 }}
              disabled={viewingPhotoIndex === 0}
            >
              ‹
            </button>

            <img
              src={isPlayingVideo && capturedPhotos[viewingPhotoIndex].frames ? capturedPhotos[viewingPhotoIndex].frames[playbackFrameIdx] : capturedPhotos[viewingPhotoIndex].src}
              style={{ maxWidth: '80%', maxHeight: '90%', objectFit: 'contain', borderRadius: '16px' }}
            />

            <button
              onClick={() => setViewingPhotoIndex(prev => Math.min(capturedPhotos.length - 1, prev + 1))}
              style={{ position: 'absolute', right: '3rem', background: 'transparent', border: 'none', color: 'white', fontSize: '2.5rem', cursor: 'pointer', opacity: viewingPhotoIndex < capturedPhotos.length - 1 ? 1 : 0.2 }}
              disabled={viewingPhotoIndex === capturedPhotos.length - 1}
            >
              ›
            </button>
          </div>

          {/* Pager Dots */}
          <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center', gap: '0.8rem' }}>
            {capturedPhotos.map((_, i) => (
              <div
                key={i}
                onClick={() => setViewingPhotoIndex(i)}
                style={{
                  width: i === viewingPhotoIndex ? '32px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: i === viewingPhotoIndex ? 'white' : 'rgba(255,255,255,0.3)',
                  cursor: 'pointer',
                  transition: 'all 0.3s'
                }}
              ></div>
            ))}
          </div>
        </div>
      )}

      {isCameraPickerOpen && capturedPhotos.length < poseLimit && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 110, overflowY: 'auto', background: '#fff' }}>
          <div style={{ height: '66px', display: 'flex', alignItems: 'center', padding: '0 1.25rem', borderBottom: '1px solid #e5e7eb', boxShadow: '0 2px 5px rgba(0,0,0,.16)', background: 'white' }}>
            <img src={logoJiwalu} alt="Jiwalu Photobooth" style={{ height: '58px', width: 'auto' }} />
          </div>
          <div style={{ padding: 'clamp(1.5rem, 4vh, 3rem) clamp(1rem, 5vw, 7rem) 3rem' }}>
            <div style={{ width: '100%', maxWidth: '1600px', margin: '0 auto' }}>
              <h1 style={{ margin: '0 0 clamp(2rem, 5vh, 4.5rem)', color: '#333', textAlign: 'center', fontSize: 'clamp(2rem, 3.1vw, 3.6rem)', fontWeight: 500, letterSpacing: '-0.04em' }}>PILIH KAMERA</h1>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cameraProfiles.length, 2)}, minmax(0, 1fr))`, gap: 'clamp(1rem, 2.2vw, 2.5rem)' }}>
                {cameraProfiles.map(profile => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => { setActiveCameraId(profile.id); setIsCameraPickerOpen(false); }}
                    aria-label={`Pilih ${profile.name}`}
                    style={{ position: 'relative', minHeight: 'min(58vh, 720px)', padding: 0, overflow: 'hidden', borderRadius: '20px', border: `2px solid ${profile.id === activeCameraId ? '#40a3eb' : '#111'}`, background: '#000', color: 'white', cursor: 'pointer', boxShadow: profile.id === activeCameraId ? '0 0 0 4px rgba(64,163,235,.12)' : 'none' }}
                  >
                    {profile.captureMode === 'dslr' ? (
                      <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'white' }}><span><CameraIcon /><br />DSLR Tethering</span></span>
                    ) : (
                      <video ref={(element) => { pickerVideoRefs.current[profile.id] = element; }} className={profile.mirror ? 'is-mirrored' : ''} autoPlay muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                    <span style={{ position: 'absolute', top: '1.1rem', left: '1.1rem', zIndex: 1, minWidth: '240px', padding: '0.5rem 1rem', borderRadius: '999px', background: '#40a3eb', color: 'white', fontSize: '0.9rem', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>{profile.name}</span>
                    <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: profile.captureMode === 'dslr' ? 1 : (cameraPreviewReady[profile.id] ? 0 : 1), transition: 'opacity .2s' }}>
                      <span style={{ display: 'grid', justifyItems: 'center', gap: '0.8rem', maxWidth: '78%', textAlign: 'center' }}>
                        <span style={{ display: 'grid', width: '110px', height: '110px', placeItems: 'center', borderRadius: '50%', background: '#8b8b8b', color: '#101010' }}><CameraIcon /></span>
                        <span style={{ color: 'white', fontSize: '0.92rem', fontWeight: 700 }}>
                          {cameraPreviewErrors[profile.id]
                            || (profile.captureMode === 'dslr'
                              ? (cameraPreviewReady[profile.id] ? 'DSLR terhubung — klik untuk memilih' : 'Mengecek koneksi DSLR...')
                              : 'Menyalakan kamera...')}
                        </span>
                        {profile.captureMode === 'dslr' && cameraPreviewReady[profile.id] && (
                          <span style={{ color: '#d1d5db', fontSize: '0.78rem', lineHeight: 1.4 }}>Live preview tidak tersedia untuk DSLR tethering.</span>
                        )}
                      </span>
                    </span>
                    <span style={{ position: 'absolute', right: 0, bottom: 0, left: 0, padding: '1.15rem', background: '#40a3eb', color: 'white', fontSize: '0.95rem', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>{profile.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
