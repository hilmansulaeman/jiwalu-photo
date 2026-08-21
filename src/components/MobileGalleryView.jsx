import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { backendRequest, getBackendApiUrl } from '../utils/backendApi.js';
import { getRecoveryHistory } from '../utils/sessionRecovery.js';
import logoJiwalu from '../assets/logo-jiwalu.svg';

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+\-.]*:/i;
const DATA_URL_PATTERN = /^data:/i;

const normalizeGalleryAssetUrl = (rawUrl, sessionId = '') => {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (DATA_URL_PATTERN.test(value) || ABSOLUTE_URL_PATTERN.test(value)) return value;

  const backendBaseUrl = getBackendApiUrl().replace(/\/$/, '');
  const cleanPath = value.replace(/^\/+/, '');

  if (cleanPath.startsWith('files/')) {
    return `${backendBaseUrl}/${cleanPath}`;
  }
  if (cleanPath.startsWith('sessions/')) {
    return `${backendBaseUrl}/files/${cleanPath}`;
  }
  if (sessionId && !cleanPath.includes('/')) {
    return `${backendBaseUrl}/files/sessions/${sessionId}/${cleanPath}`;
  }

  return `${backendBaseUrl}/files/${cleanPath}`;
};

const normalizeGalleryPayload = (payload, fallbackSessionId = '') => {
  if (!payload) return payload;
  const resolvedSessionId = payload.sessionId || payload.backendSessionId || fallbackSessionId || payload.id || '';
  const imageUrls = [
    payload.animatedImage?.url,
    payload.finalImage?.url,
    payload.printImage?.url,
    ...(payload.images || []),
  ]
    .map((url) => normalizeGalleryAssetUrl(url, resolvedSessionId))
    .filter(Boolean);

  return {
    ...payload,
    id: payload.id || payload.sessionId || resolvedSessionId,
    sessionId: payload.sessionId || resolvedSessionId,
    images: Array.from(new Set(imageUrls)),
  };
};

