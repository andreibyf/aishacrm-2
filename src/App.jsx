import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"

function App() {
  // Add debug logging
  if (import.meta.env.DEV) {
    console.log('[App] Rendering App component');
  }
  
  return (
    <>
      <Pages />
      <Toaster />
    </>
  )
}

export default App 