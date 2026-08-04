import { render } from 'preact'
import './index.css'
import { App } from './app.tsx'

render(<App />, document.getElementById('app')!)

// Shell cache only (public/sw.js) — makes the installed app open at the
// store, where the LAN API is unreachable. Prod only: HMR hates workers.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js')
}
