import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import pulsoLogo from '../../../resources/logo-pulso-260.png'

const existingFavicon = document.querySelector("link[rel='icon']")

if (existingFavicon) {
  existingFavicon.setAttribute('href', pulsoLogo)
  existingFavicon.setAttribute('type', 'image/png')
} else {
  const favicon = document.createElement('link')
  favicon.rel = 'icon'
  favicon.type = 'image/png'
  favicon.href = pulsoLogo
  document.head.appendChild(favicon)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
