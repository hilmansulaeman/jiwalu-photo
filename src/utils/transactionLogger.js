const TRANSACTIONS_KEY = 'potobox_transactions';

export function logTransaction({ orderId, packageName, amount, method = 'QRIS', status = 'Success' }) {
  try {
    const existingStr = localStorage.getItem(TRANSACTIONS_KEY);
    const existing = existingStr ? JSON.parse(existingStr) : [];
    
    const newTransaction = {
      id: orderId || `ORD-${Date.now()}`,
      timestamp: new Date().toISOString(),
      packageName: packageName || 'Unknown Package',
      amount: amount || 0,
      method,
      status
    };
    
    existing.unshift(newTransaction); // Add to beginning (newest first)
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(existing));
    return true;
  } catch (error) {
    console.error('Failed to log transaction:', error);
    return false;
  }
}

export function getTransactions() {
  try {
    const existingStr = localStorage.getItem(TRANSACTIONS_KEY);
    return existingStr ? JSON.parse(existingStr) : [];
  } catch (error) {
    console.error('Failed to read transactions:', error);
    return [];
  }
}

export function clearTransactions() {
  try {
    localStorage.removeItem(TRANSACTIONS_KEY);
    return true;
  } catch (error) {
    console.error('Failed to clear transactions:', error);
    return false;
  }
}

export function exportTransactionsToXLS() {
  const transactions = getTransactions();
  if (transactions.length === 0) {
    alert('Tidak ada transaksi untuk diekspor.');
    return;
  }

  const escapeCell = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const headers = ['Order ID', 'Tanggal', 'Waktu', 'Nama Paket', 'Jumlah (Rp)', 'Metode', 'Status'];
  const rows = transactions.map(t => {
    const dateObj = new Date(t.timestamp);
    const dateStr = dateObj.toLocaleDateString('id-ID');
    const timeStr = dateObj.toLocaleTimeString('id-ID');
    return [
      t.id,
      dateStr,
      timeStr,
      t.packageName,
      t.amount,
      t.method,
      t.status
    ];
  });

  const html = `<!doctype html>
<html>
  <head><meta charset="UTF-8" /></head>
  <body>
    <table border="1">
      <thead><tr>${headers.map(header => `<th>${escapeCell(header)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(row => `<tr>${row.map(value => `<td>${escapeCell(value)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  </body>
</html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `potobox_transactions_${new Date().toISOString().split('T')[0]}.xls`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const exportTransactionsToCSV = exportTransactionsToXLS;
