import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "sonner"

function App() {
  // Add debug logging
  if (import.meta.env.DEV) {
    console.log('[App] Rendering App component');
  }
  
  return (
    <>
      <Pages />
      <Toaster 
        position="top-center"
        theme="dark"
        richColors
        expand={false}
        offset="120px"
        toastOptions={{
          style: {
            background: 'rgba(30, 41, 59, 0.75)',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            color: '#e0e7ff',
            backdropFilter: 'blur(12px)',
            fontWeight: '500',
          },
        }}
      />
    </>
  )
}

export default App
 