import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import ItemPicker from '../components/ItemPicker'
import DateRange from '../components/DateRange'
import PriceSummary from '../components/PriceSummary'
import ProofUpload from '../components/ProofUpload'

const INIT_INFO = { full_name: '', address: '', agency: '', needs: '', phone: '', email: '' }

const fmt = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

const inputCls =
  'w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 bg-white placeholder-gray-300'

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function Section({ number, title, children }) {
  return (
    <section className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
        <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
          {number}
        </span>
        <h2 className="font-semibold text-gray-700 text-sm">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

export default function OrderForm() {
  const [items, setItems]             = useState([])
  const [quantities, setQuantities]   = useState({})
  const [info, setInfo]               = useState(INIT_INFO)
  const [dates, setDates]             = useState({ borrowDate: '', returnDate: '' })
  const [proof, setProof]             = useState(null)
  const [availability, setAvailability] = useState(null)   // null = dates not set yet
  const [loadingAvail, setLoadingAvail] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [result, setResult]           = useState(null)
  const [error, setError]             = useState('')

  useEffect(() => {
    supabase.from('items').select('*').eq('is_active', true).order('name')
      .then(({ data }) => setItems(data ?? []))
  }, [])

  // Fetch live availability whenever both dates are set
  const fetchAvailability = useCallback(async (borrow, ret) => {
    if (!borrow || !ret) { setAvailability(null); return }
    setLoadingAvail(true)
    const { data } = await supabase.rpc('get_item_availability', {
      p_borrow_date: borrow,
      p_return_date: ret,
    })
    if (data) {
      const map = {}
      data.forEach(({ item_id, available_qty }) => { map[item_id] = available_qty })
      setAvailability(map)
      // Drop qty of any item that now exceeds available stock
      setQuantities((prev) => {
        const next = { ...prev }
        Object.keys(next).forEach((id) => {
          if (next[id] > (map[id] ?? 0)) next[id] = map[id] ?? 0
        })
        return next
      })
    }
    setLoadingAvail(false)
  }, [])

  const handleDates = (d) => {
    setDates(d)
    fetchAvailability(d.borrowDate, d.returnDate)
  }

  const days = dates.borrowDate && dates.returnDate
    ? Math.max(1, Math.floor((new Date(dates.returnDate) - new Date(dates.borrowDate)) / 86400000) + 1)
    : 0

  const selectedItems = items.filter((i) => (quantities[i.id] ?? 0) > 0)
  const totalPrice    = selectedItems.reduce((s, i) => s + i.price_per_day * quantities[i.id] * days, 0)

  const submit = async (e) => {
    e.preventDefault()
    setError('')

    if (!dates.borrowDate || !dates.returnDate) { setError('Pilih tanggal pinjam dan kembali.'); return }
    if (!selectedItems.length)                  { setError('Pilih minimal satu item.'); return }
    if (!proof)                                 { setError('Upload bukti pembayaran terlebih dahulu.'); return }

    // Re-check availability server-side to prevent race conditions
    const { data: freshAvail } = await supabase.rpc('get_item_availability', {
      p_borrow_date: dates.borrowDate,
      p_return_date: dates.returnDate,
    })
    if (freshAvail) {
      const availMap = {}
      freshAvail.forEach(({ item_id, available_qty }) => { availMap[item_id] = available_qty })
      const conflicts = selectedItems.filter((i) => quantities[i.id] > (availMap[i.id] ?? 0))
      if (conflicts.length) {
        setError(
          `Item berikut tidak tersedia di tanggal yang dipilih: ${conflicts.map((i) => i.name).join(', ')}.`
        )
        setAvailability(availMap)
        return
      }
    }

    setLoading(true)
    try {
      const ext  = proof.name.split('.').pop()
      const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('proof_of_payment').upload(path, proof)
      if (upErr) throw new Error('Gagal upload bukti: ' + upErr.message)

      const { data: urlData } = supabase.storage.from('proof_of_payment').getPublicUrl(path)

      const { data: userId, error: userErr } = await supabase.rpc('upsert_user', {
        p_full_name: info.full_name,
        p_email:     info.email || null,
        p_phone:     info.phone || null,
        p_address:   info.address,
        p_agency:    info.agency || null,
      })
      if (userErr) throw new Error('Gagal menyimpan data pengguna: ' + userErr.message)

      const { data: order, error: ordErr } = await supabase
        .from('orders')
        .insert({
          user_id:           userId,
          customer_name:     info.full_name,
          address:           info.address,
          agency:            info.agency || null,
          needs:             info.needs  || null,
          phone:             info.phone  || null,
          email:             info.email  || null,
          borrow_date:       dates.borrowDate,
          return_date:       dates.returnDate,
          total_price:       totalPrice,
          payment_proof_url: urlData.publicUrl,
        })
        .select('id, order_code')
        .single()
      if (ordErr) throw new Error('Gagal membuat pesanan: ' + ordErr.message)

      const lines = selectedItems.map((i) => ({
        order_id:      order.id,
        item_id:       i.id,
        quantity:      quantities[i.id],
        price_per_day: i.price_per_day,
        rental_days:   days,
      }))
      const { error: liErr } = await supabase.from('order_items').insert(lines)
      if (liErr) throw new Error('Gagal menyimpan item: ' + liErr.message)

      setResult({ orderCode: order.order_code, totalPrice })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Success screen ──────────────────────────────────────────────────
  if (result) {
    return (
      <div className="flex flex-col items-center text-center py-10 px-4">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-extrabold text-gray-800 mb-1">Pesanan Berhasil!</h2>
        <p className="text-gray-400 text-sm mb-8">Simpan kode berikut untuk cek status.</p>

        <div className="w-full max-w-xs bg-blue-600 rounded-3xl px-8 py-6 mb-6">
          <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">Kode Pesanan</p>
          <p className="text-3xl font-extrabold text-white tracking-widest">{result.orderCode}</p>
        </div>

        <div className="w-full max-w-xs bg-white border-2 border-gray-200 rounded-2xl px-6 py-4 mb-8">
          <p className="text-xs text-gray-400 mb-1">Total Pembayaran</p>
          <p className="text-xl font-extrabold text-gray-800">{fmt(result.totalPrice)}</p>
        </div>

        <p className="text-sm text-gray-500 mb-6 max-w-xs">
          Admin akan memverifikasi pembayaran. Cek status di halaman <strong>Lacak</strong>.
        </p>
        <button
          onClick={() => {
            setResult(null)
            setInfo(INIT_INFO)
            setQuantities({})
            setDates({ borrowDate: '', returnDate: '' })
            setProof(null)
            setAvailability(null)
          }}
          className="w-full max-w-xs bg-blue-600 text-white font-bold py-4 rounded-2xl text-base active:scale-95 transition-transform"
        >
          Buat Pesanan Baru
        </button>
      </div>
    )
  }

  const summarySection = selectedItems.length > 0 && days > 0

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="pt-2 pb-1">
        <h1 className="text-2xl font-extrabold text-gray-800">Form Peminjaman</h1>
        <p className="text-gray-400 text-sm mt-1">Isi data lengkap dan pilih peralatan.</p>
      </div>

      {/* 1 — Customer info */}
      <Section number="1" title="Data Peminjam">
        <div className="space-y-3">
          <Field label="Nama Lengkap" required>
            <input className={inputCls} placeholder="Nama sesuai KTP" value={info.full_name} required
              onChange={(e) => setInfo({ ...info, full_name: e.target.value })} />
          </Field>
          <Field label="No. HP / WA" required>
            <input className={inputCls} type="tel" placeholder="08xxxxxxxxxx" value={info.phone} required
              onChange={(e) => setInfo({ ...info, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <input className={inputCls} type="email" placeholder="email@contoh.com" value={info.email}
              onChange={(e) => setInfo({ ...info, email: e.target.value })} />
          </Field>
          <Field label="Instansi / Organisasi">
            <input className={inputCls} placeholder="Nama instansi (opsional)" value={info.agency}
              onChange={(e) => setInfo({ ...info, agency: e.target.value })} />
          </Field>
          <Field label="Alamat" required>
            <textarea className={inputCls + ' resize-none'} rows={2} placeholder="Alamat lengkap"
              value={info.address} required onChange={(e) => setInfo({ ...info, address: e.target.value })} />
          </Field>
          <Field label="Keperluan / Acara">
            <textarea className={inputCls + ' resize-none'} rows={2} placeholder="Misal: seminar, wedding, dll"
              value={info.needs} onChange={(e) => setInfo({ ...info, needs: e.target.value })} />
          </Field>
        </div>
      </Section>

      {/* 2 — Dates (before items so availability loads) */}
      <Section number="2" title="Tanggal Peminjaman">
        <DateRange {...dates} onChange={handleDates} />
        {loadingAvail && (
          <p className="text-xs text-gray-400 mt-2">Memeriksa ketersediaan...</p>
        )}
      </Section>

      {/* 3 — Items */}
      <Section number="3" title="Pilih Peralatan">
        {!dates.borrowDate || !dates.returnDate
          ? <p className="text-sm text-gray-400">Pilih tanggal terlebih dahulu untuk melihat ketersediaan stok.</p>
          : <ItemPicker items={items} quantities={quantities} onChange={setQuantities} availability={availability} />
        }
      </Section>

      {/* 4 — Summary */}
      {summarySection && (
        <Section number="4" title="Ringkasan Biaya">
          <PriceSummary items={items} quantities={quantities} days={days} />
        </Section>
      )}

      {/* 5 — Proof */}
      <Section number={summarySection ? '5' : '4'} title="Bukti Pembayaran">
        <ProofUpload file={proof} onChange={setProof} />
      </Section>

      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl px-4 py-3 text-sm text-red-600 font-medium">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-extrabold py-4 rounded-2xl text-base transition-all disabled:opacity-60 shadow-lg shadow-blue-200"
      >
        {loading ? 'Mengirim pesanan...' : 'Kirim Pesanan'}
      </button>
    </form>
  )
}
