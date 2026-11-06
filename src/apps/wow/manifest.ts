import { lazy } from 'react'
import type { AppManifest } from '../../registry/types'

const manifest: AppManifest = {
  id: 'wow',
  name: 'WoW Companion',
  icon: '⚔️',
  version: '1.1.1',
  order: 35,
  component: lazy(() => import('./App')),
}

export default manifest
