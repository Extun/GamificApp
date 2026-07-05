import { Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import {Login} from './pages/admin/login.jsx'
import {Dashboard} from './pages/admin/dashboard.jsx'
import {DashboardEstudiante} from './pages/estudiante/DashboardEstudiante.jsx'
import {RegistroEstudiante} from './pages/estudiante/RegistroEstudiante.jsx'
import {AdminDashboard} from './pages/admin/AdminDashboard.jsx'
import authService from './services/authService'

// Solo entra quien tiene un JWT emitido por el servidor; si el token expira,
// authFetch lo descarta en el primer 401 y esta guardia devuelve al login.
function ProtectedRoute({ children }) {
  if (!authService.isAuthenticated()) {
    return <Navigate to="/" replace />
  }
  return children
}

// Renderiza el panel según el rol que el servidor firmó en el token:
// gestión de cuentas (admin), autoría (docente) o aprendizaje (estudiante).
function DashboardPorRol() {
  const rol = authService.getRol()
  if (rol === 'admin') return <AdminDashboard />
  if (rol === 'docente') return <Dashboard />
  return <DashboardEstudiante />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/registro" element={<RegistroEstudiante />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPorRol />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