const OriginalSnapItem = ({ url, staticUrl, label, isGifFile, idx, downloadImage, onItemClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      style={{ position: 'relative', borderRadius: '18px', overflow: 'hidden', aspectRatio: '4/3', boxShadow: '0 18px 35px rgba(15, 23, 42, 0.12)', cursor: 'pointer', background: '#f8fafc', border: '1px solid #f1f5f9' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => setIsHovered(true)}
      onTouchEnd={() => setIsHovered(false)}
      onClick={() => onItemClick && onItemClick(url)}
    >
       <img 
         src={staticUrl} 
         style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', top: 0, left: 0, zIndex: 1 }} 
         alt={`${label} Static`} 
       />
       {isGifFile && (
         <img 
           src={url} 
           style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', top: 0, left: 0, zIndex: 2, opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s ease-in-out' }} 
           alt={`${label} Animated`} 
         />
       )}
       
       {/* Top Left Label Pill */}
       <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(15, 23, 42, 0.68)', color: 'white', padding: '0.25rem 0.65rem', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 'bold', letterSpacing: '1px', pointerEvents: 'none', zIndex: 3, backdropFilter: 'blur(8px)' }}>
         {label}
       </div>

       {/* Play Icon Overlay - ONLY IF IT IS A GIF/VIDEO and NOT hovered */}
       {isGifFile && !isHovered && (
         <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(255,255,255,0.95)', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.2)', pointerEvents: 'none', zIndex: 3 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M8 5v14l11-7z" fill="#1f2937"/>
            </svg>
         </div>
       )}

       {/* Small Download Button */}
       <div style={{ position: 'absolute', bottom: '15px', left: '50%', transform: 'translateX(-50%)', zIndex: 4 }}>
         <button onClick={(e) => { e.stopPropagation(); downloadImage(url, isGifFile ? `original-${idx + 1}.gif` : `original-${idx + 1}.png`); }} style={{ background: 'white', border: 'none', width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 8px 20px rgba(15,23,42,0.22)' }}>
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1f2937" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
           </svg>
         </button>
       </div>
    </div>
  );
};

export default function MobileGalleryView({ sessionId }) {
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);

  useEffect(() => {
    const readCachedGallery = (id) => {
      if (!id) return null;
      const storedSession = window.localStorage.getItem(`potobox_gallery_${id}`);
      return storedSession ? JSON.parse(storedSession) : null;
    };

    const findCachedGallery = () => {
      const direct = readCachedGallery(sessionId);
      if (direct) return direct;

      const recovery = getRecoveryHistory().find((item) => (
        item?.backendSessionId === sessionId ||
        item?.id === sessionId ||
        item?.localGalleryId === sessionId
      ));
      if (!recovery) return null;

      const cached = readCachedGallery(recovery.backendSessionId) ||
        readCachedGallery(recovery.localGalleryId) ||
        readCachedGallery(recovery.id);
      if (!cached) return null;

      return {
        ...cached,
        id: sessionId,
          backendSessionId: recovery.backendSessionId || sessionId,
          localGalleryId: recovery.localGalleryId || cached.localGalleryId,
        };
      };

    async function fetchGallery() {
      if (sessionId?.startsWith('local-')) {
        try {
          const cached = normalizeGalleryPayload(readCachedGallery(sessionId), sessionId);
          if (!cached) throw new Error('Galeri lokal tidak ditemukan. Selesaikan sesi foto dulu di browser yang sama.');
          setSessionData(cached);
        } catch (err) {
          console.error('Error fetching local gallery:', err);
          setError(err.message || 'Gagal memuat galeri lokal.');
        } finally {
          setLoading(false);
        }
        return;
      }

      try {
        const data = await backendRequest(`/api/galleries/${sessionId}`);
        if (!data) throw new Error('Sesi foto tidak ditemukan.');

        setSessionData(normalizeGalleryPayload(data, sessionId));
      } catch (err) {
        console.error('Error fetching gallery:', err);
        const cached = normalizeGalleryPayload(findCachedGallery(), sessionId);
        if (cached?.images?.length) {
          setSessionData(cached);
          setError(null);
        } else {
          setError(err.message || 'Gagal memuat galeri foto.');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchGallery();
  }, [sessionId]);

  const handleDownloadAll = () => {
    if (!sessionData?.images?.length) return;

    Array.from(new Set(sessionData.images)).forEach((imgUrl, idx) => {
      const isMoving = isVideoOrGif(imgUrl);
      const extension = isMoving ? 'gif' : 'png';
      window.setTimeout(() => {
        downloadImage(imgUrl, `urbanmenphoto-${sessionId}-${idx + 1}.${extension}`);
      }, idx * 180);
    });
  };

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ animation: 'slowSpin 1s linear infinite', fontSize: '3rem', marginBottom: '1rem' }}>📸</div>
          <h2>Memuat Galeri Anda...</h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: 'var(--paper)', padding: '2rem', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🥺</div>
          <h2 style={{ color: 'var(--accent-dark)' }}>Oops!</h2>
          <p style={{ color: 'var(--muted)', marginTop: '0.5rem' }}>{error}</p>
        </div>
      </div>
    );
  }

  const isVideoOrGif = (url) => url.toLowerCase().includes('.gif') || url.toLowerCase().includes('.mp4');

  const variants = sessionData?.images?.filter(url => url.includes('/variant-') || url.includes('/final-print')) || [];
  const originals = sessionData?.images?.filter(url => url.includes('/original-') || url.includes('/image-')) || [];
  
  const displayVariants = variants.length > 0 ? variants : (sessionData?.images?.slice(0, 2) || []);
  const displayOriginals = (originals.length > 0 ? originals : (sessionData?.images?.slice(2) || []))
    .sort((a, b) => {
      const aIsVideo = isVideoOrGif(a);
      const bIsVideo = isVideoOrGif(b);
      if (aIsVideo === bIsVideo) return 0;
      return aIsVideo ? 1 : -1;
    });

  // Find the combined GIF, fallback to first GIF/video, then fallback to first original
  const combinedGifUrl = sessionData?.images?.find(url => url.includes('featured-video.gif'));
  const featuredVideoUrl = combinedGifUrl || displayOriginals.find(isVideoOrGif) || displayOriginals[0];
  const totalImages = sessionData?.images?.length || 0;

  const downloadImage = (url, filename) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#fffaf2', fontFamily: 'sans-serif', color: '#1f2937' }}>
      
      {/* Header */}
      <header style={{ background: 'rgba(255,255,255,0.9)', borderBottom: '1px solid #bae0f9', position: 'sticky', top: 0, zIndex: 20, backdropFilter: 'blur(14px)' }}>
        <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <img src={logoJiwalu} alt="Jiwalu Photobooth" style={{ height: '40px', width: 'auto' }} />
          </div>
          <div style={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 800 }}>
            {totalImages ? `${totalImages} file siap` : 'Menunggu hasil'}
          </div>
        </div>
      </header>

      {/* Hero Title */}
      <div style={{ textAlign: 'center', margin: '3.5rem auto 2.5rem', padding: '0 1.25rem', maxWidth: '760px' }}>
        <div style={{ color: '#2c8ed6', fontSize: '0.78rem', fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Gallery Customer</div>
        <h1 style={{ fontSize: 'clamp(2.4rem, 7vw, 4.5rem)', lineHeight: 1, fontWeight: '500', margin: '0 0 0.85rem', color: '#172033', letterSpacing: '0' }}>THANK YOU</h1>
        <p style={{ color: '#64748b', fontSize: '1rem', margin: 0, lineHeight: 1.6 }}>Hasil foto Anda sudah siap dilihat dan diunduh.</p>
        <button disabled={!sessionData?.images?.length} onClick={handleDownloadAll} style={{ marginTop: '1.6rem', background: sessionData?.images?.length ? '#40a3eb' : '#cbd5e1', color: 'white', border: 'none', padding: '0.95rem 1.8rem', borderRadius: '999px', fontSize: '0.98rem', fontWeight: '900', cursor: sessionData?.images?.length ? 'pointer' : 'not-allowed', boxShadow: sessionData?.images?.length ? '0 16px 34px rgba(249, 115, 22, 0.28)' : 'none' }}>
          Download Semua Hasil
        </button>
      </div>

      {/* Your Results Section */}
      <section style={{ padding: '0 1.5rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.45rem', fontWeight: '900', margin: '0 0 1.75rem', color: '#172033' }}>Your Results</h2>
        {!sessionData?.images?.length && (
          <div style={{ maxWidth: '560px', margin: '0 auto 3rem', padding: '1.4rem', borderRadius: '18px', border: '1px dashed #fdba74', background: '#fff7ed', color: '#c2410c', textAlign: 'center', fontWeight: 800, boxShadow: '0 14px 30px rgba(249,115,22,0.08)' }}>
            <div style={{ fontSize: '1.05rem', marginBottom: '0.35rem' }}>Hasil foto belum tersimpan untuk sesi ini.</div>
            <div style={{ color: '#9a3412', fontSize: '0.9rem', fontWeight: 700 }}>Silakan ulangi proses finalisasi foto dari photobooth.</div>
          </div>
        )}

        {/* Featured Large Image (Simulated Video) */}
        {featuredVideoUrl && (
          <div 
            onClick={() => setSelectedVideo(featuredVideoUrl)}
            style={{ maxWidth: '900px', margin: '0 auto 3rem', position: 'relative', borderRadius: '22px', overflow: 'hidden', boxShadow: '0 24px 55px rgba(15,23,42,0.14)', cursor: 'pointer', background: '#111827', border: '1px solid rgba(15,23,42,0.08)' }}
          >
            <img src={featuredVideoUrl} style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }} alt="Featured Video" />
            
            {/* Fake Video Controls Overlay */}
            <div style={{ position: 'absolute', bottom: '1rem', left: '1.5rem', display: 'flex', gap: '1rem', color: 'white' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7z" fill="white"/></svg>
              </div>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>🔊</div>
            </div>

            <div style={{ position: 'absolute', bottom: '1rem', right: '1.5rem' }} onClick={(e) => e.stopPropagation()}>
               <button onClick={() => downloadImage(featuredVideoUrl, isVideoOrGif(featuredVideoUrl) ? 'featured.gif' : 'featured.png')} style={{ background: 'white', color: 'black', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 15L12 3M12 15L8 11M12 15L16 11" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4 17L4 19C4 20.1046 4.89543 21 6 21L18 21C19.1046 21 20 20.1046 20 19L20 17" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                 </svg>
                 Save
               </button>
            </div>
          </div>
        )}

        {/* Photostrips */}
        {displayVariants.length > 0 && (
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', gap: '14px', marginBottom: '5rem', maxWidth: '720px', margin: '0 auto 5rem' }}>
          {displayVariants.map((url, idx) => (
            <div key={idx} style={{ flex: 1, borderRadius: '16px', overflow: 'hidden', boxShadow: '0 18px 42px rgba(15,23,42,0.12)', background: 'white', border: '1px solid #fff' }}>
              <img src={url} style={{ width: '100%', display: 'block' }} alt={`Variant ${idx}`} />
            </div>
          ))}
          
          {/* Single Large Download Button overlapping the gap */}
          <div style={{ position: 'absolute', bottom: '-20px', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
             <button onClick={() => {
               displayVariants.forEach((url, idx) => downloadImage(url, `photostrip-${idx + 1}.png`))
             }} style={{ background: 'white', color: '#172033', border: '1px solid #bae0f9', padding: '0.8rem 2rem', borderRadius: '999px', fontSize: '1rem', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 14px 30px rgba(15,23,42,0.14)' }}>
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 15L12 3M12 15L8 11M12 15L16 11" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4 17L4 19C4 20.1046 4.89543 21 6 21L18 21C19.1046 21 20 20.1046 20 19L20 17" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
               </svg>
               Download
             </button>
          </div>
        </div>
        )}
      </section>

      {/* Original Snaps Section */}
      <section style={{ padding: '0 1.5rem 4rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.05rem', fontWeight: '900', letterSpacing: '0.16em', margin: '0 0 2rem', color: '#172033', textTransform: 'uppercase' }}>Original Snaps</h2>
        
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
          {(() => {
            let photoCount = 0;
            let videoCount = 0;
            return displayOriginals.map((url, idx) => {
              const isGifFile = isVideoOrGif(url);
              let label = '';
              let staticUrl = url;

              if (isGifFile) {
                videoCount++;
                label = `VIDEO ${videoCount}`;

                // Find the actual static photo equivalent based on filename base
                const match = url.match(/(original-\d+)-animated\.gif/);
                if (match) {
                  const baseName = match[1];
                  const foundStatic = displayOriginals.find(imgUrl => imgUrl.includes(`/${baseName}.`) && !imgUrl.includes('-animated.gif'));
                  if (foundStatic) {
                    staticUrl = foundStatic;
                  }
                }
              } else {
                photoCount++;
                label = `PHOTO ${photoCount}`;
              }

              return (
                <OriginalSnapItem 
                  key={idx}
                  url={url}
                  staticUrl={staticUrl}
                  label={label}
                  isGifFile={isGifFile}
                  idx={idx}
                  downloadImage={downloadImage}
                  onItemClick={setSelectedVideo}
                />
              );
            });
          })()}
        </div>
      </section>

      {/* Fullscreen Video Modal */}
      {selectedVideo && (
        <GalleryLightbox 
          items={displayOriginals.includes(selectedVideo) ? displayOriginals : [selectedVideo]}
          initialIndex={Math.max(0, displayOriginals.indexOf(selectedVideo))}
          onClose={() => setSelectedVideo(null)}
          downloadImage={downloadImage}
          isVideoOrGif={isVideoOrGif}
        />
      )}

    </div>
  );
}

const GalleryLightbox = ({ items, initialIndex, onClose, downloadImage, isVideoOrGif }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollLeft = el.clientWidth * currentIndex;
    }
  }, [currentIndex]);

  const handleScroll = (e) => {
    const el = e.target;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (index !== currentIndex) {
      setCurrentIndex(index);
    }
  };

  const currentItem = items[currentIndex];
  const isVideo = currentItem ? isVideoOrGif(currentItem) : false;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#0a0a0a', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
      
      {/* Top Navbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 2rem', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
        <div style={{ width: '60px' }}></div> {/* Spacer for centering */}
        
        {/* Center Pill */}
        <div style={{ background: '#1f2937', color: 'white', padding: '0.4rem 1.2rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 'bold', letterSpacing: '1px' }}>
          {isVideo ? 'VIDEO' : 'PHOTO'}
        </div>
        
        {/* Right Actions */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button onClick={() => downloadImage(currentItem, isVideo ? `item-${currentIndex + 1}.gif` : `item-${currentIndex + 1}.png`)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' , borderRadius: '999px'}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Navigation Arrows (Desktop) */}
      <button onClick={() => {
        if (scrollRef.current) scrollRef.current.scrollBy({ left: -scrollRef.current.clientWidth, behavior: 'smooth' });
      }} style={{ position: 'absolute', left: '2rem', top: '50%', transform: 'translateY(-50%)', background: '#1f2937', color: 'white', border: 'none', width: '40px', height: '40px', borderRadius: '8px', zIndex: 10, cursor: 'pointer', display: 'none', alignItems: 'center', justifyContent: 'center' }} className="nav-arrow">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      </button>

      <button onClick={() => {
        if (scrollRef.current) scrollRef.current.scrollBy({ left: scrollRef.current.clientWidth, behavior: 'smooth' });
      }} style={{ position: 'absolute', right: '2rem', top: '50%', transform: 'translateY(-50%)', background: '#1f2937', color: 'white', border: 'none', width: '40px', height: '40px', borderRadius: '8px', zIndex: 10, cursor: 'pointer', display: 'none', alignItems: 'center', justifyContent: 'center' }} className="nav-arrow">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
      </button>

      {/* Carousel */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="hide-scrollbar"
        style={{ flex: 1, display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', width: '100vw', scrollBehavior: 'smooth' }}
      >
        {items.map((url, idx) => {
          const isActive = idx === currentIndex;
          return (
            <div key={idx} style={{ flex: '0 0 100vw', width: '100vw', scrollSnapAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', transition: 'all 0.3s ease-in-out', opacity: isActive ? 1 : 0.4, transform: isActive ? 'scale(1)' : 'scale(0.9)' }}>
              
              {/* Card Container */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '16px', padding: '1rem', display: 'flex', gap: '2rem', alignItems: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                {/* Media */}
                <div style={{ borderRadius: '8px', overflow: 'hidden' }}>
                  <img src={url} style={{ maxHeight: '75vh', maxWidth: '100%', objectFit: 'contain', display: 'block' }} alt="Gallery Item" />
                </div>
                
                {/* QR Code Section */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} className="qr-section">
                  <div style={{ background: 'white', padding: '0.8rem', borderRadius: '12px', marginBottom: '1rem' }}>
                    <QRCodeSVG value={url} size={120} />
                  </div>
                  <p style={{ color: '#9ca3af', fontSize: '0.8rem', margin: '0 0 1rem 0' }}>Scan to Download</p>
                  <button onClick={() => downloadImage(url, isVideoOrGif(url) ? `item-${idx + 1}.gif` : `item-${idx + 1}.png`)} style={{ background: 'transparent', color: 'white', border: '1px solid #4b5563', padding: '0.6rem 1.5rem', borderRadius: '999px', fontSize: '0.9rem', cursor: 'pointer' }}>
                    Download
                  </button>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* Bottom Dots */}
      <div style={{ position: 'absolute', bottom: '2rem', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '0.5rem', zIndex: 10 }}>
        {items.map((_, idx) => (
          <div key={idx} style={{ width: '6px', height: '6px', borderRadius: '50%', background: idx === currentIndex ? 'white' : 'rgba(255,255,255,0.3)', transition: 'background 0.2s' }} />
        ))}
      </div>
      
      <style>{`
        @media (min-width: 768px) {
          .nav-arrow { display: flex !important; }
        }
        @media (max-width: 768px) {
          .qr-section { display: none !important; }
        }
      `}</style>
    </div>
  );
};
