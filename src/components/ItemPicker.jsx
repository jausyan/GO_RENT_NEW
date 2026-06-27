const fmt = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

// availability: { [item_id]: available_qty } — null means dates not chosen yet
export default function ItemPicker({ items, quantities, onChange, availability }) {
  const set = (id, val) => {
    const qty = Math.max(0, parseInt(val) || 0)
    onChange({ ...quantities, [id]: qty })
  }

  if (!items.length) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        Memuat katalog...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const qty          = quantities[item.id] ?? 0
        // If dates are chosen, use live availability; otherwise fall back to stock
        const avail        = availability ? (availability[item.id] ?? 0) : item.stock
        const unavailable  = avail <= 0
        const datesChosen  = availability !== null

        return (
          <div
            key={item.id}
            className={`rounded-2xl border-2 p-4 transition-all ${
              qty > 0         ? 'border-blue-400 bg-blue-50'
              : unavailable   ? 'border-gray-100 bg-gray-50'
              :                  'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className={`font-semibold leading-snug ${unavailable ? 'text-gray-400' : 'text-gray-800'}`}>
                  {item.name}
                </p>
                {item.description && (
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.description}</p>
                )}
              </div>
              {/* +/- stepper */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={unavailable || qty === 0}
                  onClick={() => set(item.id, qty - 1)}
                  className="w-9 h-9 rounded-full border-2 border-gray-300 bg-white text-gray-700 font-bold text-xl leading-none flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform"
                >−</button>
                <span className={`w-7 text-center font-bold text-base ${unavailable ? 'text-gray-300' : 'text-gray-800'}`}>
                  {qty}
                </span>
                <button
                  type="button"
                  disabled={unavailable || qty >= avail}
                  onClick={() => set(item.id, qty + 1)}
                  className="w-9 h-9 rounded-full border-2 border-blue-500 bg-blue-500 text-white font-bold text-xl leading-none flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform"
                >+</button>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2.5">
              <span className={`text-sm font-bold ${unavailable ? 'text-gray-400' : 'text-blue-600'}`}>
                {fmt(item.price_per_day)}<span className="font-normal text-gray-400"> / hari</span>
              </span>
              <span className={`text-xs font-medium ${
                unavailable         ? 'text-red-400'
                : datesChosen       ? 'text-green-600'
                :                     'text-gray-400'
              }`}>
                {unavailable
                  ? (datesChosen ? 'Tidak tersedia di tanggal ini' : 'Stok habis')
                  : datesChosen
                    ? `Tersedia ${avail} unit`
                    : `Stok: ${item.stock}`}
              </span>
            </div>
          </div>
        )
      })}

      {availability !== null && (
        <p className="text-xs text-gray-400 pt-1">
          Ketersediaan ditampilkan berdasarkan tanggal yang dipilih.
        </p>
      )}
    </div>
  )
}
