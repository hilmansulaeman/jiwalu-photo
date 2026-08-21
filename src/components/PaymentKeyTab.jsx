import React, { useState, useEffect } from 'react';
import { backendRequest } from '../utils/backendApi.js';

export default function PaymentKeyTab({ adminToken }) {
  const [data, setData] = useState({
    midtransClientKey: '',
    midtransServerKey: '',
    xenditApiKey: '',
    activeGateway: 'none'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    try {
      const res = await backendRequest('/api/admin/payment_keys', adminToken);
      if (res) {
        setData(res);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await backendRequest('/api/admin/payment_keys', adminToken, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      alert('Payment keys berhasil disimpan');
    } catch (err) {
      alert(err.message || 'Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'Inter, sans-serif' }}>
      <h2 style={{ marginBottom: '1.5rem', color: '#111' }}>Payment Gateway Keys</h2>
      
      {loading ? <p>Memuat data...</p> : (
        <form onSubmit={handleSave} style={{ background: '#fff', padding: '2rem', borderRadius: '8px', border: '1px solid #e0e0e0', maxWidth: '800px' }}>
          
          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Gateway Aktif</label>
            <select 
              value={data.activeGateway} 
              onChange={e => setData({...data, activeGateway: e.target.value})}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
            >
              <option value="none">Tidak Ada (Disabled)</option>
              <option value="midtrans">Midtrans</option>
              <option value="xendit">Xendit</option>
            </select>
          </div>

          <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f8f9fa', borderRadius: '8px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#333' }}>Midtrans Configuration</h3>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#555' }}>Client Key</label>
              <input 
                type="text" 
                value={data.midtransClientKey || ''} 
                onChange={e => setData({...data, midtransClientKey: e.target.value})}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
                placeholder="SB-Mid-client-..."
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#555' }}>Server Key</label>
              <input 
                type="password" 
                value={data.midtransServerKey || ''} 
                onChange={e => setData({...data, midtransServerKey: e.target.value})}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
                placeholder="SB-Mid-server-..."
              />
            </div>
          </div>

          <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f8f9fa', borderRadius: '8px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#333' }}>Xendit Configuration</h3>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#555' }}>Secret API Key</label>
              <input 
                type="password" 
                value={data.xenditApiKey || ''} 
                onChange={e => setData({...data, xenditApiKey: e.target.value})}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
                placeholder="xnd_development_..."
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={saving}
            style={{ 
              padding: '12px 24px', borderRadius: '8px', border: 'none', background: '#40a3eb', color: '#fff', 
              cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600 
            }}>
            {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
          </button>
        </form>
      )}
    </div>
  );
}
