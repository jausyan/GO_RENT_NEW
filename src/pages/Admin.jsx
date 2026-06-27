import { useState, useEffect, useCallback } from 'react'
import bcrypt from 'bcryptjs'
import { supabase } from '../lib/supabase'

const fmt = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
const fmtDate = (d) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtTs = (d) =>
  new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const STATUS = {
  pending:  { label: 'Pending',    badge: 'bg-[#272115] text-[#d29922]' },
  approved: { label: 'Disetujui', badge: 'bg-[#0f2d1a] text-[#3fb950]'  },
  rejected: { label: 'Ditolak',   badge: 'bg-[#1c0a09] text-[#f85149]'  },
}

const inputCls =
  'w-full border-2 border-[#30363d] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#3fb950] bg-[#0d1117] text-[#e6edf3] placeholder-[#484f58]'

function extractStoragePath(url) {
  if (!url) return null
  const match = url.match(/proof_of_payment\/(.+?)(\?|$)/)
  return match ? match[1] : null
}

// ── Login ─────────────────────────────────────────────────────────────
function LoginForm({ onLogin }) {
  const [creds, setCreds]     = useState({ username: '', password: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data: hash, error: err } = await supabase.rpc('get_admin_hash', {
        p_username: creds.username,
      })
      if (err) throw err
      if (!hash) { setError('Username tidak ditemukan.'); return }
      const match = await bcrypt.compare(creds.password, hash)
      if (!match) { setError('Password salah.'); return }
      onLogin(creds.username)
    } catch (e) {
      setError(e?.message ?? 'Gagal menghubungi server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-2">
      <div className="w-full max-w-sm bg-[#161b22] rounded-3xl border-2 border-[#30363d] p-7 space-y-5 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-extrabold text-[#f0f6fc]">Admin Panel</h1>
          <p className="text-[#8b949e] text-sm mt-0.5">GO-RENT</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#8b949e] uppercase tracking-wide mb-1.5">Username</label>
            <input className={inputCls} value={creds.username} required autoComplete="username"
              onChange={(e) => setCreds({ ...creds, username: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#8b949e] uppercase tracking-wide mb-1.5">Password</label>
            <input className={inputCls} type="password" value={creds.password} required autoComplete="current-password"
              onChange={(e) => setCreds({ ...creds, password: e.target.value })} />
          </div>
          {error && (
            <p className="text-sm text-[#f85149] bg-[#1c0a09] border border-[#da3633] rounded-xl px-3 py-2.5">{error}</p>
          )}
          <button type="submit" disabled={loading}
            className="w-full bg-[#238636] hover:bg-[#2ea043] active:scale-95 text-white font-extrabold py-4 rounded-2xl text-base transition-all disabled:opacity-60">
            {loading ? 'Masuk...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Order Detail sheet ────────────────────────────────────────────────
function OrderSheet({ order, lines, adminUser, onClose, onStatusChange }) {
  const [note, setNote]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [proofUrl, setProofUrl] = useState(null)

  const st = STATUS[order.status]

  useEffect(() => {
    const path = extractStoragePath(order.payment_proof_url)
    if (!path) return
    supabase.storage
      .from('proof_of_payment')
      .createSignedUrl(path, 3600)
      .then(({ data }) => { if (data?.signedUrl) setProofUrl(data.signedUrl) })
  }, [order.payment_proof_url])

  const update = async (newStatus) => {
    setError('')
    setLoading(true)
    try {
      const { data, error: err } = await supabase.rpc('admin_update_order_status', {
        p_username: adminUser,
        p_order_id: order.id,
        p_status:   newStatus,
        p_note:     note.trim() || null,
      })
      if (err) throw err
      if (!data) { setError('Aksi ditolak. Sesi tidak valid.'); return }
      onStatusChange(order.id, newStatus, note.trim())
      onClose()
    } catch (e) {
      setError(e?.message ?? 'Terjadi kesalahan.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-[#161b22] w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[92vh] overflow-y-auto shadow-2xl border border-[#30363d]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* drag pill */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-[#30363d]" />
        </div>

        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
          <div>
            <p className="font-extrabold text-[#f0f6fc] tracking-widest text-base">{order.order_code}</p>
            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${st.badge}`}>
              {st.label}
            </span>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#21262d] hover:bg-[#30363d] flex items-center justify-center text-[#8b949e] font-bold text-base active:scale-95 transition-all">
            X
          </button>
        </div>

        {/* info rows */}
        <div className="px-5 py-4 space-y-0 text-sm divide-y divide-[#30363d]">
          {[
            ['Nama',         order.customer_name],
            ['Phone',        order.phone],
            ['Email',        order.email],
            ['Instansi',     order.agency],
            ['Alamat',       order.address],
            ['Keperluan',    order.needs],
            ['Tgl Pinjam',   fmtDate(order.borrow_date)],
            ['Tgl Kembali',  fmtDate(order.return_date)],
            ['Durasi',       `${order.rental_days} hari`],
            ['Dikirim',      fmtTs(order.created_at)],
          ].filter(([, v]) => v).map(([label, value]) => (
            <div key={label} className="flex gap-2 py-2">
              <span className="text-[#8b949e] w-24 shrink-0 font-medium">{label}</span>
              <span className="text-[#e6edf3] break-all">{value}</span>
            </div>
          ))}
        </div>

        {/* items */}
        {lines.length > 0 && (
          <div className="px-5 pb-4">
            <p className="text-xs font-bold text-[#8b949e] uppercase tracking-wide mb-2">Item</p>
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.id} className="flex justify-between items-center bg-[#21262d] rounded-xl px-3 py-2.5">
                  <span className="text-sm text-[#e6edf3]">{l.items?.name} × {l.quantity} × {l.rental_days}h</span>
                  <span className="text-sm font-bold text-[#f0f6fc]">{fmt(l.subtotal)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* total */}
        <div className="mx-5 mb-4 flex justify-between items-center bg-[#238636] rounded-2xl px-4 py-4">
          <span className="font-bold text-white text-sm">Total</span>
          <span className="font-extrabold text-white text-lg">{fmt(order.total_price)}</span>
        </div>

        {/* proof image */}
        <div className="px-5 pb-5">
          <p className="text-xs font-bold text-[#8b949e] uppercase tracking-wide mb-2">Bukti Pembayaran</p>
          {proofUrl ? (
            <a href={proofUrl} target="_blank" rel="noreferrer">
              <img
                src={proofUrl}
                alt="bukti pembayaran"
                className="w-full rounded-2xl border-2 border-[#30363d] object-contain max-h-60 active:opacity-80 transition-opacity"
              />
            </a>
          ) : order.payment_proof_url ? (
            <div className="w-full rounded-2xl border-2 border-dashed border-[#30363d] h-24 flex items-center justify-center text-[#8b949e] text-sm">
              Memuat bukti pembayaran...
            </div>
          ) : (
            <div className="w-full rounded-2xl border-2 border-dashed border-[#30363d] h-24 flex items-center justify-center text-[#8b949e] text-sm">
              Tidak ada bukti pembayaran
            </div>
          )}
        </div>

        {/* actions — only if pending */}
        {order.status === 'pending' && (
          <div className="px-5 pb-7 space-y-3 border-t border-[#30363d] pt-4">
            <div>
              <label className="block text-xs font-bold text-[#8b949e] uppercase tracking-wide mb-1.5">
                Catatan (opsional)
              </label>
              <textarea
                className="w-full border-2 border-[#30363d] rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-[#3fb950] bg-[#0d1117] text-[#e6edf3] placeholder-[#484f58]"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Alasan penolakan atau catatan..."
              />
            </div>
            {error && (
              <p className="text-sm text-[#f85149] bg-[#1c0a09] rounded-xl px-3 py-2.5 border border-[#da3633]">{error}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => update('approved')} disabled={loading}
                className="bg-[#238636] hover:bg-[#2ea043] active:scale-95 text-white font-extrabold py-4 rounded-2xl text-sm transition-all disabled:opacity-60">
                Setujui
              </button>
              <button onClick={() => update('rejected')} disabled={loading}
                className="bg-[#da3633] hover:bg-[#b91c1c] active:scale-95 text-white font-extrabold py-4 rounded-2xl text-sm transition-all disabled:opacity-60">
                Tolak
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────
export default function Admin() {
  const [adminUser, setAdminUser] = useState(() => sessionStorage.getItem('go_rent_admin'))
  const [orders, setOrders]       = useState([])
  const [loading, setLoading]     = useState(false)
  const [filter, setFilter]       = useState('pending')
  const [selected, setSelected]   = useState(null)
  const [lines, setLines]         = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    const q = supabase.from('orders').select('*').order('created_at', { ascending: false })
    if (filter !== 'all') q.eq('status', filter)
    const { data } = await q
    setOrders(data ?? [])
    setLoading(false)
  }, [filter])

  useEffect(() => { if (adminUser) load() }, [adminUser, load])

  const login = (username) => {
    sessionStorage.setItem('go_rent_admin', username)
    setAdminUser(username)
  }
  const logout = () => {
    sessionStorage.removeItem('go_rent_admin')
    setAdminUser(null)
  }

  const openOrder = async (order) => {
    setSelected(order)
    const { data } = await supabase.from('order_items').select('*, items(name)').eq('order_id', order.id)
    setLines(data ?? [])
  }

  const handleStatusChange = (id, status, note) => {
    setOrders((prev) =>
      prev.map((o) => o.id === id ? { ...o, status, admin_note: note, reviewed_at: new Date().toISOString() } : o)
    )
  }

  if (!adminUser) return <LoginForm onLogin={login} />

  const FILTERS = [
    { key: 'pending',  label: 'Pending'   },
    { key: 'approved', label: 'Disetujui' },
    { key: 'rejected', label: 'Ditolak'   },
    { key: 'all',      label: 'Semua'     },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-extrabold text-[#f0f6fc]">Admin Panel</h1>
          <p className="text-[#8b949e] text-xs mt-0.5">Login sebagai <strong>{adminUser}</strong></p>
        </div>
        <button
          onClick={logout}
          className="text-xs font-semibold text-[#8b949e] border-2 border-[#30363d] px-4 py-2 rounded-xl hover:border-[#da3633] hover:text-[#f85149] active:scale-95 transition-all"
        >
          Keluar
        </button>
      </div>

      {/* filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
              filter === f.key
                ? 'bg-[#238636] text-white shadow-sm'
                : 'bg-[#21262d] text-[#8b949e] hover:bg-[#30363d]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-center text-[#8b949e] text-sm py-8">Memuat...</p>}

      {!loading && orders.length === 0 && (
        <div className="text-center py-16">
          <p className="text-[#8b949e] text-sm">Tidak ada pesanan.</p>
        </div>
      )}

      <div className="space-y-3">
        {orders.map((o) => {
          const st = STATUS[o.status]
          return (
            <button
              key={o.id}
              onClick={() => openOrder(o)}
              className="w-full text-left bg-[#161b22] border-2 border-[#30363d] rounded-2xl px-4 py-4 hover:border-[#3fb950] active:scale-[0.98] transition-all shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-extrabold text-[#f0f6fc] tracking-wide text-sm">{o.order_code}</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.badge}`}>
                      {st.label}
                    </span>
                  </div>
                  <p className="text-sm text-[#e6edf3] mt-1 truncate">{o.customer_name}</p>
                  {o.agency && <p className="text-xs text-[#8b949e] truncate">{o.agency}</p>}
                  <p className="text-xs text-[#8b949e] mt-1">{fmtTs(o.created_at)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-extrabold text-[#f0f6fc]">{fmt(o.total_price)}</p>
                  <p className="text-xs text-[#8b949e] mt-1">{o.rental_days} hari</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {selected && (
        <OrderSheet
          order={selected}
          lines={lines}
          adminUser={adminUser}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
