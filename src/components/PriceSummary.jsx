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
    <div className="rounded-2xl border-2 border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Ringkasan Biaya</p>
      </div>
      <div className="divide-y divide-gray-100">
        {lines.map((l) => (
          <div key={l.name} className="px-4 py-3">
            <p className="text-sm text-gray-700 font-medium">{l.name}</p>
            <div className="flex justify-between items-center mt-0.5">
              <p className="text-xs text-gray-400">
                {l.qty} unit × {days} hari × {fmt(l.ppd)}
              </p>
              <p className="text-sm font-semibold text-gray-800">{fmt(l.subtotal)}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center px-4 py-4 bg-blue-600">
        <span className="font-bold text-white text-sm">Total Pembayaran</span>
        <span className="font-extrabold text-white text-lg">{fmt(total)}</span>
      </div>
    </div>
  )
}
