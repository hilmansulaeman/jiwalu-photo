import { useState, useEffect, useRef } from 'react';
import PaymentView from './PaymentView';
import WalletTab from './WalletTab';
import FrameManager from './FrameManager';
import FrameGifManager from './FrameGifManager';
import PaymentKeyTab from './PaymentKeyTab';
import { supabase } from '../utils/supabaseClient';
import { getKioskSettings, getPublicGalleryBaseUrl, saveKioskSettings, normalizeCameraProfiles, defaultSettings as defaultKioskSettings, setActiveProjectId } from '../utils/kioskConfig.js';
import { clearTransactions } from '../utils/transactionLogger.js';
import { getFrameSettings, saveFrameSettings } from '../utils/frameConfig.js';
import { fetchCustomFrames, setCustomFrameDisabled, validateFrameConfig } from '../utils/customFrameConfig.js';
import { FRAMES } from '../utils/photoConfig.js';
import { BACKEND_API_URL, backendRequest, formatCurrency, formatDateTime, getBackendApiUrl, reportMonitoringError } from '../utils/backendApi.js';
import { stopStream, listVideoDevices } from '../utils/camera.js';
import { captureDslrPhoto, listDslrCameras, listHardwarePrinters } from '../utils/dslr.js';
import { clearRecoveryHistory, getRecoveryHistory, getRecoverySession, removeRecoverySession, saveRecoverySession } from '../utils/sessionRecovery.js';
import AdminOverview from './AdminOverview.jsx';
import ProfileTab from './ProfileTab';
import ProjectManager from './ProjectManager.jsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTableCellsLarge, faDesktop, faImage, faChartColumn, faReceipt, faSquare, faVideo, faTicket, faCreditCard, faUser, faCalendar, faFilter, faBorderAll, faSquarePollVertical, faFolderOpen } from '@fortawesome/free-solid-svg-icons';
import logoJiwalu from '../assets/logo-jiwalu.svg';
import logoLogin from '../assets/logo_login.svg';
const ADMIN_TOKEN_KEY = 'urbanmenphoto_admin_token';
const ADMIN_USER_KEY = 'urbanmenphoto_admin_user';
const ADMIN_EXPIRES_KEY = 'urbanmenphoto_admin_expires_at';

// --- SVG Icons Helper Components ---
const OverviewIcon = () => <FontAwesomeIcon icon={faSquarePollVertical} className="text-[18px]" />;
const KioskIcon = () => <FontAwesomeIcon icon={faDesktop} className="text-[18px]" />;
const GalleryIcon = () => <FontAwesomeIcon icon={faImage} className="text-[18px]" />;
const StatisticIcon = () => <FontAwesomeIcon icon={faSquarePollVertical} className="text-[18px]" />;
const TransactionIcon = () => <FontAwesomeIcon icon={faReceipt} className="text-[18px]" />;
const FramePhotoIcon = () => <FontAwesomeIcon icon={faBorderAll} className="text-[18px]" />;
const FrameGifIcon = () => <FontAwesomeIcon icon={faVideo} className="text-[18px]" />;
const VoucherIcon = () => <FontAwesomeIcon icon={faTicket} className="text-[18px]" />;
const PaymentKeyIcon = () => <FontAwesomeIcon icon={faCreditCard} className="text-[18px]" />;
const ProfileIcon = () => <FontAwesomeIcon icon={faUser} className="text-[18px]" />;
const FilterIcon = () => <FontAwesomeIcon icon={faFilter} className="text-[18px]" />;
const ProjectIcon = () => <FontAwesomeIcon icon={faFolderOpen} className="text-[18px]" />;

const MENU_ITEMS = [
  { id: 'overview', label: 'Overview', icon: <OverviewIcon /> },
  { id: 'projects', label: 'Proyek', icon: <ProjectIcon /> },
  { id: 'kiosk', label: 'Kiosk', icon: <KioskIcon /> },
  { id: 'booth_health', label: 'Booth Health', icon: <StatisticIcon /> },
  { id: 'filters', label: 'Filters', icon: <FilterIcon /> },
  { id: 'recovery', label: 'Recovery', icon: <TransactionIcon /> },
  { id: 'storage', label: 'Storage', icon: <GalleryIcon /> },
  { id: 'gallery', label: 'Gallery', icon: <GalleryIcon /> },
  { id: 'reports', label: 'Reports', icon: <StatisticIcon /> },
  { id: 'statistic', label: 'Statistic', icon: <StatisticIcon /> },
  { id: 'transaction', label: 'Transaction', icon: <TransactionIcon /> },
  { id: 'payments', label: 'Payments', icon: <PaymentKeyIcon /> },
  { id: 'messages', label: 'Messages', icon: <GalleryIcon /> },
  { id: 'frame_photo', label: 'Frame Photo', icon: <FramePhotoIcon /> },
  { id: 'frame_gif', label: 'Frame Gif', icon: <FrameGifIcon /> },
  { id: 'voucher', label: 'Voucher', icon: <VoucherIcon /> },
  { id: 'profile', label: 'Profile', icon: <ProfileIcon /> },
  { id: 'wallet', label: 'Dompet', icon: <PaymentKeyIcon /> },
  { id: 'admin_users', label: 'Admin Users', icon: <KioskIcon /> },
  { id: 'audit_logs', label: 'Audit Logs', icon: <StatisticIcon /> },
  { id: 'payment_key', label: 'Payment Key', icon: <PaymentKeyIcon /> },
];

const STAFF_ALLOWED_MENUS = new Set(['profile', 'booth_health', 'filters', 'recovery', 'gallery', 'reports', 'statistic', 'transaction', 'payments', 'messages', 'frame_photo']);

const getAdminTabFromPath = () => {
  const section = window.location.pathname.replace(/^\/admin\/?/, '').split('/')[0];
  if (section === 'kiosk-settings') return 'kiosk';
  return MENU_ITEMS.some(item => item.id === section) ? section : 'overview';
};

const getAdminPath = (tab) => (tab === 'overview' ? '/admin' : `/admin/${tab}`);

