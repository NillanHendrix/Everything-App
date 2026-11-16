import { Outlet } from 'react-router-dom'
import { AppPrefsProvider } from './AppPrefs'
import { Header } from './Header'

export function Layout() {
  return (
    <AppPrefsProvider>
      <Header />
      <main>
        <Outlet />
      </main>
    </AppPrefsProvider>
  )
}
