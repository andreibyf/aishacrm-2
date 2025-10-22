import React, { useEffect, useState } from 'react';

export function MCPManager() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initMCP = async () => {
      try {
        if (window.mcpClient) {
          setIsReady(true);
          return;
        }

        window.mcpClient = {
          initialized: true,
          ready: true
        };
        
        setIsReady(true);
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