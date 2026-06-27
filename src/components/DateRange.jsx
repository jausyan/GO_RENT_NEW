const today = () => new Date().toISOString().split('T')[0]

export default function DateRange({ borrowDate, returnDate, onChange }) {
  const days =
    borrowDate && returnDate
      ? Math.max(1, Math.floor((new Date(returnDate) - new Date(borrowDate)) / 86400000) + 1)
      : 0

  const inputCls =
    'w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 bg-white'

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
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
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
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
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <span className="text-sm text-blue-700">
            Durasi sewa: <span className="font-bold">{days} hari</span>
          </span>
        </div>
      )}
    </div>
  )
}