const spreadsheetEscape = (value) => {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  const normalized = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return normalized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

const getNestedValue = (row, path) => {
  if (!path) return '';
  return String(path).split('.').reduce((value, key) => value?.[key], row);
};

const buildSpreadsheetHTML = (rows = [], columns = []) => {
  const headers = columns.map(column => `<th>${spreadsheetEscape(column.label || column.key)}</th>`).join('');
  const body = rows.map(row => `<tr>${columns.map(column => {
    const value = column.value ? column.value(row) : getNestedValue(row, column.key);
    return `<td>${spreadsheetEscape(value)}</td>`;
  }).join('')}</tr>`).join('');
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
  </head>
  <body>
    <table border="1">
      <thead><tr>${headers}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </body>
</html>`;
};

const toSpreadsheetFilename = (filename = 'urbanmenphoto_report.xls') => (
  String(filename).replace(/\.(csv|xlsx?)$/i, '') + '.xls'
);

const downloadSpreadsheet = (filename, rows = [], columns = []) => {
  const html = buildSpreadsheetHTML(rows, columns);
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = toSpreadsheetFilename(filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const reportDateStamp = () => new Date().toISOString().slice(0, 10);

const fetchAllAdminRows = async (endpoint, adminToken, extraParams = {}) => {
  const rows = [];
  let page = 1;
  let totalPages = 1;

  do {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '100',
      ...extraParams,
    });
    const separator = endpoint.includes('?') ? '&' : '?';
    const data = await backendRequest(`${endpoint}${separator}${params.toString()}`, adminToken);
    if (Array.isArray(data)) return data;

    const items = Array.isArray(data?.items) ? data.items : [];
    rows.push(...items);
    totalPages = Number(data?.totalPages || 1);
    page += 1;
  } while (page <= totalPages);

  return rows;
};

const SESSION_EXPORT_COLUMNS = [
  { key: 'id', label: 'Session ID' },
  { key: 'shortCode', label: 'Short Code' },
  { key: 'status', label: 'Status' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'layoutId', label: 'Layout' },
  { key: 'paperSize', label: 'Paper Size' },
  { key: 'frameId', label: 'Frame' },
  { key: 'downloadUrl', label: 'Download URL' },
  { key: 'finalImage.url', label: 'Final Image' },
  { key: 'printImage.url', label: 'Print Image' },
  { key: 'animatedImage.url', label: 'Animated Image' },
  { key: 'images', label: 'Original Count', value: row => Array.isArray(row.images) ? row.images.length : 0 },
  { key: 'createdAt', label: 'Created At', value: row => formatDateTime(row.createdAt) },
  { key: 'updatedAt', label: 'Updated At', value: row => formatDateTime(row.updatedAt) },
  { key: 'expiresAt', label: 'Expires At', value: row => formatDateTime(row.expiresAt) },
];

const PAYMENT_EXPORT_COLUMNS = [
  { key: 'id', label: 'Payment ID' },
  { key: 'sessionId', label: 'Session ID' },
  { key: 'provider', label: 'Provider' },
  { key: 'amount', label: 'Amount' },
  { key: 'currency', label: 'Currency' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Created At', value: row => formatDateTime(row.createdAt) },
  { key: 'updatedAt', label: 'Updated At', value: row => formatDateTime(row.updatedAt) },
];

const TRANSACTION_EXPORT_COLUMNS = [
  { key: 'id', label: 'Transaction ID' },
  { key: 'sessionId', label: 'Session ID' },
  { key: 'provider', label: 'Provider' },
  { key: 'amount', label: 'Amount' },
  { key: 'currency', label: 'Currency' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Created At', value: row => formatDateTime(row.createdAt) },
];

const PAYMENT_LOG_EXPORT_COLUMNS = [
  { key: 'id', label: 'Log ID' },
  { key: 'paymentId', label: 'Payment ID' },
  { key: 'sessionId', label: 'Session ID' },
  { key: 'event', label: 'Event' },
  { key: 'provider', label: 'Provider' },
  { key: 'amount', label: 'Amount' },
  { key: 'currency', label: 'Currency' },
  { key: 'statusBefore', label: 'Status Before' },
  { key: 'statusAfter', label: 'Status After' },
  { key: 'providerRef', label: 'Provider Ref' },
  { key: 'ip', label: 'IP' },
  { key: 'userAgent', label: 'User Agent' },
  { key: 'createdAt', label: 'Created At', value: row => formatDateTime(row.createdAt) },
];

const MESSAGE_EXPORT_COLUMNS = [
  { key: 'id', label: 'Message ID' },
  { key: 'sessionId', label: 'Session ID' },
  { key: 'channel', label: 'Channel' },
  { key: 'recipient', label: 'Recipient' },
  { key: 'downloadUrl', label: 'Download URL' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Created At', value: row => formatDateTime(row.createdAt) },
];

const AUDIT_EXPORT_COLUMNS = [
  { key: 'id', label: 'Audit ID' },
  { key: 'actorId', label: 'Actor ID' },
  { key: 'action', label: 'Action' },
  { key: 'resource', label: 'Resource' },
  { key: 'metadata', label: 'Metadata', value: row => row.metadata ? JSON.stringify(row.metadata) : '' },
  { key: 'ip', label: 'IP' },
  { key: 'userAgent', label: 'User Agent' },
  { key: 'success', label: 'Success', value: row => row.success ? 'yes' : 'no' },
  { key: 'createdAt', label: 'Created At', value: row => formatDateTime(row.createdAt) },
];

function StatusBadge({ status, before }) {
  const normalized = String(status || 'unknown').toLowerCase();
  const isSuccess = ['paid', 'success', 'sent', 'completed', 'finalized', 'active', 'saved', 'local'].includes(normalized);
  const isPending = ['pending', 'created', 'processing', 'queued', 'waiting', 'saving'].includes(normalized);
  const isFailed = ['failed', 'expired', 'cancelled', 'canceled', 'error', 'inactive'].includes(normalized);
  const style = isSuccess
    ? { background: '#d1fae5', color: '#047857', border: '1px solid #a7f3d0' }
    : isPending
      ? { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }
      : isFailed
        ? { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }
        : { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' };

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0.25rem 0.65rem',
      borderRadius: '8px',
      fontSize: '0.78rem',
      fontWeight: '800',
      lineHeight: 1.2,
      textTransform: 'capitalize',
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {normalized === 'paid' ? 'Success Paid' : `${before ? `${before} → ` : ''}${normalized}`}
    </span>
  );
}

const getPaginationItems = (currentPage, totalPages) => {
  const total = Math.max(1, Number(totalPages || 1));
  const current = Math.min(Math.max(1, Number(currentPage || 1)), total);
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 3) return [1, 2, 3, 'ellipsis', total];
  if (current >= total - 2) return [1, 'ellipsis', total - 2, total - 1, total];
  return [1, 'ellipsis-left', current, 'ellipsis-right', total];
};

function AdminPagination({ page, totalPages, pageSize, total, onPageChange, onPageSizeChange }) {
  const safeTotal = Math.max(0, Number(total || 0));
  const safePageSize = Math.max(1, Number(pageSize || 10));
  const safeTotalPages = Math.max(1, Number(totalPages || Math.ceil(safeTotal / safePageSize) || 1));
  const safePage = Math.min(Math.max(1, Number(page || 1)), safeTotalPages);
  const start = safeTotal ? ((safePage - 1) * safePageSize) + 1 : 0;
  const end = Math.min(safeTotal, safePage * safePageSize);
  const canPrev = safePage > 1;
  const canNext = safePage < safeTotalPages;

  const navButtonStyle = (disabled = false) => ({
    border: 'none',
    background: 'transparent',
    color: disabled ? '#cbd5e1' : '#64748b',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 900,
    fontSize: '0.82rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.35rem 0.25rem',
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '1rem', padding: '0.9rem 0', color: '#64748b', fontSize: '0.82rem', fontWeight: 900 }}>
      <div>
        Menampilkan {start}-{end} dari {safeTotal}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={() => canPrev && onPageChange(safePage - 1)}
          disabled={!canPrev}
          style={navButtonStyle(!canPrev)}
        >
          <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>&lt;</span> Prev
        </button>
        {getPaginationItems(safePage, safeTotalPages).map((item, index) => {
          const isEllipsis = String(item).startsWith('ellipsis');
          const isActive = item === safePage;
          if (isEllipsis) {
            return (
              <span key={`${item}-${index}`} style={{ width: '24px', height: '24px', borderRadius: '8px', background: '#f1f5f9', color: '#94a3b8', display: 'inline-grid', placeItems: 'center', fontWeight: 900 }}>
                ...
              </span>
            );
          }
          return (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? '#40a3eb' : '#f1f5f9',
                color: isActive ? 'white' : '#64748b',
                cursor: 'pointer',
                fontWeight: 900,
                fontSize: '0.78rem',
                display: 'inline-grid',
                placeItems: 'center',
              }}
            >
              {item}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => canNext && onPageChange(safePage + 1)}
          disabled={!canNext}
          style={navButtonStyle(!canNext)}
        >
          Next <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>&gt;</span>
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <select
          value={safePageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          style={{ padding: '0.45rem 0.7rem', minWidth: '62px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 900, outline: 'none' }}
        >
          {[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
        </select>
      </div>
    </div>
  );
}

function KioskSettingsTab({ projectId, adminToken, onBack }) {
  const [settings, setSettings] = useState(null);
  const [savedMessage, setSavedMessage] = useState('');
  const [dslrCameras, setDslrCameras] = useState([]);
  const [webcams, setWebcams] = useState([]);
  const [cameraMessage, setCameraMessage] = useState('');
  const [refreshingCameraId, setRefreshingCameraId] = useState('');
  const [lastRefreshedCameraId, setLastRefreshedCameraId] = useState('');
  const [hardwarePrinters, setHardwarePrinters] = useState([]);
  const [printerMessage, setPrinterMessage] = useState('');
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isTestingCamera, setIsTestingCamera] = useState(false);
  const [previewCameraId, setPreviewCameraId] = useState('');
  const [isTestPrintActive, setIsTestPrintActive] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectCover, setProjectCover] = useState('');
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const previewVideoRef = useRef(null);
  const previewStreamRef = useRef(null);
  const [previewImage, setPreviewImage] = useState('');

  useEffect(() => () => stopStream(previewStreamRef.current), []);

  useEffect(() => {
    const handleAfterPrint = () => setIsTestPrintActive(false);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const url = projectId ? `/api/admin/projects/${projectId}` : `/api/settings`;
        const res = await backendRequest(url, adminToken);
        const fetchedSettings = projectId ? (res.settings || {}) : (res || {});

        // Merge with defaults and ensure exactly 2 camera profiles exist
        const mergedSettings = { ...defaultKioskSettings, ...fetchedSettings };
        mergedSettings.cameraProfiles = normalizeCameraProfiles(mergedSettings);

        setSettings(mergedSettings);
        if (projectId) {
          setProjectName(res.name || '');
          setProjectCover(res.coverImage || res.cover || '');
        }
      } catch (err) {
        console.error("Failed to fetch settings", err);
      }
    };
    fetchSettings();
  }, [projectId, adminToken]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const loadCameraDevices = async (profile, cameraNumber) => {
    if (profile) {
      setRefreshingCameraId(profile.id);
      setLastRefreshedCameraId(profile.id);
    }
    setCameraMessage('');
    try {
      const dslrs = await listDslrCameras();
      setDslrCameras(dslrs);
      try {
        const cams = await listVideoDevices();
        setWebcams(cams);
      } catch (e) {
        console.warn('Webcams not found or permission denied', e);
      }
      setCameraMessage(profile
        ? `Kamera ${cameraNumber} diperbarui: ${dslrs.length} Canon DSLR terdeteksi dari Hardware Agent.`
        : `${dslrs.length} Canon DSLR terdeteksi dari Hardware Agent.`);
    } catch (err) {
      setDslrCameras([]);
      setCameraMessage(err.message || 'Hardware Agent tidak dapat membaca Canon DSLR.');
    } finally {
      if (profile) setRefreshingCameraId('');
    }
  };

  useEffect(() => {
    loadCameraDevices();
  }, []);

  const loadHardwarePrinters = async () => {
    setIsLoadingPrinters(true);
    try {
      const printers = await listHardwarePrinters();
      setHardwarePrinters(printers);
      setPrinterMessage(`${printers.length} printer Windows terdeteksi dari Hardware Agent.`);
    } catch (error) {
      setHardwarePrinters([]);
      setPrinterMessage(error.message || 'Hardware Agent tidak dapat membaca printer.');
    } finally {
      setIsLoadingPrinters(false);
    }
  };

  useEffect(() => {
    loadHardwarePrinters();
  }, []);

  const updateCameraProfile = (profileId, changes) => {
    setSettings(prev => ({
      ...prev,
      cameraProfiles: (prev.cameraProfiles || []).map(profile => profile.id === profileId ? { ...profile, ...changes } : profile),
    }));
  };

  const getCameraProfileStatus = (profile) => {
    if (!profile.enabled) return { text: 'Nonaktif', color: '#6b7280', background: '#f3f4f6' };
    if ((profile.captureMode || 'dslr') === 'webcam') {
      return profile.deviceId ? { text: 'Webcam siap digunakan', color: '#166534', background: '#dcfce7' } : { text: 'Pilih Webcam Device', color: '#92400e', background: '#fef3c7' };
    }
    if (!profile.tetherPort) return { text: 'Pilih Canon DSLR', color: '#92400e', background: '#fef3c7' };
    return dslrCameras.some(camera => camera.port === profile.tetherPort)
      ? { text: 'Canon DSLR terdeteksi dan siap memotret', color: '#166534', background: '#dcfce7' }
      : { text: 'Canon DSLR tidak terdeteksi', color: '#991b1b', background: '#fee2e2' };
  };

  const handleTestCamera = async (cameraId) => {
    setIsTestingCamera(true);
    setCameraMessage('');
    setPreviewImage('');
    stopStream(previewStreamRef.current);
    try {
      const cameraProfile = settings.cameraProfiles?.find(profile => profile.id === cameraId) || settings.cameraProfiles?.[0];
      setPreviewCameraId(cameraProfile?.id || '');

      if ((cameraProfile?.captureMode || 'dslr') === 'webcam') {
        if (!cameraProfile?.deviceId && !cameraProfile?.facingMode) throw new Error('Pilih Webcam Device terlebih dahulu.');

        const constraints = {
          video: cameraProfile?.deviceId ? { deviceId: { exact: cameraProfile.deviceId } } : { facingMode: cameraProfile?.facingMode || 'user' }
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        previewStreamRef.current = stream;
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = stream;
          previewVideoRef.current.play().catch(e => console.warn('Play interrupted', e));
        }
        setCameraMessage(`Preview Webcam aktif.`);
        return;
      }

      if (!cameraProfile?.tetherPort) throw new Error('Pilih Canon DSLR terlebih dahulu.');
      const result = await captureDslrPhoto(cameraProfile.tetherPort);
      setPreviewImage(result.url);
      setCameraMessage(`Foto test ${cameraProfile.name || 'DSLR'} berhasil diambil.`);
    } catch (err) {
      setCameraMessage(err.message || 'Kamera tidak bisa ditest.');
    } finally {
      setIsTestingCamera(false);
    }
  };

  const handleStopPreview = () => {
    stopStream(previewStreamRef.current);
    previewStreamRef.current = null;
    setPreviewCameraId('');
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    setPreviewImage('');
    setCameraMessage('Preview kamera dihentikan.');
  };

  const handleTestPrint = () => {
    setIsTestPrintActive(true);
    window.setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        reportMonitoringError({
          category: 'print',
          message: err.message || 'Gagal test print dari admin.',
          source: 'admin',
          metadata: {
            trigger: 'admin_test_print',
            printerName: settings.printerName || '',
          },
        });
      }
    }, 100);
  };

  const handleUseCurrentFrontendUrl = () => {
    const currentUrl = window.location.origin.replace(/\/$/, '');
    setSettings(prev => ({
      ...prev,
      publicFrontendUrl: currentUrl,
      publicGalleryBaseUrl: currentUrl,
    }));
    setSavedMessage('URL frontend saat ini dipakai untuk QR/gallery. Jangan lupa simpan.');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const handleUseDefaultBackendUrl = () => {
    setSettings(prev => ({ ...prev, backendApiUrl: BACKEND_API_URL }));
    setSavedMessage('Backend API dikembalikan ke default. Jangan lupa simpan.');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const handleCopyText = async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setSavedMessage('URL berhasil disalin.');
      setTimeout(() => setSavedMessage(''), 2500);
    } catch {
      setSavedMessage('Browser tidak mengizinkan copy otomatis.');
      setTimeout(() => setSavedMessage(''), 2500);
    }
  };

  const handleUploadCover = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append('file', file, file.name);

      const res = await fetch(`${getBackendApiUrl()}/api/admin/frames/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData
      });
      if (!res.ok) throw new Error('Gagal upload cover');
      const resData = await res.json();
      const assetUrl = resData.data?.url || resData.url || resData.imageUrl;
      if (assetUrl) {
        setProjectCover(assetUrl);
      } else {
        throw new Error('URL gambar tidak ditemukan dari response server');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setIsUploadingCover(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (projectId) {
        await backendRequest(`/api/admin/projects/${projectId}`, adminToken, {
          method: 'PATCH',
          body: JSON.stringify({ settings, name: projectName, coverImage: projectCover })
        });
      } else {
        await fetch(`${BACKEND_API_URL}/api/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        });
      }
      setSavedMessage('Pengaturan berhasil disimpan!');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (err) {
      alert("Gagal menyimpan: " + err.message);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        alert(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  if (!settings) return <div style={{ padding: '2rem' }}>Memuat pengaturan...</div>;

  return (
    <div style={{ background: 'white', padding: '2.5rem', borderRadius: '8px', border: '1px solid #e9ecef', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid #e9ecef', paddingBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#111' }}>{projectId ? `Project Settings (${projectId})` : 'Global Kiosk Settings'}</h2>
          <p style={{ margin: 0, color: '#6c757d', marginTop: '0.2rem', fontSize: '0.9rem' }}>Konfigurasi mesin fisik photobooth ini.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {onBack && (
            <button type="button" onClick={onBack} style={{ padding: '0.6rem 1.2rem', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              Kembali
            </button>
          )}
          <button onClick={() => { window.location.href = '/'; }} style={{ padding: '0.6rem 1.2rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            Buka Photobooth
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ width: '100%' }}>
        {isTestPrintActive && (
          <div className="print-area">
            <div style={{
              width: '4in',
              height: '6in',
              boxSizing: 'border-box',
              border: '10px solid #40a3eb',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.25in',
              fontFamily: 'Arial, sans-serif',
              color: '#111827',
              background: '#fff7ed',
            }}>
              <div style={{ width: '0.65in', height: '0.65in', borderRadius: '8px', background: '#40a3eb', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: '0.22in' }}>up</div>
              <div style={{ fontSize: '0.26in', fontWeight: 900 }}>Urbanmenphoto</div>
              <div style={{ width: '2.7in', height: '2.7in', border: '3px dashed #fdba74', borderRadius: '8px', display: 'grid', placeItems: 'center', textAlign: 'center', color: '#9a3412', fontWeight: 900, fontSize: '0.18in' }}>
                TEST PRINT
              </div>
              <div style={{ fontSize: '0.13in', color: '#64748b', textAlign: 'center', lineHeight: 1.4 }}>
                {settings.kioskName}<br />
                {new Date().toLocaleString('id-ID')}
              </div>
            </div>
          </div>
        )}

        <div style={{ marginBottom: '1.5rem', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#fff' }}>
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, color: '#111827' }}>Booth Profile</h3>
            <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.85rem' }}>Identitas booth untuk log, gallery, dan operasional event.</p>
          </div>

          {projectId && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 'bold', color: '#495057', fontSize: '0.9rem' }}>Nama Proyek / Event</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '0.95rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 'bold', color: '#495057', fontSize: '0.9rem' }}>Cover Image</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {projectCover && (
                    <img src={projectCover.startsWith('/') ? `${getBackendApiUrl()}${projectCover}` : projectCover} alt="Cover Preview" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #ced4da' }} />
                  )}
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadCover}
                      disabled={isUploadingCover}
                      style={{
                        position: 'absolute',
                        width: '100%',
                        height: '100%',
                        opacity: 0,
                        cursor: isUploadingCover ? 'wait' : 'pointer',
                        zIndex: 10,
                      }}
                    />
                    <div style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px dashed #ced4da', fontSize: '0.95rem', background: '#f8fafc', color: '#64748b', textAlign: 'center' }}>
                      {isUploadingCover ? 'Mengunggah...' : (projectCover ? 'Ganti Cover Image' : 'Pilih/Upload Image')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 'bold', color: '#495057', fontSize: '0.9rem' }}>Booth ID</label>
              <input
                type="text"
                name="boothId"
                value={settings.boothId || ''}
                readOnly
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '0.95rem', background: '#f8fafc', color: '#64748b' }}
              />
              <p style={{ fontSize: '0.78rem', color: '#868e96', marginTop: '0.35rem' }}>ID unik browser/mesin ini untuk membedakan booth.</p>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 'bold', color: '#495057', fontSize: '0.9rem' }}>Nama Kiosk / Cabang</label>
              <input
                type="text"
                name="kioskName"
                value={settings.kioskName || ''}
                onChange={handleChange}
                placeholder="Urbanmenphoto Booth"
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '1rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 'bold', color: '#495057', fontSize: '0.9rem' }}>Nama Event</label>
              <input
                type="text"
                name="eventName"
                value={settings.eventName || ''}
                onChange={handleChange}
                placeholder="Contoh: Wedding Andi & Sinta"
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '1rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 'bold', color: '#495057', fontSize: '0.9rem' }}>Lokasi Booth</label>
              <input
                type="text"
                name="boothLocation"
                value={settings.boothLocation || ''}
                onChange={handleChange}
                placeholder="Contoh: Lobby Utama / Ballroom A"
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '1rem' }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 'bold', color: '#495057', fontSize: '0.9rem' }}>Operator</label>
              <input
                type="text"
                name="operatorName"
                value={settings.operatorName || ''}
                onChange={handleChange}
                placeholder="Nama operator yang jaga booth"
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '1rem' }}
              />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '1.5rem', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, color: '#111827' }}>Network Settings</h3>
              <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.85rem' }}>Atur alamat yang dipakai QR customer, gallery, dan koneksi backend.</p>
            </div>
            <button
              type="button"
              onClick={handleUseCurrentFrontendUrl}
              style={{ padding: '0.65rem 1rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}
            >
              Pakai URL Sekarang
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 'bold', color: '#495057', fontSize: '0.9rem' }}>Public Frontend URL</label>
              <input
                type="url"
                name="publicFrontendUrl"
                value={settings.publicFrontendUrl || ''}
                onChange={handleChange}
                placeholder="http://192.168.1.10:5173"
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '1rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 'bold', color: '#495057', fontSize: '0.9rem' }}>Public Gallery / QR URL</label>
              <input
                type="url"
                name="publicGalleryBaseUrl"
                value={settings.publicGalleryBaseUrl || ''}
                onChange={handleChange}
                placeholder="http://192.168.1.10:5173"
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '1rem' }}
              />
              <p style={{ fontSize: '0.78rem', color: '#868e96', marginTop: '0.35rem' }}>QR akan menjadi URL ini + /gallery/id.</p>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 'bold', color: '#495057', fontSize: '0.9rem' }}>Backend API URL</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem' }}>
                <input
                  type="url"
                  name="backendApiUrl"
                  value={settings.backendApiUrl || ''}
                  onChange={handleChange}
                  placeholder={BACKEND_API_URL}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '1rem' }}
                />
                <button
                  type="button"
                  onClick={handleUseDefaultBackendUrl}
                  style={{ padding: '0.65rem 1rem', background: 'white', color: '#111827', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                >
                  Default
                </button>
              </div>
            </div>

          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              type="button"
              onClick={() => handleCopyText(window.location.origin)}
              style={{ padding: '0.75rem', background: 'white', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', textAlign: 'left', overflowWrap: 'anywhere' }}
            >
              Browser sekarang: {window.location.origin}
            </button>
            <button
              type="button"
              onClick={() => handleCopyText(getBackendApiUrl())}
              style={{ padding: '0.75rem', background: 'white', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', textAlign: 'left', overflowWrap: 'anywhere' }}
            >
              Backend aktif: {getBackendApiUrl()}
            </button>
          </div>

          {/(localhost|127\.0\.0\.1)/.test(`${settings.publicFrontendUrl || window.location.origin} ${settings.publicGalleryBaseUrl || ''}`) && (
            <div style={{ marginTop: '1rem', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #bae0f9', background: '#fff7ed', color: '#9a3412', fontWeight: 800, fontSize: '0.86rem' }}>
              Untuk test dari HP, ganti localhost menjadi IP komputer booth, contoh http://192.168.x.x:5173.
            </div>
          )}
        </div>

        <div style={{ marginBottom: '1.5rem', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#fff7ed' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 'bold', color: '#495057' }}>Camera Device Booth</label>
              <p style={{ fontSize: '0.82rem', color: '#868e96', margin: 0 }}>Dipilih admin/operator dan otomatis dipakai customer saat sesi foto.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            {(settings.cameraProfiles || []).map((profile, index) => (
              <div key={profile.id} style={{ padding: '1rem', borderRadius: '8px', border: '1px solid #bae0f9', background: 'white' }}>
                <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 'bold', color: '#495057', fontSize: '0.9rem' }}>Posisi Kamera {index + 1}</label>
                <input
                  value={profile.name || ''}
                  onChange={(event) => updateCameraProfile(profile.id, { name: event.target.value })}
                  placeholder={`Posisi Kamera ${index + 1}`}
                  style={{ width: '100%', boxSizing: 'border-box', marginBottom: '0.6rem', padding: '0.7rem', borderRadius: '8px', border: '1px solid #ced4da' }}
                />
                <div style={{ marginBottom: '0.4rem', color: '#495057', fontWeight: 700, fontSize: '0.82rem' }}>Mode Kamera</div>
                <select value={profile.captureMode || 'dslr'} onChange={(event) => updateCameraProfile(profile.id, { captureMode: event.target.value })} style={{ width: '100%', marginBottom: '0.6rem', padding: '0.7rem', borderRadius: '8px', border: '1px solid #ced4da', background: 'white' }}>
                  <option value="dslr">DSLR (USB / gphoto2)</option>
                  <option value="webcam">Webcam (Browser / HP)</option>
                </select>

                {(profile.captureMode || 'dslr') === 'dslr' ? (
                  <>
                    <div style={{ marginBottom: '0.4rem', color: '#495057', fontWeight: 700, fontSize: '0.82rem' }}>Canon DSLR melalui Camera Bridge (Zadig / WinUSB)</div>
                    <select value={profile.tetherPort || ''} onChange={(event) => updateCameraProfile(profile.id, { tetherPort: event.target.value })} style={{ width: '100%', marginTop: '0.6rem', padding: '0.7rem', borderRadius: '8px', border: '1px solid #ced4da', background: 'white' }}>
                      <option value="">Pilih DSLR dari Camera Agent</option>
                      {dslrCameras.map(camera => <option key={camera.port} value={camera.port}>{camera.model} — {camera.stable === false ? `${camera.port} (ID sementara)` : camera.port}</option>)}
                    </select>
                  </>
                ) : (
                  <>
                    <div style={{ marginBottom: '0.4rem', color: '#495057', fontWeight: 700, fontSize: '0.82rem' }}>Pilih Webcam Device (Aktifkan Izin Kamera di Browser)</div>
                    <select value={profile.deviceId || ''} onChange={(event) => updateCameraProfile(profile.id, { deviceId: event.target.value, deviceLabel: event.target.options[event.target.selectedIndex].text })} style={{ width: '100%', marginTop: '0.6rem', padding: '0.7rem', borderRadius: '8px', border: '1px solid #ced4da', background: 'white' }}>
                      <option value="">Default Kamera ({profile.facingMode === 'environment' ? 'Belakang' : 'Depan'})</option>
                      {webcams.map(cam => <option key={cam.deviceId} value={cam.deviceId}>{cam.label}</option>)}
                    </select>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => loadCameraDevices(profile, index + 1)}
                  disabled={Boolean(refreshingCameraId)}
                  style={{ width: '100%', marginTop: '0.6rem', padding: '0.65rem 0.8rem', background: '#111827', color: 'white', border: 'none', borderRadius: '8px', cursor: refreshingCameraId ? 'wait' : 'pointer', fontWeight: 'bold' }}
                >
                  {refreshingCameraId === profile.id ? `Mengecek Kamera ${index + 1}...` : `Refresh Kamera ${index + 1}`}
                </button>
                {lastRefreshedCameraId === profile.id && cameraMessage && (
                  <div style={{ marginTop: '0.55rem', padding: '0.55rem 0.65rem', borderRadius: '7px', background: dslrCameras.length ? '#dcfce7' : '#fef2f2', color: dslrCameras.length ? '#166534' : '#b91c1c', fontSize: '0.78rem', fontWeight: 700, lineHeight: 1.35 }}>
                    {cameraMessage}
                  </div>
                )}
                {(() => {
                  const status = getCameraProfileStatus(profile);
                  return <div style={{ marginTop: '0.6rem', padding: '0.45rem 0.6rem', borderRadius: '7px', color: status.color, background: status.background, fontSize: '0.78rem', fontWeight: 800 }}>{status.text}</div>;
                })()}
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.7rem', color: '#495057', fontSize: '0.85rem', fontWeight: 'bold' }}>
                  <input type="checkbox" checked={Boolean(profile.enabled)} onChange={(event) => updateCameraProfile(profile.id, { enabled: event.target.checked })} style={{ width: 17, height: 17, accentColor: '#40a3eb' }} />
                  Aktifkan pilihan posisi ini
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.45rem', color: '#495057', fontSize: '0.85rem', fontWeight: 'bold' }}>
                  <input type="checkbox" checked={Boolean(profile.mirror)} onChange={(event) => updateCameraProfile(profile.id, { mirror: event.target.checked })} style={{ width: 17, height: 17, accentColor: '#40a3eb' }} />
                  Mirror preview & hasil
                </label>

                {profile.enabled && (
                  <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #e5e7eb' }}>
                    <button
                      type="button"
                      onClick={() => handleTestCamera(profile.id)}
                      disabled={isTestingCamera}
                      style={{ width: '100%', padding: '0.85rem 1rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: isTestingCamera ? 'wait' : 'pointer', fontWeight: 'bold' }}
                    >
                      {isTestingCamera && previewCameraId === profile.id ? 'Menyalakan...' : `Test Kamera ${index + 1}`}
                    </button>

                    {previewCameraId === profile.id && (
                      <div style={{ marginTop: '1rem' }}>
                        <div style={{ background: '#111827', borderRadius: '8px', minHeight: '180px', overflow: 'hidden', display: 'grid', placeItems: 'center', border: '1px solid #1f2937', marginBottom: '0.75rem' }}>
                          {previewImage ? (
                            <img src={previewImage} alt="Hasil foto" style={{ width: '100%', height: '100%', minHeight: '180px', objectFit: 'contain', display: 'block' }} />
                          ) : (
                            <video
                              ref={previewVideoRef}
                              muted
                              playsInline
                              className={profile.mirror ? 'is-mirrored' : ''}
                              style={{ width: '100%', height: '100%', minHeight: '180px', objectFit: 'cover', display: 'block' }}
                            />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleStopPreview}
                          style={{ width: '100%', padding: '0.85rem 1rem', background: 'white', color: '#111827', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          Stop Preview
                        </button>
                        {cameraMessage && (
                          <div style={{ marginTop: '0.75rem', padding: '0.8rem', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e5e7eb', color: '#4b5563', fontSize: '0.82rem', lineHeight: 1.4 }}>
                            {cameraMessage}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p style={{ margin: '0 0 1rem', fontSize: '0.78rem', color: '#868e96' }}>Pilih ID Canon berbeda untuk setiap posisi. ID berformat canon:serial bersifat permanen; jangan simpan pilihan bertanda ID sementara.</p>
        </div>

        <div style={{ marginBottom: '1.5rem', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 'bold', color: '#495057' }}>Printer Booth</label>
              <p style={{ fontSize: '0.82rem', color: '#868e96', margin: 0 }}>Foto dikirim langsung oleh Hardware Agent ke driver OS/Laptop, tanpa dialog print browser.</p>
            </div>
            <button
              type="button"
              onClick={loadHardwarePrinters}
              disabled={isLoadingPrinters}
              style={{ padding: '0.65rem 1rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: isLoadingPrinters ? 'wait' : 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}
            >
              {isLoadingPrinters ? 'Membaca...' : 'Refresh Printer'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 'bold', color: '#495057', fontSize: '0.9rem' }}>Mode Print</label>
              <div style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', fontWeight: 800 }}>Printer Windows melalui Hardware Agent</div>
              <p style={{ fontSize: '0.78rem', color: '#868e96', marginTop: '0.35rem' }}>Menggunakan driver printer yang terpasang di Mini PC.</p>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 'bold', color: '#495057', fontSize: '0.9rem' }}>Printer (Terinstall di OS via USB)</label>
              <select
                value={settings.printerName || ''}
                onChange={(event) => setSettings(previous => ({ ...previous, printerName: event.target.value, printMode: 'hardware_agent' }))}
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '1rem', background: 'white' }}
              >
                <option value="">Pilih printer dari Hardware Agent</option>
                {hardwarePrinters.map(printer => <option key={printer.name} value={printer.name}>{printer.name}{printer.isDefault ? ' (Default Windows)' : ''}</option>)}
              </select>
              <p style={{ fontSize: '0.78rem', color: hardwarePrinters.length ? '#166534' : '#b91c1c', marginTop: '0.35rem' }}>{printerMessage || 'Klik Refresh Printer untuk membaca driver Windows.'}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.9rem 1rem', borderRadius: '8px', border: '1px solid #e5e7eb', background: 'white', color: '#495057', fontWeight: 'bold' }}>
              <input
                type="checkbox"
                name="autoPrintEnabled"
                checked={Boolean(settings.autoPrintEnabled)}
                onChange={handleChange}
                style={{ width: 18, height: 18, accentColor: '#40a3eb' }}
              />
              Auto print setelah foto selesai
            </label>

            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 'bold', color: '#495057', fontSize: '0.9rem' }}>Delay Auto Print (detik)</label>
              <input
                type="number"
                name="printDelaySeconds"
                value={settings.printDelaySeconds ?? 1.5}
                onChange={handleChange}
                min="0"
                max="10"
                step="0.5"
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '1rem' }}
              />
            </div>
          </div>

          <textarea
            name="printNote"
            value={settings.printNote || ''}
            onChange={handleChange}
            placeholder="Catatan operator, contoh: set printer default ke 4R borderless sebelum event."
            style={{ width: '100%', minHeight: '76px', marginTop: '1rem', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '0.95rem', resize: 'vertical' }}
          />
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#495057' }}>Idle Timeout (Detik)</label>
          <input
            type="number"
            name="idleTimeout"
            value={settings.idleTimeout ?? 60}
            onChange={handleChange}
            min="10" max="300"
            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '1rem' }}
          />
          <p style={{ fontSize: '0.8rem', color: '#868e96', marginTop: '0.3rem' }}>Waktu diam sebelum sistem otomatis kembali ke layar awal.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="submit" style={{ padding: '0.8rem 2rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>
            Simpan Pengaturan
          </button>
          {savedMessage && <span style={{ color: '#10B981', fontWeight: 'bold' }}>✓ {savedMessage}</span>}
        </div>
      </form>
    </div>
  );
}

const HealthPill = ({ status }) => {
  const styles = {
    ok: { background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', label: 'OK' },
    warn: { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', label: 'Warning' },
    fail: { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', label: 'Failed' },
    checking: { background: '#e0f2fe', color: '#075985', border: '1px solid #bae6fd', label: 'Checking' },
    idle: { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', label: 'Idle' },
  };
  const style = styles[status] || styles.idle;
  return (
    <span style={{ padding: '0.28rem 0.7rem', borderRadius: '8px', fontWeight: 900, fontSize: '0.78rem', whiteSpace: 'nowrap', ...style }}>
      {style.label}
    </span>
  );
};

const createHealthItem = (id, label, status, detail, meta = '') => ({ id, label, status, detail, meta });

import { FILTER_CATEGORIES, getEditorFilterStyle, fetchCustomFilters } from '../utils/photoConfig.js';

function FilterManagementTab({ adminToken }) {
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFilter, setNewFilter] = useState({ name: '', category: 'CUSTOM', css: '', active: true });

  const loadFilters = async () => {
    setLoading(true);
    await fetchCustomFilters();
    setLoading(false);
  };

  useEffect(() => {
    loadFilters();
  }, []);

  const handleSaveFilter = async () => {
    if (!newFilter.name || !newFilter.css) {
      alert('Nama dan Aturan CSS wajib diisi!');
      return;
    }

    try {
      const res = await fetch(`${getBackendApiUrl()}/api/admin/filters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(newFilter)
      });
      if (res.ok) {
        setShowAddModal(false);
        setNewFilter({ name: '', category: 'CUSTOM', css: '', active: true });
        loadFilters();
      } else {
        const err = await res.json();
        alert('Gagal menyimpan filter: ' + (err.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  if (loading) {
    return (
      <div style={{ background: 'white', width: '100%', padding: '3rem', borderRadius: '8px', textAlign: 'center', color: '#6b7280' }}>
        Memuat daftar filter...
      </div>
    );
  }

  return (
    <div style={{ background: 'white', width: '100%', padding: '2rem', borderRadius: '8px', border: '1px solid #e9ecef', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#111827' }}>Manajemen Filter</h2>
          <p style={{ margin: '0.4rem 0 0', color: '#6b7280' }}>Daftar efek warna filter yang tersedia untuk digunakan oleh pelanggan pada saat sesi foto (Studio Editor).</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{ background: '#40a3eb', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 2px 4px rgba(249, 115, 22, 0.2)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Tambah Filter
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', marginTop: '2rem' }}>
        {Object.entries(FILTER_CATEGORIES).filter(([category]) => category !== 'ALL').map(([category, filters]) => (
          <div key={category}>
            <h3 style={{ borderBottom: '2px solid #e5e7eb', paddingBottom: '0.5rem', marginBottom: '1.5rem', color: '#374151', fontSize: '1.1rem' }}>
              Kategori: {category}
            </h3>

            {filters.length === 0 ? (
              <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '0.9rem' }}>Belum ada filter di kategori ini.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.5rem' }}>
                {filters.map(filterName => {
                  const cssFilter = getEditorFilterStyle(filterName);
                  return (
                    <div key={filterName} style={{ background: '#ffffff', borderRadius: '8px', padding: '1rem', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                      <div style={{ position: 'relative', width: '100%', aspectRatio: '4/5', borderRadius: '8px', overflow: 'hidden', marginBottom: '1rem' }}>
                        <div style={{ width: '100%', height: '100%', background: 'url(https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=500&fit=crop) center/cover', filter: cssFilter }}></div>
                        <div style={{ position: 'absolute', top: '0', left: '0', background: '#40a3eb', color: 'white', padding: '0.2rem 0.6rem', borderBottomRightRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                          LUT
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0 0.25rem' }}>
                        <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', color: '#111827' }}>{filterName}</h4>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>Terakhir Diperbarui: Jul 29 2026 at 20:22</p>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>Owned by me</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', width: '100%', maxWidth: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 1.5rem', color: '#111827' }}>Tambah Filter Kustom</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#374151', fontWeight: 'bold' }}>Nama Filter</label>
                <input
                  type="text"
                  value={newFilter.name}
                  onChange={(e) => setNewFilter({ ...newFilter, name: e.target.value })}
                  placeholder="Misal: RETRO BREEZE"
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#374151', fontWeight: 'bold' }}>Kategori</label>
                <select
                  value={newFilter.category}
                  onChange={(e) => setNewFilter({ ...newFilter, category: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem', background: 'white' }}
                >
                  <option value="CUSTOM">CUSTOM</option>
                  <option value="ESSENTIAL">ESSENTIAL</option>
                  <option value="RETRO">RETRO</option>
                  <option value="FUN">FUN</option>
                  <option value="COOL">COOL</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#374151', fontWeight: 'bold' }}>Aturan CSS (filter)</label>
                <input
                  type="text"
                  value={newFilter.css}
                  onChange={(e) => setNewFilter({ ...newFilter, css: e.target.value })}
                  placeholder="Misal: sepia(0.5) contrast(1.2) brightness(0.9)"
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem', fontFamily: 'monospace' }}
                />
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>Masukkan value CSS filter (tanpa kata 'filter:').</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ padding: '0.6rem 1.2rem', border: '1px solid #d1d5db', background: 'white', color: '#374151', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Batal
              </button>
              <button
                onClick={handleSaveFilter}
                style={{ padding: '0.6rem 1.2rem', border: 'none', background: '#40a3eb', color: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Simpan Filter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function BoothHealthTab({ adminToken }) {
  const [items, setItems] = useState([]);
  const [checking, setChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState('');

  const runChecks = async () => {
    setChecking(true);
    const nextItems = [];
    const settings = getKioskSettings();
    const activeBackendUrl = getBackendApiUrl();
    const activeFrontendUrl = (settings.publicFrontendUrl || window.location.origin).replace(/\/$/, '');
    const activeGalleryUrl = getPublicGalleryBaseUrl(settings);

    try {
      const startedAt = performance.now();
      const health = await backendRequest('/health');
      const durationMs = Math.round(performance.now() - startedAt);
      nextItems.push(createHealthItem(
        'backend',
        'Backend API',
        health?.ok ? 'ok' : 'warn',
        health?.ok ? `Backend online (${durationMs} ms).` : 'Backend merespons, tapi status health tidak OK.',
        activeBackendUrl,
      ));
    } catch (err) {
      nextItems.push(createHealthItem('backend', 'Backend API', 'fail', err.message || 'Backend tidak bisa diakses.', activeBackendUrl));
    }

    try {
      const me = await backendRequest('/api/admin/auth/me', adminToken);
      nextItems.push(createHealthItem('admin', 'Admin Session', 'ok', `Login aktif sebagai ${me?.email || 'admin'}.`, me?.role ? `Role: ${me.role}` : ''));
    } catch (err) {
      nextItems.push(createHealthItem('admin', 'Admin Session', 'fail', err.message || 'Token admin tidak valid.'));
    }

    try {
      const cameras = await listDslrCameras();
      const configured = (settings.cameraProfiles || []).filter(profile => profile.enabled);
      const missing = configured.filter(profile => !profile.tetherPort || !cameras.some(camera => camera.port === profile.tetherPort));
      const status = cameras.length === 0 ? 'fail' : (missing.length > 0 ? 'warn' : 'ok');
      const detail = cameras.length === 0
        ? 'Hardware Agent tidak mendeteksi Canon DSLR.'
        : missing.length > 0
          ? `${cameras.length} Canon DSLR terdeteksi, tetapi ${missing.length} posisi belum dipetakan.`
          : `${cameras.length} Canon DSLR terdeteksi dan semua posisi aktif siap dipotret.`;
      nextItems.push(createHealthItem('camera', 'Canon DSLR (EDSDK)', status, detail, `${configured.length} posisi aktif`));
    } catch (err) {
      nextItems.push(createHealthItem('camera', 'Canon DSLR (EDSDK)', 'fail', err.message || 'Tidak bisa membaca Hardware Agent.'));
    }

    const printStatus = settings.autoPrintEnabled
      ? (settings.printerName ? 'ok' : 'warn')
      : 'warn';
    const printDetail = settings.autoPrintEnabled
      ? settings.printerName
        ? `Auto print aktif melalui Hardware Agent ke ${settings.printerName}.`
        : 'Auto print aktif, tetapi printer belum dipilih.'
      : 'Auto print mati. Operator perlu klik PRINT PHOTO manual.';
    nextItems.push(createHealthItem('printer', 'Hardware Printer', printStatus, printDetail, settings.printerName || 'Belum dipilih'));

    try {
      const key = `booth_health_probe_${Date.now()}`;
      window.localStorage.setItem(key, 'ok');
      window.localStorage.removeItem(key);
      nextItems.push(createHealthItem('localStorage', 'Local Storage', 'ok', 'Setting booth bisa dibaca dan ditulis di browser ini.'));
    } catch (err) {
      nextItems.push(createHealthItem('localStorage', 'Local Storage', 'fail', 'Browser tidak bisa menulis localStorage. Setting booth tidak akan tersimpan.'));
    }

    try {
      const galleryKeys = Object.keys(window.localStorage).filter(key => key.startsWith('potobox_gallery_'));
      nextItems.push(createHealthItem(
        'localGallery',
        'Local Gallery Cache',
        galleryKeys.length > 20 ? 'warn' : 'ok',
        galleryKeys.length ? `${galleryKeys.length} cache gallery lokal tersimpan di browser.` : 'Tidak ada cache gallery lokal menumpuk.',
      ));
    } catch {
      nextItems.push(createHealthItem('localGallery', 'Local Gallery Cache', 'warn', 'Tidak bisa membaca jumlah cache gallery lokal.'));
    }

    const frontendHost = (() => {
      try {
        return new URL(activeFrontendUrl).hostname;
      } catch {
        return window.location.hostname;
      }
    })();
    const backendHost = (() => {
      try {
        return new URL(activeBackendUrl).hostname;
      } catch {
        return '';
      }
    })();
    const galleryHost = (() => {
      try {
        return new URL(activeGalleryUrl).hostname;
      } catch {
        return '';
      }
    })();
    const isFrontendLocal = ['localhost', '127.0.0.1', ''].includes(frontendHost);
    const isBackendLocal = ['localhost', '127.0.0.1', ''].includes(backendHost);
    const isGalleryLocal = ['localhost', '127.0.0.1', ''].includes(galleryHost);
    nextItems.push(createHealthItem(
      'network',
      'Phone / QR Network',
      isFrontendLocal || isBackendLocal || isGalleryLocal ? 'warn' : 'ok',
      isFrontendLocal || isBackendLocal || isGalleryLocal
        ? 'Masih memakai localhost/127.0.0.1. HP customer di WiFi lain tidak bisa membuka QR ini.'
        : 'Frontend/backend memakai alamat jaringan, lebih siap untuk QR dibuka dari HP.',
      `Frontend: ${activeFrontendUrl} | Gallery: ${activeGalleryUrl} | Backend: ${activeBackendUrl}`,
    ));

    setItems(nextItems);
    setLastCheckedAt(new Date().toLocaleString('id-ID'));
    setChecking(false);
  };

  useEffect(() => {
    runChecks();
  }, []);

  const totals = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', border: '1px solid #e9ecef', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ margin: 0, color: '#111' }}>Booth Health Check</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#6c757d', fontSize: '0.9rem' }}>Cek kesiapan backend, kamera, printer, storage, dan QR network sebelum booth dipakai.</p>
            {lastCheckedAt && <p style={{ margin: '0.45rem 0 0', color: '#9ca3af', fontSize: '0.82rem' }}>Terakhir dicek: {lastCheckedAt}</p>}
          </div>
          <button
            type="button"
            onClick={runChecks}
            disabled={checking}
            style={{ padding: '0.75rem 1.1rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: checking ? 'wait' : 'pointer', fontWeight: 'bold' }}
          >
            {checking ? 'Checking...' : 'Run Check'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.9rem', marginBottom: '1.25rem' }}>
          <div style={{ padding: '1rem', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <div style={{ color: '#166534', fontSize: '0.8rem', fontWeight: 900 }}>OK</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>{totals.ok || 0}</div>
          </div>
          <div style={{ padding: '1rem', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fde68a' }}>
            <div style={{ color: '#92400e', fontSize: '0.8rem', fontWeight: 900 }}>Warning</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>{totals.warn || 0}</div>
          </div>
          <div style={{ padding: '1rem', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca' }}>
            <div style={{ color: '#991b1b', fontSize: '0.8rem', fontWeight: 900 }}>Failed</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>{totals.fail || 0}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '0.85rem' }}>
          {items.map(item => (
            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '180px 110px minmax(0, 1fr)', gap: '1rem', alignItems: 'center', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#fff' }}>
              <div style={{ fontWeight: 900, color: '#111827' }}>{item.label}</div>
              <HealthPill status={item.status} />
              <div>
                <div style={{ color: '#374151', fontWeight: 700 }}>{item.detail}</div>
                {item.meta && <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: '0.25rem', overflowWrap: 'anywhere' }}>{item.meta}</div>}
              </div>
            </div>
          ))}
          {!items.length && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', border: '1px dashed #d1d5db', borderRadius: '8px' }}>
              Klik Run Check untuk mulai cek booth.
            </div>
          )}
        </div>
      </div>


    </div>
  );
}

function RecoveryTab() {
  const getRecoveryKey = (session = {}) => session?.backendSessionId || session?.localGalleryId || session?.id || '';
  const [history, setHistory] = useState(() => getRecoveryHistory());
  const [recovery, setRecovery] = useState(() => getRecoverySession() || getRecoveryHistory()[0] || null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [isPrintActive, setIsPrintActive] = useState(false);

  useEffect(() => {
    const handleAfterPrint = () => setIsPrintActive(false);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const refresh = () => {
    const nextHistory = getRecoveryHistory();
    const currentKey = getRecoveryKey(recovery);
    setHistory(nextHistory);
    setRecovery(nextHistory.find(item => getRecoveryKey(item) === currentKey) || getRecoverySession() || nextHistory[0] || null);
    setMessage('');
  };

  const selectRecovery = (session) => {
    setRecovery(session);
    setMessage('');
  };

  const handleRetrySave = async () => {
    if (!recovery?.backendSessionId || !recovery?.customerToken || !recovery?.finalizePayload) {
      setMessage('Payload backend/session token tidak tersedia. Hanya bisa print ulang atau buka gallery lokal.');
      return;
    }
    setSaving(true);
    setMessage('Menyimpan ulang ke backend...');
    try {
      const finalized = await backendRequest(`/api/sessions/${recovery.backendSessionId}/finalize`, null, {
        method: 'POST',
        sessionToken: recovery.customerToken,
        body: JSON.stringify(recovery.finalizePayload),
      });
      const downloadUrl = `${getPublicGalleryBaseUrl()}/gallery/${recovery.backendSessionId}`;
      const next = {
        ...recovery,
        status: 'saved',
        error: '',
        downloadUrl,
        backendDownloadUrl: finalized?.downloadUrl || recovery.backendDownloadUrl || '',
        finalizedAt: new Date().toISOString(),
      };
      saveRecoverySession(next);
      setRecovery(next);
      setHistory(getRecoveryHistory());
      setMessage('Sesi berhasil disimpan ulang ke backend.');
    } catch (err) {
      const next = {
        ...recovery,
        status: 'failed',
        error: err.message || 'Retry save gagal.',
      };
      saveRecoverySession(next);
      setRecovery(next);
      setHistory(getRecoveryHistory());
      setMessage(next.error);
    } finally {
      setSaving(false);
    }
  };

  const handlePrintAgain = () => {
    if (!recovery?.printImage) {
      setMessage('Tidak ada file print tersimpan untuk sesi terakhir.');
      return;
    }
    setIsPrintActive(true);
    window.setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        reportMonitoringError({
          category: 'print',
          sessionId: recovery?.backendSessionId || recovery?.id || '',
          message: err.message || 'Gagal print ulang dari recovery.',
          source: 'admin',
          metadata: {
            trigger: 'recovery_print_again',
          },
        });
      }
    }, 100);
  };

  const handleRemoveSelected = () => {
    const sessionKey = getRecoveryKey(recovery);
    if (!sessionKey) return;
    removeRecoverySession(sessionKey);
    const nextHistory = getRecoveryHistory();
    setHistory(nextHistory);
    setRecovery(nextHistory[0] || null);
    setMessage('Sesi recovery terpilih dibersihkan.');
  };

  const handleClearAll = () => {
    clearRecoveryHistory();
    setHistory([]);
    setRecovery(null);
    setMessage('Semua recovery history dibersihkan.');
  };

  const status = recovery?.status || 'idle';
  const hasBackendRetry = Boolean(recovery?.backendSessionId && recovery?.customerToken && recovery?.finalizePayload);
  const selectedKey = getRecoveryKey(recovery);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {isPrintActive && recovery?.printImage && (
        <div className="print-area">
          {recovery.printMeta && (
            <style>{`
              @page {
                size: ${recovery.printMeta.inchWidth}in ${recovery.printMeta.inchHeight}in;
                margin: 0;
              }
            `}</style>
          )}
          <img
            src={recovery.printImage}
            alt="Recovery print"
            className="print-output-image"
            style={{
              width: recovery.printMeta ? `${recovery.printMeta.inchWidth}in` : '4in',
              height: recovery.printMeta ? `${recovery.printMeta.inchHeight}in` : '6in',
            }}
          />
        </div>
      )}

      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', border: '1px solid #e9ecef', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ margin: 0, color: '#111' }}>Session Recovery History</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#6c757d', fontSize: '0.9rem' }}>Pilih beberapa sesi terakhir untuk retry save/print tanpa customer foto ulang.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={refresh} style={{ padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#f8f9fa', color: '#111', cursor: 'pointer', fontWeight: 'bold' }}>
              Refresh
            </button>
            <button onClick={handleClearAll} disabled={!history.length} style={{ padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #fecaca', background: history.length ? '#fee2e2' : '#f1f5f9', color: history.length ? '#dc2626' : '#94a3b8', cursor: history.length ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>
              Clear All
            </button>
          </div>
        </div>

        {message && (
          <div style={{ marginBottom: '1rem', padding: '0.9rem 1rem', borderRadius: '8px', background: message.includes('berhasil') ? '#dcfce7' : '#fff7ed', color: message.includes('berhasil') ? '#166534' : '#9a3412', fontWeight: 800 }}>
            {message}
          </div>
        )}

        {!history.length && !recovery ? (
          <div style={{ padding: '2rem', borderRadius: '8px', border: '1px dashed #d1d5db', color: '#6b7280', textAlign: 'center' }}>
            Belum ada recovery history yang bisa dipakai di browser booth ini.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: '1.5rem', alignItems: 'start' }}>
            <div style={{ borderRadius: '8px', border: '1px solid #e5e7eb', background: '#f8fafc', overflow: 'hidden' }}>
              <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid #e5e7eb', background: 'white' }}>
                <div style={{ fontWeight: 900, color: '#111827' }}>Sesi Terakhir</div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem' }}>{history.length} sesi tersimpan di browser booth ini</div>
              </div>
              <div style={{ display: 'grid', gap: '0.65rem', padding: '0.75rem', maxHeight: '620px', overflowY: 'auto' }}>
                {history.map((session, index) => {
                  const sessionKey = getRecoveryKey(session);
                  const isSelected = sessionKey === selectedKey;
                  return (
                    <button
                      key={sessionKey || index}
                      type="button"
                      onClick={() => selectRecovery(session)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '74px minmax(0, 1fr)',
                        gap: '0.75rem',
                        width: '100%',
                        padding: '0.65rem',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid #40a3eb' : '1px solid #e5e7eb',
                        background: isSelected ? '#fff7ed' : 'white',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ width: 74, height: 74, borderRadius: '8px', overflow: 'hidden', background: '#e5e7eb', display: 'grid', placeItems: 'center' }}>
                        {session.printImage || session.finalImage ? (
                          <img src={session.printImage || session.finalImage} alt="Recovery thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ color: '#94a3b8', fontWeight: 900, fontSize: '0.75rem' }}>NO IMG</span>
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <span style={{ fontWeight: 900, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {session.backendSessionId ? `#${session.backendSessionId.slice(0, 8)}` : session.localGalleryId || 'Local session'}
                          </span>
                          <StatusBadge status={session.status || 'idle'} />
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>
                          {formatDateTime(session.updatedAt || session.createdAt)}
                        </div>
                        <div style={{ color: session.error ? '#dc2626' : '#94a3b8', fontSize: '0.75rem', marginTop: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {session.error || (session.downloadUrl ? 'Gallery link tersedia' : 'Menunggu hasil')}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
              <div style={{ borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden', background: '#f8fafc' }}>
                {recovery?.printImage ? (
                  <img src={recovery.printImage} alt="Selected print preview" style={{ width: '100%', display: 'block', maxHeight: '420px', objectFit: 'contain', background: 'white' }} />
                ) : (
                  <div style={{ aspectRatio: '2/3', display: 'grid', placeItems: 'center', color: '#9ca3af', fontWeight: 900 }}>No Print Preview</div>
                )}
              </div>

              <div>
                <div style={{ display: 'grid', gap: '0.85rem', marginBottom: '1.2rem' }}>
                  {[
                    ['Status', <StatusBadge status={status} />],
                    ['Session ID', recovery?.backendSessionId || recovery?.localGalleryId || '-'],
                    ['Download URL', recovery?.downloadUrl || '-'],
                    ['Created', formatDateTime(recovery?.createdAt)],
                    ['Updated', formatDateTime(recovery?.updatedAt)],
                    ['Error', recovery?.error || '-'],
                    ['Backend Retry', hasBackendRetry ? 'Available' : 'Not available'],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'grid', gridTemplateColumns: '130px minmax(0, 1fr)', gap: '1rem', paddingBottom: '0.7rem', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ color: '#64748b', fontWeight: 900 }}>{label}</div>
                      <div style={{ color: '#111827', fontWeight: 700, overflowWrap: 'anywhere' }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleRetrySave}
                    disabled={!hasBackendRetry || saving}
                    style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: 'none', background: hasBackendRetry ? '#40a3eb' : '#cbd5e1', color: 'white', cursor: hasBackendRetry && !saving ? 'pointer' : 'not-allowed', fontWeight: 900 }}
                  >
                    {saving ? 'Retrying...' : 'Retry Save Backend'}
                  </button>
                  <button
                    onClick={handlePrintAgain}
                    disabled={!recovery?.printImage}
                    style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #d1d5db', background: 'white', color: '#111827', cursor: recovery?.printImage ? 'pointer' : 'not-allowed', fontWeight: 900 }}
                  >
                    Print Ulang
                  </button>
                  {recovery?.downloadUrl && (
                    <button
                      onClick={() => window.open(recovery.downloadUrl, '_blank', 'noopener,noreferrer')}
                      style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontWeight: 900 }}
                    >
                      Buka Gallery
                    </button>
                  )}
                  <button
                    onClick={handleRemoveSelected}
                    disabled={!recovery}
                    style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #fecaca', background: recovery ? '#fee2e2' : '#f1f5f9', color: recovery ? '#dc2626' : '#94a3b8', cursor: recovery ? 'pointer' : 'not-allowed', fontWeight: 900 }}
                  >
                    Hapus Sesi Ini
                  </button>
                </div>

                {history.length >= 8 && (
                  <div style={{ marginTop: '1rem', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #bae0f9', background: '#fff7ed', color: '#9a3412', fontWeight: 800, fontSize: '0.85rem' }}>
                    Browser menyimpan maksimal 10 recovery session. Kalau file foto terlalu besar, history otomatis disusutkan agar sesi terbaru tetap aman.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const formatBytes = (bytes = 0) => {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
};

function StorageManagementTab({ adminToken }) {
  const [stats, setStats] = useState(null);
  const [localCacheCount, setLocalCacheCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const countLocalCache = () => {
    try {
      const count = Object.keys(window.localStorage).filter(key => key.startsWith('potobox_gallery_')).length;
      setLocalCacheCount(count);
    } catch {
      setLocalCacheCount(0);
    }
  };

  const loadStats = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await backendRequest('/api/admin/storage', adminToken);
      setStats(data);
      countLocalCache();
    } catch (err) {
      setError(err.message || 'Gagal memuat storage stats.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [adminToken]);

  const handleCleanupExpired = async () => {
    setCleanupLoading(true);
    setMessage('');
    setError('');
    try {
      const result = await backendRequest('/api/admin/cleanup', adminToken, { method: 'POST' });
      setMessage(`Cleanup selesai: ${result.deletedSessions || 0} sesi dan ${result.deletedFiles || 0} file dihapus.`);
      await loadStats();
    } catch (err) {
      setError(err.message || 'Cleanup gagal.');
    } finally {
      setCleanupLoading(false);
    }
  };

  const handleClearLocalCache = () => {
    try {
      Object.keys(window.localStorage)
        .filter(key => key.startsWith('potobox_gallery_'))
        .forEach(key => window.localStorage.removeItem(key));
      countLocalCache();
      setMessage('Cache gallery lokal browser berhasil dibersihkan.');
    } catch {
      setError('Gagal membersihkan cache lokal browser.');
    }
  };

  const cards = [
    { label: 'Storage Used', value: formatBytes(stats?.storageBytes), tone: '#40a3eb' },
    { label: 'Storage Files', value: stats?.storageFiles ?? '-', tone: '#3b82f6' },
    { label: 'Total Sessions', value: stats?.totalSessions ?? '-', tone: '#111827' },
    { label: 'Expired Sessions', value: stats?.expiredSessions ?? '-', tone: (stats?.expiredSessions || 0) > 0 ? '#dc2626' : '#16a34a' },
    { label: 'Finalized', value: stats?.finalizedSessions ?? '-', tone: '#16a34a' },
    { label: 'Paid Not Finalized', value: stats?.paidSessions ?? '-', tone: '#ca8a04' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', border: '1px solid #e9ecef', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ margin: 0, color: '#111' }}>Storage Management</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#6c757d', fontSize: '0.9rem' }}>Pantau file hasil foto/video dan bersihkan sesi expired.</p>
          </div>
          <button
            type="button"
            onClick={loadStats}
            disabled={loading}
            style={{ padding: '0.7rem 1rem', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#f8f9fa', color: '#111', cursor: loading ? 'wait' : 'pointer', fontWeight: 'bold' }}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {message && <div style={{ marginBottom: '1rem', padding: '0.9rem 1rem', borderRadius: '8px', background: '#dcfce7', color: '#166534', fontWeight: 800 }}>{message}</div>}
        {error && <div style={{ marginBottom: '1rem', padding: '0.9rem 1rem', borderRadius: '8px', background: '#fee2e2', color: '#991b1b', fontWeight: 800 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {cards.map(card => (
            <div key={card.label} style={{ padding: '1.2rem', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#fff' }}>
              <div style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 900, textTransform: 'uppercase' }}>{card.label}</div>
              <div style={{ color: card.tone, fontSize: '2rem', fontWeight: 900, marginTop: '0.35rem' }}>{card.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ padding: '1.2rem', borderRadius: '8px', border: '1px solid #bae0f9', background: '#fff7ed' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: '#111827' }}>Backend Expired Cleanup</h3>
            <p style={{ margin: '0 0 1rem', color: '#64748b', fontSize: '0.9rem', lineHeight: 1.5 }}>Menghapus sesi yang sudah expired beserta file di backend storage. Sesi aktif tidak ikut dihapus.</p>
            <button
              type="button"
              onClick={handleCleanupExpired}
              disabled={cleanupLoading}
              style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: '8px', border: 'none', background: '#40a3eb', color: 'white', cursor: cleanupLoading ? 'wait' : 'pointer', fontWeight: 900 }}
            >
              {cleanupLoading ? 'Cleaning...' : `Cleanup Expired (${stats?.expiredSessions || 0})`}
            </button>
          </div>

          <div style={{ padding: '1.2rem', borderRadius: '8px', border: '1px solid #dbeafe', background: '#eff6ff' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: '#111827' }}>Browser Local Gallery Cache</h3>
            <p style={{ margin: '0 0 1rem', color: '#64748b', fontSize: '0.9rem', lineHeight: 1.5 }}>{localCacheCount} cache gallery lokal tersimpan di browser booth ini. Ini hanya fallback lokal, bukan backend gallery.</p>
            <button
              type="button"
              onClick={handleClearLocalCache}
              disabled={localCacheCount === 0}
              style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #bfdbfe', background: localCacheCount ? 'white' : '#dbeafe', color: '#1d4ed8', cursor: localCacheCount ? 'pointer' : 'not-allowed', fontWeight: 900 }}
            >
              Clear Local Cache
            </button>
          </div>
        </div>

        {stats?.storageDir && (
          <div style={{ marginTop: '1rem', padding: '0.85rem 1rem', borderRadius: '8px', background: '#f8fafc', color: '#64748b', fontSize: '0.82rem', overflowWrap: 'anywhere' }}>
            Storage path: {stats.storageDir}
          </div>
        )}
      </div>
    </div>
  );
}

function StatisticTab({ sessions }) {
  const totalSessions = sessions.length;
  const totalPhotos = sessions.reduce((acc, s) => acc + (s.images ? s.images.length : 0), 0);
  const avgPhotos = totalSessions > 0 ? (totalPhotos / totalSessions).toFixed(1) : 0;

  const today = new Date().toDateString();
  const sessionsToday = sessions.filter(s => new Date(s.createdAt || s.created_at).toDateString() === today).length;

  // Simple calculation for a CSS bar chart (Sessions per day for the last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toDateString();
  }).reverse();

  const sessionsPerDay = last7Days.map(dateStr => {
    return {
      date: dateStr.substring(0, 3), // Mon, Tue...
      count: sessions.filter(s => new Date(s.createdAt || s.created_at).toDateString() === dateStr).length
    };
  });

  const maxCount = Math.max(...sessionsPerDay.map(d => d.count), 1);

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', color: '#111' }}>Kiosk Statistics</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e9ecef', borderLeft: '4px solid #10B981' }}>
          <div style={{ color: '#6c757d', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.85rem', textTransform: 'uppercase' }}>Sesi Hari Ini</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#111' }}>{sessionsToday}</div>
        </div>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e9ecef', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ color: '#6c757d', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.85rem', textTransform: 'uppercase' }}>Total Sesi (All Time)</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#111' }}>{totalSessions}</div>
        </div>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e9ecef', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ color: '#6c757d', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.85rem', textTransform: 'uppercase' }}>Total Foto Diambil</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#111' }}>{totalPhotos}</div>
        </div>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e9ecef', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ color: '#6c757d', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.85rem', textTransform: 'uppercase' }}>Rata-rata Foto / Sesi</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#111' }}>{avgPhotos}</div>
        </div>
      </div>

      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', border: '1px solid #e9ecef' }}>
        <h3 style={{ marginTop: 0, marginBottom: '2rem', color: '#111' }}>Aktivitas 7 Hari Terakhir</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', height: '200px', gap: '2rem', paddingBottom: '1rem', borderBottom: '1px solid #e9ecef' }}>
          {sessionsPerDay.map((day, idx) => {
            const heightPercent = (day.count / maxCount) * 100;
            return (
              <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ fontSize: '0.8rem', color: '#111', fontWeight: 'bold', marginBottom: '0.5rem' }}>{day.count > 0 ? day.count : ''}</div>
                <div style={{
                  width: '100%',
                  maxWidth: '40px',
                  height: `${heightPercent}%`,
                  background: day.count > 0 ? '#00e58c' : '#f1f3f5',
                  borderRadius: '6px 6px 0 0',
                  transition: 'height 0.5s ease-out'
                }}></div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '2rem', paddingTop: '1rem' }}>
          {sessionsPerDay.map((day, idx) => (
            <div key={idx} style={{ flex: 1, textAlign: 'center', fontSize: '0.85rem', color: '#6c757d', fontWeight: 'bold' }}>
              {day.date}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FrameSettingsTab() {
  const [settings, setSettings] = useState(getFrameSettings());
  const [customFrames, setCustomFrames] = useState([]);
  const [savedMessage, setSavedMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // UI States
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'form'
  const [activeFilter, setActiveFilter] = useState('Semua');
  const [editingFrame, setEditingFrame] = useState(null);

  const loadFrames = async () => {
    const frames = await fetchCustomFrames({ includeInvalid: true, includeDisabled: true });
    setCustomFrames(frames);
  };

  useEffect(() => {
    loadFrames();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSaveText = (e) => {
    e.preventDefault();
    if (saveFrameSettings(settings)) {
      setSavedMessage('Desain Bingkai berhasil disimpan!');
      setTimeout(() => setSavedMessage(''), 3000);
    }
  };
  const [jsonText, setJsonText] = useState('');

  useEffect(() => {
    if (viewMode === 'form' && editingFrame?.slots) {
      setJsonText(JSON.stringify(editingFrame.slots, null, 2));
    } else {
      setJsonText('[\n  {\n    "id": "photo1",\n    "x": 0,\n    "y": 0,\n    "width": 300,\n    "height": 400,\n    "borderRadius": 0,\n    "rotate": 0\n  }\n]');
    }
  }, [viewMode, editingFrame]);

  const handleSaveJson = async () => {
    if (!editingFrame || !editingFrame.url) return;
    try {
      // Validate JSON
      const parsed = JSON.parse(jsonText);
      const validation = validateFrameConfig({
        ...(Array.isArray(parsed) ? { slots: parsed } : parsed),
        url: editingFrame.url,
        frameImage: editingFrame.url,
        width: editingFrame.width,
        height: editingFrame.height,
      });
      if (!validation.isValid) {
        alert(`Config belum aman dipakai:\n- ${validation.errors.join('\n- ')}`);
        return;
      }
      const fileName = editingFrame.url.split('/').pop();
      const baseName = fileName.split('.')[0];
      const jsonPath = `frames/${baseName}.json`;

      setIsUploading(true);
      const jsonBlob = new Blob([jsonText], { type: 'application/json' });

      const { error } = await supabase.storage
        .from('potobox-galleries')
        .upload(jsonPath, jsonBlob, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'application/json'
        });

      if (error) throw error;
      alert("Konfigurasi JSON berhasil disimpan!");
      await loadFrames();
    } catch (e) {
      alert("Format JSON tidak valid atau gagal menyimpan: " + e.message);
    } finally {
      setIsUploading(false);
    }
  };
  const handleUploadFrame = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!supabase) {
      alert("Supabase belum terhubung!");
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `frame_${Date.now()}.${fileExt}`;
      const filePath = `frames/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('potobox-galleries')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || 'image/png'
        });

      if (uploadError) throw uploadError;

      await loadFrames();
    } catch (err) {
      alert("Gagal mengunggah bingkai: " + err.message);
    } finally {
      setIsUploading(false);
      e.target.value = null; // Reset input
    }
  };

  const handleDeleteFrame = async (frame) => {
    if (window.confirm(`Hapus bingkai ${frame.name}?`)) {
      try {
        const fileName = frame.url.split('/').pop();
        const baseName = fileName.split('.')[0];
        if (fileName) {
          await supabase.storage.from('potobox-galleries').remove([
            `frames/${fileName}`,
            `frames/${baseName}.json`
          ]);
        }
      } catch (err) {
        console.error("Gagal menghapus dari storage", err);
      }

      await loadFrames();
      setViewMode('list');
    }
  };

  const handleToggleComposerFrameDisabled = async (frame) => {
    if (!frame?.id) return;
    setCustomFrameDisabled(frame.id, !frame.disabled);
    const nextFrame = { ...frame, disabled: !frame.disabled };
    setSelectedFrame(prev => prev?.id === frame.id ? { ...prev, disabled: !frame.disabled } : prev);
    setFrames(prev => prev.map(item => item.id === frame.id ? nextFrame : item));
  };

  const handleToggleFrameDisabled = async (frame) => {
    if (!frame?.id) return;
    setCustomFrameDisabled(frame.id, !frame.disabled);
    await loadFrames();
  };

  // Combine default frames and custom frames for the list
  const allFrames = [
    ...FRAMES,
    ...customFrames.map(cf => ({ ...cf, type: 'custom', tone: '#f8f9fa', accent: cf.disabled ? '#94a3b8' : cf.validation?.isValid ? '#10b981' : '#ef4444' }))
  ];

  const filteredFrames = activeFilter === 'Semua'
    ? allFrames
    : allFrames.filter(f => f.type === activeFilter.toLowerCase());

  if (viewMode === 'form') {
    return (
      <div style={{ background: 'white', padding: '2.5rem', borderRadius: '8px', border: '1px solid #e9ecef', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
        <div style={{ marginBottom: '2rem' }}>
          <button
            onClick={() => setViewMode('list')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: '#40a3eb', fontWeight: 'bold', fontSize: '1.2rem', cursor: 'pointer', padding: 0, marginBottom: '0.5rem' }}
          >
            <span style={{ fontSize: '1.5rem' }}>←</span> Bingkai Bawaan (Default)
          </button>
          <p style={{ margin: 0, color: '#6c757d', fontSize: '0.9rem', marginLeft: '2rem' }}>Detail bingkai photobooth ukuran panjang ke samping</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#495057', fontSize: '0.85rem' }}>Nama</label>
            <input
              type="text"
              defaultValue={editingFrame?.name || ''}
              placeholder="Masukkan Nama Bingkai"
              style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '1rem', background: '#f8f9fa' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#495057', fontSize: '0.85rem' }}>Kategori</label>
            <select
              defaultValue={editingFrame?.type || 'basic'}
              style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '1rem', background: '#f8f9fa' }}
            >
              <option value="basic">Reguler</option>
              <option value="premium">Premium</option>
              <option value="special">Spesial</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>

        {/* --- CUSTOM JSON EDITOR --- */}
        {editingFrame?.id?.startsWith('custom_') && (
          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 'bold', color: '#495057', fontSize: '0.85rem' }}>
              <span>Figma Template JSON Config (Advanced)</span>
              <a href="#" style={{ color: '#3b82f6', textDecoration: 'none' }}>Panduan Mapping</a>
            </label>
            <div style={{ background: '#f8f9fa', border: '1px solid #ced4da', borderRadius: '8px', padding: '1rem', position: 'relative' }}>
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', color: '#6c757d' }}>
                Jika PNG Anda dirancang di Figma dengan posisi foto spesifik, tempelkan susunan JSON <code>slots</code> di bawah ini agar sistem dapat menyinkronkan posisinya secara otomatis!
              </p>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                style={{ width: '100%', height: '200px', padding: '1rem', borderRadius: '6px', border: '1px solid #ced4da', fontFamily: 'monospace', fontSize: '0.85rem', background: '#1e1e1e', color: '#d4d4d4', resize: 'vertical' }}
              />
              <button
                onClick={handleSaveJson}
                disabled={isUploading}
                style={{ marginTop: '1rem', padding: '0.6rem 1.5rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}
              >
                {isUploading ? 'Menyimpan...' : 'Simpan JSON Koordinat'}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
          <div style={{ background: '#fff7ed', border: '2px dashed #bae0f9', borderRadius: '8px', padding: '3rem 2rem', textAlign: 'center', position: 'relative' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🖼️</div>
            <h4 style={{ margin: 0, color: '#2c8ed6', marginBottom: '0.5rem' }}>Thumbnail frame photobooth</h4>
            <p style={{ margin: 0, color: '#fdba74', fontSize: '0.85rem' }}>ukuran panjang ke samping</p>
            {editingFrame?.id?.startsWith('custom_') && (
              <img src={editingFrame.url} alt="thumbnail" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0.2 }} />
            )}
          </div>
          <div style={{ background: '#fff7ed', border: '2px dashed #bae0f9', borderRadius: '8px', padding: '3rem 2rem', textAlign: 'center', position: 'relative' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📥</div>
            <h4 style={{ margin: 0, color: '#2c8ed6', marginBottom: '0.5rem' }}>File mentahan frame</h4>
            <p style={{ margin: 0, color: '#fdba74', fontSize: '0.85rem' }}>ukuran panjang ke samping</p>
            {editingFrame?.id?.startsWith('custom_') && (
              <img src={editingFrame.url} alt="overlay" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0.9 }} />
            )}
            <input
              type="file"
              accept="image/png"
              onChange={handleUploadFrame}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#495057', fontSize: '0.85rem' }}>Tone Dasar</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f8f9fa', border: '1px solid #ced4da', borderRadius: '8px', padding: '0.5rem 0.8rem' }}>
              <input type="color" defaultValue={editingFrame?.tone || '#ffffff'} style={{ border: 'none', width: '30px', height: '30px', padding: 0, background: 'transparent', cursor: 'pointer' }} />
              <input type="text" defaultValue={editingFrame?.tone || '#ffffff'} style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: '1rem', textTransform: 'uppercase' }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#495057', fontSize: '0.85rem' }}>Aksen / Garis</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f8f9fa', border: '1px solid #ced4da', borderRadius: '8px', padding: '0.5rem 0.8rem' }}>
              <input type="color" defaultValue={editingFrame?.accent || '#111827'} style={{ border: 'none', width: '30px', height: '30px', padding: 0, background: 'transparent', cursor: 'pointer' }} />
              <input type="text" defaultValue={editingFrame?.accent || '#111827'} style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: '1rem', textTransform: 'uppercase' }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #e9ecef', paddingTop: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.2rem', fontWeight: 'bold', color: '#495057', fontSize: '0.85rem' }}>Status</label>
            <div style={{ color: editingFrame?.disabled ? '#64748b' : editingFrame?.validation?.isValid === false ? '#dc2626' : '#10b981', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: editingFrame?.disabled ? '#94a3b8' : editingFrame?.validation?.isValid === false ? '#dc2626' : '#10b981', display: 'inline-block' }}></span>
              {editingFrame?.disabled ? 'Nonaktif' : editingFrame?.validation?.isValid === false ? 'Rusak / Perlu diperbaiki' : 'Aktif'}
            </div>
            {editingFrame?.validation?.errors?.length > 0 && (
              <div style={{ marginTop: '0.55rem', color: '#b91c1c', fontSize: '0.78rem', fontWeight: 800 }}>
                {editingFrame.validation.errors.slice(0, 2).join(' ')}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {editingFrame?.id?.startsWith('custom_') && (
              <button
                type="button"
                onClick={async () => {
                  await handleToggleFrameDisabled(editingFrame);
                  setEditingFrame(prev => prev ? { ...prev, disabled: !prev.disabled } : prev);
                }}
                style={{ padding: '0.8rem 1.4rem', background: editingFrame.disabled ? '#dcfce7' : '#f1f5f9', color: editingFrame.disabled ? '#166534' : '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
              >
                {editingFrame.disabled ? 'Aktifkan' : 'Nonaktifkan'}
              </button>
            )}
            {editingFrame?.id?.startsWith('custom_') && (
              <button
                onClick={() => handleDeleteFrame(editingFrame)}
                style={{ padding: '0.8rem 2rem', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
              >
                Hapus
              </button>
            )}
            <button
              onClick={() => setViewMode('list')}
              style={{ padding: '0.8rem 3rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)' }}
            >
              Simpan Data
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* SECTION: BINGKAI BAWAAN (DEFAULT) & KUSTOM */}
      <div style={{ background: 'white', padding: '2.5rem', borderRadius: '8px', border: '1px solid #e9ecef', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, color: '#111' }}>Bingkai Bawaan (Default)</h2>
            <p style={{ margin: 0, color: '#6c757d', marginTop: '0.2rem', fontSize: '0.9rem' }}>Atur dan kelola frame bawaan sistem (Default) dan kustom.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: '#6c757d', fontWeight: 'bold', fontSize: '0.9rem' }}>
              {['Semua', 'Premium', 'Reguler', 'Spesial', 'Custom'].map(cat => (
                <span
                  key={cat}
                  onClick={() => setActiveFilter(cat)}
                  style={{
                    cursor: 'pointer',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '20px',
                    background: activeFilter === cat ? '#f8f9fa' : 'transparent',
                    color: activeFilter === cat ? '#40a3eb' : '#6c757d'
                  }}
                >
                  {cat}
                </span>
              ))}
              <span style={{ cursor: 'pointer', padding: '0.4rem' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
              </span>
            </div>
            <button
              onClick={() => { setEditingFrame(null); setViewMode('form'); }}
              style={{ padding: '0.6rem 1.2rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: '0 4px 10px rgba(249, 115, 22, 0.3)' }}
            >
              + Custom Frame
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', overflowX: 'auto', paddingBottom: '1rem', paddingTop: '0.5rem' }}>
          {filteredFrames.map((frame, idx) => (
            <div
              key={frame.id || idx}
              onClick={() => { setEditingFrame(frame); setViewMode('form'); }}
              className={`frame-${frame.id}`}
              style={{
                flex: '0 0 160px',
                aspectRatio: '1/2',
                background: frame.tone || '#fff',
                border: `4px solid ${frame.accent || '#ccc'}`,
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.5rem',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                cursor: 'pointer',
                transition: 'transform 0.2s',
                opacity: frame.disabled ? 0.55 : 1,
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.03)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              {frame.id?.startsWith('custom_') && (
                <div style={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 12, display: 'flex', justifyContent: 'space-between', gap: '0.35rem', alignItems: 'center' }}>
                  <span style={{ padding: '0.18rem 0.45rem', borderRadius: '8px', background: frame.disabled ? '#e5e7eb' : frame.validation?.isValid ? '#dcfce7' : '#fee2e2', color: frame.disabled ? '#475569' : frame.validation?.isValid ? '#166534' : '#b91c1c', fontSize: '0.62rem', fontWeight: 900 }}>
                    {frame.disabled ? 'DISABLED' : frame.validation?.isValid ? 'VALID' : 'RUSAK'}
                  </span>
                  {Number(frame.usageCount || 0) > 0 && (
                    <span style={{ padding: '0.18rem 0.4rem', borderRadius: '8px', background: '#111827', color: 'white', fontSize: '0.62rem', fontWeight: 900 }}>
                      {frame.usageCount}x
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleToggleFrameDisabled(frame);
                    }}
                    style={{ border: 'none', borderRadius: '8px', background: 'rgba(17,24,39,0.78)', color: 'white', fontSize: '0.62rem', fontWeight: 900, padding: '0.2rem 0.45rem', cursor: 'pointer' }}
                  >
                    {frame.disabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              )}
              {frame.id?.startsWith('custom_') ? (
                <div style={{ width: '100%', height: '100%', backgroundImage: `url(${frame.url})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', zIndex: 5 }} />
              ) : (
                <>
                  <div style={{ width: '80%', height: '60%', background: 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', color: 'rgba(0,0,0,0.3)', zIndex: 5 }}>
                    1
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', textAlign: 'center', marginTop: '0.5rem', color: frame.accent, zIndex: 5 }}>
                    {frame.name}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FramePhotoComposerTab({ adminToken }) {
  const [frames, setFrames] = useState([]);
  const [selectedFrame, setSelectedFrame] = useState(null);
  const [frameMeta, setFrameMeta] = useState({
    templateType: 'strip',
    paperSize: 'strip-2x6',
    orientation: 'portrait',
    photoCount: 3,
    printMode: 'auto',
    printCopies: 2,
  });
  const [isUploading, setIsUploading] = useState(false);
  const [slots, setSlots] = useState([]);
  const [selectedSlotIdx, setSelectedSlotIdx] = useState(null);
  const [isSavingJson, setIsSavingJson] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  // Canvas drawing state
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [frameImgObj, setFrameImgObj] = useState(null);
  const [canvasScale, setCanvasScale] = useState(1);

  // Frame base dimensions follow the uploaded PNG's natural size. This keeps
  // slot coordinates aligned even when custom frames are not exported 1080x1920.
  const frameBaseWidth = Number(frameImgObj?.naturalWidth || selectedFrame?.width || 1080);
  const frameBaseHeight = Number(frameImgObj?.naturalHeight || selectedFrame?.height || 1920);

  useEffect(() => {
    loadFrames();
  }, []);

  const loadFrames = async () => {
    const fetched = await fetchCustomFrames({ includeInvalid: true, includeDisabled: true });
    setFrames(fetched);
  };

  // Load frame image and draw canvas
  useEffect(() => {
    if (!selectedFrame) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setFrameImgObj(img);
    };
    img.src = selectedFrame.url;
    // Load existing slots
    if (selectedFrame.slots && Array.isArray(selectedFrame.slots)) {
      setSlots(selectedFrame.slots);
    } else {
      setSlots([]);
    }
    setFrameMeta({
      templateType: selectedFrame.templateType || 'strip',
      paperSize: selectedFrame.paperSize || (selectedFrame.templateType === 'print_sheet' ? '4r' : 'strip-2x6'),
      orientation: selectedFrame.orientation || 'portrait',
      photoCount: Number(selectedFrame.photoCount || selectedFrame.layoutCount || selectedFrame.slots?.length || 3),
      printMode: selectedFrame.printMode || (selectedFrame.templateType === 'print_sheet' ? 'same' : 'auto'),
      printCopies: Number(selectedFrame.printCopies || 2),
    });
    setSelectedSlotIdx(null);
    setPreviewDataUrl(null);
  }, [selectedFrame]);

  // Redraw canvas whenever slots or image changes
  useEffect(() => {
    drawCanvas();
  }, [slots, frameImgObj, selectedSlotIdx]);

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = frameBaseWidth / rect.width;
    const scaleY = frameBaseHeight / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = frameBaseWidth;
    canvas.height = frameBaseHeight;

    // Draw background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, frameBaseWidth, frameBaseHeight);

    // Draw checkerboard (to indicate transparency)
    const size = 40;
    for (let x = 0; x < frameBaseWidth; x += size) {
      for (let y = 0; y < frameBaseHeight; y += size) {
        ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#e8e8e8' : '#d0d0d0';
        ctx.fillRect(x, y, size, size);
      }
    }

    // Draw frame overlay
    if (frameImgObj) {
      ctx.drawImage(frameImgObj, 0, 0, frameBaseWidth, frameBaseHeight);
    }

    // Draw slots
    slots.forEach((slot, i) => {
      const isSelected = i === selectedSlotIdx;
      ctx.save();
      ctx.strokeStyle = isSelected ? '#3b82f6' : '#ef4444';
      ctx.lineWidth = isSelected ? 5 : 3;
      ctx.setLineDash(isSelected ? [] : [15, 8]);
      ctx.strokeRect(slot.x, slot.y, slot.width, slot.height);
      ctx.restore();

      // Fill with semi-transparent gray placeholder
      ctx.save();
      ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.18)' : 'rgba(200,200,200,0.35)';
      ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
      ctx.restore();

      // Label
      ctx.save();
      ctx.fillStyle = isSelected ? '#1d4ed8' : '#dc2626';
      ctx.font = `bold ${Math.min(slot.height * 0.25, 60)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`📷 ${i + 1}`, slot.x + slot.width / 2, slot.y + slot.height / 2);
      ctx.restore();

      // Corner handles
      if (isSelected) {
        [
          [slot.x, slot.y],
          [slot.x + slot.width, slot.y],
          [slot.x, slot.y + slot.height],
          [slot.x + slot.width, slot.y + slot.height],
        ].forEach(([hx, hy]) => {
          ctx.save();
          ctx.fillStyle = '#3b82f6';
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(hx, hy, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });
      }
    });
  };

  const handleCanvasMouseDown = (e) => {
    const { x, y } = getCanvasCoords(e);

    // Check if clicking on an existing slot
    const clickedIdx = slots.findIndex(s =>
      x >= s.x && x <= s.x + s.width &&
      y >= s.y && y <= s.y + s.height
    );

    if (clickedIdx !== -1) {
      setSelectedSlotIdx(clickedIdx);
      setIsDrawing(false);
    } else {
      setSelectedSlotIdx(null);
      setIsDrawing(true);
      setDrawStart({ x, y });
    }
  };

  const handleCanvasMouseMove = (e) => {
    if (!isDrawing || !drawStart) return;
    const { x, y } = getCanvasCoords(e);
    drawCanvas();
    // Draw live rectangle
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 6]);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
    const rx = Math.min(x, drawStart.x);
    const ry = Math.min(y, drawStart.y);
    const rw = Math.abs(x - drawStart.x);
    const rh = Math.abs(y - drawStart.y);
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.restore();
  };

  const handleCanvasMouseUp = (e) => {
    if (!isDrawing || !drawStart) return;
    const { x, y } = getCanvasCoords(e);
    const newSlot = {
      id: `photo${slots.length + 1}`,
      source: `photo_${Math.min(slots.length + 1, Number(frameMeta.photoCount) || slots.length + 1)}`,
      x: Math.round(Math.min(x, drawStart.x)),
      y: Math.round(Math.min(y, drawStart.y)),
      width: Math.round(Math.abs(x - drawStart.x)),
      height: Math.round(Math.abs(y - drawStart.y)),
      borderRadius: 0,
      rotate: 0,
    };
    if (newSlot.width > 20 && newSlot.height > 20) {
      const newSlots = [...slots, newSlot];
      setSlots(newSlots);
      setSelectedSlotIdx(newSlots.length - 1);
    }
    setIsDrawing(false);
    setDrawStart(null);
  };

  const updateSelectedSlot = (field, value) => {
    if (selectedSlotIdx === null) return;
    setSlots(prev => prev.map((s, i) =>
      i === selectedSlotIdx ? { ...s, [field]: field === 'source' ? value : parseInt(value) || 0 } : s
    ));
  };

  const deleteSelectedSlot = () => {
    setSlots(prev => prev.filter((_, i) => i !== selectedSlotIdx));
    setSelectedSlotIdx(null);
  };

  const handleGeneratePreview = async () => {
    if (!selectedFrame || slots.length === 0) return;
    setIsGeneratingPreview(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = frameBaseWidth;
      canvas.height = frameBaseHeight;
      const ctx = canvas.getContext('2d');

      // White background
      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw dummy gradient photos in each slot
      const colors = [
        ['#667eea', '#764ba2'],
        ['#f093fb', '#f5576c'],
        ['#4facfe', '#00f2fe'],
        ['#43e97b', '#38f9d7'],
      ];
      slots.forEach((slot, i) => {
        const [c1, c2] = colors[i % colors.length];
        const gradient = ctx.createLinearGradient(slot.x, slot.y, slot.x + slot.width, slot.y + slot.height);
        gradient.addColorStop(0, c1);
        gradient.addColorStop(1, c2);
        ctx.save();
        ctx.beginPath();
        const r = slot.borderRadius || 0;
        ctx.roundRect ? ctx.roundRect(slot.x, slot.y, slot.width, slot.height, r) : ctx.rect(slot.x, slot.y, slot.width, slot.height);
        ctx.clip();
        ctx.fillStyle = gradient;
        ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `bold ${Math.min(slot.height * 0.2, 72)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`FOTO ${i + 1}`, slot.x + slot.width / 2, slot.y + slot.height / 2);
        ctx.restore();
      });

      // Draw frame overlay on top
      const overlayImg = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = selectedFrame.url;
      });
      ctx.drawImage(overlayImg, 0, 0, frameBaseWidth, frameBaseHeight);

      setPreviewDataUrl(canvas.toDataURL('image/png'));
    } catch (err) {
      alert('Gagal membuat preview: ' + err.message);
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedFrame || slots.length === 0) {
      alert('Pilih frame dan tambahkan minimal 1 slot foto terlebih dahulu.');
      return;
    }
    const jsonData = {
      frameImage: selectedFrame.url,
      width: frameBaseWidth,
      height: frameBaseHeight,
      ...frameMeta,
      active: true,
      photoCount: Number(frameMeta.photoCount) || slots.length,
      layoutCount: Number(frameMeta.photoCount) || slots.length,
      printCopies: Number(frameMeta.printCopies) || 1,
      slots: slots.map((s, i) => ({
        id: s.id || `photo${i + 1}`,
        source: s.source || `photo_${Math.min(i + 1, Number(frameMeta.photoCount) || i + 1)}`,
        x: s.x, y: s.y,
        width: s.width, height: s.height,
        borderRadius: s.borderRadius || 0,
        rotate: s.rotate || 0,
      })),
    };
    const validation = validateFrameConfig(jsonData);
    if (!validation.isValid) {
      alert(`Frame belum aman dipakai customer:\n- ${validation.errors.join('\n- ')}`);
      return;
    }

    setIsSavingJson(true);
    try {

      const fileName = selectedFrame.url.split('/').pop();
      const baseName = fileName.split('?')[0].split('.')[0];
      const jsonPath = `frames/${baseName}.json`;
      const jsonBlob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });

      const { error } = await supabase.storage
        .from('potobox-galleries')
        .upload(jsonPath, jsonBlob, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'application/json',
        });

      if (error) throw error;
      setCustomFrameDisabled(selectedFrame.id, false);
      if (adminToken) {
        await backendRequest('/api/admin/frames', adminToken, {
          method: 'POST',
          body: JSON.stringify({
            id: selectedFrame.id,
            name: selectedFrame.name,
            category: 'custom',
            layoutCount: Number(frameMeta.photoCount) || slots.length,
            imageUrl: selectedFrame.url,
            slotJson: JSON.stringify(jsonData),
            templateType: frameMeta.templateType,
            paperSize: frameMeta.paperSize,
            orientation: frameMeta.orientation,
            printMode: frameMeta.printMode,
            printCopies: Number(frameMeta.printCopies) || 1,
            active: true,
          }),
        });
      }
      const warningText = validation.warnings.length ? `\n\nCatatan:\n- ${validation.warnings.join('\n- ')}` : '';
      alert(`✅ Konfigurasi ${slots.length} slot foto berhasil disimpan untuk frame "${selectedFrame.name}"!${warningText}`);
      await loadFrames();
      setSelectedFrame({ ...selectedFrame, ...jsonData, disabled: false, validation });
    } catch (err) {
      alert('Gagal menyimpan: ' + err.message);
    } finally {
      setIsSavingJson(false);
    }
  };

  const handleUploadNewFrame = async (e) => {
    const file = e.target.files[0];
    if (!file || !supabase) return;
    setIsUploading(true);
    try {
      const fileName = `frame_${Date.now()}.png`;
      const { error } = await supabase.storage
        .from('potobox-galleries')
        .upload(`frames/${fileName}`, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'image/png',
        });
      if (error) throw error;
      await loadFrames();
      alert('✅ Frame PNG berhasil di-upload! Silakan pilih dari daftar.');
    } catch (err) {
      alert('Gagal upload: ' + err.message);
    } finally {
      setIsUploading(false);
      e.target.value = null;
    }
  };

  const handleDeleteFrame = async (frame) => {
    if (!window.confirm(`Hapus frame "${frame.name}" beserta konfigurasinya?`)) return;
    try {
      const fileName = frame.url.split('/').pop().split('?')[0];
      const baseName = fileName.split('.')[0];
      await supabase.storage.from('potobox-galleries').remove([
        `frames/${fileName}`,
        `frames/${baseName}.json`,
      ]);
      if (selectedFrame?.id === frame.id) {
        setSelectedFrame(null);
        setSlots([]);
      }
      await loadFrames();
    } catch (err) {
      alert('Gagal menghapus: ' + err.message);
    }
  };

  const selectedSlot = selectedSlotIdx !== null ? slots[selectedSlotIdx] : null;
  const currentFrameDraftValidation = selectedFrame
    ? validateFrameConfig({
      ...selectedFrame,
      frameImage: selectedFrame.url,
      width: frameBaseWidth,
      height: frameBaseHeight,
      ...frameMeta,
      active: !selectedFrame.disabled,
      slots,
    })
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e9ecef', padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#111', fontSize: '1.4rem' }}>🖼️ Frame Photo Composition</h2>
          <p style={{ margin: '0.3rem 0 0 0', color: '#6c757d', fontSize: '0.9rem' }}>Upload frame PNG, gambar area slot foto, lalu simpan konfigurasinya.</p>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1.5rem', background: '#40a3eb', color: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95rem', boxShadow: '0 4px 12px rgba(249,115,22,0.3)' }}>
          {isUploading ? '⏳ Uploading...' : '+ Upload Frame PNG'}
          <input type="file" accept="image/png" style={{ display: 'none' }} onChange={handleUploadNewFrame} disabled={isUploading} />
        </label>
      </div>

      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e9ecef', padding: '1.25rem 1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem', color: '#111', fontSize: '1rem' }}>Template & Print Output</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280' }}>Jumlah Foto User</label>
            <select
              value={frameMeta.photoCount}
              onChange={(event) => setFrameMeta(prev => ({ ...prev, photoCount: Number(event.target.value) }))}
              style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #d1d5db', background: 'white', fontWeight: 'bold' }}
            >
              {[1, 3, 4, 6, 8].map(count => <option key={count} value={count}>{count} foto</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280' }}>Ukuran Output</label>
            <select
              value={frameMeta.paperSize}
              onChange={(event) => setFrameMeta(prev => ({ ...prev, paperSize: event.target.value }))}
              style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #d1d5db', background: 'white', fontWeight: 'bold' }}
            >
              <option value="strip-2x6">Strip 2x6</option>
              <option value="2r">2R</option>
              <option value="3r">3R</option>
              <option value="4r">4R</option>
              <option value="5r">5R</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280' }}>Jumlah Strip di Kertas</label>
            <input
              type="number"
              min="1"
              max="4"
              value={frameMeta.printCopies}
              onChange={(event) => setFrameMeta(prev => ({ ...prev, printCopies: Number(event.target.value) }))}
              style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #d1d5db', background: 'white', fontWeight: 'bold' }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 280px', gap: '1.5rem', alignItems: 'start' }}>
        {/* LEFT: Frame list */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e9ecef', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 'bold', color: '#374151' }}>Daftar Frame</h3>
          {frames.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#9ca3af', fontSize: '0.85rem', border: '2px dashed #e5e7eb', borderRadius: '8px' }}>
              Belum ada frame.<br />Upload PNG pertamamu!
            </div>
          ) : frames.map((frame) => (
            <div
              key={frame.id}
              onClick={() => setSelectedFrame(frame)}
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                border: selectedFrame?.id === frame.id ? '2px solid #40a3eb' : '1px solid #e9ecef',
                background: selectedFrame?.id === frame.id ? '#fff7ed' : '#f9fafb',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                transition: 'all 0.2s',
                opacity: frame.disabled ? 0.55 : 1,
              }}
            >
              <img src={frame.url} alt={frame.name} style={{ width: '48px', height: '72px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e9ecef', flexShrink: 0, background: '#e5e7eb' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 'bold', color: '#111', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{frame.name}</div>
                <div style={{ fontSize: '0.75rem', color: frame.disabled ? '#64748b' : frame.validation?.isValid ? '#10b981' : '#ef4444', marginTop: '0.2rem', fontWeight: 800 }}>
                  {frame.disabled ? 'Nonaktif' : frame.validation?.isValid ? `Valid · ${frame.slots.length} slot` : 'Rusak / belum aman'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.15rem' }}>
                  {(frame.templateType || 'strip').replace('_', ' ')} · {frame.photoCount || frame.layoutCount || frame.slots?.length || 0} foto · {Number(frame.usageCount || 0)}x dipakai
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleToggleComposerFrameDisabled(frame); }}
                title={frame.disabled ? 'Aktifkan frame' : 'Nonaktifkan frame'}
                style={{ background: frame.disabled ? '#dcfce7' : '#f1f5f9', border: '1px solid #e5e7eb', color: frame.disabled ? '#166534' : '#475569', cursor: 'pointer', fontSize: '0.72rem', padding: '0.25rem 0.45rem', borderRadius: '8px', fontWeight: 900, flexShrink: 0 }}
              >
                {frame.disabled ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteFrame(frame); }}
                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem', flexShrink: 0 }}
              >🗑️</button>
            </div>
          ))}
        </div>

        {/* CENTER: Canvas mapper */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e9ecef', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!selectedFrame ? (
            <div style={{ display: 'grid', placeItems: 'center', minHeight: '400px', color: '#9ca3af', textAlign: 'center', border: '2px dashed #e5e7eb', borderRadius: '8px' }}>
              <div>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👈</div>
                <p style={{ margin: 0, fontWeight: 'bold' }}>Pilih frame dari daftar</p>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem' }}>atau upload frame PNG baru</p>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold', color: '#111' }}>{selectedFrame.name}</h3>
                  <p style={{ margin: '0.2rem 0 0 0', color: '#6c757d', fontSize: '0.8rem' }}>Klik dan drag di atas kanvas untuk menandai area foto</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={handleGeneratePreview}
                    disabled={slots.length === 0 || isGeneratingPreview}
                    style={{ padding: '0.5rem 1rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', opacity: slots.length === 0 ? 0.5 : 1 }}
                  >
                    {isGeneratingPreview ? '⏳' : '👁 Preview'}
                  </button>
                  <button
                    onClick={handleSaveConfig}
                    disabled={slots.length === 0 || isSavingJson || currentFrameDraftValidation?.errors?.length > 0}
                    style={{ padding: '0.5rem 1rem', background: currentFrameDraftValidation?.errors?.length ? '#cbd5e1' : '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: currentFrameDraftValidation?.errors?.length ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '0.85rem', opacity: slots.length === 0 ? 0.5 : 1 }}
                  >
                    {isSavingJson ? '⏳ Menyimpan...' : '💾 Simpan Config'}
                  </button>
                </div>
              </div>

              {currentFrameDraftValidation && (
                <div style={{ display: 'grid', gap: '0.45rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', padding: '0.7rem 0.85rem', borderRadius: '8px', border: currentFrameDraftValidation.isValid ? '1px solid #bbf7d0' : '1px solid #fecaca', background: currentFrameDraftValidation.isValid ? '#f0fdf4' : '#fef2f2', color: currentFrameDraftValidation.isValid ? '#166534' : '#991b1b', fontWeight: 900, fontSize: '0.82rem' }}>
                    <span>{currentFrameDraftValidation.isValid ? 'Frame aman dipakai customer' : 'Frame belum aman dipakai customer'}</span>
                    <span>{slots.length} slot</span>
                    <span>{Number(frameMeta.photoCount) || 0} foto user</span>
                  </div>
                  {currentFrameDraftValidation.errors.length > 0 && (
                    <div style={{ padding: '0.7rem 0.85rem', borderRadius: '8px', background: '#fff7ed', color: '#9a3412', fontSize: '0.78rem', fontWeight: 800, lineHeight: 1.45 }}>
                      {currentFrameDraftValidation.errors.slice(0, 4).map((error, index) => <div key={index}>- {error}</div>)}
                    </div>
                  )}
                  {currentFrameDraftValidation.warnings.length > 0 && (
                    <div style={{ padding: '0.7rem 0.85rem', borderRadius: '8px', background: '#fffbeb', color: '#92400e', fontSize: '0.78rem', fontWeight: 800, lineHeight: 1.45 }}>
                      {currentFrameDraftValidation.warnings.slice(0, 3).map((warning, index) => <div key={index}>- {warning}</div>)}
                    </div>
                  )}
                </div>
              )}

              <div style={{ position: 'relative', lineHeight: 0, borderRadius: '8px', overflow: 'hidden', border: '2px solid #e9ecef', cursor: isDrawing ? 'crosshair' : 'default', userSelect: 'none' }}>
                <canvas
                  ref={canvasRef}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={() => { if (isDrawing) { setIsDrawing(false); setDrawStart(null); drawCanvas(); } }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: '#f9fafb', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#6c757d' }}>
                <span>✏️ Klik & drag = Tambah slot baru</span>
                <span>•</span>
                <span>🖱️ Klik kotak = Pilih untuk edit</span>
                <span>•</span>
                <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{slots.length} slot ditambahkan</span>
              </div>
            </>
          )}
        </div>

        {/* RIGHT: Slot editor + preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Slot editor panel */}
          <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e9ecef', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', fontWeight: 'bold', color: '#374151' }}>
              {selectedSlot ? `Slot ${selectedSlotIdx + 1} Properties` : 'Slot Properties'}
            </h3>
            {!selectedSlot ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem', padding: '1rem 0' }}>
                Pilih slot di kanvas untuk mengedit propertinya
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', marginBottom: '0.25rem' }}>Source Foto</label>
                  <select
                    value={selectedSlot.source || `photo_${selectedSlotIdx + 1}`}
                    onChange={(e) => updateSelectedSlot('source', e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', background: '#f9fafb', fontWeight: 'bold' }}
                  >
                    {Array.from({ length: Number(frameMeta.photoCount) || 1 }, (_, index) => (
                      <option key={index} value={`photo_${index + 1}`}>Foto {index + 1}</option>
                    ))}
                  </select>
                </div>
                {[
                  { label: 'X (pixel)', field: 'x' },
                  { label: 'Y (pixel)', field: 'y' },
                  { label: 'Width (pixel)', field: 'width' },
                  { label: 'Height (pixel)', field: 'height' },
                  { label: 'Border Radius', field: 'borderRadius' },
                  { label: 'Rotate (derajat)', field: 'rotate' },
                ].map(({ label, field }) => (
                  <div key={field}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', marginBottom: '0.25rem' }}>{label}</label>
                    <input
                      type="number"
                      value={selectedSlot[field] || 0}
                      onChange={(e) => updateSelectedSlot(field, e.target.value)}
                      style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', background: '#f9fafb' }}
                    />
                  </div>
                ))}
                <button
                  onClick={deleteSelectedSlot}
                  style={{ marginTop: '0.5rem', padding: '0.6rem', background: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
                >
                  🗑️ Hapus Slot Ini
                </button>
              </div>
            )}

            {slots.length > 0 && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid #e9ecef', paddingTop: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', marginBottom: '0.5rem' }}>SEMUA SLOT</div>
                {slots.map((s, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedSlotIdx(i)}
                    style={{
                      padding: '0.4rem 0.6rem',
                      borderRadius: '6px',
                      background: i === selectedSlotIdx ? '#eff6ff' : 'transparent',
                      border: i === selectedSlotIdx ? '1px solid #bfdbfe' : '1px solid transparent',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      color: '#374151',
                      marginBottom: '0.25rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>📷 Slot {i + 1}</span>
                    <span style={{ color: '#6b7280' }}>{s.source || `photo_${i + 1}`}</span>
                    <span style={{ color: '#9ca3af' }}>{s.width}×{s.height}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview panel */}
          {previewDataUrl && (
            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e9ecef', padding: '1.25rem' }}>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 'bold', color: '#374151' }}>🎉 Hasil Komposisi</h3>
              <img src={previewDataUrl} alt="preview" style={{ width: '100%', borderRadius: '8px', border: '1px solid #e9ecef' }} />
              <a
                href={previewDataUrl}
                download="frame_preview.png"
                style={{ display: 'block', textAlign: 'center', marginTop: '0.75rem', padding: '0.5rem', background: '#f0fdf4', color: '#10b981', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold', fontSize: '0.85rem', border: '1px solid #bbf7d0' }}
              >
                ⬇️ Download Preview
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TransactionTab({ adminToken }) {
  const [paymentLogs, setPaymentLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionPageSize, setTransactionPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const loadPaymentLogs = async () => {
    if (!adminToken) return;
    setLogsLoading(true);
    setLogsError('');
    try {
      const logs = await backendRequest('/api/admin/payment-logs', adminToken);
      setPaymentLogs(Array.isArray(logs) ? logs : []);
    } catch (err) {
      setLogsError(err.message);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadPaymentLogs();
  }, [adminToken]);

  const filteredLogs = paymentLogs.filter(log => statusFilter === 'ALL' || (log.statusAfter || '').toLowerCase() === statusFilter.toLowerCase());

  const paidPaymentIds = new Set();
  const totalRevenue = filteredLogs.reduce((acc, log) => {
    if ((log.statusAfter === 'paid' || log.statusAfter === 'success') && !paidPaymentIds.has(log.paymentId)) {
      paidPaymentIds.add(log.paymentId);
      return acc + Number(log.amount || 0);
    }
    return acc;
  }, 0);
  const transactionTotalPages = Math.max(1, Math.ceil(filteredLogs.length / transactionPageSize));
  const transactionStartIndex = (transactionPage - 1) * transactionPageSize;
  const paginatedPaymentLogs = filteredLogs.slice(transactionStartIndex, transactionStartIndex + transactionPageSize);

  useEffect(() => {
    if (transactionPage > transactionTotalPages) {
      setTransactionPage(transactionTotalPages);
    }
  }, [transactionPage, transactionTotalPages]);

  const handleClear = () => {
    if (window.confirm('Yakin ingin menghapus semua riwayat transaksi? Laporan ini tidak bisa dikembalikan.')) {
      if (clearTransactions()) {
        setPaymentLogs([]);
      }
    }
  };

  const exportPaymentLogsToXLS = () => {
    if (paymentLogs.length === 0) {
      alert('Tidak ada payment log untuk diekspor.');
      return;
    }
    downloadSpreadsheet(`urbanmenphoto_payment_logs_${new Date().toISOString().split('T')[0]}.xls`, paymentLogs, [
      { key: 'paymentId', label: 'Payment ID' },
      { key: 'sessionId', label: 'Session ID' },
      { key: 'event', label: 'Event' },
      { key: 'provider', label: 'Provider' },
      { key: 'amount', label: 'Amount' },
      { key: 'currency', label: 'Currency' },
      { key: 'statusBefore', label: 'Status Before', value: row => row.statusBefore || '' },
      { key: 'statusAfter', label: 'Status After' },
      { key: 'ip', label: 'IP' },
      { key: 'createdAt', label: 'Created At', value: row => formatDateTime(row.createdAt) },
    ]);
  };

  return (
    <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', border: '1px solid #e9ecef', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#111' }}>Payment Logs</h2>
          <p style={{ margin: 0, color: '#6c757d', fontSize: '0.9rem', marginTop: '0.2rem' }}>
            Estimasi pendapatan berhasil: <span style={{ color: '#10B981', fontWeight: 'bold' }}>{formatCurrency(totalRevenue)}</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setTransactionPage(1); }}
            style={{ height: '42px', padding: '0 1rem', borderRadius: '8px', border: '1px solid #e9ecef', background: '#f8f9fa', fontSize: '0.9rem', color: '#111', fontWeight: 'bold', cursor: 'pointer', outline: 'none', boxSizing: 'border-box' }}
          >
            <option value="ALL">Semua Status</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <button onClick={loadPaymentLogs} style={{ height: '42px', padding: '0 1rem', background: '#f8f9fa', color: '#111', border: '1px solid #e9ecef', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', boxSizing: 'border-box' }}>
            Refresh
          </button>
          <button onClick={exportPaymentLogsToXLS} style={{ height: '42px', padding: '0 1rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', boxSizing: 'border-box' }}>
            ↓ Export XLS
          </button>
          <button onClick={handleClear} style={{ display: 'none', height: '42px', padding: '0 1rem', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', boxSizing: 'border-box' }}>
            Clear Logs
          </button>
        </div>
      </div>

      {logsError && (
        <div style={{ marginBottom: '1rem', padding: '0.8rem 1rem', borderRadius: '8px', background: '#fee2e2', color: '#b91c1c', fontWeight: 'bold' }}>
          {logsError}
        </div>
      )}

      {logsLoading ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px dashed #ced4da', borderRadius: '8px', color: '#6c757d' }}>
          Memuat payment log...
        </div>
      ) : filteredLogs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px dashed #ced4da', borderRadius: '8px', color: '#6c757d' }}>
          Belum ada payment log yang sesuai filter.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e9ecef', color: '#6c757d', fontSize: '0.9rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '1rem 0' }}>Payment ID</th>
                <th style={{ padding: '1rem 0' }}>Waktu</th>
                <th style={{ padding: '1rem 0' }}>Event</th>
                <th style={{ padding: '1rem 0' }}>Provider</th>
                <th style={{ padding: '1rem 0' }}>Amount</th>
                <th style={{ padding: '1rem 0' }}>Status</th>
                <th style={{ padding: '1rem 0' }}>IP</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPaymentLogs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid #f1f3f5' }}>
                  <td style={{ padding: '1rem 0', fontFamily: 'monospace', color: '#111', fontSize: '0.85rem' }}>
                    <div>{String(log.paymentId || '').slice(0, 18)}...</div>
                    <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.2rem' }}>{String(log.sessionId || '').slice(0, 18)}...</div>
                  </td>
                  <td style={{ padding: '1rem 0', color: '#495057', fontSize: '0.95rem' }}>
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td style={{ padding: '1rem 0', color: '#111', fontWeight: '700' }}>{log.event}</td>
                  <td style={{ padding: '1rem 0', color: '#495057', fontSize: '0.95rem' }}>{log.provider}</td>
                  <td style={{ padding: '1rem 0', color: '#111', fontWeight: 'bold' }}>{formatCurrency(log.amount)}</td>
                  <td style={{ padding: '1rem 0' }}>
                    <StatusBadge status={log.statusAfter} before={log.statusBefore} />
                  </td>
                  <td style={{ padding: '1rem 0', color: '#6c757d', fontSize: '0.85rem' }}>{log.ip || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <AdminPagination
            page={transactionPage}
            totalPages={transactionTotalPages}
            pageSize={transactionPageSize}
            total={filteredLogs.length}
            onPageChange={setTransactionPage}
            onPageSizeChange={(size) => {
              setTransactionPageSize(size);
              setTransactionPage(1);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MonitoringTab({ adminToken }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadLogs = async () => {
    if (!adminToken) return;
    setLoading(true);
    setError('');
    try {
      const rows = await fetchAllAdminRows('/api/admin/audit-logs', adminToken, { q: 'monitoring.error' });
      setLogs(rows.filter(row => String(row.action || '').startsWith('monitoring.error.')));
    } catch (err) {
      setError(err.message || 'Gagal memuat monitoring error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [adminToken]);

  const filteredLogs = logs.filter((log) => {
    const logCategory = log.metadata?.category || String(log.action || '').replace('monitoring.error.', '');
    if (category && logCategory !== category) return false;
    if (query.trim()) {
      const text = [
        log.action,
        log.resource,
        log.metadata?.message,
        log.metadata?.source,
        log.metadata ? JSON.stringify(log.metadata) : '',
      ].filter(Boolean).join(' ').toLowerCase();
      if (!text.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  });
  const totals = filteredLogs.reduce((acc, log) => {
    const key = log.metadata?.category || String(log.action || '').replace('monitoring.error.', '') || 'system';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const startIndex = (page - 1) * pageSize;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const categoryLabel = (value) => ({
    save_photo: 'Gagal Save Foto',
    print: 'Gagal Print',
    whatsapp: 'Gagal WhatsApp',
    payment: 'Gagal Payment',
    system: 'System',
  }[value] || value);

  return (
    <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', border: '1px solid #e9ecef', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, color: '#111' }}>Monitoring Error</h2>
          <p style={{ margin: '0.25rem 0 0', color: '#6c757d', fontSize: '0.9rem' }}>Ringkasan error penting: save foto, print, WhatsApp, dan payment.</p>
        </div>
        <button onClick={loadLogs} disabled={loading} style={{ padding: '0.65rem 1rem', background: '#f8f9fa', color: '#111827', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: loading ? 'wait' : 'pointer', fontWeight: 'bold' }}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', borderRadius: '8px', background: '#fee2e2', color: '#b91c1c', fontWeight: 800 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
        {['save_photo', 'print', 'whatsapp', 'payment'].map(key => (
          <div key={key} style={{ padding: '1rem', borderRadius: '8px', background: totals[key] ? '#fff7ed' : '#f8fafc', border: totals[key] ? '1px solid #bae0f9' : '1px solid #e5e7eb' }}>
            <div style={{ color: totals[key] ? '#c2410c' : '#64748b', fontSize: '0.78rem', fontWeight: 900 }}>{categoryLabel(key)}</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 900 }}>{totals[key] || 0}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(180px, 1fr)', gap: '0.75rem', padding: '1rem', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e5e7eb', marginBottom: '1rem' }}>
        <select value={category} onChange={event => { setCategory(event.target.value); setPage(1); }} style={{ padding: '0.7rem 0.8rem', border: '1px solid #d1d5db', borderRadius: '8px', background: 'white' }}>
          <option value="">Semua kategori</option>
          <option value="save_photo">Gagal Save Foto</option>
          <option value="print">Gagal Print</option>
          <option value="whatsapp">Gagal WhatsApp</option>
          <option value="payment">Gagal Payment</option>
          <option value="system">System</option>
        </select>
        <input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Cari pesan, session, source..." style={{ padding: '0.7rem 0.8rem', border: '1px solid #d1d5db', borderRadius: '8px' }} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px dashed #ced4da', borderRadius: '8px', color: '#6c757d' }}>Memuat monitoring error...</div>
      ) : filteredLogs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px dashed #ced4da', borderRadius: '8px', color: '#10b981', fontWeight: 900 }}>Belum ada error penting tercatat.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: '0.65rem' }}>
            {paginatedLogs.map(log => {
              const key = log.metadata?.category || String(log.action || '').replace('monitoring.error.', '') || 'system';
              return (
                <div key={log.id} style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr) 120px', gap: '1rem', alignItems: 'center', padding: '0.95rem', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fffafa' }}>
                  <div>
                    <div style={{ color: '#111827', fontWeight: 900 }}>{formatDateTime(log.createdAt)}</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.74rem', fontWeight: 800, marginTop: '0.2rem' }}>{log.ip || '-'}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                      <span style={{ padding: '0.2rem 0.55rem', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 900, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}>{categoryLabel(key)}</span>
                      <span style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 800 }}>{log.metadata?.source || 'backend'}</span>
                    </div>
                    <div style={{ color: '#111827', fontSize: '0.9rem', fontWeight: 900, overflowWrap: 'anywhere' }}>{log.metadata?.message || describeAuditAction(log.action)}</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: '0.25rem', overflowWrap: 'anywhere' }}>
                      Resource/session: {log.resource || '-'}
                    </div>
                  </div>
                  <StatusBadge status="failed" />
                </div>
              );
            })}
          </div>
          <AdminPagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            total={filteredLogs.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}
    </div>
  );
}

function ReportExportTab({ adminToken, adminUser }) {
  const [exportingKey, setExportingKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const reports = [
    {
      key: 'sessions',
      title: 'Customer Gallery / Session Logs',
      description: 'Semua sesi customer, link gallery, media final, GIF, dan jumlah original snaps.',
      endpoint: '/api/admin/sessions',
      filename: `urbanmenphoto_sessions_${reportDateStamp()}.xls`,
      columns: SESSION_EXPORT_COLUMNS,
    },
    {
      key: 'transactions',
      title: 'Transactions',
      description: 'Rekap transaksi dari data payment utama.',
      endpoint: '/api/admin/transactions',
      filename: `urbanmenphoto_transactions_${reportDateStamp()}.xls`,
      columns: TRANSACTION_EXPORT_COLUMNS,
    },
    {
      key: 'payment_logs',
      title: 'Payment Logs',
      description: 'Riwayat event payment, perubahan status, IP, dan provider reference.',
      endpoint: '/api/admin/payment-logs',
      filename: `urbanmenphoto_payment_logs_${reportDateStamp()}.xls`,
      columns: PAYMENT_LOG_EXPORT_COLUMNS,
    },
    {
      key: 'messages',
      title: 'Delivery Messages',
      description: 'Log pengiriman link gallery via WhatsApp/email.',
      endpoint: '/api/admin/messages',
      filename: `urbanmenphoto_messages_${reportDateStamp()}.xls`,
      columns: MESSAGE_EXPORT_COLUMNS,
    },
    {
      key: 'audit',
      title: 'Audit Activity',
      description: 'Jejak aksi admin, customer session, dan webhook backend.',
      endpoint: '/api/admin/audit-logs',
      filename: `urbanmenphoto_audit_logs_${reportDateStamp()}.xls`,
      columns: AUDIT_EXPORT_COLUMNS,
      ownerOnly: true,
    },
  ].filter(report => !report.ownerOnly || adminUser?.role === 'owner');

  const exportReport = async (report) => {
    setExportingKey(report.key);
    setMessage('');
    setError('');
    try {
      const rows = await fetchAllAdminRows(report.endpoint, adminToken);
      if (!rows.length) {
        setMessage(`${report.title}: tidak ada data untuk diekspor.`);
        return;
      }
      downloadSpreadsheet(report.filename, rows, report.columns);
      setMessage(`${report.title}: ${rows.length} data berhasil diekspor.`);
    } catch (err) {
      setError(`${report.title}: ${err.message || 'Export gagal.'}`);
    } finally {
      setExportingKey('');
    }
  };

  const exportEventBundle = async () => {
    setExportingKey('bundle');
    setMessage('');
    setError('');
    try {
      const sessionRows = await fetchAllAdminRows('/api/admin/sessions', adminToken);
      const transactionRows = await fetchAllAdminRows('/api/admin/transactions', adminToken);
      const paymentLogRows = await fetchAllAdminRows('/api/admin/payment-logs', adminToken);
      downloadSpreadsheet(`urbanmenphoto_sessions_${reportDateStamp()}.xls`, sessionRows, SESSION_EXPORT_COLUMNS);
      downloadSpreadsheet(`urbanmenphoto_transactions_${reportDateStamp()}.xls`, transactionRows, TRANSACTION_EXPORT_COLUMNS);
      downloadSpreadsheet(`urbanmenphoto_payment_logs_${reportDateStamp()}.xls`, paymentLogRows, PAYMENT_LOG_EXPORT_COLUMNS);
      setMessage(`Bundle rekap event berhasil diekspor: ${sessionRows.length} sessions, ${transactionRows.length} transactions, ${paymentLogRows.length} payment logs.`);
    } catch (err) {
      setError(err.message || 'Export bundle gagal.');
    } finally {
      setExportingKey('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', border: '1px solid #e9ecef', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, color: '#111' }}>Export Report</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#6c757d', fontSize: '0.9rem' }}>Download XLS untuk rekap event, transaksi, gallery, dan audit.</p>
          </div>
          <button
            type="button"
            onClick={exportEventBundle}
            disabled={Boolean(exportingKey)}
            style={{ padding: '0.75rem 1.1rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: exportingKey ? 'wait' : 'pointer', fontWeight: 'bold' }}
          >
            {exportingKey === 'bundle' ? 'Exporting...' : 'Export Bundle Event'}
          </button>
        </div>

        {message && <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', borderRadius: '8px', background: '#dcfce7', color: '#166534', fontWeight: 800 }}>{message}</div>}
        {error && <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', borderRadius: '8px', background: '#fee2e2', color: '#b91c1c', fontWeight: 800 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          {reports.map(report => (
            <div key={report.key} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.1rem', background: '#fff' }}>
              <div style={{ minHeight: '90px' }}>
                <h3 style={{ margin: '0 0 0.45rem', color: '#111827', fontSize: '1rem' }}>{report.title}</h3>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', lineHeight: 1.45 }}>{report.description}</p>
              </div>
              <button
                type="button"
                onClick={() => exportReport(report)}
                disabled={Boolean(exportingKey)}
                style={{ width: '100%', marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '8px', border: 'none', background: '#40a3eb', color: 'white', cursor: exportingKey ? 'wait' : 'pointer', fontWeight: 900 }}
              >
                {exportingKey === report.key ? 'Exporting...' : 'Download XLS'}
              </button>
            </div>
          ))}
        </div>

        {adminUser?.role !== 'owner' && (
          <div style={{ marginTop: '1.2rem', padding: '0.9rem 1rem', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e5e7eb', color: '#64748b', fontSize: '0.85rem', lineHeight: 1.5 }}>
            Staff bisa export rekap operasional. Audit activity penuh, payment key, storage, dan admin users tetap khusus owner.
          </div>
        )}
      </div>
    </div>
  );
}

const describeAuditAction = (action = '') => {
  const parts = String(action || '').split('.');
  const area = parts[0] || 'system';
  const subject = parts.slice(1, -1).join(' ') || parts[1] || 'activity';
  const verb = parts[parts.length - 1] || 'event';
  const verbMap = {
    create: 'membuat',
    update: 'mengubah',
    delete: 'menghapus',
    login: 'login',
    logout: 'logout',
    failed: 'gagal',
    success: 'berhasil',
    finalize: 'menyimpan hasil',
    cleanup: 'cleanup',
  };
  return `${area} ${verbMap[verb] || verb} ${subject}`.replace(/\s+/g, ' ').trim();
};

const auditAreaStyle = (action = '') => {
  const area = String(action).split('.')[0];
  if (area === 'admin') return { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' };
  if (area === 'customer') return { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' };
  if (area === 'webhook' || area === 'payment') return { background: '#fff7ed', color: '#c2410c', border: '1px solid #bae0f9' };
  return { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' };
};

const formatAuditMetadataValue = (value) => {
  if (value == null || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    if ('url' in value && value.url) return value.url;
    return JSON.stringify(value);
  }
  return String(value);
};

function AuditMetadataDetails({ metadata }) {
  if (!metadata || typeof metadata !== 'object' || Object.keys(metadata).length === 0) {
    return (
      <div style={{ padding: '0.8rem', borderRadius: '8px', background: '#f8fafc', color: '#64748b', fontSize: '0.78rem', lineHeight: 1.45 }}>
        Belum ada metadata detail untuk audit ini.
      </div>
    );
  }

  const before = metadata.before && typeof metadata.before === 'object' ? metadata.before : null;
  const after = metadata.after && typeof metadata.after === 'object' ? metadata.after : null;
  const beforeAfterKeys = before || after
    ? Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]))
    : [];
  const groupedEntries = Object.entries(metadata).filter(([key]) => key !== 'before' && key !== 'after');

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {beforeAfterKeys.length > 0 && (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: '#f8fafc', color: '#64748b', fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase' }}>
            <div style={{ padding: '0.55rem' }}>Field</div>
            <div style={{ padding: '0.55rem' }}>Before</div>
            <div style={{ padding: '0.55rem' }}>After</div>
          </div>
          {beforeAfterKeys.map((key) => {
            const beforeValue = formatAuditMetadataValue(before?.[key]);
            const afterValue = formatAuditMetadataValue(after?.[key]);
            const changed = beforeValue !== afterValue;
            return (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid #f1f5f9', background: changed ? '#fff7ed' : 'white', fontSize: '0.75rem' }}>
                <div style={{ padding: '0.55rem', color: '#475569', fontWeight: 900 }}>{key}</div>
                <div style={{ padding: '0.55rem', color: '#64748b', overflowWrap: 'anywhere' }}>{beforeValue}</div>
                <div style={{ padding: '0.55rem', color: changed ? '#c2410c' : '#64748b', fontWeight: changed ? 900 : 700, overflowWrap: 'anywhere' }}>{afterValue}</div>
              </div>
            );
          })}
        </div>
      )}

      {groupedEntries.map(([groupKey, groupValue]) => (
        <div key={groupKey} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.75rem', background: '#fff' }}>
          <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '0.45rem' }}>{groupKey}</div>
          {groupValue && typeof groupValue === 'object' && !Array.isArray(groupValue) ? (
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              {Object.entries(groupValue).map(([key, value]) => (
                <div key={key} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr)', gap: '0.5rem', fontSize: '0.76rem' }}>
                  <div style={{ color: '#94a3b8', fontWeight: 900 }}>{key}</div>
                  <div style={{ color: '#111827', fontWeight: 750, overflowWrap: 'anywhere' }}>{formatAuditMetadataValue(value)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#111827', fontWeight: 800, fontSize: '0.78rem', overflowWrap: 'anywhere' }}>{formatAuditMetadataValue(groupValue)}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function AuditActivityTab({ adminToken }) {
  const [logs, setLogs] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    actor: '',
    action: '',
    success: '',
    query: '',
  });
  const [selectedLog, setSelectedLog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(10);

  const actorMap = adminUsers.reduce((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {});

  const loadAuditLogs = async () => {
    if (!adminToken) return;
    setLoading(true);
    setError('');
    try {
      const rows = await fetchAllAdminRows('/api/admin/audit-logs', adminToken);
      setLogs(rows);
      try {
        const users = await backendRequest('/api/admin/users', adminToken);
        setAdminUsers(Array.isArray(users) ? users : []);
      } catch {
        setAdminUsers([]);
      }
    } catch (err) {
      setError(err.message || 'Gagal memuat audit logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, [adminToken]);

  const actionOptions = Array.from(new Set(logs.map(log => log.action).filter(Boolean))).sort();
  const actorOptions = Array.from(new Set(logs.map(log => log.actorId || 'system').filter(Boolean)));

  const filteredLogs = logs.filter((log) => {
    const createdDate = log.createdAt ? new Date(log.createdAt) : null;
    if (filters.dateFrom && createdDate && createdDate < new Date(`${filters.dateFrom}T00:00:00`)) return false;
    if (filters.dateTo && createdDate && createdDate > new Date(`${filters.dateTo}T23:59:59`)) return false;
    if (filters.actor) {
      const actorValue = log.actorId || 'system';
      if (actorValue !== filters.actor) return false;
    }
    if (filters.action && log.action !== filters.action) return false;
    if (filters.success && String(Boolean(log.success)) !== filters.success) return false;
    if (filters.query.trim()) {
      const haystack = [
        log.id,
        log.actorId,
        actorMap[log.actorId]?.email,
        actorMap[log.actorId]?.role,
        log.action,
        log.resource,
        log.ip,
        log.userAgent,
        log.metadata ? JSON.stringify(log.metadata) : '',
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(filters.query.trim().toLowerCase())) return false;
    }
    return true;
  });

  const totals = filteredLogs.reduce((acc, log) => {
    acc.total += 1;
    if (log.success) acc.success += 1;
    else acc.failed += 1;
    const area = String(log.action || 'system').split('.')[0] || 'system';
    acc.areas[area] = (acc.areas[area] || 0) + 1;
    return acc;
  }, { total: 0, success: 0, failed: 0, areas: {} });
  const auditTotalPages = Math.max(1, Math.ceil(filteredLogs.length / auditPageSize));
  const auditStartIndex = (auditPage - 1) * auditPageSize;
  const paginatedLogs = filteredLogs.slice(auditStartIndex, auditStartIndex + auditPageSize);

  useEffect(() => {
    if (auditPage > auditTotalPages) {
      setAuditPage(auditTotalPages);
    }
  }, [auditPage, auditTotalPages]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setAuditPage(1);
  };

  const resetFilters = () => {
    setFilters({ dateFrom: '', dateTo: '', actor: '', action: '', success: '', query: '' });
    setAuditPage(1);
  };

  const exportFiltered = async () => {
    setExporting(true);
    setError('');
    try {
      if (!filteredLogs.length) {
        setError('Tidak ada audit log untuk diekspor.');
        return;
      }
      downloadSpreadsheet(`urbanmenphoto_audit_filtered_${reportDateStamp()}.xls`, filteredLogs, [
        ...AUDIT_EXPORT_COLUMNS,
        { key: 'actorEmail', label: 'Actor Email', value: row => actorMap[row.actorId]?.email || (row.actorId ? row.actorId : 'system/customer') },
        { key: 'actorRole', label: 'Actor Role', value: row => actorMap[row.actorId]?.role || (row.actorId ? '-' : 'system/customer') },
        { key: 'description', label: 'Readable Detail', value: row => describeAuditAction(row.action) },
      ]);
    } finally {
      setExporting(false);
    }
  };

  const selectedActor = selectedLog ? actorMap[selectedLog.actorId] : null;
  const auditPaginationControls = filteredLogs.length > 0 && (
    <AdminPagination
      page={auditPage}
      totalPages={auditTotalPages}
      pageSize={auditPageSize}
      total={filteredLogs.length}
      onPageChange={setAuditPage}
      onPageSizeChange={(size) => {
        setAuditPageSize(size);
        setAuditPage(1);
      }}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', border: '1px solid #e9ecef', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, color: '#111' }}>Audit Activity</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#6c757d', fontSize: '0.9rem' }}>Filter jejak aktivitas admin/operator, customer, dan backend event.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={loadAuditLogs} disabled={loading} style={{ padding: '0.65rem 1rem', background: '#f8f9fa', color: '#111827', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: loading ? 'wait' : 'pointer', fontWeight: 'bold' }}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button onClick={exportFiltered} disabled={exporting || loading} style={{ padding: '0.65rem 1rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: exporting ? 'wait' : 'pointer', fontWeight: 'bold' }}>
              {exporting ? 'Exporting...' : 'Export Filtered XLS'}
            </button>
          </div>
        </div>

        {error && <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', borderRadius: '8px', background: '#fee2e2', color: '#b91c1c', fontWeight: 800 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
          <div style={{ padding: '1rem', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
            <div style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 900 }}>Total Filtered</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 900 }}>{totals.total}</div>
          </div>
          <div style={{ padding: '1rem', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <div style={{ color: '#166534', fontSize: '0.78rem', fontWeight: 900 }}>Success</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 900 }}>{totals.success}</div>
          </div>
          <div style={{ padding: '1rem', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca' }}>
            <div style={{ color: '#991b1b', fontSize: '0.78rem', fontWeight: 900 }}>Failed</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 900 }}>{totals.failed}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', padding: '1rem', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e5e7eb', marginBottom: '1rem' }}>
          <input type="date" value={filters.dateFrom} onChange={event => handleFilterChange('dateFrom', event.target.value)} style={{ padding: '0.7rem 0.8rem', border: '1px solid #d1d5db', borderRadius: '8px' }} />
          <input type="date" value={filters.dateTo} onChange={event => handleFilterChange('dateTo', event.target.value)} style={{ padding: '0.7rem 0.8rem', border: '1px solid #d1d5db', borderRadius: '8px' }} />
          <select value={filters.actor} onChange={event => handleFilterChange('actor', event.target.value)} style={{ padding: '0.7rem 0.8rem', border: '1px solid #d1d5db', borderRadius: '8px', background: 'white' }}>
            <option value="">Semua admin/operator</option>
            {actorOptions.map(actorId => {
              const user = actorMap[actorId];
              return <option key={actorId} value={actorId}>{actorId === 'system' ? 'System / customer' : `${user?.email || actorId} (${user?.role || 'admin'})`}</option>;
            })}
          </select>
          <select value={filters.action} onChange={event => handleFilterChange('action', event.target.value)} style={{ padding: '0.7rem 0.8rem', border: '1px solid #d1d5db', borderRadius: '8px', background: 'white' }}>
            <option value="">Semua event/action</option>
            {actionOptions.map(action => <option key={action} value={action}>{action}</option>)}
          </select>
          <select value={filters.success} onChange={event => handleFilterChange('success', event.target.value)} style={{ padding: '0.7rem 0.8rem', border: '1px solid #d1d5db', borderRadius: '8px', background: 'white' }}>
            <option value="">Semua status</option>
            <option value="true">Success</option>
            <option value="false">Failed</option>
          </select>
          <input value={filters.query} onChange={event => handleFilterChange('query', event.target.value)} placeholder="Cari resource, IP, email..." style={{ padding: '0.7rem 0.8rem', border: '1px solid #d1d5db', borderRadius: '8px' }} />
          <button type="button" onClick={resetFilters} style={{ padding: '0.7rem 0.8rem', border: '1px solid #d1d5db', borderRadius: '8px', background: 'white', color: '#111827', cursor: 'pointer', fontWeight: 900 }}>
            Reset Filter
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px dashed #ced4da', borderRadius: '8px', color: '#6c757d' }}>Memuat audit logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px dashed #ced4da', borderRadius: '8px', color: '#6c757d' }}>Tidak ada audit log yang cocok dengan filter.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: '1rem', alignItems: 'start' }}>
              <div style={{ display: 'grid', gap: '0.65rem' }}>
                {paginatedLogs.map(log => {
                  const actor = actorMap[log.actorId];
                  const isSelected = selectedLog?.id === log.id;
                  return (
                    <button
                      key={log.id}
                      type="button"
                      onClick={() => setSelectedLog(log)}
                      style={{ width: '100%', textAlign: 'left', display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr) 96px', gap: '1rem', alignItems: 'center', padding: '0.95rem', borderRadius: '8px', border: isSelected ? '2px solid #40a3eb' : '1px solid #e5e7eb', background: isSelected ? '#fff7ed' : 'white', cursor: 'pointer' }}
                    >
                      <div>
                        <div style={{ color: '#111827', fontWeight: 900 }}>{formatDateTime(log.createdAt)}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.74rem', fontWeight: 800, marginTop: '0.2rem' }}>{log.ip || '-'}</div>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                          <span style={{ padding: '0.2rem 0.5rem', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 900, ...auditAreaStyle(log.action) }}>{String(log.action || 'system').split('.')[0]}</span>
                          <span style={{ color: '#111827', fontWeight: 900 }}>{log.action}</span>
                        </div>
                        <div style={{ color: '#475569', fontSize: '0.86rem', fontWeight: 700, overflowWrap: 'anywhere' }}>{describeAuditAction(log.action)}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: '0.25rem', overflowWrap: 'anywhere' }}>
                          {actor?.email || log.actorId || 'System / customer'} · {log.resource || '-'}
                        </div>
                      </div>
                      <StatusBadge status={log.success ? 'success' : 'failed'} />
                    </button>
                  );
                })}
              </div>

              <aside style={{ position: 'sticky', top: 0, border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', padding: '1rem' }}>
                {!selectedLog ? (
                  <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem 1rem', fontWeight: 800 }}>Pilih audit log untuk melihat detail.</div>
                ) : (
                  <div style={{ display: 'grid', gap: '0.85rem' }}>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 900, textTransform: 'uppercase' }}>Detail Perubahan</div>
                      <h3 style={{ margin: '0.3rem 0 0', color: '#111827', lineHeight: 1.25 }}>{describeAuditAction(selectedLog.action)}</h3>
                    </div>
                    {[
                      ['Event / Action', selectedLog.action],
                      ['Status', selectedLog.success ? 'Success' : 'Failed'],
                      ['Actor', selectedActor?.email || selectedLog.actorId || 'System / customer'],
                      ['Role', selectedActor?.role || (selectedLog.actorId ? '-' : 'system/customer')],
                      ['Resource', selectedLog.resource || '-'],
                      ['IP Address', selectedLog.ip || '-'],
                      ['Waktu', formatDateTime(selectedLog.createdAt)],
                      ['Audit ID', selectedLog.id],
                    ].map(([label, value]) => (
                      <div key={label} style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.65rem' }}>
                        <div style={{ color: '#94a3b8', fontSize: '0.74rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '0.25rem' }}>{label}</div>
                        <div style={{ color: '#111827', fontWeight: 800, overflowWrap: 'anywhere' }}>{value}</div>
                      </div>
                    ))}
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.65rem' }}>
                      <div style={{ color: '#94a3b8', fontSize: '0.74rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '0.25rem' }}>User Agent</div>
                      <div style={{ color: '#475569', fontSize: '0.78rem', lineHeight: 1.45, overflowWrap: 'anywhere' }}>{selectedLog.userAgent || '-'}</div>
                    </div>
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.65rem' }}>
                      <div style={{ color: '#94a3b8', fontSize: '0.74rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Metadata / Field Changes</div>
                      <AuditMetadataDetails metadata={selectedLog.metadata} />
                    </div>
                  </div>
                )}
              </aside>
            </div>
            {auditPaginationControls}
          </>
        )}
      </div>
    </div>
  );
}

function BackendListTab({ title, description, endpoint, adminToken, columns }) {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: 25, totalPages: 0 });
  const [query, setQuery] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const filterKey = endpoint.includes('payments')
    ? 'status'
    : endpoint.includes('messages')
      ? 'channel'
      : endpoint.includes('audit-logs')
        ? 'action'
        : 'status';

  const loadRows = async (nextPage = pagination.page) => {
    if (!adminToken) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(pagination.pageSize),
      });
      if (query.trim()) params.set('q', query.trim());
      if (filterValue.trim()) params.set(filterKey, filterValue.trim());
      const data = await backendRequest(`${endpoint}?${params.toString()}`, adminToken);
      if (Array.isArray(data)) {
        setRows(data);
        setPagination(prev => ({ ...prev, total: data.length, page: 1, totalPages: 1 }));
      } else {
        setRows(Array.isArray(data?.items) ? data.items : []);
        setPagination({
          total: Number(data?.total || 0),
          page: Number(data?.page || nextPage),
          pageSize: Number(data?.pageSize || pagination.pageSize),
          totalPages: Number(data?.totalPages || 0),
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows(1);
  }, [endpoint, adminToken, pagination.pageSize]);

  const exportCurrentList = async () => {
    if (!adminToken) return;
    setExporting(true);
    setError('');
    try {
      const params = {};
      if (query.trim()) params.q = query.trim();
      if (filterValue.trim()) params[filterKey] = filterValue.trim();
      const exportRows = await fetchAllAdminRows(endpoint, adminToken, params);
      if (!exportRows.length) {
        setError('Tidak ada data untuk diekspor.');
        return;
      }
      const exportColumns = columns.map(column => ({
        key: column.key,
        label: column.label,
        value: (row) => {
          const value = row[column.key];
          if (column.key === 'amount') return value;
          if (String(column.key).toLowerCase().includes('at')) return formatDateTime(value);
          if (typeof value === 'boolean') return value ? 'yes' : 'no';
          return value;
        },
      }));
      const name = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      downloadSpreadsheet(`urbanmenphoto_${name || 'report'}_${reportDateStamp()}.xls`, exportRows, exportColumns);
    } catch (err) {
      setError(err.message || 'Export gagal.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', border: '1px solid #e9ecef', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, color: '#111' }}>{title}</h2>
          {description && <p style={{ margin: '0.25rem 0 0', color: '#6c757d', fontSize: '0.9rem' }}>{description}</p>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') loadRows(1); }}
            placeholder="Search..."
            style={{ padding: '0.6rem 0.8rem', border: '1px solid #e9ecef', borderRadius: '6px', minWidth: '180px' }}
          />
          <input
            value={filterValue}
            onChange={(event) => setFilterValue(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') loadRows(1); }}
            placeholder={`Filter ${filterKey}`}
            style={{ padding: '0.6rem 0.8rem', border: '1px solid #e9ecef', borderRadius: '6px', width: '130px' }}
          />
          <button onClick={() => loadRows(1)} style={{ padding: '0.6rem 1rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            Apply
          </button>
          <button onClick={() => loadRows(pagination.page)} style={{ padding: '0.6rem 1rem', background: '#f8f9fa', color: '#111', border: '1px solid #e9ecef', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            Refresh
          </button>
          <button onClick={exportCurrentList} disabled={exporting} style={{ padding: '0.6rem 1rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: exporting ? 'wait' : 'pointer', fontWeight: 'bold' }}>
            {exporting ? 'Exporting...' : 'Export XLS'}
          </button>
        </div>
      </div>

      {error && <div style={{ marginBottom: '1rem', padding: '0.8rem 1rem', borderRadius: '8px', background: '#fee2e2', color: '#b91c1c', fontWeight: 'bold' }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px dashed #ced4da', borderRadius: '8px', color: '#6c757d' }}>Memuat data...</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px dashed #ced4da', borderRadius: '8px', color: '#6c757d' }}>Belum ada data.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e9ecef', color: '#6c757d', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                {columns.map(col => <th key={col.key} style={{ padding: '1rem 0.75rem' }}>{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id || row.tokenHash || idx} style={{ borderBottom: '1px solid #f1f3f5' }}>
                  {columns.map(col => (
                    <td key={col.key} style={{ padding: '1rem 0.75rem', color: '#374151', fontSize: '0.9rem', verticalAlign: 'top' }}>
                      {col.render ? col.render(row) : String(row[col.key] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <AdminPagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onPageChange={loadRows}
            onPageSizeChange={(size) => setPagination(prev => ({ ...prev, pageSize: size, page: 1 }))}
          />
        </div>
      )}
    </div>
  );
}

function AdminSessionDetailModal({ detail, loading, error, onClose }) {
  const session = detail?.session || {};
  const images = [
    session.animatedImage?.url,
    session.finalImage?.url,
    session.printImage?.url,
    ...(session.images || []),
  ].filter(Boolean);
  const payments = detail?.payments || [];
  const messages = detail?.messages || [];
  const auditLogs = detail?.auditLogs || [];

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(17, 24, 39, 0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div style={{ width: 'min(1100px, 100%)', maxHeight: '88vh', overflowY: 'auto', background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 24px 70px rgba(0,0,0,0.25)', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ margin: 0, color: '#111' }}>Session Detail</h2>
            <p style={{ margin: '0.35rem 0 0', color: '#6c757d', fontFamily: 'monospace', fontSize: '0.9rem' }}>{session.id || '-'}</p>
          </div>
          <button onClick={onClose} style={{ padding: '0.55rem 0.85rem', background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Close</button>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6c757d' }}>Memuat detail...</div>
        ) : error ? (
          <div style={{ padding: '1rem', borderRadius: '8px', background: '#fee2e2', color: '#b91c1c', fontWeight: 'bold' }}>{error}</div>
        ) : (
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.9rem' }}>
              {[
                ['Status', session.status],
                ['Created', formatDateTime(session.createdAt)],
                ['Expires', formatDateTime(session.expiresAt)],
                ['Download', session.downloadUrl],
              ].map(([label, value]) => (
                <div key={label} style={{ border: '1px solid #e9ecef', borderRadius: '8px', padding: '0.9rem', background: '#f8f9fa' }}>
                  <div style={{ color: '#6c757d', fontSize: '0.76rem', fontWeight: '900', textTransform: 'uppercase', marginBottom: '0.35rem' }}>{label}</div>
                  <div style={{ color: '#111827', fontWeight: '800', overflowWrap: 'anywhere' }}>{value || '-'}</div>
                </div>
              ))}
            </div>

            <section>
              <h3 style={{ margin: '0 0 0.75rem', color: '#111' }}>Media</h3>
              {images.length === 0 ? (
                <div style={{ padding: '1rem', borderRadius: '8px', border: '1px dashed #ced4da', color: '#6c757d' }}>Belum ada media.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
                  {images.map((url, index) => (
                    <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" style={{ display: 'block', border: '1px solid #e9ecef', borderRadius: '8px', overflow: 'hidden', background: '#f8f9fa', textDecoration: 'none' }}>
                      <img src={url} alt={`Session media ${index + 1}`} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                      <div style={{ padding: '0.5rem', color: '#374151', fontSize: '0.78rem', fontWeight: '800' }}>{url.includes('.gif') ? 'GIF' : `Image ${index + 1}`}</div>
                    </a>
                  ))}
                </div>
              )}
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <DetailList title="Payments" rows={payments} columns={['provider', 'amount', 'status', 'createdAt']} />
              <DetailList title="Messages" rows={messages} columns={['channel', 'recipient', 'status', 'createdAt']} />
              <DetailList title="Activity" rows={auditLogs} columns={['action', 'success', 'createdAt']} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailList({ title, rows, columns }) {
  return (
    <section style={{ border: '1px solid #e9ecef', borderRadius: '8px', padding: '1rem' }}>
      <h3 style={{ margin: '0 0 0.75rem', color: '#111' }}>{title}</h3>
      {rows.length === 0 ? (
        <div style={{ color: '#6c757d', fontSize: '0.9rem' }}>Belum ada data.</div>
      ) : (
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          {rows.map((row, index) => (
            <div key={row.id || `${title}-${index}`} style={{ borderBottom: index === rows.length - 1 ? 'none' : '1px solid #f1f3f5', paddingBottom: '0.6rem' }}>
              {columns.map((column) => (
                <div key={column} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.84rem', marginBottom: '0.2rem' }}>
                  <span style={{ color: '#6c757d', fontWeight: '800' }}>{column}</span>
                  <span style={{ color: '#111827', fontWeight: '700', textAlign: 'right', overflowWrap: 'anywhere' }}>{formatDetailValue(row[column], column)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDetailValue(value, column) {
  if (value == null || value === '') return '-';
  if (column === 'createdAt' || column === 'updatedAt') return formatDateTime(value);
  if (column === 'amount') return formatCurrency(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

const emptyVoucherForm = {
  code: '',
  name: '',
  type: 'fixed',
  value: 0,
  minAmount: 0,
  maxDiscount: 0,
  usageLimit: 0,
  active: true,
  startsAt: '',
  endsAt: ''
};

const toDateInputValue = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toISOString().split('T')[0];
};

const dateInputToISOString = (dateString, isEndOfDay = false) => {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (isEndOfDay) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
};

const voucherStatus = (voucher) => {
  if (!voucher.active) return 'inactive';
  const now = new Date();
  if (voucher.startsAt && new Date(voucher.startsAt) > now) return 'scheduled';
  if (voucher.endsAt && new Date(voucher.endsAt) < now) return 'expired';
  if (voucher.usageLimit > 0 && voucher.usedCount >= voucher.usageLimit) return 'depleted';
  return 'active';
};

function AddVoucherModal({ isOpen, onClose, form, updateForm, saveVoucher, saving, error, isEdit }) {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '8px', padding: '2rem', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, color: '#111827', fontSize: '1.25rem' }}>{isEdit ? 'Edit Voucher' : 'Buat Voucher Baru'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280', borderRadius: '8px' }}>&times;</button>
        </div>

        {error && <div style={{ padding: '0.85rem 1rem', borderRadius: '8px', background: '#fee2e2', color: '#991b1b', marginBottom: '1rem', fontWeight: 600, fontSize: '0.9rem' }}>{error}</div>}

        <form onSubmit={saveVoucher} style={{ display: 'grid', gap: '1rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem', color: '#374151', fontSize: '0.9rem', fontWeight: 600 }}>
            Kode Voucher
            <input value={form.code} onChange={e => updateForm('code', e.target.value.toUpperCase())} placeholder="PROMO2026" required maxLength={32} style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', textTransform: 'uppercase' }} />
          </label>

          <label style={{ display: 'grid', gap: '0.35rem', color: '#374151', fontSize: '0.9rem', fontWeight: 600 }}>
            Nama Voucher (Opsional)
            <input value={form.name} onChange={e => updateForm('name', e.target.value)} placeholder="Diskon Spesial" style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px' }} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <label style={{ display: 'grid', gap: '0.35rem', color: '#374151', fontSize: '0.9rem', fontWeight: 600 }}>
              Tipe Diskon
              <select value={form.type} onChange={e => updateForm('type', e.target.value)} style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', background: 'white' }}>
                <option value="fixed">Tunai (Rp)</option>
                <option value="percent">Diskon (%)</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', color: '#374151', fontSize: '0.9rem', fontWeight: 600 }}>
              Nilai
              <input type="number" min="1" max={form.type === 'percent' ? "100" : undefined} value={form.value} onChange={e => updateForm('value', e.target.value)} placeholder={form.type === 'percent' ? '10' : '5000'} required style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px' }} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <label style={{ display: 'grid', gap: '0.35rem', color: '#374151', fontSize: '0.9rem', fontWeight: 600 }}>
              Mulai (Opsional)
              <input type="date" value={form.startsAt} onChange={e => updateForm('startsAt', e.target.value)} style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', color: '#374151', fontSize: '0.9rem', fontWeight: 600 }}>
              Berakhir (Opsional)
              <input type="date" value={form.endsAt} onChange={e => updateForm('endsAt', e.target.value)} style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px' }} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: '0.35rem', color: '#374151', fontSize: '0.9rem', fontWeight: 600 }}>
              Limit Pemakaian
              <input type="number" min="0" value={form.usageLimit} onChange={e => updateForm('usageLimit', e.target.value)} placeholder="0 = unlimited" style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px' }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', color: '#374151', fontWeight: 600 }}>
              <input type="checkbox" checked={form.active} onChange={e => updateForm('active', e.target.checked)} />
              Aktif
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
            <button type="button" onClick={onClose} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid #d1d5db', background: 'white', color: '#374151', fontWeight: 600, cursor: 'pointer' }}>Batal</button>
            <button type="submit" disabled={saving} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: '#40a3eb', color: 'white', fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Menyimpan...' : 'Simpan Voucher'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VoucherSettingsTab({ adminToken }) {
  const [vouchers, setVouchers] = useState([]);
  const [activeTab, setActiveTab] = useState('tunai'); // 'tunai' | 'diskon'
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [form, setForm] = useState(emptyVoucherForm);
  const [editingId, setEditingId] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadVouchers = async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const data = await backendRequest('/api/admin/vouchers', adminToken);
      setVouchers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadVouchers(); }, [adminToken]);

  const filteredVouchers = vouchers.filter(v => activeTab === 'tunai' ? v.type === 'fixed' : v.type === 'percent');
  const isAllSelected = filteredVouchers.length > 0 && filteredVouchers.every(v => selectedIds.has(v.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredVouchers.map(v => v.id)));
    }
  };

  const toggleSelect = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const resetForm = () => {
    setForm(emptyVoucherForm);
    setEditingId('');
  };

  const openModalNew = () => {
    resetForm();
    updateForm('type', activeTab === 'tunai' ? 'fixed' : 'percent');
    setIsModalOpen(true);
    setError('');
  };

  const openModalEdit = (voucher) => {
    setEditingId(voucher.id);
    setForm({
      id: voucher.id,
      code: voucher.code || '',
      name: voucher.name || '',
      type: voucher.type || 'fixed',
      value: String(voucher.value || ''),
      minAmount: String(voucher.minAmount || ''),
      maxDiscount: String(voucher.maxDiscount || ''),
      usageLimit: String(voucher.usageLimit || ''),
      active: Boolean(voucher.active),
      startsAt: toDateInputValue(voucher.startsAt),
      endsAt: toDateInputValue(voucher.endsAt),
    });
    setIsModalOpen(true);
    setError('');
  };

  const updateForm = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const saveVoucher = async (event) => {
    event.preventDefault();
    if (!adminToken) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        id: form.id || undefined,
        code: form.code.trim(),
        name: form.name.trim(),
        type: form.type,
        value: Number(form.value || 0),
        minAmount: Number(form.minAmount || 0),
        maxDiscount: Number(form.maxDiscount || 0),
        usageLimit: Number(form.usageLimit || 0),
        active: Boolean(form.active),
        startsAt: dateInputToISOString(form.startsAt),
        endsAt: dateInputToISOString(form.endsAt, true),
      };

      if (payload.type === 'percent' && payload.value > 100) {
        throw new Error('Persentase diskon tidak boleh lebih dari 100%.');
      }

      const endpoint = editingId ? `/api/admin/vouchers/${editingId}` : '/api/admin/vouchers';
      const saved = await backendRequest(endpoint, adminToken, {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      setVouchers(prev => {
        const exists = prev.some(item => item.id === saved.id);
        return exists ? prev.map(item => item.id === saved.id ? saved : item) : [saved, ...prev];
      });
      setMessage(`Voucher ${saved.code} berhasil disimpan.`);
      setIsModalOpen(false);
      resetForm();
    } catch (err) {
      setError(err.message || 'Gagal menyimpan voucher.');
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Yakin ingin menghapus ${selectedIds.size} voucher terpilih?`)) return;
    setDeleting(true);
    try {
      await backendRequest('/api/admin/vouchers/bulk-delete', adminToken, {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      setVouchers(prev => prev.filter(item => !selectedIds.has(item.id)));
      setSelectedIds(new Set());
      setMessage('Voucher terpilih berhasil dihapus.');
    } catch (err) {
      alert('Gagal menghapus voucher: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const deleteSingle = async (voucher) => {
    if (!window.confirm(`Hapus voucher ${voucher.code}?`)) return;
    try {
      await backendRequest(`/api/admin/vouchers/${voucher.id}`, adminToken, { method: 'DELETE' });
      setVouchers(prev => prev.filter(item => item.id !== voucher.id));
    } catch (err) {
      alert('Gagal menghapus voucher: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <AddVoucherModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        form={form}
        updateForm={updateForm}
        saveVoucher={saveVoucher}
        saving={saving}
        error={error}
        isEdit={!!editingId}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <h2 style={{ margin: 0, color: '#111827', fontSize: '1.5rem', fontWeight: 700 }}>Manajemen Voucher</h2>
        <p style={{ margin: 0, color: '#6b7280' }}>Kelola voucher tunai dan diskon untuk proyek Anda.</p>
      </div>

      {message && <div style={{ padding: '0.75rem 1rem', background: '#dcfce7', color: '#166534', borderRadius: '8px', fontWeight: 600 }}>{message}</div>}

      <div style={{ borderBottom: '1px solid #e5e7eb', display: 'flex', gap: '2rem' }}>
        <button
          onClick={() => { setActiveTab('tunai'); setSelectedIds(new Set()); }}
          style={{ padding: '0.75rem 0', background: 'none', border: 'none', borderBottom: activeTab === 'tunai' ? '2px solid #40a3eb' : '2px solid transparent', color: activeTab === 'tunai' ? '#40a3eb' : '#6b7280', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          Voucher Tunai
          <span style={{ padding: '2px 8px', borderRadius: '8px', background: activeTab === 'tunai' ? '#eff6ff' : '#f3f4f6', color: activeTab === 'tunai' ? '#1d4ed8' : '#6b7280', fontSize: '0.75rem' }}>{vouchers.filter(v => v.type === 'fixed').length}</span>
        </button>
        <button
          onClick={() => { setActiveTab('diskon'); setSelectedIds(new Set()); }}
          style={{ padding: '0.75rem 0', background: 'none', border: 'none', borderBottom: activeTab === 'diskon' ? '2px solid #40a3eb' : '2px solid transparent', color: activeTab === 'diskon' ? '#40a3eb' : '#6b7280', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          Voucher Diskon
          <span style={{ padding: '2px 8px', borderRadius: '8px', background: activeTab === 'diskon' ? '#eff6ff' : '#f3f4f6', color: activeTab === 'diskon' ? '#1d4ed8' : '#6b7280', fontSize: '0.75rem' }}>{vouchers.filter(v => v.type === 'percent').length}</span>
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ margin: 0, color: '#111827', fontSize: '1.25rem' }}>
          {activeTab === 'tunai' ? 'Voucher Tunai' : 'Voucher Diskon'}
        </h3>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
          {activeTab === 'tunai' ? 'Kode untuk pembayaran dengan potongan harga nominal tetap.' : 'Kode untuk pembayaran dengan potongan harga persentase.'}
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button onClick={openModalNew} style={{ padding: '0.65rem 1.25rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
            Buat Voucher {activeTab === 'tunai' ? 'Tunai' : 'Diskon'}
          </button>
          <button style={{ padding: '0.65rem 1.25rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
            Upload Tabel Voucher
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '8px', width: 'fit-content', marginTop: '0.5rem' }}>
          <button disabled style={{ padding: '0.4rem 0.75rem', background: 'none', border: 'none', color: '#9ca3af', fontWeight: 600, cursor: 'not-allowed', borderRadius: '8px' }}>
            Unduh Terpilih ({selectedIds.size})
          </button>
          <div style={{ width: '1px', background: '#e5e7eb', margin: '0.25rem 0' }}></div>
          <button onClick={deleteSelected} disabled={selectedIds.size === 0 || deleting} style={{ padding: '0.4rem 0.75rem', background: 'none', border: 'none', color: selectedIds.size > 0 ? '#dc2626' : '#9ca3af', fontWeight: 600, cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed', borderRadius: '8px' }}>
            {deleting ? 'Menghapus...' : `Hapus Terpilih (${selectedIds.size})`}
          </button>
          <div style={{ width: '1px', background: '#e5e7eb', margin: '0.25rem 0' }}></div>
          <button disabled style={{ padding: '0.4rem 0.75rem', background: 'none', border: 'none', color: '#9ca3af', fontWeight: 600, cursor: 'not-allowed', borderRadius: '8px' }}>
            Unduh Tabel
          </button>
        </div>
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '1rem', width: '40px' }}>
                  <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                </th>
                <th style={{ padding: '1rem', color: '#4b5563', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kode</th>
                <th style={{ padding: '1rem', color: '#4b5563', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nilai</th>
                <th style={{ padding: '1rem', color: '#4b5563', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ketersediaan</th>
                <th style={{ padding: '1rem', color: '#4b5563', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Masa Berlaku</th>
                <th style={{ padding: '1rem', color: '#4b5563', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                <th style={{ padding: '1rem', color: '#4b5563', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pembuat</th>
                <th style={{ padding: '1rem', color: '#4b5563', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Memuat data...</td></tr>
              ) : filteredVouchers.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>Tidak ada data voucher.</td></tr>
              ) : (
                filteredVouchers.map(v => (
                  <tr key={v.id} style={{ borderBottom: '1px solid #f3f4f6', background: selectedIds.has(v.id) ? '#f0fdf4' : 'transparent' }}>
                    <td style={{ padding: '1rem' }}>
                      <input type="checkbox" checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '1rem', fontWeight: 600, color: '#111827' }}>{v.code}</td>
                    <td style={{ padding: '1rem', color: '#4b5563', fontWeight: 500 }}>{v.type === 'percent' ? `${v.value}%` : formatCurrency(v.value)}</td>
                    <td style={{ padding: '1rem', color: '#4b5563' }}>{v.usageLimit ? `${v.usedCount || 0} / ${v.usageLimit}` : 'Tidak terbatas'}</td>
                    <td style={{ padding: '1rem', color: '#4b5563', fontSize: '0.85rem' }}>
                      {v.startsAt ? new Date(v.startsAt).toLocaleDateString() : '-'} s/d {v.endsAt ? new Date(v.endsAt).toLocaleDateString() : '-'}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <StatusBadge status={voucherStatus(v)} />
                    </td>
                    <td style={{ padding: '1rem', color: '#4b5563', fontSize: '0.85rem' }}>
                      {v.createdBy || '-'}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <button onClick={() => openModalEdit(v)} style={{ padding: '0.4rem 0.75rem', background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', color: '#374151', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', marginRight: '0.5rem' }}>Edit</button>
                      <button onClick={() => deleteSingle(v)} style={{ padding: '0.4rem 0.75rem', background: 'none', border: '1px solid #fee2e2', borderRadius: '8px', color: '#dc2626', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Hapus</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '1rem', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            Menampilkan 1 - {filteredVouchers.length} dari {filteredVouchers.length} data
          </div>
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            Tampilkan per halaman:
            <select style={{ marginLeft: '0.5rem', padding: '0.25rem 1rem 0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '8px' }}>
              <option>25</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}


function AdminUsersTab({ adminToken }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ email: '', password: '', role: 'staff' });
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ password: '', role: 'staff' });
  const [deletingUser, setDeletingUser] = useState(null);
  const [modalMode, setModalMode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadUsers = async () => {
    if (!adminToken) return;
    setLoading(true);
    setError('');
    try {
      const data = await backendRequest('/api/admin/users', adminToken);
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [adminToken]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const openCreateModal = () => {
    setForm({ email: '', password: '', role: 'staff' });
    setEditingUser(null);
    setDeletingUser(null);
    setModalMode('create');
    setError('');
    setSuccessMessage('');
  };

  const startEditUser = (user) => {
    setEditingUser(user);
    setEditForm({ password: '', role: user.role || 'staff' });
    setDeletingUser(null);
    setModalMode('edit');
    setError('');
    setSuccessMessage('');
  };

  const startDeleteUser = (user) => {
    setDeletingUser(user);
    setEditingUser(null);
    setModalMode('delete');
    setError('');
    setSuccessMessage('');
  };

  const closeUserModal = () => {
    if (saving || updating) return;
    setModalMode(null);
    setEditingUser(null);
    setDeletingUser(null);
    setEditForm({ password: '', role: 'staff' });
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccessMessage('');
    try {
      await backendRequest('/api/admin/users', adminToken, {
        method: 'POST',
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          role: form.role,
        }),
      });
      setForm({ email: '', password: '', role: 'staff' });
      setSuccessMessage('User admin berhasil ditambahkan.');
      setModalMode(null);
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUser = async (event) => {
    event.preventDefault();
    if (!editingUser) return;
    setUpdating(true);
    setError('');
    setSuccessMessage('');
    try {
      const body = { role: editForm.role };
      if (editForm.password.trim()) {
        body.password = editForm.password;
      }
      await backendRequest(`/api/admin/users/${editingUser.id}`, adminToken, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setSuccessMessage(`User ${editingUser.email} berhasil diupdate.`);
      setModalMode(null);
      setEditingUser(null);
      setEditForm({ password: '', role: 'staff' });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setError('');
    setSuccessMessage('');
    try {
      await backendRequest(`/api/admin/users/${deletingUser.id}`, adminToken, { method: 'DELETE' });
      setSuccessMessage(`User ${deletingUser.email} berhasil dihapus.`);
      setModalMode(null);
      setDeletingUser(null);
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', border: '1px solid #e9ecef', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, color: '#111' }}>Admin Users</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#6c757d', fontSize: '0.9rem' }}>Daftar akun admin dari backend.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={openCreateModal} style={{ padding: '0.6rem 1rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              + Tambah User
            </button>
            <button onClick={loadUsers} style={{ padding: '0.6rem 1rem', background: '#f8f9fa', color: '#111', border: '1px solid #e9ecef', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              Refresh
            </button>
          </div>
        </div>

        {error && !modalMode && <div style={{ marginBottom: '1rem', padding: '0.8rem 1rem', borderRadius: '8px', background: '#fee2e2', color: '#b91c1c', fontWeight: 'bold', fontSize: '0.9rem' }}>{error}</div>}
        {successMessage && <div style={{ marginBottom: '1rem', padding: '0.8rem 1rem', borderRadius: '8px', background: '#d1fae5', color: '#047857', fontWeight: 'bold', fontSize: '0.9rem' }}>{successMessage}</div>}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>Memuat user...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e9ecef', color: '#6c757d', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '1rem 0.75rem' }}>User ID</th>
                  <th style={{ padding: '1rem 0.75rem' }}>Email</th>
                  <th style={{ padding: '1rem 0.75rem' }}>Role</th>
                  <th style={{ padding: '1rem 0.75rem' }}>Created</th>
                  <th style={{ padding: '1rem 0.75rem' }}>Updated</th>
                  <th style={{ padding: '1rem 0.75rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} style={{ borderBottom: '1px solid #f1f3f5' }}>
                    <td style={{ padding: '1rem 0.75rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{user.id}</td>
                    <td style={{ padding: '1rem 0.75rem', color: '#111', fontWeight: 'bold' }}>{user.email}</td>
                    <td style={{ padding: '1rem 0.75rem' }}>
                      <span style={{ padding: '0.25rem 0.6rem', borderRadius: '8px', background: user.role === 'owner' ? '#dbeafe' : '#f3f4f6', color: user.role === 'owner' ? '#1d4ed8' : '#374151', fontWeight: 'bold', fontSize: '0.8rem' }}>
                        {user.role}
                      </span>
                    </td>
                    <td style={{ padding: '1rem 0.75rem', color: '#6c757d' }}>{formatDateTime(user.createdAt)}</td>
                    <td style={{ padding: '1rem 0.75rem', color: '#6c757d' }}>{formatDateTime(user.updatedAt)}</td>
                    <td style={{ padding: '1rem 0.75rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => startEditUser(user)}
                          style={{ padding: '0.45rem 0.75rem', borderRadius: '7px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => startDeleteUser(user)}
                          style={{ padding: '0.45rem 0.75rem', borderRadius: '7px', border: '1px solid #fecaca', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalMode && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'rgba(17, 24, 39, 0.55)' }}
        >
          <div style={{ width: 'min(520px, 100%)', background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 24px 70px rgba(0,0,0,0.25)', padding: '1.5rem' }}>
            {modalMode === 'create' && (
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <h2 style={{ margin: 0, color: '#111' }}>Tambah Admin User</h2>
                  <p style={{ margin: '0.35rem 0 0', color: '#6c757d', fontSize: '0.9rem' }}>Buat akun owner atau staff baru.</p>
                </div>

                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', color: '#495057', fontSize: '0.85rem' }}>Email</label>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="staff@urbanmenphoto.com"
                      required
                      style={{ width: '100%', padding: '0.85rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '0.95rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', color: '#495057', fontSize: '0.85rem' }}>Password</label>
                    <input
                      type="password"
                      name="password"
                      value={form.password}
                      onChange={handleChange}
                      placeholder="Minimal 10 karakter"
                      minLength={10}
                      required
                      style={{ width: '100%', padding: '0.85rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '0.95rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', color: '#495057', fontSize: '0.85rem' }}>Role</label>
                    <select
                      name="role"
                      value={form.role}
                      onChange={handleChange}
                      style={{ width: '100%', padding: '0.85rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '0.95rem', background: 'white' }}
                    >
                      <option value="staff">Staff</option>
                      <option value="owner">Owner</option>
                    </select>
                  </div>
                </div>

                {error && <div style={{ marginTop: '1rem', padding: '0.8rem 1rem', borderRadius: '8px', background: '#fee2e2', color: '#b91c1c', fontWeight: 'bold', fontSize: '0.9rem' }}>{error}</div>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="button" onClick={closeUserModal} disabled={saving} style={{ padding: '0.75rem 1rem', background: '#f8f9fa', color: '#111', border: '1px solid #e9ecef', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                    Batal
                  </button>
                  <button type="submit" disabled={saving} style={{ padding: '0.75rem 1rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                    {saving ? 'Menyimpan...' : 'Tambah User'}
                  </button>
                </div>
              </form>
            )}

            {modalMode === 'edit' && editingUser && (
              <form onSubmit={handleUpdateUser}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <h2 style={{ margin: 0, color: '#111' }}>Edit User</h2>
                  <p style={{ margin: '0.35rem 0 0', color: '#6c757d', fontSize: '0.9rem' }}>{editingUser.email}</p>
                </div>

                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', color: '#495057', fontSize: '0.85rem' }}>Password Baru</label>
                    <input
                      type="password"
                      value={editForm.password}
                      onChange={(event) => setEditForm(prev => ({ ...prev, password: event.target.value }))}
                      placeholder="Kosongkan jika tidak diganti"
                      minLength={editForm.password ? 10 : undefined}
                      style={{ width: '100%', padding: '0.85rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '0.95rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', color: '#495057', fontSize: '0.85rem' }}>Role</label>
                    <select
                      value={editForm.role}
                      onChange={(event) => setEditForm(prev => ({ ...prev, role: event.target.value }))}
                      style={{ width: '100%', padding: '0.85rem', borderRadius: '8px', border: '1px solid #ced4da', fontSize: '0.95rem', background: 'white' }}
                    >
                      <option value="staff">Staff</option>
                      <option value="owner">Owner</option>
                    </select>
                  </div>
                </div>

                {error && <div style={{ marginTop: '1rem', padding: '0.8rem 1rem', borderRadius: '8px', background: '#fee2e2', color: '#b91c1c', fontWeight: 'bold', fontSize: '0.9rem' }}>{error}</div>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="button" onClick={closeUserModal} disabled={updating} style={{ padding: '0.75rem 1rem', background: '#f8f9fa', color: '#111', border: '1px solid #e9ecef', borderRadius: '8px', cursor: updating ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                    Batal
                  </button>
                  <button type="submit" disabled={updating} style={{ padding: '0.75rem 1rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: updating ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                    {updating ? 'Menyimpan...' : 'Simpan Edit'}
                  </button>
                </div>
              </form>
            )}

            {modalMode === 'delete' && deletingUser && (
              <div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <h2 style={{ margin: 0, color: '#111' }}>Delete User</h2>
                  <p style={{ margin: '0.35rem 0 0', color: '#6c757d', fontSize: '0.9rem' }}>
                    Hapus admin user <strong>{deletingUser.email}</strong>? Tindakan ini tidak bisa dibatalkan.
                  </p>
                </div>

                {error && <div style={{ marginTop: '1rem', padding: '0.8rem 1rem', borderRadius: '8px', background: '#fee2e2', color: '#b91c1c', fontWeight: 'bold', fontSize: '0.9rem' }}>{error}</div>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="button" onClick={closeUserModal} style={{ padding: '0.75rem 1rem', background: '#f8f9fa', color: '#111', border: '1px solid #e9ecef', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Batal
                  </button>
                  <button type="button" onClick={handleDeleteUser} style={{ padding: '0.75rem 1rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Delete User
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!(typeof window !== 'undefined' && window.localStorage.getItem(ADMIN_TOKEN_KEY)));
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [adminToken, setAdminToken] = useState(() => (typeof window !== 'undefined' && window.localStorage.getItem(ADMIN_TOKEN_KEY)) || '');
  const [adminUser, setAdminUser] = useState(() => {
    if (typeof window === 'undefined') return null;
    const savedUser = window.localStorage.getItem(ADMIN_USER_KEY);
    if (!savedUser) return null;
    try { return JSON.parse(savedUser); } catch { return null; }
  });
  const [error, setError] = useState('');
  const [sessionNotice, setSessionNotice] = useState('');

  useEffect(() => {
    if (isAuthenticated) return;

    const handleCredentialResponse = async (response) => {
      try {
        const res = await backendRequest('/api/auth/google/verify', null, {
          method: 'POST',
          body: JSON.stringify({ credential: response.credential })
        });

        if (res?.token && res?.user) {
          localStorage.setItem("urbanmenphoto_admin_token", res.token);
          localStorage.setItem("urbanmenphoto_admin_user", JSON.stringify(res.user));
          setAdminToken(res.token);
          setAdminUser(res.user);
          setIsAuthenticated(true);
        }
      } catch (err) {
        setError('Login Google gagal: ' + err.message);
      }
    };

    const initGoogle = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '657226319551-2269ospiircnegcjj570kkr75q580m0c.apps.googleusercontent.com',
        callback: handleCredentialResponse
      });
      const btnContainer = document.getElementById('googleSignInBtn');
      if (btnContainer) {
        window.google.accounts.id.renderButton(
          btnContainer,
          { theme: 'outline', size: 'large', width: 300 }
        );
      }
    };

    if (window.google?.accounts?.id) {
      initGoogle();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initGoogle;
      document.head.appendChild(script);
    }
  }, [isAuthenticated]);

  const [showNotificationMenu, setShowNotificationMenu] = useState(false);
  const [activeTab, setActiveTab] = useState(getAdminTabFromPath);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const adminMenuRef = useRef(null);

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);
  const [sessionDetailError, setSessionDetailError] = useState('');
  const [galleryPage, setGalleryPage] = useState(1);
  const [galleryPageSize, setGalleryPageSize] = useState(10);
  const visibleMenuItems = adminUser?.role === 'staff'
    ? MENU_ITEMS.filter(item => STAFF_ALLOWED_MENUS.has(item.id))
    : MENU_ITEMS;
  const sidebarGroups = [
    { label: 'OPERASI', ids: ['overview', 'projects', 'transaction', 'gallery', 'booth_health'] },
    { label: 'APLIKASI', ids: ['filters', 'frame_photo', 'frame_gif', 'voucher'] },
    { label: 'AKUN', ids: ['profile', 'wallet', 'payment_key', 'admin_users'] },
  ].map((group) => ({
    ...group,
    items: group.ids.map((id) => visibleMenuItems.find((item) => item.id === id)).filter(Boolean),
  })).filter((group) => group.items.length > 0);
  const sidebarLabels = {
    overview: 'Analitik',
    booth_health: 'Perangkat',
    filters: 'Filter',
    frame_photo: 'Bingkai',
    frame_gif: 'Bingkai GIF',
    profile: 'Profil',
    admin_users: 'Tim',
    payments: 'Pembayaran',
    payment_key: 'API Payment',
  };

  const clearAdminSession = (message = '') => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
    localStorage.removeItem(ADMIN_EXPIRES_KEY);
    setIsAuthenticated(false);
    setAdminToken('');
    setAdminUser(null);
    setSessions([]);
    setSessionNotice(message);
  };

  useEffect(() => {
    if (!isAuthenticated || visibleMenuItems.some(item => item.id === activeTab)) return;
    const fallbackTab = visibleMenuItems[0]?.id || 'overview';
    setActiveTab(fallbackTab);
    window.history.replaceState({}, '', getAdminPath(fallbackTab));
  }, [isAuthenticated, adminUser?.role, activeTab]);

  useEffect(() => {
    const handlePopState = () => setActiveTab(getAdminTabFromPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToTab = (tab) => {
    setActiveTab(tab);
    window.history.pushState({}, '', getAdminPath(tab));
  };

  useEffect(() => {
    const handleUnauthorized = (event) => {
      const path = event?.detail?.path || '';
      if (localStorage.getItem(ADMIN_TOKEN_KEY) && String(path).includes('/api/admin/')) {
        clearAdminSession('Sesi admin habis. Silakan login ulang.');
      }
    };
    window.addEventListener('backend:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('backend:unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const expiresAt = localStorage.getItem(ADMIN_EXPIRES_KEY);
    if (!expiresAt) return undefined;

    const expiresMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiresMs)) return undefined;
    const remainingMs = expiresMs - Date.now();
    if (remainingMs <= 0) {
      clearAdminSession('Sesi admin habis. Silakan login ulang.');
      return undefined;
    }

    const timer = window.setTimeout(() => {
      clearAdminSession('Sesi admin habis. Silakan login ulang.');
    }, remainingMs);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated]);

  useEffect(() => {
    const savedToken = localStorage.getItem(ADMIN_TOKEN_KEY);
    const savedUser = localStorage.getItem(ADMIN_USER_KEY);
    const savedExpiresAt = localStorage.getItem(ADMIN_EXPIRES_KEY);
    if (!savedToken) return;
    if (savedExpiresAt && new Date(savedExpiresAt).getTime() <= Date.now()) {
      clearAdminSession('Sesi admin habis. Silakan login ulang.');
      return;
    }

    setAdminToken(savedToken);
    setIsAuthenticated(true);
    if (savedUser) {
      try {
        setAdminUser(JSON.parse(savedUser));
      } catch {
        setAdminUser({ email: 'admin', role: 'owner' });
      }
    } else {
      setAdminUser({ email: 'admin', role: 'owner' });
    }

    backendRequest('/api/admin/auth/me', savedToken)
      .then((user) => {
        setIsAuthenticated(true);
        setAdminUser(user);
        localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
        fetchSessions(savedToken);
      })
      .catch((err) => {
        if (err.status === 401) {
          clearAdminSession('Sesi admin tidak valid. Silakan login ulang.');
          return;
        }
        setSessionNotice('Admin tetap login dari sesi tersimpan. Backend belum bisa divalidasi, coba refresh data jika koneksi sudah normal.');
      });
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      setError('Email dan Password harus diisi.');
      return;
    }
    try {
      const result = await backendRequest('/api/admin/auth/login', null, {
        method: 'POST',
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        })
      });

      if (result.requires2FA) {
        setRequires2FA(true);
        setError('');
        return;
      }

      const user = { email: loginEmail, role: result.role };

      localStorage.setItem('urbanmenphoto_admin_token', result.token);
      localStorage.setItem('urbanmenphoto_admin_user', JSON.stringify(user));
      setAdminToken(result.token);
      setAdminUser(user);
      setIsAuthenticated(true);
      setError('');
      setLoginPassword('');
    } catch (err) {
      setError(err.message || 'Login gagal.');
      setLoginPassword('');
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (!otpCode) {
      setError('Kode OTP harus diisi.');
      return;
    }
    try {
      const result = await backendRequest('/api/admin/auth/login/verify-otp', null, {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, otp: otpCode })
      });

      const user = { email: loginEmail, role: result.role };
      localStorage.setItem('urbanmenphoto_admin_token', result.token);
      localStorage.setItem('urbanmenphoto_admin_user', JSON.stringify(user));
      setAdminToken(result.token);
      setAdminUser(user);
      setIsAuthenticated(true);
      setError('');
      setLoginPassword('');
      setOtpCode('');
      setRequires2FA(false);
    } catch (err) {
      setError(err.message || 'OTP tidak valid atau sudah kadaluarsa.');
      setOtpCode('');
    }
  };

  const handleLogout = async () => {
    const token = adminToken || localStorage.getItem(ADMIN_TOKEN_KEY);
    if (token) {
      try {
        await backendRequest('/api/admin/auth/logout', token, { method: 'POST' });
      } catch (err) {
        console.warn('Logout request failed:', err);
      }
    }
    clearAdminSession('');
    setLoginEmail('');
    setLoginPassword('');
  };

  const fetchSessions = async (token = adminToken) => {
    if (!token) return;
    setLoading(true);
    try {
      const [sessionData, paymentData] = await Promise.all([
        fetchAllAdminRows('/api/admin/sessions', token),
        fetchAllAdminRows('/api/admin/payments', token).catch(() => [])
      ]);

      let parsedSessions = Array.isArray(sessionData) ? sessionData : [];

      if (Array.isArray(paymentData) && paymentData.length > 0) {
        const paymentMap = {};
        paymentData.forEach(p => {
          if (!paymentMap[p.sessionId] || p.status === 'paid' || p.status === 'settlement' || p.status === 'success') {
            paymentMap[p.sessionId] = p;
          }
        });
        parsedSessions = parsedSessions.map(session => ({
          ...session,
          payment: paymentMap[session.id] || session.payment
        }));
      }

      setSessions(parsedSessions);
    } catch (err) {
      console.error('Error fetching sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (sessionId) => {
    if (!adminToken || !window.confirm(`Hapus permanen galeri dan file untuk sesi ${sessionId}?`)) {
      return;
    }
    try {
      await backendRequest(`/api/admin/sessions/${sessionId}`, adminToken, { method: 'DELETE' });
      setSessions(prev => prev.filter(session => session.id !== sessionId));
    } catch (err) {
      alert('Gagal menghapus sesi: ' + err.message);
    }
  };

  const openSessionDetail = async (sessionId) => {
    if (!adminToken) return;
    setSessionDetail({ session: { id: sessionId } });
    setSessionDetailLoading(true);
    setSessionDetailError('');
    try {
      const detail = await backendRequest(`/api/admin/sessions/${sessionId}`, adminToken);
      setSessionDetail(detail);
    } catch (err) {
      setSessionDetailError(err.message);
    } finally {
      setSessionDetailLoading(false);
    }
  };

  const galleryTotalPages = Math.max(1, Math.ceil(sessions.length / galleryPageSize));
  const galleryStartIndex = (galleryPage - 1) * galleryPageSize;
  const paginatedGallerySessions = sessions.slice(galleryStartIndex, galleryStartIndex + galleryPageSize);

  useEffect(() => {
    if (galleryPage > galleryTotalPages) {
      setGalleryPage(galleryTotalPages);
    }
  }, [galleryPage, galleryTotalPages]);

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: '#f8f9fa' }}>
        <form onSubmit={requires2FA ? handleVerifyOTP : handleLogin} style={{ background: 'white', padding: '3rem', borderRadius: '16px', border: '1px solid #e9ecef', textAlign: 'center', maxWidth: '400px', width: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <img src={logoLogin} alt="Login Logo" style={{ height: '6rem', width: 'auto', objectFit: 'contain' }} />
          </div>
          <p style={{ color: '#6c757d', marginBottom: '2rem', fontSize: '0.9rem' }}>
            {requires2FA ? 'Cek email Anda untuk kode verifikasi 6 digit.' : 'Login dengan akun Jiwalu Photobooth.'}
          </p>

          {sessionNotice && <div style={{ marginBottom: '1rem', padding: '0.75rem 0.9rem', borderRadius: '8px', background: '#fff7ed', color: '#c2410c', fontWeight: '800', fontSize: '0.85rem', textAlign: 'left' }}>{sessionNotice}</div>}

          {!requires2FA ? (
            <>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="example@gmail.com"
                style={{
                  width: '100%', padding: '0.9rem 1rem', fontSize: '1rem',
                  borderRadius: '8px', border: '2px solid #e9ecef', marginBottom: '1rem'
                }}
                autoFocus
              />
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Password"
                style={{
                  width: '100%', padding: '0.9rem 1rem', fontSize: '1rem',
                  borderRadius: '8px', border: '2px solid #e9ecef', marginBottom: '1rem'
                }}
              />
            </>
          ) : (
            <>
              <input
                type="text"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="Kode 6 Digit"
                maxLength={6}
                style={{
                  width: '100%', padding: '0.9rem 1rem', fontSize: '1.25rem', letterSpacing: '0.2rem', textAlign: 'center',
                  borderRadius: '8px', border: '2px solid #e9ecef', marginBottom: '1rem'
                }}
                autoFocus
              />
            </>
          )}

          {error && <div style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

          <button type="submit" style={{ width: '100%', padding: '1rem', background: '#40a3eb', color: 'white', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer', border: 'none' }}>
            {requires2FA ? 'Verifikasi OTP' : 'Masuk'}
          </button>

          {!requires2FA && (
            <>
              <div style={{ margin: '1.5rem 0', display: 'flex', alignItems: 'center', color: '#adb5bd', fontSize: '0.9rem' }}>
                <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #e9ecef' }} />
                <span style={{ padding: '0 1rem' }}>Atau masuk dengan</span>
                <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #e9ecef' }} />
              </div>

              <div id="googleSignInBtn" style={{ display: 'flex', justifyContent: 'center' }}></div>
            </>
          )}

          {requires2FA && (
            <button type="button" onClick={() => { setRequires2FA(false); setOtpCode(''); }} style={{ marginTop: '1rem', background: 'transparent', border: 'none', color: '#6b7280', fontSize: '0.9rem', cursor: 'pointer' }}>
              Batal
            </button>
          )}
        </form>
      </div>
    );
  }

  // Render Content based on activeTab
  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <AdminOverview sessions={sessions} />;

      case 'wallet':
        return <WalletTab />;

      case 'profile':
        return <ProfileTab adminUser={adminUser} />;

      case 'frame_gif':
        return <FrameGifManager adminToken={adminToken} />;

      case 'payment_key':
        return <PaymentKeyTab adminToken={adminToken} />;

      case 'projects':
        return <ProjectManager
          adminToken={adminToken}
          onEditProject={(id) => { setSelectedProjectId(id); setActiveTab('kiosk'); }}
          onStartKiosk={(id) => {
            setSelectedProjectId(id);
            setActiveTab('kiosk');
          }}
        />;

      case 'kiosk':
        return <KioskSettingsTab projectId={selectedProjectId} adminToken={adminToken} onBack={() => { setSelectedProjectId(null); setActiveTab('projects'); }} />;

      case 'booth_health':
        return <BoothHealthTab adminToken={adminToken} />;

      case 'filters':
        return <FilterManagementTab adminToken={adminToken} />;

      case 'recovery':
        return <RecoveryTab />;

      case 'storage':
        return <StorageManagementTab adminToken={adminToken} />;

      case 'reports':
        return <ReportExportTab adminToken={adminToken} adminUser={adminUser} />;

      case 'statistic':
        return <StatisticTab sessions={sessions} />;

      case 'transaction':
        return <TransactionTab adminToken={adminToken} />;

      case 'payments':
        return (
          <BackendListTab
            title="Payments"
            description="Status payment utama dari backend."
            endpoint="/api/admin/payments"
            adminToken={adminToken}
            columns={[
              { key: 'id', label: 'Payment ID', render: row => <span style={{ fontFamily: 'monospace' }}>{String(row.id).slice(0, 18)}...</span> },
              { key: 'sessionId', label: 'Session ID', render: row => <span style={{ fontFamily: 'monospace' }}>{String(row.sessionId).slice(0, 18)}...</span> },
              { key: 'provider', label: 'Provider' },
              { key: 'originalAmount', label: 'Original', render: row => formatCurrency(row.originalAmount || row.amount) },
              { key: 'discountAmount', label: 'Discount', render: row => <span style={{ color: '#059669', fontWeight: 600 }}>{row.discountAmount ? `- ${formatCurrency(row.discountAmount)}` : '-'}</span> },
              { key: 'amount', label: 'Final', render: row => <span style={{ fontWeight: 700 }}>{formatCurrency(row.amount)}</span> },
              { key: 'status', label: 'Status', render: row => <StatusBadge status={row.status} /> },
              { key: 'createdAt', label: 'Created', render: row => formatDateTime(row.createdAt) },
            ]}
          />
        );

      case 'messages':
        return (
          <BackendListTab
            title="Delivery Messages"
            description="Log kirim link email/WhatsApp."
            endpoint="/api/admin/messages"
            adminToken={adminToken}
            columns={[
              { key: 'id', label: 'Message ID', render: row => <span style={{ fontFamily: 'monospace' }}>{String(row.id).slice(0, 18)}...</span> },
              { key: 'sessionId', label: 'Session ID', render: row => <span style={{ fontFamily: 'monospace' }}>{String(row.sessionId).slice(0, 18)}...</span> },
              { key: 'channel', label: 'Channel' },
              { key: 'recipient', label: 'Recipient' },
              { key: 'status', label: 'Status', render: row => <StatusBadge status={row.status} /> },
              { key: 'createdAt', label: 'Created', render: row => formatDateTime(row.createdAt) },
            ]}
          />
        );

      case 'frame_photo':
        return <FrameManager adminToken={adminToken} />;

      case 'voucher':
        return <VoucherSettingsTab adminToken={adminToken} />;

      case 'admin_users':
        return <AdminUsersTab adminToken={adminToken} />;

      case 'audit_logs':
        return <AuditActivityTab adminToken={adminToken} />;

      case 'gallery':
        const exportGallerySessions = () => {
          if (!sessions.length) {
            alert('Belum ada session/gallery untuk diekspor.');
            return;
          }
          downloadSpreadsheet(`urbanmenphoto_gallery_sessions_${reportDateStamp()}.xls`, sessions, SESSION_EXPORT_COLUMNS);
        };
        return (
          <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', border: '1px solid #e9ecef', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0, color: '#111' }}>Customer Gallery Logs</h2>
                <p style={{ margin: '0.25rem 0 0', color: '#6c757d', fontSize: '0.9rem' }}>{sessions.length} session termuat di halaman admin.</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button onClick={() => fetchSessions()} style={{ padding: '0.5rem 1rem', background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Refresh</button>
                <button onClick={exportGallerySessions} style={{ padding: '0.5rem 1rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Export XLS</button>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>Memuat data...</div>
            ) : sessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>Belum ada sesi foto yang tersimpan.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e9ecef', color: '#6c757d', fontSize: '0.9rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '1rem 0' }}>Session ID</th>
                      <th style={{ padding: '1rem 0' }}>Time</th>
                      <th style={{ padding: '1rem 0' }}>Preview</th>
                      <th style={{ padding: '1rem 0', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedGallerySessions.map(s => {
                      const imageList = Array.from(new Set([
                        s.animatedImage?.url,
                        s.finalImage?.url,
                        s.printImage?.url,
                        ...(s.images || []),
                      ].filter(Boolean)));
                      const previews = imageList.slice(0, 3);

                      return (
                        <tr key={s.id} style={{ borderBottom: '1px solid #f1f3f5' }}>
                          <td style={{ padding: '1rem 0', fontFamily: 'monospace', color: '#111', fontSize: '0.9rem' }}>{s.id.substring(0, 15)}...</td>
                          <td style={{ padding: '1rem 0', color: '#495057', fontSize: '0.95rem' }}>{formatDateTime(s.createdAt || s.created_at)}</td>
                          <td style={{ padding: '1rem 0' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              {previews.map((imgUrl, idx) => (
                                <div key={idx} style={{ width: '40px', height: '40px', borderRadius: '6px', overflow: 'hidden', background: '#f8f9fa', border: '1px solid #e9ecef' }}>
                                  <img src={imgUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                              ))}
                              {imageList.length > 3 && (
                                <span style={{ fontSize: '0.8rem', color: '#6c757d', fontWeight: 'bold' }}>+{imageList.length - 3}</span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '1rem 0', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <a
                                href={`/gallery/${s.id}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ display: 'inline-flex', padding: '0.4rem 0.8rem', background: '#e9ecef', color: '#111', textDecoration: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 'bold' }}
                              >
                                View
                              </a>
                              <button
                                onClick={() => openSessionDetail(s.id)}
                                style={{ display: 'inline-flex', padding: '0.4rem 0.8rem', background: '#fff7ed', color: '#2c8ed6', border: '1px solid #bae0f9', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer' }}
                              >
                                Detail
                              </button>
                              <button
                                onClick={() => deleteSession(s.id)}
                                style={{ display: 'inline-flex', padding: '0.4rem 0.8rem', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer' }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <AdminPagination
                  page={galleryPage}
                  totalPages={galleryTotalPages}
                  pageSize={galleryPageSize}
                  total={sessions.length}
                  onPageChange={setGalleryPage}
                  onPageSizeChange={(size) => {
                    setGalleryPageSize(size);
                    setGalleryPage(1);
                  }}
                />
              </div>
            )}
          </div>
        );

      default:
        // Placeholder for unimplemented menus
        return (
          <div style={{ background: 'white', padding: '4rem 2rem', borderRadius: '8px', border: '1px dashed #ced4da', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', color: '#adb5bd' }}>🚧</div>
            <h2 style={{ color: '#495057', marginBottom: '0.5rem' }}>{MENU_ITEMS.find(m => m.id === activeTab)?.label} Settings</h2>
            <p style={{ color: '#868e96' }}>Modul ini sedang dalam pengembangan dan akan segera hadir.</p>
          </div>
        );
    }
  };

  return (
    <div className="admin-layout flex min-h-screen bg-[#f1f1f1] font-sans text-[#25232a]">
      {/* Sidebar Navigation */}
      <aside className="admin-sidebar flex w-48 shrink-0 flex-col border-r border-[#e7e7e9] bg-[rgba(250,250,250,0.86)] shadow-[2px_0_8px_rgba(25,20,35,0.05)]">
        <div className="px-4 pb-2 pt-5">
          <img src={logoJiwalu} alt="Jiwalu Logo" className="w-36 h-auto max-w-full object-contain" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 pt-2 text-[10px] font-medium text-[#9b9ba5]">
          <button type="button" className="inline-flex items-center gap-1 rounded px-0.5 py-1 transition hover:text-[#40a3eb]" aria-label="Pilih bahasa">ID <span className="text-xs">⌄</span></button>
          <button type="button" className="grid size-6 place-items-center rounded text-base leading-none transition hover:bg-[#fff0e7] hover:text-[#40a3eb]" aria-label="Sembunyikan sidebar">⇥</button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-7">
          {sidebarGroups.map((group) => (
            <section className="mb-5" key={group.label}>
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-normal text-[#686975]">{group.label}</h2>
              <div className="space-y-1.5">
                {group.items.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button key={item.id} onClick={() => navigateToTab(item.id)} className={`flex min-h-8 w-full items-center gap-3 rounded px-0 py-1 text-left text-[15px] transition-colors ${isActive ? 'font-medium text-[#40a3eb]' : 'font-normal text-[#3f4655] hover:text-[#40a3eb]'}`}>
                      <span className="admin-sidebar-icon grid size-[16px] shrink-0 place-items-center">{item.icon}</span>
                      <span className="leading-5">{sidebarLabels[item.id] || item.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="border-t border-[#ededee] px-3 py-4">
          {adminUser && (
            <div className="mb-3 flex items-center gap-2.5 px-1">
              <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#fff0e7] text-xs font-bold text-[#40a3eb]">{adminUser.email.slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-xs font-medium text-[#363744]">{adminUser.email}</div>
                <div className="mt-0.5 text-[10px] text-[#81818a]">{adminUser.role}</div>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex min-h-8 w-full items-center gap-2 rounded px-1 py-1 text-left text-sm text-[#3f4655] transition-colors hover:text-[#40a3eb]"
          >
            <span className="text-base">↪</span> Keluar
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-7">
        {renderContent()}
      </main>
      {sessionDetail && (
        <AdminSessionDetailModal
          detail={sessionDetail}
          loading={sessionDetailLoading}
          error={sessionDetailError}
          onClose={() => setSessionDetail(null)}
        />
      )}
    </div>
  );
}
