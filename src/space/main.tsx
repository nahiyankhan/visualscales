import { createRoot } from 'react-dom/client'
import { AtlasHome } from '../navigation/AtlasHome.js'
import SpaceAtlas from './SpaceAtlas.js'

createRoot(document.getElementById('root')!).render(
  <>
    <AtlasHome />
    <SpaceAtlas />
  </>
)
