import React, { useState, useEffect, useRef } from 'react';
import { getBackendApiUrl, backendRequest } from '../utils/backendApi.js';

export default function ProfileTab({ adminUser }) {
  const [formData, setFormData] = useState({
    email: adminUser?.email || '',
    username: adminUser?.username || 'hilman',
    fullName: adminUser?.fullName || 'Hilman Sulaeman',
    company: adminUser?.company || 'urbanmenphoto',
    phone: adminUser?.phone || '087831568837'
  });
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(adminUser?.twoFactorEnabled || false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const googleButtonRef = useRef(null);

  // Google Sign-In dihilangkan untuk environment Desktop (Tauri)
  // karena adanya restriksi origin dari sistem keamanan Google.
  
  const handleCredentialResponse = async (response) => {
    try {
      const adminToken = localStorage.getItem('urbanmenphoto_admin_token');
      const data = await backendRequest('/api/auth/google/verify', adminToken, {
        method: 'POST',
        body: JSON.stringify({ credential: response.credential })
      });
      
      if (data?.token) {
        localStorage.setItem("urbanmenphoto_admin_token", data.token);
      }
      if (data?.user) {
        localStorage.setItem("urbanmenphoto_admin_user", JSON.stringify(data.user));
      }
      window.location.reload();
    } catch (err) {
      console.error('Google Auth Error:', err);
      alert('Gagal menghubungkan dengan Google: ' + err.message);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    alert('Perubahan berhasil disimpan');
  };

  const handleToggle2FA = async () => {
    try {
      const adminToken = localStorage.getItem('urbanmenphoto_admin_token');
      await backendRequest('/api/admin/auth/2fa/toggle', adminToken, {
        method: 'POST',
        body: JSON.stringify({ enabled: !twoFactorEnabled })
      });
      setTwoFactorEnabled(!twoFactorEnabled);
      alert(!twoFactorEnabled ? '2FA berhasil diaktifkan' : '2FA dinonaktifkan');
      // Update local storage user
      const user = JSON.parse(localStorage.getItem('urbanmenphoto_admin_user') || '{}');
      user.twoFactorEnabled = !twoFactorEnabled;
      localStorage.setItem('urbanmenphoto_admin_user', JSON.stringify(user));
    } catch (err) {
      alert('Gagal mengubah 2FA: ' + err.message);
    }
  };

  return (
    <div style={{ width: '100%', margin: 0, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0 0 0.25rem 0', color: '#111827' }}>Pengaturan profil</h2>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.95rem' }}>Perbarui informasi yang muncul pada faktur dan komunikasi.</p>
      </div>

      {/* Main Profile Card */}
      <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: '2rem', overflow: 'hidden' }}>
        <div style={{ padding: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>Alamat email</label>
              <input 
                type="email" 
                name="email"
                value={formData.email}
                disabled
                style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #d1d5db', background: '#f9fafb', color: '#6b7280', fontSize: '0.9rem', outline: 'none' }}
              />
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>Email tidak dapat diubah setelah terdaftar.</p>
            </div>

            {/* Username */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>Nama pengguna</label>
              <input 
                type="text" 
                name="username"
                value={formData.username}
                onChange={handleChange}
                style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>

            {/* Full Name */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>Nama lengkap</label>
              <input 
                type="text" 
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>

            {/* Company */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>Perusahaan</label>
              <input 
                type="text" 
                name="company"
                value={formData.company}
                onChange={handleChange}
                style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>Nomor telepon</label>
            <input 
              type="text" 
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9rem', outline: 'none' }}
            />
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>Kami menggunakan nomor ini untuk keperluan penagihan atau dukungan.</p>
          </div>

          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              onClick={handleSave}
              style={{ padding: '0.65rem 1.25rem', background: '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}
            >
              Simpan perubahan
            </button>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #e5e7eb', padding: '1.5rem 2rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '0 0 0.5rem 0', color: '#111827' }}>Akun Sosial & Integrasi</h3>
          {adminUser?.googleId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
              {adminUser.avatarUrl && <img src={adminUser.avatarUrl} alt="Avatar" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />}
              <div>
                <div style={{ fontWeight: '600', color: '#374151' }}>Terhubung dengan Google</div>
                <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>ID: {adminUser.googleId.substring(0, 10)}...</div>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ margin: '0 0 1rem 0', color: '#6b7280', fontSize: '0.9rem' }}>Akun Anda belum tertaut dengan Google.</p>
              <div style={{ margin: '1rem 0', padding: '0.75rem', background: '#fef3c7', color: '#92400e', borderRadius: '8px', fontSize: '0.85rem' }}>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Google Sign-In Dinonaktifkan di Desktop</strong>
                Sistem keamanan Google memblokir login pihak ketiga di dalam aplikasi Desktop (Tauri). Silakan gunakan Email dan Kata Sandi (beserta 2FA) untuk login ke Dashboard Admin.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Security Card */}
      <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold', margin: 0, color: '#111827' }}>Keamanan Akun</h2>
          <span style={{ padding: '0.35rem 0.75rem', background: twoFactorEnabled ? '#dcfce7' : '#f3f4f6', color: twoFactorEnabled ? '#166534' : '#374151', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '600' }}>
            {twoFactorEnabled ? 'Aktif' : 'Nonaktif'}
          </span>
        </div>
        <p style={{ margin: '0 0 1.5rem 0', color: '#6b7280', fontSize: '0.95rem' }}>Kelola verifikasi login Anda</p>

        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#1e40af', margin: '0 0 0.25rem 0' }}>Keamanan Akun</h4>
          <p style={{ margin: '0 0 0.75rem 0', color: '#1e40af', fontSize: '0.85rem' }}>Aktifkan verifikasi ekstra saat login. Kode dikirim ke email Anda.</p>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#1e40af', fontSize: '0.85rem' }}>
            <li style={{ marginBottom: '0.25rem' }}>Kode verifikasi via email</li>
            <li>Lindungi transaksi penting</li>
          </ul>
        </div>

        <button onClick={handleToggle2FA} style={{ padding: '0.65rem 1.25rem', background: twoFactorEnabled ? '#dc2626' : '#40a3eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}>
          {twoFactorEnabled ? 'Nonaktifkan Autentikasi Dua Faktor' : 'Aktifkan Autentikasi Dua Faktor'}
        </button>
      </div>
    </div>
  );
}
