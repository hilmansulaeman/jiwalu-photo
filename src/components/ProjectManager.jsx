import React, { useState, useEffect } from 'react';
import { backendRequest, getBackendApiUrl } from '../utils/backendApi';

export default function ProjectManager({ adminToken, onEditProject, onStartKiosk }) {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const data = await backendRequest('/api/admin/projects', adminToken);
      setProjects(data || []);
    } catch (err) {
      setError('Gagal memuat proyek');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (adminToken) {
      fetchProjects();
    }
  }, [adminToken]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    
    try {
      await backendRequest('/api/admin/projects', adminToken, {
        method: 'POST',
        body: JSON.stringify({ name: newProjectName })
      });
      setNewProjectName('');
      setIsCreating(false);
      fetchProjects();
    } catch (err) {
      alert('Gagal membuat proyek baru: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus proyek ini? Semua pengaturan di dalamnya akan hilang.')) {
      return;
    }
    
    try {
      await backendRequest(`/api/admin/projects/${id}`, adminToken, {
        method: 'DELETE'
      });
      fetchProjects();
    } catch (err) {
      alert('Gagal menghapus proyek: ' + err.message);
    }
  };

  if (isLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Memuat...</div>;
  }

  return (
    <div style={{ background: 'white', padding: '2.5rem', borderRadius: '8px', border: '1px solid #e9ecef', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e9ecef', paddingBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#111' }}>Proyek</h2>
          <p style={{ margin: '0.25rem 0 0 0', color: '#6c757d', fontSize: '0.9rem' }}>
            Kelola proyek photobooth Anda di sini.
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.625rem 1rem',
            background: '#40a3eb',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Buat Baru
        </button>
      </div>

      {error && (
        <div style={{ padding: '1rem', marginBottom: '1.5rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: '8px' }}>
          {error}
        </div>
      )}

      {isCreating && (
        <form onSubmit={handleCreate} style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem' }}>Proyek Baru</h3>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <input
              type="text"
              placeholder="Nama Proyek (contoh: Kiosk Self-Service)"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px' }}
              required
            />
            <button type="submit" style={{ padding: '0.5rem 1rem', backgroundColor: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
              Simpan
            </button>
            <button type="button" onClick={() => setIsCreating(false)} style={{ padding: '0.5rem 1rem', backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer' }}>
              Batal
            </button>
          </div>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {projects.map(project => (
          <div 
            key={project.id} 
            onClick={() => onStartKiosk && onStartKiosk(project.id)}
            style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: 'pointer', transition: 'box-shadow 0.2s', ':hover': { boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' } }}
          >
            <div style={{ height: '160px', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {project.coverImage ? (
                <img src={project.coverImage.startsWith('/') ? `${getBackendApiUrl()}${project.coverImage}` : project.coverImage} alt={project.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              )}
            </div>
            <div style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.125rem', color: '#111827' }}>{project.name}</h3>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>ID: {project.id}</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); onEditProject(project.id); }}
                  title="Edit Pengaturan Kiosk"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', backgroundColor: '#f3f4f6', border: 'none', borderRadius: '8px', color: '#4b5563', cursor: 'pointer' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(project.id); }}
                  title="Hapus Proyek"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', backgroundColor: '#fee2e2', border: 'none', borderRadius: '8px', color: '#dc2626', cursor: 'pointer' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
        {projects.length === 0 && !isLoading && (
          <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: '#6b7280', backgroundColor: 'white', borderRadius: '8px', border: '1px dashed #d1d5db' }}>
            Belum ada proyek. Klik "Buat Baru" untuk memulai.
          </div>
        )}
      </div>
    </div>
  );
}
