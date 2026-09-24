import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { DialogId } from '../../core/ui'
import type { DialogProps } from './types'

export const DIALOGS: Record<DialogId, LazyExoticComponent<ComponentType<DialogProps>>> = {
  newLaunch: lazy(() => import('./NewLaunch')),
  sliders: lazy(() => import('./Sliders')),
  review: lazy(() => import('./Review')),
  postMortem: lazy(() => import('./PostMortem')),
  launchDetail: lazy(() => import('./LaunchDetail')),
  research: lazy(() => import('./Research')),
  staff: lazy(() => import('./Staff')),
  features: lazy(() => import('./Features')),
  office: lazy(() => import('./Office')),
  playbook: lazy(() => import('./Playbook')),
  finance: lazy(() => import('./Finance')),
  dayJob: lazy(() => import('./DayJob')),
  milestones: lazy(() => import('./Milestones')),
  settings: lazy(() => import('./Settings')),
}
