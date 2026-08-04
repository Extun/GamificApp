import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import {Login} from './pages/admin/login.jsx'
import {RegistroEstudiante} from './pages/estudiante/RegistroEstudiante.jsx'
import {ToastHost} from './components/dashboard/Toast.jsx'
import {GuardiaDeSesion} from './components/GuardiaDeSesion.jsx'
import authService from './services/authService'

// Los tres paneles se cargan BAJO DEMANDA, no en el arranque.
//
// Cada sesión usa exactamente uno de ellos, pero todos viajaban en el mismo
// archivo: un niño de segundo de básica descargaba —sobre la red de la
// escuela, antes de ver la pantalla de acceso— el editor de actividades del
// docente, los generadores de IA, el lector de Excel de la carga masiva y los
// módulos de administración que nunca va a abrir. El arranque es justo el
// momento en que el producto no puede permitirse ser lento.
//
// El login y el registro NO se dividen a propósito: son la primera pantalla,
// y diferirlos cambiaría un arranque grande por un arranque en blanco.
const Dashboard = lazy(() => import('./pages/admin/dashboard.jsx').then((m) => ({ default: m.Dashboard })))
const DashboardEstudiante = lazy(() => import('./pages/estudiante/DashboardEstudiante.jsx').then((m) => ({ default: m.DashboardEstudiante })))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard.jsx').then((m) => ({ default: m.AdminDashboard })))
const DescargarApp = lazy(() => import('./pages/DescargarApp.jsx').then((m) => ({ default: m.DescargarApp })))

// Espera de la carga diferida. Con la caché del navegador o una red decente no
// llega a verse; en la red de la escuela evita el susto de una pantalla en
// blanco sin explicación. No inventa una estética nueva: es el mismo fondo de
// la aplicación con un mensaje comprensible por un niño.
function CargandoPanel() {
  return (
    <div className="app-cargando" role="status">
      <span className="app-cargando-punto" aria-hidden="true" />
      <p>Preparando todo…</p>
    </div>
  )
}

// Solo entra quien tiene un JWT emitido por el servidor Y todavía vigente
// (SPEC-024: `isAuthenticated` mira `exp`, no solo que el token exista). Un
// token caducado ya no deja montar el panel, así que no hay panel fantasma
// esperando a que el primer 401 lo descubra.
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
      <Suspense fallback={<CargandoPanel />}>
        <Routes>
          <Route path="/" element={<RutaDeAcceso><Login /></RutaDeAcceso>} />
          <Route path="/registro" element={<RegistroEstudiante />} />
          {/* Pública y sin guardia: el docente o el revisor tiene que poder
              llegar a la descarga sin una cuenta y sin sesión abierta. */}
          <Route path="/descargar" element={<DescargarApp />} />
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
      </Suspense>
      {/* Notificaciones transitorias (SPEC-018 Fase 4): un solo host para
          toda la app; sobrevive a la navegación interna de la SPA. */}
      <ToastHost />
      {/* Vigilancia de la sesión (SPEC-024): explica y devuelve al acceso
          cuando caduca, y la renueva mientras la app se está usando. No
          pinta nada; va dentro del Router porque navega. */}
      <GuardiaDeSesion />
    </>
  )
}

export default App
