const fmt = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

export default function PriceSummary({ items, quantities, days }) {
  const lines = items
    .filter((i) => (quantities[i.id] ?? 0) > 0)
    .map((i) => ({
      name:     i.name,
      qty:      quantities[i.id],
      ppd:      i.price_per_day,
      subtotal: i.price_per_day * quantities[i.id] * days,
    }))

  if (!lines.length || days === 0) return null

  const total = lines.reduce((s, l) => s + l.subtotal, 0)

  return (
    <div className="rounded-2xl border-2 border-[#30363d] bg-[#161b22] overflow-hidden">
      <div className="px-4 py-3 bg-[#21262d] border-b border-[#30363d]">
        <p className="text-xs font-bold text-[#8b949e] uppercase tracking-wide">Ringkasan Biaya</p>
      </div>
      <div className="divide-y divide-[#30363d]">
        {lines.map((l) => (
          <div key={l.name} className="px-4 py-3">
            <p className="text-sm text-[#e6edf3] font-medium">{l.name}</p>
            <div className="flex justify-between items-center mt-0.5">
              <p className="text-xs text-[#8b949e]">
                {l.qty} unit × {days} hari × {fmt(l.ppd)}
              </p>
              <p className="text-sm font-semibold text-[#f0f6fc]">{fmt(l.subtotal)}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center px-4 py-4 bg-[#238636]">
        <span className="font-bold text-white text-sm">Total Pembayaran</span>
        <span className="font-extrabold text-white text-lg">{fmt(total)}</span>
      </div>
    </div>
  )
}
