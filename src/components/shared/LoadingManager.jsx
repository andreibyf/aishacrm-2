/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useState } from "react";
import { Loader2 } from "lucide-react";

const LoadingContext = createContext();

export const LoadingProvider = ({ children }) => {
    const [loadingStates, setLoadingStates] = useState({});

    const setLoading = useCallback((key, isLoading) => {
        setLoadingStates((prev) => ({
            ...prev,
            [key]: isLoading,
        }));
    }, []);

    const isLoading = useCallback((key) => {
        return loadingStates[key] || false;
    }, [loadingStates]);

    const hasAnyLoading = useCallback(() => {
        return Object.values(loadingStates).some(Boolean);
    }, [loadingStates]);

    return (
        <LoadingContext.Provider
            value={{ setLoading, isLoading, hasAnyLoading }}
        >
            {children}
            {hasAnyLoading() && (
                <div className="fixed top-4 right-4 z-50">
                    <div className="bg-white rounded-lg shadow-lg p-3 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        <span className="text-sm text-slate-600">
                            Loading...
                        </span>
                    </div>
                </div>
            )}
        </LoadingContext.Provider>
    );
};

export const useLoading = () => {
    const context = useContext(LoadingContext);
    if (!context) {
        throw new Error("useLoading must be used within a LoadingProvider");
    }
    return context;
};
