import React, { useState, useEffect, useRef } from 'react';
import { listDslrCameras, listHardwarePrinters } from '../utils/dslr.js';
import { getKioskSettings, saveKioskSettings, getActiveProjectId, setActiveProjectId, syncKioskSettings } from '../utils/kioskConfig.js';
import { getBackendApiUrl } from '../utils/backendApi.js';
import { X, Save, Lock, Camera, Printer as PrinterIcon, Download, Power, MonitorPlay, Globe, LayoutTemplate } from './ui/icons.jsx';

export default function DeviceSetupModal({ onClose }) {
  const [settings, setSettings] = useState(getKioskSettings());
  const [printers, setPrinters] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [webcams, setWebcams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(getActiveProjectId() || '');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [pinMode, setPinMode] = useState(false);
  const [newPin, setNewPin] = useState(settings.lockFullscreenPin || '000000');
  const videoRef = useRef(null);

  useEffect(() => {
    let currentStream = null;
    const currentCamera = settings.cameraProfiles?.[0] || {};
    
    async function startPreview() {
      if (currentCamera.captureMode === 'webcam' && currentCamera.deviceId) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: currentCamera.deviceId } }
          });
          currentStream = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.warn('Failed to start camera preview', err);
        }
      }
    }
    
    startPreview();
    
    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [settings.cameraProfiles]);

  useEffect(() => {
    async function loadHardware() {
      try {
        setLoading(true);
        // Load hardware printers
        try {
          const hwPrinters = await listHardwarePrinters();
          setPrinters(hwPrinters || []);
        } catch (err) {
          console.warn('Could not load hardware printers', err);
        }
        
        // Load projects
        try {
          const projRes = await fetch(`${getBackendApiUrl()}/api/projects`);
          if (projRes.ok) {
            const data = await projRes.json();
            setProjects(data?.data || []);
          }
        } catch (err) {
          console.warn('Could not load projects', err);
        }

        // Load webcams
        try {
          // Minta izin akses kamera terlebih dahulu agar label dan ID bisa terbaca
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(track => track.stop());
          } catch (permErr) {
            console.warn('Izin kamera ditolak atau tidak tersedia', permErr);
          }
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(d => d.kind === 'videoinput');
          setWebcams(videoDevices);
        } catch (err) {
          console.warn('Could not load webcams', err);
        }

        // Load DSLR cameras
        try {
          const hwCameras = await listDslrCameras();
          setCameras(hwCameras || []);
        } catch (err) {
          console.warn('Could not load DSLR cameras', err);
        }
      } catch (err) {
        setErrorMsg('Gagal memuat perangkat hardware.');
      } finally {
        setLoading(false);
      }
    }
    loadHardware();
  }, []);

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleCameraChange = (deviceId, label) => {
    setSettings(prev => {
      const newProfiles = [...prev.cameraProfiles];
      if (newProfiles.length > 0) {
        newProfiles[0] = {
          ...newProfiles[0],
          deviceId: deviceId,
          deviceLabel: label || deviceId,
          captureMode: deviceId.startsWith('usb:') || deviceId.startsWith('canon:') ? 'dslr' : 'webcam'
        };
      }
      return { ...prev, cameraProfiles: newProfiles };
    });
  };

  const handleSave = () => {
    saveKioskSettings({
      ...settings,
      lockFullscreenPin: newPin
    });
    onClose();
  };

  const handleProjectChange = async (projectId) => {
    setSelectedProjectId(projectId);
    setActiveProjectId(projectId);
    setLoading(true);
    await syncKioskSettings();
    setSettings(getKioskSettings());
    setLoading(false);
  };

  const currentCamera = settings.cameraProfiles?.[0] || {};
  const isWebcam = currentCamera.captureMode === 'webcam';

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Device Setup</h2>
          <button onClick={onClose} style={styles.closeBtn}><X size={24} /></button>
        </div>

        <div style={styles.content}>
          {errorMsg && <div style={styles.error}>{errorMsg}</div>}
          
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}><LayoutTemplate size={18}/> Profil Kiosk</h3>
            <div style={styles.card}>
              <select 
                style={styles.select}
                value={selectedProjectId}
                onChange={(e) => handleProjectChange(e.target.value)}
              >
                <option value="">Global / Default</option>
                {projects.map(proj => (
                  <option key={proj.id} value={proj.id}>{proj.name}</option>
                ))}
              </select>
              <p style={styles.hint}>Kiosk ini akan menggunakan pengaturan dan harga dari proyek yang dipilih.</p>
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}><Camera size={18}/> Camera</h3>
            <div style={styles.card}>
              <div style={{ width: '100%', aspectRatio: '16/9', backgroundColor: '#000', borderRadius: '6px', marginBottom: '1rem', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isWebcam ? (
                  <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: currentCamera.mirror !== false ? 'scaleX(-1)' : 'none' }} />
                ) : (
                  <div style={{ color: '#6b7280', textAlign: 'center', fontSize: '0.85rem' }}>
                    Preview tidak tersedia untuk DSLR
                  </div>
                )}
              </div>
              <select 
                style={styles.select}
                value={currentCamera.deviceId || ''}
                onChange={(e) => handleCameraChange(e.target.value, e.target.options[e.target.selectedIndex].text)}
              >
                <option value="">Pilih Kamera</option>
                <optgroup label="Webcams">
                  {webcams.map(cam => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || `Camera (${cam.deviceId.slice(0, 5)})`}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Hardware Agent (DSLR)">
                  {(cameras || []).map(cam => (
                    <option key={cam.port} value={cam.port}>
                      {cam.model} ({cam.port})
                    </option>
                  ))}
                </optgroup>
              </select>
              <p style={styles.hint}>Pilih kamera utama yang akan digunakan booth ini.</p>
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}><PrinterIcon size={18}/> Printer</h3>
            <div style={styles.card}>
              <div style={styles.row}>
                <label style={styles.label}>Enable Printing (Auto Print)</label>
                <input 
                  type="checkbox" 
                  checked={!!settings.autoPrintEnabled}
                  onChange={(e) => handleChange('autoPrintEnabled', e.target.checked)}
                  style={styles.toggle}
                />
              </div>
              {settings.autoPrintEnabled && (
                <div style={{ marginTop: '1rem' }}>
                  <select 
                    style={styles.select}
                    value={settings.printerName || ''}
                    onChange={(e) => handleChange('printerName', e.target.value)}
                  >
                    <option value="">Pilih Printer Hardware</option>
                    {(printers || []).map(p => (
                      <option key={p.name} value={p.name}>
                        {p.name} {p.isDefault ? '(Default)' : ''}
                      </option>
                    ))}
                  </select>
                  <p style={styles.hint}>Saat aktif, foto akan otomatis dikirim ke printer di atas secara silent.</p>
                </div>
              )}
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}><Download size={18}/> Download Settings</h3>
            <div style={styles.card}>
              <div style={styles.row}>
                <label style={styles.label}>Save files to local device</label>
                <input 
                  type="checkbox" 
                  checked={!!settings.saveToLocalDevice}
                  onChange={(e) => handleChange('saveToLocalDevice', e.target.checked)}
                  style={styles.toggle}
                />
              </div>
              <p style={styles.hint}>Simpan salinan foto langsung ke perangkat lokal ini.</p>
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}><Lock size={18}/> Lock Fullscreen PIN</h3>
            <div style={styles.card}>
              <div style={styles.row}>
                <input 
                  type={pinMode ? "text" : "password"}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={styles.input}
                  placeholder="PIN 6 Angka"
                />
                <button 
                  onClick={() => setPinMode(!pinMode)} 
                  style={styles.changeBtn}
                >
                  {pinMode ? 'Hide' : 'Show'}
                </button>
              </div>
              <p style={styles.hint}>PIN ini digunakan untuk membuka menu Device Setup ini dari halaman utama.</p>
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}><Power size={18}/> Auto-Start Settings</h3>
            <div style={styles.card}>
              <div style={styles.row}>
                <label style={styles.label}>Auto-start with this project</label>
                <input 
                  type="checkbox" 
                  checked={!!settings.autoStartProject}
                  onChange={(e) => handleChange('autoStartProject', e.target.checked)}
                  style={styles.toggle}
                />
              </div>
              <p style={styles.hint}>Lewati layar tunggu dan langsung mulai sesi foto saat aplikasi dijalankan.</p>
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}><MonitorPlay size={18}/> Screensaver</h3>
            <div style={styles.card}>
              <div style={styles.row}>
                <label style={styles.label}>Enable Screensaver (Idle Mode)</label>
                <input 
                  type="checkbox" 
                  checked={!!settings.enableScreensaver}
                  onChange={(e) => handleChange('enableScreensaver', e.target.checked)}
                  style={styles.toggle}
                />
              </div>
              <p style={styles.hint}>Tampilkan screensaver video/gambar saat booth sedang tidak digunakan.</p>
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}><Globe size={18}/> Web browser</h3>
            <div style={styles.card}>
              <div style={styles.row}>
                <label style={styles.label}>Reduce pull-to-refresh and overscroll</label>
                <input 
                  type="checkbox" 
                  checked={!!settings.reducePullToRefresh}
                  onChange={(e) => handleChange('reducePullToRefresh', e.target.checked)}
                  style={styles.toggle}
                />
              </div>
              <p style={styles.hint}>Mencegah gesture browser bawaan yang mengganggu pengalaman kiosk.</p>
            </div>
          </div>

        </div>

        <div style={styles.footer}>
          <button onClick={onClose} style={styles.btnCancel}>Cancel</button>
          <button onClick={handleSave} style={styles.btnSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    backgroundColor: '#fff',
    width: '90%',
    maxWidth: '560px',
    maxHeight: '90vh',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  header: {
    padding: '1.25rem 1.5rem',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#111827',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#6b7280',
    padding: '0.25rem',
  },
  content: {
    padding: '1.5rem',
    overflowY: 'auto',
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  section: {
    marginBottom: '1.5rem',
  },
  sectionTitle: {
    margin: '0 0 0.75rem 0',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  card: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '1rem',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: '0.9rem',
    color: '#111827',
    fontWeight: 500,
  },
  hint: {
    margin: '0.5rem 0 0 0',
    fontSize: '0.8rem',
    color: '#6b7280',
  },
  select: {
    width: '100%',
    padding: '0.6rem',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '0.9rem',
    outline: 'none',
  },
  input: {
    flex: 1,
    padding: '0.6rem',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '1rem',
    letterSpacing: '0.1em',
    outline: 'none',
  },
  changeBtn: {
    marginLeft: '0.75rem',
    padding: '0.6rem 1rem',
    backgroundColor: '#eff6ff',
    color: '#40a3eb',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  toggle: {
    width: '40px',
    height: '24px',
    cursor: 'pointer',
  },
  error: {
    padding: '0.75rem',
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    borderRadius: '6px',
    marginBottom: '1rem',
    fontSize: '0.85rem',
  },
  footer: {
    padding: '1.25rem 1.5rem',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
  },
  btnCancel: {
    padding: '0.6rem 1.25rem',
    backgroundColor: '#fff',
    border: '1px solid #d1d5db',
    color: '#374151',
    borderRadius: '6px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  btnSave: {
    padding: '0.6rem 1.25rem',
    backgroundColor: '#0066ff',
    border: 'none',
    color: '#fff',
    borderRadius: '6px',
    fontWeight: 500,
    cursor: 'pointer',
  }
};
