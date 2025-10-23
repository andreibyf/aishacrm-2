import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"

function App() {
  // Add debug logging
  console.log('[App] Rendering App component');
  
  try {
    return (
      <>
        <Pages />
        <Toaster />
      </>
    )
  } catch (error) {
    console.error('[App] Error rendering:', error);
    return <div style={{padding: '20px', color: 'red'}}>
      <h1>Error in App</h1>
      <pre>{error.message}</pre>
    </div>;
  }
}

export default App 