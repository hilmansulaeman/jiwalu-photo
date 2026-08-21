import React, { useState, useEffect } from 'react';
import { backendRequest } from '../utils/backendApi.js';

export default function WalletTab() {
  const [activeSubTab, setActiveSubTab] = useState('platform');
  const [data, setData] = useState({
    settings: { accountName: '', accountNumber: '', bankName: '', withdrawalPref: '' },
    withdrawals: [],
    totalEarnings: 0,
    balance: 0
  });
  const [loading, setLoading] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  useEffect(() => {
    fetchWalletData();
  }, []);

  const fetchWalletData = async () => {
    try {
      const res = await backendRequest('/api/admin/wallet', localStorage.getItem('admin_token'));
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (!withdrawAmount || parseInt(withdrawAmount) < 10000) {
      alert('Minimum penarikan adalah Rp 10.000');
      return;
    }
    if (parseInt(withdrawAmount) > data.balance) {
      alert('Saldo tidak mencukupi');
      return;
    }

    setWithdrawLoading(true);
    try {
      const res = await backendRequest('/api/admin/wallet/withdraw', localStorage.getItem('admin_token'), {
        method: 'POST',
        body: JSON.stringify({ amount: parseInt(withdrawAmount) })
      });
      alert('Pengajuan penarikan berhasil dibuat');
      setWithdrawAmount('');
      fetchWalletData();
    } catch (err) {
      alert(err.message || 'Gagal membuat penarikan');
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSettingsSaving(true);
    try {
      const res = await backendRequest('/api/admin/wallet/settings', localStorage.getItem('admin_token'), {
        method: 'PUT',
        body: JSON.stringify(data.settings)
      });
      alert('Pengaturan disimpan');
    } catch (err) {
      alert(err.message || 'Gagal menyimpan pengaturan');
    } finally {
      setSettingsSaving(false);
    }
  };

  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
  };

  return (
    <div className="wallet-container" style={{ padding: '2rem', fontFamily: 'Inter, sans-serif' }}>
      
      <div style={{ display: 'flex', gap: '20px', marginBottom: '2rem', borderBottom: '1px solid #e0e0e0' }}>
        <button 
          onClick={() => setActiveSubTab('platform')}
          style={{ 
            background: 'none', border: 'none', padding: '10px 0', cursor: 'pointer', fontSize: '1rem', fontWeight: 600,
            color: activeSubTab === 'platform' ? '#40a3eb' : '#888',
            borderBottom: activeSubTab === 'platform' ? '2px solid #40a3eb' : '2px solid transparent'
          }}>
          Platform Wallet
        </button>
        <button 
          onClick={() => setActiveSubTab('gateway')}
          style={{ 
            background: 'none', border: 'none', padding: '10px 0', cursor: 'pointer', fontSize: '1rem', fontWeight: 600,
            color: activeSubTab === 'gateway' ? '#40a3eb' : '#888',
            borderBottom: activeSubTab === 'gateway' ? '2px solid #40a3eb' : '2px solid transparent'
          }}>
          Dompet gateway Anda
        </button>
      </div>

      {loading ? <p>Memuat data...</p> : (
        activeSubTab === 'platform' ? (
          <div>
            <div style={{ display: 'flex', gap: '20px', marginBottom: '2rem' }}>
              <div style={{ flex: 1, padding: '1.5rem', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '0.9rem' }}>Saldo Saat Ini</h3>
                <h1 style={{ margin: '0 0 15px 0', fontSize: '2rem', color: '#40a3eb' }}>{formatRupiah(data.balance)}</h1>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input 
                    type="number" 
                    placeholder="Masukkan jumlah" 
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc', flex: 1 }}
                  />
                  <button 
                    onClick={handleWithdraw} 
                    disabled={withdrawLoading || data.balance === 0}
                    style={{ 
                      padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#40a3eb', color: '#fff', 
                      cursor: withdrawLoading || data.balance === 0 ? 'not-allowed' : 'pointer', fontWeight: 600 
                    }}>
                    {withdrawLoading ? 'Memproses...' : 'Tarik Dana'}
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, padding: '1.5rem', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '0.9rem' }}>Total Pendapatan</h3>
                <h1 style={{ margin: 0, fontSize: '2rem', color: '#40a3eb' }}>{formatRupiah(data.totalEarnings)}</h1>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ flex: 2, padding: '1.5rem', background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                <h3 style={{ margin: '0 0 20px 0', color: '#40a3eb' }}>Transaksi Terbaru</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e0e0e0', textAlign: 'left' }}>
                      <th style={{ padding: '10px', color: '#666', fontWeight: 500 }}>ID</th>
                      <th style={{ padding: '10px', color: '#666', fontWeight: 500 }}>Tanggal</th>
                      <th style={{ padding: '10px', color: '#666', fontWeight: 500 }}>Jumlah</th>
                      <th style={{ padding: '10px', color: '#666', fontWeight: 500 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.withdrawals.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#999' }}>Belum ada transaksi</td>
                      </tr>
                    ) : (
                      data.withdrawals.map(w => (
                        <tr key={w.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '10px' }}>{w.id}</td>
                          <td style={{ padding: '10px' }}>{new Date(w.createdAt).toLocaleDateString('id-ID')}</td>
                          <td style={{ padding: '10px' }}>{formatRupiah(w.amount)}</td>
                          <td style={{ padding: '10px' }}>
                            <span style={{ 
                              padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem',
                              background: w.status === 'completed' ? '#dcfce7' : w.status === 'failed' ? '#fee2e2' : '#fef3c7',
                              color: w.status === 'completed' ? '#166534' : w.status === 'failed' ? '#991b1b' : '#92400e'
                            }}>
                              {w.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ flex: 1, padding: '1.5rem', background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                <h3 style={{ margin: '0 0 20px 0', color: '#40a3eb' }}>Pengaturan Penarikan</h3>
                <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#444' }}>Nama Pemegang Rekening</label>
                    <input 
                      type="text" 
                      value={data.settings.accountName || ''}
                      onChange={(e) => setData({...data, settings: {...data.settings, accountName: e.target.value}})}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#444' }}>Nomor Rekening</label>
                    <input 
                      type="text" 
                      value={data.settings.accountNumber || ''}
                      onChange={(e) => setData({...data, settings: {...data.settings, accountNumber: e.target.value}})}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#444' }}>Bank</label>
                    <select 
                      value={data.settings.bankName || ''}
                      onChange={(e) => setData({...data, settings: {...data.settings, bankName: e.target.value}})}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                    >
                      <option value="">Pilih Bank...</option>
                      <option value="BCA">BCA</option>
                      <option value="Mandiri">Mandiri</option>
                      <option value="BNI">BNI</option>
                      <option value="BRI">BRI</option>
                      <option value="Lainnya">Lainnya...</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#444' }}>Preferensi Jadwal Penarikan</label>
                    <select 
                      value={data.settings.withdrawalPref || ''}
                      onChange={(e) => setData({...data, settings: {...data.settings, withdrawalPref: e.target.value}})}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                    >
                      <option value="manual">Penarikan Manual</option>
                      <option value="weekly">Mingguan Otomatis</option>
                      <option value="monthly">Bulanan Otomatis</option>
                    </select>
                  </div>
                  <button 
                    type="submit" 
                    disabled={settingsSaving}
                    style={{ 
                      padding: '12px', borderRadius: '8px', border: 'none', background: '#40a3eb', color: '#fff', 
                      cursor: settingsSaving ? 'not-allowed' : 'pointer', fontWeight: 600, marginTop: '10px'
                    }}>
                    {settingsSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '2rem', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>Dompet Gateway</h3>
            <p style={{ color: '#666', marginBottom: '2rem' }}>Kelola koneksi API Gateway Anda (seperti Midtrans atau Xendit) untuk menerima pembayaran langsung. Konfigurasi Client Key dan Server Key dapat diatur melalui menu Payment Key.</p>
            <div style={{ padding: '1rem', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Status Integrasi</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }}></span>
                <span>Active (Payment Key terhubung)</span>
              </div>
            </div>
            <a href="/admin/payment_key" style={{ display: 'inline-block', padding: '10px 20px', background: '#40a3eb', color: '#fff', textDecoration: 'none', borderRadius: '8px', fontWeight: 600 }}>Atur Payment Key</a>
          </div>
        )
      )}
    </div>
  );
}
