import { Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import {Login} from './pages/admin/login.jsx'
import {Dashboard} from './pages/admin/dashboard.jsx'
import {DashboardEstudiante} from './pages/estudiante/DashboardEstudiante.jsx'
import {RegistroEstudiante} from './pages/estudiante/RegistroEstudiante.jsx'
import {AdminDashboard} from './pages/admin/AdminDashboard.jsx'
import {ToastHost} from './components/dashboard/Toast.jsx'
import authService from './services/authService'

// Solo entra quien tiene un JWT emitido por el servidor; si el token expira,
// authFetch lo descarta en el primer 401 y esta guardia devuelve al login.
function ProtectedRoute({ children }) {
  if (!authService.isAuthenticated()) {
    return <Navigate to="/" replace />
  }
  return children
}

// Con sesión abierta, "/" no debe pintar el formulario de acceso (SPEC-021
// P0-2). Es la pantalla donde aterriza el botón Atrás del navegador desde el
// panel, y ver el login teniendo la sesión viva se lee como "me echó de la
// aplicación" — sobre todo para un niño de 6-9 años.
//
// `replace`: la entrada de "/" se sustituye en vez de apilarse, así que no se
// crea un bucle del que el usuario no pueda salir con Atrás.
//
// "/registro" NO lleva esta guardia a propósito: en una tablet compartida, el
// siguiente niño tiene que poder darse de alta aunque el anterior no cerrara
// sesión.
function RutaDeAcceso({ children }) {
  if (authService.isAuthenticated()) {
    return <Navigate to="/dashboard" replace />
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
    <>
      <Routes>
        <Route path="/" element={<RutaDeAcceso><Login /></RutaDeAcceso>} />
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
      {/* Notificaciones transitorias (SPEC-018 Fase 4): un solo host para
          toda la app; sobrevive a la navegación interna de la SPA. */}
      <ToastHost />
    </>
  )
}

export default App
