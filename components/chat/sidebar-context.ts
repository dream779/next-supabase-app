'use client'

import { createContext, useContext } from 'react'

type SidebarContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

export const SidebarContext = createContext<SidebarContextValue | null>(null)

export function useSidebar(): SidebarContextValue | null {
  return useContext(SidebarContext)
}
