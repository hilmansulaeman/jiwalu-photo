import React, { useState, useEffect, useRef } from 'react';
import { backendRequest, getBackendApiUrl } from '../utils/backendApi.js';
import { detectTransparentHoles } from '../utils/transparencyDetector.js';
import {
  Search, Grid, List, ChevronDown, X, File, Plus, Wand2,
  Trash2, Download, UploadCloud, ArrowLeft
} from './ui/icons.jsx';

// ==============================================
// FRAME OPTIONS MODAL
// ==============================================
function FrameOptionsModal({ frame, onClose, onToggleActive, onDelete }) {
  if (!frame) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-2">{frame.name}</h3>
          <p className="text-sm text-gray-500 mb-6">Status: {frame.active ? 'Aktif' : 'Tidak Aktif'}</p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => onToggleActive(frame)}
              className="w-full bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold py-3 px-4 rounded-xl transition-colors"
            >
              {frame.active ? 'Nonaktifkan Frame' : 'Aktifkan Frame'}
            </button>
            <button
              onClick={() => {
                if (confirm('Yakin ingin menghapus bingkai ini?')) {
                  onDelete(frame.id);
                }
              }}
              className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              Hapus Bingkai
            </button>
            <button
              onClick={onClose}
              className="w-full bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold py-3 px-4 rounded-xl transition-colors mt-2"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FrameManager({ adminToken }) {

  // Data
  const [frames, setFrames] = useState([]);
  const [filteredFrames, setFilteredFrames] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);

  // Load frames
  const loadFrames = async () => {
    try {
      const backendFrames = await backendRequest('/api/admin/frames', adminToken);
      const framesArray = Array.isArray(backendFrames) ? backendFrames : [];
      const mappedFrames = framesArray.map(f => {
        let slots = [];
        try {
          if (f.slotJson) slots = JSON.parse(f.slotJson);
        } catch (e) { }
        return {
          ...f,
          url: f.imageUrl,
          photoCount: f.layoutCount,
          slots: slots,
          disabled: !f.active,
        };
      });
      setFrames(mappedFrames);
      setFilteredFrames(mappedFrames);
    } catch (err) {
      console.error('Failed to load frames', err);
    }
  };

  useEffect(() => {
    loadFrames();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFrames(frames);
    } else {
      setFilteredFrames(frames.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())));
    }
  }, [searchQuery, frames]);

  const [selectedFrame, setSelectedFrame] = useState(null);

  const generateSvgForSlots = (slots) => {
    const width = 1080;
    const height = 1920;
    let rects = '';

    slots.forEach((s, i) => {
      rects += `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" fill="#e2e8f0" rx="${s.borderRadius || 20}" />
       <text x="${s.x + s.width / 2}" y="${s.y + s.height / 2 + 20}" font-family="sans-serif" font-size="64" font-weight="bold" fill="#94a3b8" text-anchor="middle">${i + 1}</text>`;
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
      <rect width="100%" height="100%" fill="#f8fafc" />
      ${rects}
    </svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  };

  const handleCreateBlankFrame = async (name, slots = []) => {
    try {
      const payload = {
        name: name || 'Untitled Frame',
        imageUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
        templateType: 'strip',
        layoutCount: slots.length,
        paperSize: 'strip-2x6',
        orientation: 'portrait',
        printCopies: 2,
        active: true,
        slotJson: JSON.stringify(slots)
      };

      await backendRequest('/api/admin/frames', adminToken, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      loadFrames();
      setShowCreateModal(false);
    } catch (e) {
      alert('Gagal membuat bingkai kosong: ' + e.message);
    }
  };

  const handleToggleActive = async (frame) => {
    try {
      const payload = { ...frame, active: !frame.active, id: frame.id.replace(/^custom_/, '') };
      // Omit url, disabled etc that we added for UI
      delete payload.url;
      delete payload.photoCount;
      delete payload.disabled;

      const rawId = frame.id.replace(/^custom_/, '');
      await backendRequest(`/api/admin/frames/${rawId}`, adminToken, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      loadFrames();
      setSelectedFrame(null);
    } catch (e) {
      alert('Gagal merubah status: ' + e.message);
    }
  };

  const handleDeleteFrame = async (id) => {
    try {
      const rawId = id.replace(/^custom_/, '');
      await backendRequest(`/api/admin/frames/${rawId}`, adminToken, {
        method: 'DELETE'
      });
      loadFrames();
      setSelectedFrame(null);
    } catch (e) {
      alert('Gagal menghapus: ' + e.message);
    }
  };

  const handleFrameClick = (frame) => {
    setSelectedFrame(frame);
  };

  return (
    <div className="flex flex-col h-full bg-[#f1f2f4] overflow-hidden p-6 rounded-xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 m-0">Manajemen Bingkai</h2>
          <p className="text-gray-500 text-sm mt-1">Buat dan kelola bingkai photobooth Anda</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-[#3b82f6] hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus size={18} /> Buat Baru
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex justify-between items-center bg-white p-2 rounded-lg border border-gray-200 mb-6 shadow-sm">
        <div className="flex-1 max-w-2xl relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-transparent border-none focus:ring-0 text-sm text-gray-700 outline-none"
          />
        </div>
        <div className="flex items-center gap-4 border-l border-gray-200 pl-4 ml-4">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-md">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-1 rounded shadow-sm transition-colors ${viewMode === 'grid' ? 'bg-[#3b82f6] text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Grid size={16} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1 rounded shadow-sm transition-colors ${viewMode === 'list' ? 'bg-[#3b82f6] text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <List size={16} />
            </button>
          </div>
          <button className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900">
            <ChevronDown size={16} /> Newest
          </button>
        </div>
      </div>

      {/* Gallery */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {filteredFrames.map(frame => (
              <div
                key={frame.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group flex flex-col cursor-pointer"
                onClick={() => handleFrameClick(frame)}
              >
                <div
                  className="p-4 bg-gray-50 aspect-[3/4] flex items-center justify-center relative overflow-hidden"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%, #e5e7eb), repeating-linear-gradient(45deg, #e5e7eb 25%, #f9fafb 25%, #f9fafb 75%, #e5e7eb 75%, #e5e7eb)',
                    backgroundPosition: '0 0, 10px 10px',
                    backgroundSize: '20px 20px'
                  }}
                >
                  {frame.url && !frame.url.startsWith('data:image/svg+xml') && !frame.url.startsWith('data:image/gif') ? (
                    <div className="relative w-full h-full flex items-center justify-center group-hover:scale-105 transition-transform">
                      <img src={frame.url} alt={frame.name} className="absolute inset-0 m-auto max-w-full max-h-full object-contain drop-shadow-md z-10" />
                      <div className="absolute inset-0 m-auto z-20 pointer-events-none" style={{ aspectRatio: '1080/1920', maxHeight: '100%', maxWidth: '100%', height: '100%' }}>
                        {(() => {
                          try {
                            const slots = JSON.parse(frame.slotJson || '[]');
                            return slots.map((s, i) => (
                              <div 
                                key={i}
                                className="absolute flex items-center justify-center text-gray-500 font-black text-4xl drop-shadow-lg"
                                style={{
                                  left: `${(s.x / 1080) * 100}%`,
                                  top: `${(s.y / 1920) * 100}%`,
                                  width: `${(s.width / 1080) * 100}%`,
                                  height: `${(s.height / 1920) * 100}%`,
                                }}
                              >
                                {i + 1}
                              </div>
                            ));
                          } catch(e) { return null; }
                        })()}
                      </div>
                    </div>
                  ) : (
                    <img src={generateSvgForSlots(JSON.parse(frame.slotJson || '[]'))} alt={frame.name} className="max-w-full max-h-full object-contain drop-shadow-md group-hover:scale-105 transition-transform" />
                  )}
                  {!frame.active && (
                    <div className="absolute top-2 right-2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded font-bold">INACTIVE</div>
                  )}
                </div>
                <div className="p-3 border-t border-gray-100 flex justify-between items-center">
                  <div className="font-semibold text-xs text-gray-800 truncate">{frame.name || 'Untitled Frame'}</div>
                </div>
              </div>
            ))}
            {filteredFrames.length === 0 && (
              <div className="col-span-full py-20 text-center text-gray-400">
                <div className="inline-block p-4 bg-white rounded-full mb-4 shadow-sm"><Search size={32} /></div>
                <p>Tidak ada frame yang ditemukan.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredFrames.map(frame => (
              <div 
                key={frame.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group flex items-center cursor-pointer p-4"
                onClick={() => handleFrameClick(frame)}
              >
                <div 
                  className="w-24 h-32 bg-gray-50 flex-shrink-0 flex items-center justify-center relative overflow-hidden rounded-lg border border-gray-200"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%, #e5e7eb), repeating-linear-gradient(45deg, #e5e7eb 25%, #f9fafb 25%, #f9fafb 75%, #e5e7eb 75%, #e5e7eb)',
                    backgroundPosition: '0 0, 10px 10px',
                    backgroundSize: '20px 20px'
                  }}
                >
                  {frame.url && !frame.url.startsWith('data:image/svg+xml') && !frame.url.startsWith('data:image/gif') ? (
                    <div className="relative w-full h-full flex items-center justify-center group-hover:scale-105 transition-transform">
                      <img src={frame.url} alt={frame.name} className="absolute inset-0 m-auto max-w-full max-h-full object-contain drop-shadow-md z-10" />
                      <div className="absolute inset-0 m-auto z-20 pointer-events-none" style={{ aspectRatio: '1080/1920', maxHeight: '100%', maxWidth: '100%', height: '100%' }}>
                        {(() => {
                          try {
                            const slots = JSON.parse(frame.slotJson || '[]');
                            return slots.map((s, i) => (
                              <div 
                                key={i}
                                className="absolute flex items-center justify-center text-gray-500 font-black text-xl drop-shadow-lg"
                                style={{
                                  left: `${(s.x / 1080) * 100}%`,
                                  top: `${(s.y / 1920) * 100}%`,
                                  width: `${(s.width / 1080) * 100}%`,
                                  height: `${(s.height / 1920) * 100}%`,
                                }}
                              >
                                {i + 1}
                              </div>
                            ));
                          } catch(e) { return null; }
                        })()}
                      </div>
                    </div>
                  ) : (
                    <img src={generateSvgForSlots(JSON.parse(frame.slotJson || '[]'))} alt={frame.name} className="max-w-full max-h-full object-contain drop-shadow-md group-hover:scale-105 transition-transform" />
                  )}
                </div>
                <div className="ml-6 flex-1">
                  <h4 className="font-bold text-gray-900 text-lg mb-1">{frame.name || 'Untitled Frame'}</h4>
                  <p className="text-sm text-gray-500">
                    {(() => {
                      try {
                        return JSON.parse(frame.slotJson || '[]').length;
                      } catch {
                        return 0;
                      }
                    })()} Kotak Foto
                  </p>
                </div>
                <div className="mr-4">
                  <span className={`px-3 py-1 text-xs font-bold rounded-full ${frame.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                    {frame.active ? 'Aktif' : 'Tidak Aktif'}
                  </span>
                </div>
              </div>
            ))}
            {filteredFrames.length === 0 && (
              <div className="py-20 text-center text-gray-400 w-full">
                <div className="inline-block p-4 bg-white rounded-full mb-4 shadow-sm"><Search size={32} /></div>
                <p>Tidak ada frame yang ditemukan.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedFrame && (
        <FrameOptionsModal
          frame={selectedFrame}
          onClose={() => setSelectedFrame(null)}
          onToggleActive={handleToggleActive}
          onDelete={handleDeleteFrame}
        />
      )}

      {showCreateModal && (
        <CreateFrameModal
          onClose={() => setShowCreateModal(false)}
          onOpenAsset={() => {
            setShowCreateModal(false);
            setShowAssetModal(true);
          }}
          onSelectBlank={handleCreateBlankFrame}
        />
      )}

      {showAssetModal && (
        <AddAssetModal
          adminToken={adminToken}
          onClose={() => setShowAssetModal(false)}
          onAssetSelected={async ({ assetUrl, detectedSlots }) => {
            setShowAssetModal(false);
            try {
              if (!detectedSlots || detectedSlots.length === 0) {
                alert("Peringatan: Sistem tidak dapat mendeteksi lubang transparan atau warna hijau stabilo pada gambar ini. Bingkai akan diunggah dengan 1 kotak default. Untuk hasil otomatis, pastikan gambar dilubangi (PNG) atau gunakan kotak Hijau Stabilo!");
              }
              const payloadSlots = detectedSlots && detectedSlots.length > 0 ? detectedSlots : [
                { x: 100, y: 100, width: 880, height: 1720, borderRadius: 20 }
              ];
              const payload = {
                name: 'Bingkai Upload',
                imageUrl: assetUrl,
                templateType: 'print_sheet',
                layoutCount: payloadSlots.length,
                paperSize: '4r',
                orientation: 'portrait',
                printCopies: 2,
                active: true,
                slotJson: JSON.stringify(payloadSlots)
              };

              await backendRequest('/api/admin/frames', adminToken, {
                method: 'POST',
                body: JSON.stringify(payload)
              });
              loadFrames();
            } catch (e) {
              alert('Gagal membuat bingkai: ' + e.message);
            }
          }}
        />
      )}
    </div>
  );
}

// ==============================================
// CREATE FRAME MODAL
// ==============================================
function CreateFrameModal({ onClose, onOpenAsset, onSelectBlank }) {
  const templates = [
    { id: 1, name: 'Rect Triple Strip', type: 'blank', desc: '6 placeholders · rect', slots: [{ x: 40, y: 40, width: 480, height: 586, borderRadius: 0 }, { x: 560, y: 40, width: 480, height: 586, borderRadius: 0 }, { x: 40, y: 666, width: 480, height: 586, borderRadius: 0 }, { x: 560, y: 666, width: 480, height: 586, borderRadius: 0 }, { x: 40, y: 1292, width: 480, height: 586, borderRadius: 0 }, { x: 560, y: 1292, width: 480, height: 586, borderRadius: 0 }] },
    { id: 2, name: 'Rounded Triple Strip', type: 'blank', desc: '6 placeholders · rounded', slots: [{ x: 40, y: 40, width: 480, height: 586, borderRadius: 30 }, { x: 560, y: 40, width: 480, height: 586, borderRadius: 30 }, { x: 40, y: 666, width: 480, height: 586, borderRadius: 30 }, { x: 560, y: 666, width: 480, height: 586, borderRadius: 30 }, { x: 40, y: 1292, width: 480, height: 586, borderRadius: 30 }, { x: 560, y: 1292, width: 480, height: 586, borderRadius: 30 }] },
    { id: 3, name: 'Oval Triple Strip', type: 'blank', desc: '6 placeholders · oval', slots: [{ x: 40, y: 170, width: 480, height: 480, borderRadius: 240 }, { x: 560, y: 170, width: 480, height: 480, borderRadius: 240 }, { x: 40, y: 720, width: 480, height: 480, borderRadius: 240 }, { x: 560, y: 720, width: 480, height: 480, borderRadius: 240 }, { x: 40, y: 1270, width: 480, height: 480, borderRadius: 240 }, { x: 560, y: 1270, width: 480, height: 480, borderRadius: 240 }] },
    { id: 4, name: 'Square Triple Strip', type: 'blank', desc: '6 placeholders · square', slots: [{ x: 40, y: 170, width: 480, height: 480, borderRadius: 0 }, { x: 560, y: 170, width: 480, height: 480, borderRadius: 0 }, { x: 40, y: 720, width: 480, height: 480, borderRadius: 0 }, { x: 560, y: 720, width: 480, height: 480, borderRadius: 0 }, { x: 40, y: 1270, width: 480, height: 480, borderRadius: 0 }, { x: 560, y: 1270, width: 480, height: 480, borderRadius: 0 }] },
    { id: 5, name: 'Rect Quadruple Strip', type: 'blank', desc: '8 placeholders · rect', slots: [{ x: 40, y: 40, width: 480, height: 430, borderRadius: 0 }, { x: 560, y: 40, width: 480, height: 430, borderRadius: 0 }, { x: 40, y: 510, width: 480, height: 430, borderRadius: 0 }, { x: 560, y: 510, width: 480, height: 430, borderRadius: 0 }, { x: 40, y: 980, width: 480, height: 430, borderRadius: 0 }, { x: 560, y: 980, width: 480, height: 430, borderRadius: 0 }, { x: 40, y: 1450, width: 480, height: 430, borderRadius: 0 }, { x: 560, y: 1450, width: 480, height: 430, borderRadius: 0 }] },
    { id: 6, name: 'Rect Quad 2x2', type: 'blank', desc: '4 placeholders · rect', slots: [{ x: 40, y: 40, width: 480, height: 900, borderRadius: 0 }, { x: 560, y: 40, width: 480, height: 900, borderRadius: 0 }, { x: 40, y: 980, width: 480, height: 900, borderRadius: 0 }, { x: 560, y: 980, width: 480, height: 900, borderRadius: 0 }] },
    { id: 7, name: 'Rect Quad Masthead', type: 'blank', desc: '4 placeholders · rect', slots: [{ x: 40, y: 40, width: 1000, height: 1100, borderRadius: 0 }, { x: 40, y: 1180, width: 306, height: 700, borderRadius: 0 }, { x: 387, y: 1180, width: 306, height: 700, borderRadius: 0 }, { x: 734, y: 1180, width: 306, height: 700, borderRadius: 0 }] },
    { id: 8, name: 'Newspaper Hero Split', type: 'blank', desc: '3 placeholders · rect', slots: [{ x: 40, y: 40, width: 1000, height: 1000, borderRadius: 0 }, { x: 40, y: 1080, width: 480, height: 800, borderRadius: 0 }, { x: 560, y: 1080, width: 480, height: 800, borderRadius: 0 }] },
    { id: 9, name: 'Newspaper Three Up', type: 'blank', desc: '3 placeholders · rect', slots: [{ x: 40, y: 40, width: 1000, height: 586, borderRadius: 0 }, { x: 40, y: 666, width: 1000, height: 586, borderRadius: 0 }, { x: 40, y: 1292, width: 1000, height: 586, borderRadius: 0 }] },
    { id: 10, name: 'Newspaper Lede Side', type: 'blank', desc: '3 placeholders · rect', slots: [{ x: 40, y: 40, width: 480, height: 1840, borderRadius: 0 }, { x: 560, y: 40, width: 480, height: 900, borderRadius: 0 }, { x: 560, y: 980, width: 480, height: 900, borderRadius: 0 }] },
    { id: 11, name: 'Circle Grid', type: 'blank', desc: '4 placeholders · circle', slots: [{ x: 40, y: 460, width: 480, height: 480, borderRadius: 240 }, { x: 560, y: 460, width: 480, height: 480, borderRadius: 240 }, { x: 40, y: 980, width: 480, height: 480, borderRadius: 240 }, { x: 560, y: 980, width: 480, height: 480, borderRadius: 240 }] },
  ];

  const [frameName, setFrameName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);

  const blankTemplatesCount = templates.filter(t => t.type === 'blank').length;

  const handleCreateSubmit = () => {
    let dummySlots = [];
    if (selectedTemplateId) {
      const t = templates.find(temp => temp.id === selectedTemplateId);
      if (t && t.type === 'blank') {
        if (Array.isArray(t.slots)) {
          dummySlots = t.slots;
        } else {
          const numSlots = t.slots || 3;
          const padY = 120;
          const padX = 80;
          const gap = 60;
          const sWidth = 1080 - (padX * 2);
          const availHeight = 1920 - (padY * 2);
          const totalGaps = Math.max(0, numSlots - 1) * gap;
          const sHeight = Math.floor((availHeight - totalGaps) / numSlots);

          dummySlots = Array.from({ length: numSlots }).map((_, i) => ({
            x: padX,
            y: padY + (i * (sHeight + gap)),
            width: sWidth,
            height: sHeight,
            borderRadius: 20
          }));
        }
      }
    }
    onSelectBlank(frameName || 'Untitled Frame', dummySlots);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        <div className="flex justify-between items-center p-5 border-b border-gray-100">
          <h3 className="text-xl font-bold text-gray-900">Buat Bingkai Baru</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full p-1 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-gray-50/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <button
              className="bg-white border-2 border-blue-500 rounded-xl p-6 flex flex-col items-center justify-center gap-4 hover:bg-blue-50 transition-colors shadow-sm"
            >
              <div className="text-gray-400"><File size={40} strokeWidth={1.5} /></div>
              <span className="font-bold text-gray-800">Bingkai Kosong</span>
            </button>
            <button
              onClick={onOpenAsset}
              className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center gap-4 hover:border-gray-400 hover:bg-gray-50 transition-all shadow-sm"
            >
              <div className="text-gray-400"><Plus size={40} strokeWidth={1.5} /></div>
              <span className="font-bold text-gray-800">Add from files</span>
            </button>
          </div>

          <div className="flex items-center justify-between border-b border-gray-200 mb-6">
            <div className="flex gap-6">
              <div className="pb-3 font-semibold text-sm flex items-center gap-2 border-b-2 border-blue-500 text-blue-600">
                Blank templates <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">{blankTemplatesCount}</span>
              </div>
            </div>
            <div className="pb-3 flex items-center gap-2 text-sm text-gray-600">
              Urutkan <button className="font-semibold flex items-center gap-1 hover:text-gray-900">Popularitas <ChevronDown size={14} /></button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {templates.filter(t => t.type === 'blank').map(t => (
              <div
                key={t.id}
                className="cursor-pointer group"
                onClick={() => {
                  setSelectedTemplateId(t.id);
                  setFrameName(t.name);
                }}
              >
                <div className={`bg-white border-2 rounded-lg p-2 aspect-[3/4] mb-2 shadow-sm group-hover:shadow-md transition-all ${selectedTemplateId === t.id ? 'border-blue-500' : 'border-gray-200 group-hover:border-blue-300'}`}>
                  <div
                    className="w-full h-full rounded p-2 relative overflow-hidden"
                    style={{ background: t.type === 'public' ? t.bg : '#f8fafc' }}
                  >
                    {t.type === 'blank' && Array.isArray(t.slots) ? t.slots.map((s, i) => (
                      <div
                        key={i}
                        className="bg-gray-200 absolute flex items-center justify-center text-gray-400 text-[10px] font-bold shadow-[inset_0_0_2px_rgba(0,0,0,0.1)]"
                        style={{
                          left: `${(s.x / 1080) * 100}%`,
                          top: `${(s.y / 1920) * 100}%`,
                          width: `${(s.width / 1080) * 100}%`,
                          height: `${(s.height / 1920) * 100}%`,
                          borderRadius: s.borderRadius ? `${(s.borderRadius / 1080) * 100}%` : '2px'
                        }}
                      >
                        {i + 1}
                      </div>
                    )) : (
                      t.type === 'blank' && Array.from({ length: t.slots || 3 }).map((_, i) => (
                        <div key={i} className="bg-gray-200 w-full flex-1 rounded flex items-center justify-center text-gray-400 text-xs font-bold mb-1">{i + 1}</div>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex flex-col mt-1">
                  <div className="text-sm font-semibold text-gray-800 truncate">{t.name}</div>
                  {t.desc && <div className="text-[10px] text-gray-500 truncate">{t.desc}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 bg-white flex justify-between items-center">
          <input
            type="text"
            placeholder="Untitled Frame"
            value={frameName}
            onChange={(e) => setFrameName(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 outline-none focus:border-blue-500"
          />
          <button
            onClick={handleCreateSubmit}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg transition-colors"
          >
            {selectedTemplateId ? 'Gunakan Terpilih' : 'Buat Bingkai Kosong'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ==============================================
// ADD ASSET MODAL
// ==============================================
function AddAssetModal({ onClose, onAssetSelected, adminToken }) {
  const [assets, setAssets] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    backendRequest('/api/admin/frames', adminToken).then(res => {
      setAssets(res.data || []);
    }).catch(e => console.error(e));
  }, [adminToken]);

  const handleUpload = async (file) => {
    if (!file) return;
    setIsUploading(true);
    try {
      // Auto-punch holes using HTML5 Canvas & Computer Vision projection mapping
      const processedResult = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 1080;
          canvas.height = 1920;
          const ctx = canvas.getContext('2d');
          
          // Draw image using object-contain math to preserve aspect ratio
          const scale = Math.min(1080 / img.width, 1920 / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const drawX = (1080 - drawW) / 2;
          const drawY = (1920 - drawH) / 2;

          ctx.drawImage(img, drawX, drawY, drawW, drawH);

          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;
          const w = canvas.width;
          const h = canvas.height;

          // CHROMA KEY OR TRANSPARENCY DETECTION
          const isSlotTarget = (r, g, b, a) => {
             if (a < 50) return true; // Already transparent hole
             return g > 80 && g > r * 1.1 && g > b * 1.1; // Extremely forgiving green screen
          };
          
          // 1. Pixel-perfect Chroma Key Erasure
          // Make all target pixels truly transparent first
          for (let i = 0; i < data.length; i += 4) {
             if (isSlotTarget(data[i], data[i+1], data[i+2], data[i+3])) {
                data[i+3] = 0; // Make pixel transparent
             }
          }
          ctx.putImageData(imgData, 0, 0);

          // 2. Breadth-First Search (BFS) to find contiguous transparent regions (holes)
          const visited = new Uint8Array(w * h);
          const blobs = [];
          
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const idx = y * w + x;
              if (!visited[idx] && data[idx * 4 + 3] < 50) {
                 // Found a new transparent region
                 let minX = x, maxX = x, minY = y, maxY = y;
                 let touchesEdge = false;
                 
                 // Manual queue for BFS to avoid recursion limit
                 const queueX = [x];
                 const queueY = [y];
                 visited[idx] = 1;
                 
                 let head = 0;
                 while(head < queueX.length) {
                    const cx = queueX[head];
                    const cy = queueY[head];
                    head++;
                    
                    if (cx === 0 || cx === w - 1 || cy === 0 || cy === h - 1) touchesEdge = true;
                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;
                    
                    // check 4 neighbors
                    if (cx > 0 && !visited[cy * w + (cx - 1)] && data[(cy * w + (cx - 1)) * 4 + 3] < 50) {
                       visited[cy * w + (cx - 1)] = 1;
                       queueX.push(cx - 1); queueY.push(cy);
                    }
                    if (cx < w - 1 && !visited[cy * w + (cx + 1)] && data[(cy * w + (cx + 1)) * 4 + 3] < 50) {
                       visited[cy * w + (cx + 1)] = 1;
                       queueX.push(cx + 1); queueY.push(cy);
                    }
                    if (cy > 0 && !visited[(cy - 1) * w + cx] && data[((cy - 1) * w + cx) * 4 + 3] < 50) {
                       visited[(cy - 1) * w + cx] = 1;
                       queueX.push(cx); queueY.push(cy - 1);
                    }
                    if (cy < h - 1 && !visited[(cy + 1) * w + cx] && data[((cy + 1) * w + cx) * 4 + 3] < 50) {
                       visited[(cy + 1) * w + cx] = 1;
                       queueX.push(cx); queueY.push(cy + 1);
                    }
                 }
                 
                 // If the region touches the edge, it's likely the outer transparent background, NOT a hole!
                 if (!touchesEdge && (maxX - minX > 20) && (maxY - minY > 20)) {
                    blobs.push({ x: minX, y: minY, width: maxX - minX, height: maxY - minY, borderRadius: 0 });
                 }
              } else {
                 visited[idx] = 1; // Mark opaque pixels as visited
              }
            }
          }
          
          // Sort slots top-to-bottom, left-to-right
          blobs.sort((a, b) => {
            if (Math.abs(a.y - b.y) > 50) return a.y - b.y;
            return a.x - b.x;
          });
          
          // Coordinates are already in 1080x1920 base space!
          const detectedSlots = blobs.map(b => ({
             x: b.x,
             y: b.y,
             width: b.width,
             height: b.height,
             borderRadius: 20
          }));
          
          canvas.toBlob((blob) => {
            if (blob) resolve({ blob, detectedSlots });
            else reject(new Error('Canvas toBlob failed'));
          }, 'image/png');
        };
        img.onerror = () => reject(new Error('Gagal membaca gambar'));
        img.src = URL.createObjectURL(file);
      });

      const formData = new FormData();
      formData.append('file', processedResult.blob, file.name.replace(/\.[^/.]+$/, "") + "_transparent.png");

      const res = await fetch(`${getBackendApiUrl()}/api/admin/frames/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData
      });
      if (!res.ok) throw new Error(await res.text());
      const resData = await res.json();

      const assetUrl = resData.data?.url || resData.url || resData.imageUrl;
      onAssetSelected({ assetUrl, detectedSlots: processedResult.detectedSlots });
    } catch (err) {
      alert('Gagal upload: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white z-10">
          <h3 className="text-xl font-bold text-gray-900">Tambahkan Aset dari File</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-gray-50 flex flex-col gap-6" style={{ maxHeight: '70vh' }}>

          <div className="flex justify-between items-center">
            <button className="text-gray-500 font-semibold text-sm hover:text-gray-800">Refresh Aset</button>
            <button className="flex items-center gap-1 border border-gray-200 bg-white rounded-md px-3 py-1.5 text-sm text-gray-600 font-medium hover:bg-gray-50">
              Terbaru dulu <ChevronDown size={14} />
            </button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
            {assets.slice(0, 10).map((asset, i) => (
              <div
                key={i}
                onClick={() => onAssetSelected(asset.imageUrl || asset.url)}
                className="bg-white rounded-lg border border-gray-200 aspect-square flex items-center justify-center p-2 relative group cursor-pointer hover:border-blue-400 shadow-sm overflow-hidden"
              >
                <img src={asset.imageUrl || asset.url} alt="asset" className="max-w-full max-h-full object-contain" />
                <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] p-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {asset.name}
                </div>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="bg-red-500 text-white p-1 rounded hover:bg-red-600" onClick={e => e.stopPropagation()}><Trash2 size={12} /></button>
                  <button className="bg-blue-500 text-white p-1 rounded hover:bg-blue-600" onClick={e => e.stopPropagation()}><Download size={12} /></button>
                </div>
              </div>
            ))}
            {assets.length === 0 && (
              <div className="col-span-full py-4 text-center text-gray-400 text-sm">Belum ada aset frame.</div>
            )}
          </div>

          <div
            className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-colors mt-4
              ${isDraggingOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud size={36} className="text-gray-400 mb-3" />
            <p className="text-gray-600 font-medium">Letakkan gambar di sini atau klik untuk unggah</p>
            <input
              type="file"
              accept="image/png, image/jpeg"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            {isUploading && <p className="text-blue-500 text-sm mt-2 font-bold animate-pulse">Mengunggah...</p>}
          </div>

          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Masukkan URL gambar"
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            <button
              onClick={() => imageUrl && onAssetSelected(imageUrl)}
              className="bg-[#3b82f6] hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold text-sm transition-colors whitespace-nowrap"
            >
              Tambah URL
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 bg-white flex justify-end gap-3">
          <button onClick={onClose} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg text-sm transition-colors">
            Batal
          </button>
          <button className="bg-gray-300 text-gray-500 cursor-not-allowed font-bold py-2 px-6 rounded-lg text-sm">
            Buat Aset (0)
          </button>
        </div>
      </div>
    </div>
  );
}

