import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { iniciarInstitucion } from './services/institucionService'
import { purgarSesionCaducada } from './services/authService'

// Una sesión ya caducada se descarta ANTES de montar React (SPEC-024): así el
// primer render ya sabe la verdad y se pinta el Login, en vez de entrar al
// panel del último rol y quedarse vacío esperando a que un 401 lo descubra.
purgarSesionCaducada()

// Identidad institucional (SPEC-002): colores, título y favicon desde la BD.
iniciarInstitucion()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
