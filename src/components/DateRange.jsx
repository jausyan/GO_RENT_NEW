const today = () => new Date().toISOString().split('T')[0]

export default function DateRange({ borrowDate, returnDate, onChange }) {
  const days =
    borrowDate && returnDate
      ? Math.max(1, Math.floor((new Date(returnDate) - new Date(borrowDate)) / 86400000) + 1)
      : 0

  const inputCls =
    'w-full border-2 border-[#30363d] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#3fb950] bg-[#0d1117] text-[#e6edf3]'

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-[#8b949e] uppercase tracking-wide mb-1.5">
            Tgl Pinjam
          </label>
          <input
            type="date"
            min={today()}
            value={borrowDate}
            onChange={(e) => {
              const d = e.target.value
              onChange({ borrowDate: d, returnDate: returnDate < d ? d : returnDate })
            }}
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#8b949e] uppercase tracking-wide mb-1.5">
            Tgl Kembali
          </label>
          <input
            type="date"
            min={borrowDate || today()}
            value={returnDate}
            onChange={(e) => onChange({ borrowDate, returnDate: e.target.value })}
            className={inputCls}
            required
          />
        </div>
      </div>
      {days > 0 && (
        <div className="bg-[#0f2d1a] border border-[#238636] rounded-xl px-4 py-3">
          <span className="text-sm text-[#3fb950]">
            Durasi sewa: <span className="font-bold">{days} hari</span>
          </span>
        </div>
      )}
    </div>
  )
}
