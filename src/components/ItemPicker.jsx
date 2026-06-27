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
      <div className="text-center py-8 text-[#8b949e] text-sm">
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
              qty > 0         ? 'border-[#3fb950] bg-[#0f2d1a]'
              : unavailable   ? 'border-[#21262d] bg-[#161b22]'
              :                  'border-[#30363d] bg-[#161b22]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className={`font-semibold leading-snug ${unavailable ? 'text-[#484f58]' : 'text-[#e6edf3]'}`}>
                  {item.name}
                </p>
                {item.description && (
                  <p className="text-xs text-[#8b949e] mt-0.5 leading-relaxed">{item.description}</p>
                )}
              </div>
              {/* +/- stepper */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={unavailable || qty === 0}
                  onClick={() => set(item.id, qty - 1)}
                  className="w-9 h-9 rounded-full border-2 border-[#30363d] bg-[#21262d] text-[#e6edf3] font-bold text-xl leading-none flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform"
                >−</button>
                <span className={`w-7 text-center font-bold text-base ${unavailable ? 'text-[#484f58]' : 'text-[#e6edf3]'}`}>
                  {qty}
                </span>
                <button
                  type="button"
                  disabled={unavailable || qty >= avail}
                  onClick={() => set(item.id, qty + 1)}
                  className="w-9 h-9 rounded-full border-2 border-[#238636] bg-[#238636] text-white font-bold text-xl leading-none flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform"
                >+</button>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2.5">
              <span className={`text-sm font-bold ${unavailable ? 'text-[#8b949e]' : 'text-[#3fb950]'}`}>
                {fmt(item.price_per_day)}<span className="font-normal text-[#8b949e]"> / hari</span>
              </span>
              <span className={`text-xs font-medium ${
                unavailable         ? 'text-[#f85149]'
                : datesChosen       ? 'text-[#3fb950]'
                :                     'text-[#8b949e]'
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
        <p className="text-xs text-[#8b949e] pt-1">
          Ketersediaan ditampilkan berdasarkan tanggal yang dipilih.
        </p>
      )}
    </div>
  )
}
