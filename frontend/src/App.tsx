import { Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { SessionPage } from './pages/SessionPage'
import { Settings } from './pages/Settings'
import { SessionHistory } from './pages/SessionHistory'
import { CalendarPage } from './pages/CalendarPage'

export default function App() {
  return (
    <div className="flex h-screen bg-background text-text overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/session" element={<SessionPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/history" element={<SessionHistory />} />
        </Routes>
      </main>
    </div>
  )
}
