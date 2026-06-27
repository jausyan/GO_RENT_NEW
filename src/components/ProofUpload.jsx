import { useState } from 'react'

export default function ProofUpload({ file, onChange }) {
  const [preview, setPreview] = useState(null)

  const handle = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    onChange(f)
    setPreview(URL.createObjectURL(f))
  }

  return (
    <div>
      <label className="block text-xs font-bold text-[#8b949e] uppercase tracking-wide mb-2">
        Bukti Transfer <span className="text-[#f85149]">*</span>
      </label>
      <label className="flex flex-col items-center justify-center w-full border-2 border-dashed border-[#30363d] rounded-2xl cursor-pointer bg-[#161b22] active:bg-[#21262d] transition-colors overflow-hidden">
        {preview ? (
          <img src={preview} alt="preview" className="w-full max-h-56 object-contain" />
        ) : (
          <div className="py-8 px-4 text-center">
            <div className="w-12 h-12 rounded-full bg-[#21262d] flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-[#8b949e]">Tap untuk upload foto bukti</p>
            <p className="text-xs text-[#6e7681] mt-1">PNG, JPG — maks. 5 MB</p>
          </div>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={handle} required />
      </label>
      {file && (
        <p className="text-xs text-[#3fb950] mt-2 font-medium">
          {file.name} — siap diupload
        </p>
      )}
    </div>
  )
}
