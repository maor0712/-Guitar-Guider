import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Home } from './pages/Home'
import { SongPage } from './pages/SongPage'
import { useRoute } from './router'

function App() {
  const [page, id] = useRoute()
  if (page === 'song' && id) return <SongPage key={id} id={id} />
  return <Home />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
