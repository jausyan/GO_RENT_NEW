import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import OrderForm from './pages/OrderForm'
import TrackOrder from './pages/TrackOrder'
import Admin from './pages/Admin'
import logo from './img/jmmi.png'

// Admin is intentionally excluded — accessible only by typing /admin in the URL
const LINKS = [
  { to: '/',      end: true, label: 'Pesan' },
  { to: '/track',            label: 'Lacak' },
]

/* ── Top header (desktop) ── */
function TopNav() {
  const linkCls = ({ isActive }) =>
    `px-5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
      isActive ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
    }`
  return (
    <header className="hidden sm:block bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
      <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={logo} alt="JMMI" className="h-9 w-9 object-contain" />
          <span className="font-extrabold text-blue-600 text-xl tracking-tight">GO-RENT</span>
        </div>
        <nav className="flex gap-1">
          {LINKS.map(({ to, end, label }) => (
            <NavLink key={to} to={to} end={end} className={linkCls}>{label}</NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}

/* ── Bottom nav bar (mobile) ── */
function BottomNav() {
  const linkCls = ({ isActive }) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors ${
      isActive ? 'text-blue-600' : 'text-gray-400'
    }`
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="flex h-16">
        {LINKS.map(({ to, end, label }) => (
          <NavLink key={to} to={to} end={end} className={linkCls}>
            {({ isActive }) => (
              <>
                <span className={`text-[11px] font-semibold leading-none ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                  {label}
                </span>
                {isActive && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-blue-600 rounded-full" />}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

/* ── Mobile top bar ── */
function MobileHeader() {
  return (
    <header className="sm:hidden bg-white border-b border-gray-200 sticky top-0 z-20">
      <div className="px-4 h-14 flex items-center gap-3">
        <img src={logo} alt="JMMI" className="h-9 w-9 object-contain" />
        <span className="font-extrabold text-blue-600 text-lg tracking-tight">GO-RENT</span>
      </div>
    </header>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        {/* desktop top nav */}
        <TopNav />
        {/* mobile top logo bar */}
        <MobileHeader />

        <main className="max-w-2xl mx-auto px-4 py-5 pb-24 sm:pb-10">
          <Routes>
            <Route path="/" element={<OrderForm />} />
            <Route path="/track" element={<TrackOrder />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </main>

        {/* mobile bottom nav */}
        <BottomNav />
      </div>
    </BrowserRouter>
  )
}
