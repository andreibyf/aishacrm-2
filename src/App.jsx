import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as Sonner } from "@/components/ui/sonner"

function App() {
  // Add debug logging
  if (import.meta.env.DEV) {
    console.log('[App] Rendering App component');
  }
  
  return (
    <>
      <Pages />
      <Toaster />
      <Sonner />
    </>
  )
}

export default App 