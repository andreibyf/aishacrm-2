/* eslint-disable react-refresh/only-export-components */
import { useEffect } from 'react'; // Removed unused React and useState

export function MCPManager() {
  // const [isReady, setIsReady] = useState(false); // UNUSED: isReady state not used

  useEffect(() => {
    const initMCP = async () => {
      try {
        if (window.mcpClient) {
          // setIsReady(true); // UNUSED: isReady state not used
          return;
        }

        window.mcpClient = {
          initialized: true,
          ready: true
        };
        
        // setIsReady(true); // UNUSED: isReady state not used
      } catch (error) {
        console.error('MCP initialization failed:', error);
      }
    };

    initMCP();
  }, []);

  return null;
}

export function useMCPClient() {
  return {
    isReady: !!window.mcpClient,
    client: window.mcpClient
  };
}