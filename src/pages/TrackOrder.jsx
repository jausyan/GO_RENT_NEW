import { useState } from 'react'
import { supabase } from '../lib/supabase'

const fmt = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
const fmtDate = (d) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

const STATUS = {
  pending:  { label: 'Menunggu Verifikasi', cls: 'bg-yellow-50 border-yellow-300 text-yellow-800' },
  approved: { label: 'Disetujui',           cls: 'bg-green-50 border-green-300 text-green-800' },
  rejected: { label: 'Ditolak',             cls: 'bg-red-50 border-red-300 text-red-800' },
}

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  )
}

function DownloadReceiptButton({ order, lines }) {
  const [downloading, setDownloading] = useState(false)

  const download = async () => {
    setDownloading(true)
    // Lazy-load jsPDF only when needed — keeps initial bundle small
    const { generateReceipt } = await import('../lib/receipt')
    await generateReceipt(order, lines)
    setDownloading(false)
  }

  return (
    <div className="px-5 pb-5">
      <button
        onClick={download}
        disabled={downloading}
        className="w-full border-2 border-blue-600 text-blue-600 font-bold py-3.5 rounded-2xl text-sm hover:bg-blue-600 hover:text-white active:scale-95 transition-all disabled:opacity-60"
      >
        {downloading ? 'Menyiapkan PDF...' : 'Download Kuitansi PDF'}
      </button>
    </div>
  )
}

export default function TrackOrder() {
  const [code, setCode]       = useState('')
  const [order, setOrder]     = useState(null)
  const [lines, setLines]     = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const search = async (e) => {
    e.preventDefault()
    setError('')
    setOrder(null)
    setLoading(true)
    try {
      const { data, error: err } = await supabase
        .from('orders')
        .select('*')
        .eq('order_code', code.trim().toUpperCase())
        .single()
      if (err || !data) { setError('Kode pesanan tidak ditemukan.'); setLoading(false); return }
      setOrder(data)
      const { data: items } = await supabase
        .from('order_items')
        .select('*, items(name)')
        .eq('order_id', data.id)
      setLines(items ?? [])
    } catch {
      setError('Terjadi kesalahan. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  const st = order ? STATUS[order.status] : null

  return (
    <div className="space-y-5">
      <div className="pt-2">
        <h1 className="text-2xl font-extrabold text-gray-800">Lacak Pesanan</h1>
        <p className="text-gray-400 text-sm mt-1">Masukkan kode pesanan untuk cek status.</p>
      </div>

      <form onSubmit={search} className="flex gap-2">
        <input
          className="flex-1 border-2 border-gray-200 rounded-2xl px-4 py-3.5 text-sm font-bold uppercase tracking-widest focus:outline-none focus:border-blue-400 placeholder-gray-300 placeholder:normal-case placeholder:font-normal placeholder:tracking-normal"
          placeholder="Masukkan kode pesanan"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-5 py-3.5 rounded-2xl text-sm font-bold hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-60 shrink-0"
        >
          {loading ? '...' : 'Cek'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl px-4 py-3 text-sm text-red-600 font-medium">
          {error}
        </div>
      )}

      {order && (
        <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden">
          {/* Status header */}
          <div className={`px-5 py-5 border-b-2 ${st.cls}`}>
            <p className="font-extrabold text-base">{st.label}</p>
            <p className="font-mono font-bold text-sm opacity-60 mt-0.5">{order.order_code}</p>
          </div>

          {/* Info */}
          <div className="px-5">
            <InfoRow label="Nama"        value={order.customer_name} />
            <InfoRow label="Instansi"    value={order.agency} />
            <InfoRow label="Keperluan"   value={order.needs} />
            <InfoRow label="Alamat"      value={order.address} />
            <InfoRow label="Tgl Pinjam"  value={fmtDate(order.borrow_date)} />
            <InfoRow label="Tgl Kembali" value={fmtDate(order.return_date)} />
            <InfoRow label="Durasi"      value={`${order.rental_days} hari`} />
          </div>

          {/* Items */}
          {lines.length > 0 && (
            <div className="px-5 pb-1 mt-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Item Dipinjam</p>
              <div className="space-y-2">
                {lines.map((l) => (
                  <div key={l.id} className="flex justify-between items-center bg-gray-50 rounded-xl px-3 py-2.5">
                    <span className="text-sm text-gray-700 font-medium">{l.items?.name} × {l.quantity}</span>
                    <span className="text-sm font-bold text-gray-800">{fmt(l.subtotal)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Total */}
          <div className="mx-5 my-4 flex justify-between items-center bg-blue-600 rounded-2xl px-4 py-4">
            <span className="font-bold text-white text-sm">Total</span>
            <span className="font-extrabold text-white text-lg">{fmt(order.total_price)}</span>
          </div>

          {/* Rejection note */}
          {order.status === 'rejected' && order.admin_note && (
            <div className="mx-5 mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-0.5">Catatan Admin</p>
              <p className="text-sm text-red-700">{order.admin_note}</p>
            </div>
          )}

          {/* Download receipt — approved orders only */}
          {order.status === 'approved' && (
            <DownloadReceiptButton order={order} lines={lines} />
          )}
        </div>
      )}
    </div>
  )
}
