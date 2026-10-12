import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { sampleData } from '../data/color/globe-data.js'
import { AtlasHome } from '../navigation/AtlasHome.js'
import { TokenSurface, type TokenSurfaceData } from './TokenSurface.js'

const queryToken = new URLSearchParams(window.location.search).get('token') ?? ''
const sampledTokenIds = new Set(sampleData.tokens.map(token => token.id))
const queryData: TokenSurfaceData | undefined = sampledTokenIds.has(queryToken)
  ? { meta: { name: sampleData.meta.name, homeId: queryToken }, tokens: sampleData.tokens }
  : undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AtlasHome />
    <TokenSurface data={queryData} />
  </StrictMode>
)
