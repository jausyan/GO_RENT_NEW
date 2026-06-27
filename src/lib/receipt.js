import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import logoUrl from '../img/jmmi.png'

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

const fmtMoney = (n) =>
  'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n)

const BLUE  = [37, 99, 235]
const GREEN = [22, 163, 74]
const GRAY  = [107, 114, 128]
const LGRAY = [248, 250, 252]

// Load an image URL into a base64 data URL so jsPDF can embed it.
async function toDataUrl(url) {
  const res  = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
}

export async function generateReceipt(order, lines) {
  const logoData = await toDataUrl(logoUrl)
  const doc    = new jsPDF({ unit: 'mm', format: 'a4' })
  const W      = doc.internal.pageSize.getWidth()
  const H      = doc.internal.pageSize.getHeight()
  const margin = 18

  // ── Header bar ────────────────────────────────────────────────────
  doc.setFillColor(...BLUE)
  doc.rect(0, 0, W, 38, 'F')

  // Logo (white background circle so PNG transparency looks clean on blue)
  const logoSize = 14
  const logoX    = margin
  const logoY    = 4
  doc.setFillColor(255, 255, 255)
  doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 1, 'F')
  doc.addImage(logoData, 'PNG', logoX, logoY, logoSize, logoSize)

  // Title to the right of logo
  const textX = margin + logoSize + 4
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('GO-RENT', textX, 13)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text('Layanan Sewa Peralatan Elektronik', textX, 20)

  // Receipt label + code on the right
  doc.setFontSize(8)
  doc.text('KUITANSI PEMBAYARAN', W - margin, 12, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(order.order_code, W - margin, 22, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(200, 220, 255)
  doc.text('Dicetak: ' + fmtDate(new Date().toISOString()), W - margin, 30, { align: 'right' })
  doc.setTextColor(0, 0, 0)

  // ── Customer + period block ────────────────────────────────────────
  let y = 48
  const half = W / 2

  // Left column label
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GRAY)
  doc.text('DATA PEMINJAM', margin, y)
  doc.text('PERIODE SEWA', half + 4, y)
  doc.setTextColor(0)

  y += 5
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(order.customer_name, margin, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(fmtDate(order.borrow_date), half + 4, y)

  y += 5
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  if (order.agency) doc.text(order.agency, margin, y)
  doc.text('s/d  ' + fmtDate(order.return_date), half + 4, y)

  y += 5
  if (order.phone) doc.text('HP: ' + order.phone, margin, y)
  doc.setFont('helvetica', 'bold')
  doc.text(order.rental_days + ' hari', half + 4, y)
  doc.setFont('helvetica', 'normal')

  y += 5
  if (order.address) {
    const addrLines = doc.splitTextToSize('Alamat: ' + order.address, half - margin - 4)
    doc.text(addrLines, margin, y)
    y += addrLines.length * 4.5
  } else {
    y += 4
  }

  if (order.needs) {
    doc.setTextColor(...GRAY)
    const needsLines = doc.splitTextToSize('Keperluan: ' + order.needs, W - margin * 2)
    doc.text(needsLines, margin, y)
    doc.setTextColor(0)
    y += needsLines.length * 4.5
  }

  y += 4

  // Thin divider
  doc.setDrawColor(220, 228, 240)
  doc.setLineWidth(0.3)
  doc.line(margin, y - 2, W - margin, y - 2)

  // ── Items table ───────────────────────────────────────────────────
  const rows = lines.map((l, i) => [
    i + 1,
    l.items?.name ?? '-',
    l.quantity,
    l.rental_days,
    fmtMoney(l.price_per_day),
    fmtMoney(l.subtotal),
  ])

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['No', 'Nama Item', 'Qty', 'Hari', 'Harga / Hari', 'Subtotal']],
    body: rows,
    styles: {
      fontSize: 9,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      textColor: [30, 30, 30],
    },
    headStyles: {
      fillColor: BLUE,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    alternateRowStyles: { fillColor: LGRAY },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto'               },
      2: { cellWidth: 13, halign: 'center' },
      3: { cellWidth: 13, halign: 'center' },
      4: { cellWidth: 34, halign: 'right'  },
      5: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
    },
    tableLineColor: [220, 228, 240],
    tableLineWidth: 0.2,
  })

  y = doc.lastAutoTable.finalY

  // ── Total bar ─────────────────────────────────────────────────────
  doc.setFillColor(...BLUE)
  doc.rect(margin, y, W - margin * 2, 11, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('TOTAL PEMBAYARAN', margin + 4, y + 7.2)
  doc.setFontSize(11)
  doc.text(fmtMoney(order.total_price), W - margin - 4, y + 7.2, { align: 'right' })
  doc.setTextColor(0)

  y += 20

  // ── Approved stamp ────────────────────────────────────────────────
  const stampX = W - margin - 52
  doc.setDrawColor(...GREEN)
  doc.setLineWidth(1.2)
  doc.roundedRect(stampX, y - 7, 52, 18, 2, 2, 'S')
  doc.setTextColor(...GREEN)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('DISETUJUI', stampX + 26, y + 2, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  if (order.reviewed_at) {
    doc.text(fmtDate(order.reviewed_at), stampX + 26, y + 8, { align: 'center' })
  }
  doc.setTextColor(0)

  // Note next to stamp
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('Pesanan ini telah diverifikasi', margin, y + 1)
  doc.text('oleh admin GO-RENT.', margin, y + 6)
  doc.setTextColor(0)

  // ── Footer ────────────────────────────────────────────────────────
  doc.setFillColor(...LGRAY)
  doc.rect(0, H - 16, W, 16, 'F')
  doc.setDrawColor(220, 228, 240)
  doc.setLineWidth(0.3)
  doc.line(0, H - 16, W, H - 16)
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('Terima kasih telah menggunakan GO-RENT', W / 2, H - 9, { align: 'center' })
  doc.text('Dokumen ini digenerate otomatis — tidak memerlukan tanda tangan.', W / 2, H - 4, { align: 'center' })

  doc.save(`GO-RENT_${order.order_code}.pdf`)
}
