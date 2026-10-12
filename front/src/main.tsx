import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isKioskMode } from './constants/app'

if (isKioskMode()) {
  document.documentElement.classList.add('kiosk')
  document.body.classList.add('kiosk')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
