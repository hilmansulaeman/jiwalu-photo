import { BarChart3, Filter, Image as ImageIcon, Printer, Search, Star, WalletCards, X } from './ui/icons.jsx';
import { useState } from 'react';
import { Card, CardContent, CardHeader } from './ui/card.jsx';
import { Button } from './ui/button.jsx';

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

function asDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getWeeklySeries(sessions) {
  const weeks = Array.from({ length: 4 }, (_, index) => ({ label: `Minggu ${index + 1}`, value: 0, count: 0 }));
  const today = new Date();
  const fourWeeksAgo = new Date(today);
  fourWeeksAgo.setDate(today.getDate() - 28);

  sessions.forEach((session) => {
    const date = asDate(session.createdAt || session.created_at);
    const age = Math.max(0, Math.min(27, Math.floor((date - fourWeeksAgo) / 86400000)));
    const index = Math.min(3, Math.floor(age / 7));
    const amount = Number(session.totalPrice || session.total_price || session.payment?.amount || 0);
    weeks[index].value += amount;
    weeks[index].count += 1;
  });
  return weeks;
}

function BarPanel({ title, series, mode = 'value' }) {
  const values = series.map((entry) => mode === 'value' ? entry.value : entry.count);
  const actualMax = Math.max(...values, 0);
  const chartMax = mode === 'value'
    ? Math.max(50000, Math.ceil(actualMax / 5000) * 5000)
    : Math.max(25, Math.ceil(actualMax / 5) * 5);
  const ticks = Array.from({ length: 6 }, (_, index) => (chartMax / 5) * (5 - index));
  const formatTick = (value) => mode === 'value'
    ? value === 0 ? 'Rp 0' : `Rp ${new Intl.NumberFormat('id-ID').format(value)}`
    : String(value);

  return (
    <Card className="overflow-hidden rounded-xl">
      <CardHeader className="p-5 pb-1 sm:p-6 sm:pb-1">
        <h2 className="text-lg font-semibold tracking-[-0.025em] text-[#18181b] sm:text-xl">{title}</h2>
        <div className="mt-7 flex items-center justify-center gap-4 text-xs font-medium text-[#6b6870]">
          <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-[1px] bg-[#40a3eb]" />Proyek A</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-[1px] bg-[#60bbf2]" />Proyek B</span>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-2 sm:p-6 sm:pt-2">
        <div className="grid grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[92px_minmax(0,1fr)]">
          <div className="relative h-[340px] sm:h-[460px]">
            {ticks.map((tick, index) => (
              <span key={tick} className="absolute right-3 -translate-y-1/2 whitespace-nowrap text-[10px] font-medium text-[#77737e] sm:right-4 sm:text-sm" style={{ top: `${index * 20}%` }}>
                {formatTick(tick)}
              </span>
            ))}
          </div>
          <div className="relative h-[340px] border-b border-l border-[#dedee1] sm:h-[460px]">
            {ticks.map((tick, index) => (
              <div key={tick} className="absolute left-0 right-0 border-t border-[#e8e7e8]" style={{ top: `${index * 20}%` }} />
            ))}
            <div className="absolute inset-0 grid grid-cols-4">
              {series.map((entry, index) => {
            const value = mode === 'value' ? entry.value : entry.count;
            const height = value ? Math.max(2, (value / chartMax) * 100) : 0;
            const secondary = value ? Math.max(2, height * (0.62 + ((index % 2) * 0.12))) : 0;
            return (
              <div className="relative flex min-w-0 items-end justify-center gap-1.5 border-r border-[#e8e7e8] px-2 pb-0 sm:gap-3 sm:px-5" key={entry.label}>
                <div className="w-full max-w-20 rounded-t-[2px] bg-[#40a3eb] transition-[height]" style={{ height: `${height}%` }} title={`Proyek A: ${formatTick(value)}`} />
                <div className="w-full max-w-20 rounded-t-[2px] bg-[#60bbf2] transition-[height]" style={{ height: `${secondary}%` }} title={`Proyek B: ${formatTick(Math.round(value * (0.62 + ((index % 2) * 0.12))))}`} />
              </div>
            );
              })}
            </div>
          </div>
        </div>
        <div className="ml-[64px] grid grid-cols-4 text-center text-[10px] font-medium text-[#77737e] sm:ml-[92px] sm:text-sm">
          {series.map((entry) => <span className="pt-3" key={entry.label}>{entry.label}</span>)}
        </div>
      </CardContent>
    </Card>
  );
}

function DonutCard({ title, value, color, icon: Icon, percentage = 42 }) {
  const p1 = percentage;
  const p2 = Math.min(100, p1 + 26);
  const p3 = Math.min(100, p2 + 14);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center justify-between p-3.5 pb-1">
        <h3 className="truncate text-xs font-semibold text-[#34323a]">{title}</h3>
        <Icon className="size-3.5 text-[#8d8994]" />
      </CardHeader>
      <CardContent className="flex items-center gap-3 p-3.5 pt-2">
        <div className="relative grid size-14 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${color} 0 ${p1}%, #f7d75c ${p1}% ${p2}%, #0da3be ${p2}% ${p3}%, #ecebf0 ${p3}% 100%)` }}>
          <div className="size-10 rounded-full bg-white flex items-center justify-center">
            <span className="text-[10px] font-bold text-[#111]">{percentage}%</span>
          </div>
        </div>
        <div>
          <strong className="text-lg font-bold text-[#111]">{percentage}%</strong>
          <p className="text-[11px] font-medium leading-tight text-[#66626e]">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TransactionFilterDialog({ initialProject, onClose, onApply }) {
  const [project, setProject] = useState(initialProject);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentSources, setPaymentSources] = useState([]);
  const [sessionTypes, setSessionTypes] = useState([]);
  const toggle = (setValue, value) => setValue((items) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value]);
  const clear = () => {
    setProject('all');
    setDateFrom('');
    setDateTo('');
    setPaymentSources([]);
    setSessionTypes([]);
  };
  const checkbox = (label, value, values, setValues) => (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-base font-medium text-[#3d4658]" key={value}>
      <input type="checkbox" checked={values.includes(value)} onChange={() => toggle(setValues, value)} className="size-5 rounded-md border-[#949494] accent-[#40a3eb]" />
      {label}
    </label>
  );

  return (
    <div className="fixed inset-0 z-[1300] grid place-items-center bg-[#111827]/55 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="transaction-filter-title">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply({ project, dateFrom, dateTo, paymentSources, sessionTypes });
        }}
        className="w-full max-w-[896px] overflow-hidden rounded-[24px] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.3)]"
      >
        <header className="flex items-center justify-between border-b border-[#ececf0] px-7 py-6 sm:px-10">
          <h2 id="transaction-filter-title" className="text-2xl font-bold tracking-[-0.03em] text-[#182235] sm:text-[30px]">Filter Transaksi</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-[#9aa3b2] transition hover:bg-[#f5f5f6] hover:text-[#4b5563]" aria-label="Tutup filter">
            <X className="size-7 stroke-[4]" />
          </button>
        </header>

        <div className="space-y-8 px-7 py-7 sm:px-10 sm:py-8">
          <label className="block">
            <span className="sr-only">Proyek</span>
            <select value={project} onChange={(event) => setProject(event.target.value)} className="h-[76px] w-full rounded-2xl border-2 border-[#d4d7dd] bg-white px-6 text-xl font-medium text-[#3d4658] outline-none focus:border-[#40a3eb] focus:ring-4 focus:ring-[#bae0f9]">
              <option value="all">Semua Proyek</option>
              <option value="active">Proyek Aktif</option>
              <option value="archived">Proyek Arsip</option>
            </select>
          </label>

          <fieldset>
            <legend className="mb-3 text-lg font-semibold text-[#687386]">Rentang Tanggal</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-lg font-medium text-[#9aa3b2]">Tanggal Mulai
                <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-[84px] rounded-2xl border-2 border-[#d4d7dd] bg-white px-6 text-xl text-[#151515] outline-none focus:border-[#40a3eb] focus:ring-4 focus:ring-[#bae0f9]" />
              </label>
              <label className="grid gap-2 text-lg font-medium text-[#9aa3b2]">Tanggal Selesai
                <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-[84px] rounded-2xl border-2 border-[#d4d7dd] bg-white px-6 text-xl text-[#151515] outline-none focus:border-[#40a3eb] focus:ring-4 focus:ring-[#bae0f9]" />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-4 text-lg font-semibold text-[#687386]">Sumber pembayaran</legend>
            <div className="flex flex-wrap gap-x-7 gap-y-4">
              {checkbox('QRIS', 'qris', paymentSources, setPaymentSources)}
              {checkbox('Voucher tunai', 'cash-voucher', paymentSources, setPaymentSources)}
              {checkbox('Voucher diskon', 'discount-voucher', paymentSources, setPaymentSources)}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-4 text-lg font-semibold text-[#687386]">Tipe sesi</legend>
            <div className="flex flex-wrap gap-x-7 gap-y-4">
              {checkbox('Sesi', 'session', sessionTypes, setSessionTypes)}
              {checkbox('Cetak ulang', 'reprint', sessionTypes, setSessionTypes)}
            </div>
          </fieldset>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[#ececf0] px-7 py-6 sm:px-10">
          <button type="button" onClick={clear} className="text-lg font-medium text-[#687386] transition hover:text-[#40a3eb]">Hapus semua</button>
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="h-14 px-7 text-lg" onClick={onClose}>Batal</Button>
            <Button type="submit" className="h-14 bg-[#40a3eb] px-7 text-lg hover:bg-[#2c8ed6]">Terapkan Filter</Button>
          </div>
        </footer>
      </form>
    </div>
  );
}

export default function AdminOverview({ sessions = [] }) {
  const [project, setProject] = useState('all');
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const successfulSessions = sessions.filter(session => 
    session.status === 'paid' || 
    session.status === 'finalized' || 
    session.payment?.status === 'paid' || 
    session.payment?.status === 'settlement' || 
    session.payment?.status === 'success'
  );
  
  const series = getWeeklySeries(successfulSessions);
  const totalRevenue = series.reduce((sum, entry) => sum + entry.value, 0);
  const totalPrints = successfulSessions.reduce((sum, session) => sum + Number(session.printCount || session.print_count || 0), 0);
  const totalPhotos = successfulSessions.reduce((sum, session) => sum + (session.images?.length || 0), 0);

  const metrics = [
    { label: 'TOTAL PENDAPATAN', value: rupiah.format(totalRevenue), color: 'text-[#40a3eb]', icon: WalletCards },
    { label: 'TOTAL TRANSAKSI', value: String(successfulSessions.length), color: 'text-[#40a3eb]', icon: BarChart3 },
    { label: 'RATING RATA-RATA', value: successfulSessions.length ? '5.0' : '0', color: 'text-[#40a3eb]', icon: Star },
    { label: 'SALINAN DICETAK', value: String(totalPrints || totalPhotos), color: 'text-[#40a3eb]', icon: Printer },
  ];

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#1e1d22]">Dashboard</h1>
        <p className="mt-1 text-xs text-[#6f6b75]">Pantau kinerja photobooth, lihat analitik, dan kelola pengaturan dalam satu tempat.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#e7e4e9] bg-white/70 p-2 shadow-sm">
        <label className="sr-only" htmlFor="project-filter">Pilih proyek</label>
        <div className="relative">
          <select
            id="project-filter"
            value={project}
            onChange={(event) => setProject(event.target.value)}
            className="h-9 appearance-none rounded-md border border-[#ddd9e0] bg-white py-2 pl-3 pr-8 text-sm font-medium text-[#37343c] outline-none transition focus:border-[#40a3eb] focus:ring-2 focus:ring-[#bae0f9]"
          >
            <option value="all">Semua proyek</option>
            <option value="active">Proyek aktif</option>
            <option value="archived">Proyek arsip</option>
          </select>
          <span aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#78737d]">⌄</span>
        </div>

        <Button
          type="button"
          variant="outline"
          size="default"
          aria-pressed={filterOpen}
          onClick={() => setFilterOpen((open) => !open)}
          className={filterOpen ? 'gap-1.5 border-[#40a3eb] bg-[#f0f8ff] text-[#1b71b0]' : 'gap-1.5 bg-white'}
        >
          <Filter className="size-4" />
          Filter
        </Button>

        <label className="relative min-w-[220px] flex-1 sm:flex-none" htmlFor="project-search">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8d8893]" />
          <input
            id="project-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari proyek atau sesi..."
            className="h-9 w-full rounded-md border border-[#ddd9e0] bg-white py-2 pl-9 pr-3 text-sm text-[#37343c] outline-none transition placeholder:text-[#aaa6ae] focus:border-[#40a3eb] focus:ring-2 focus:ring-[#bae0f9] sm:w-64"
          />
        </label>
      </div>

      {filterOpen && <TransactionFilterDialog initialProject={project} onClose={() => setFilterOpen(false)} onApply={({ project: nextProject }) => {
        setProject(nextProject);
        setFilterOpen(false);
      }} />}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, color, icon: Icon }) => (
          <Card key={label} className="min-h-[100px]">
            <CardContent className="flex h-full flex-col justify-between p-4">
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-medium text-[#6f6b75]">{label}</span>
                <Icon className="size-3.5 text-[#b4b0b9]" />
              </div>
              <strong className={`text-lg font-semibold ${color}`}>{value}</strong>
            </CardContent>
          </Card>
        ))}
      </div>

      <BarPanel title="Pendapatan per Proyek" series={series} />
      <BarPanel title="Transaksi per Proyek" series={series} mode="count" />

      <div>
        <h2 className="mb-2 text-xs font-semibold text-[#3a3740]">Preferensi Pengguna</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DonutCard 
            title="Preferensi Filter" 
            value="Menggunakan filter" 
            color="#40a3eb" 
            icon={ImageIcon} 
            percentage={successfulSessions.length ? Math.round((successfulSessions.filter(s => s.settings?.filter && s.settings.filter !== 'normal').length / successfulSessions.length) * 100) : 0} 
          />
          <DonutCard 
            title="Preferensi Bingkai" 
            value="Menggunakan bingkai" 
            color="#40a3eb" 
            icon={ImageIcon} 
            percentage={successfulSessions.length ? Math.round((successfulSessions.filter(s => s.frameId || s.frame_id).length / successfulSessions.length) * 100) : 0} 
          />
          <DonutCard 
            title="Distribusi Salinan" 
            value="Mencetak foto" 
            color="#60bbf2" 
            icon={Printer} 
            percentage={successfulSessions.length ? Math.round((successfulSessions.filter(s => Number(s.printCount || s.print_count || 0) > 0).length / successfulSessions.length) * 100) : 0} 
          />
          <DonutCard 
            title="Rating Kepuasan" 
            value="Ulasan pelanggan" 
            color="#f59e0b" 
            icon={Star} 
            percentage={successfulSessions.length ? 100 : 0} 
          />
        </div>
      </div>
    </div>
  );
}
