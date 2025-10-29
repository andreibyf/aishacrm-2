import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Play, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Clock,
  FileText
} from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';

export default function TestRunner({ testSuites }) {
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState(null);
  const [preflight, setPreflight] = useState({ status: 'unknown', message: null, database: 'unknown' });
  const [checking, setChecking] = useState(true);

  const runTests = async () => {
    setRunning(true);
    setResults([]);
    
    const allResults = [];

    for (const suite of testSuites) {
      for (const test of suite.tests) {
        setCurrentTest(`${suite.name} - ${test.name}`);
        
        const startTime = Date.now();
        let result = {
          suite: suite.name,
          test: test.name,
          status: 'running',
          duration: 0,
          error: null
        };

        try {
          await test.fn();
          result.status = 'passed';
          result.duration = Date.now() - startTime;
        } catch (error) {
          result.status = 'failed';
          result.duration = Date.now() - startTime;
          result.error = error.message;
        }

        allResults.push(result);
        setResults([...allResults]);
      }
    }

    setCurrentTest(null);
    setRunning(false);
  };

  const totalTests = testSuites.reduce((sum, suite) => sum + suite.tests.length, 0);
  const passedTests = results.filter(r => r.status === 'passed').length;
  const failedTests = results.filter(r => r.status === 'failed').length;
  const passRate = totalTests > 0 ? ((passedTests / results.length) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center justify-between">
            <span>Test Suite Runner</span>
            <div className="flex items-center gap-2">
              <Button
                onClick={async () => {
                  setChecking(true);
                  try {
                    let resp = await fetch(`${BACKEND_URL}/api/status`);
                    if (!resp.ok) throw new Error(`Status ${resp.status}`);
                    const data = await resp.json();
                    const db = data?.services?.database || 'unknown';
                    setPreflight({ status: 'ok', message: data?.message || 'Backend online', database: db });
                  } catch (e1) {
                    try {
                      const resp = await fetch(`${BACKEND_URL}/health`);
                      if (!resp.ok) throw new Error(`Status ${resp.status}`);
                      const data = await resp.json();
                      setPreflight({ status: 'ok', message: 'Backend online', database: data?.database || 'unknown' });
                    } catch (e2) {
                      setPreflight({ status: 'error', message: `Backend not reachable at ${BACKEND_URL}`, database: 'unknown' });
                    }
                  } finally {
                    setChecking(false);
                  }
                }}
                variant="outline"
                className="bg-slate-700 border-slate-600"
                disabled={checking}
              >
                {checking ? <Clock className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Check Backend
              </Button>
              <Button 
                onClick={runTests} 
                disabled={running || checking || preflight.status !== 'ok'}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {running ? (
                  <>
                    <Clock className="w-4 h-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Run All Tests
                  </>
                )}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Preflight banner */}
          {checking ? (
            <Alert className="mb-4 bg-blue-900/30 border-blue-700">
              <Clock className="h-4 w-4 animate-spin" />
              <AlertDescription className="text-blue-300">Checking backend status…</AlertDescription>
            </Alert>
          ) : preflight.status !== 'ok' ? (
            <Alert className="mb-4 bg-red-900/30 border-red-700">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <AlertDescription className="text-red-300">
                {preflight.message}. Tests are disabled until the backend is reachable.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="mb-4 bg-green-900/30 border-green-700">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              <AlertDescription className="text-green-300">
                Backend online (database: {preflight.database}). You can run the tests.
              </AlertDescription>
            </Alert>
          )}

          {running && currentTest && (
            <Alert className="mb-4 bg-blue-900/30 border-blue-700">
              <Clock className="h-4 w-4 animate-spin" />
              <AlertDescription className="text-blue-300">
                Running: {currentTest}
              </AlertDescription>
            </Alert>
          )}

          {results.length > 0 && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <Card className="bg-slate-700 border-slate-600">
                <CardContent className="p-4">
                  <div className="text-sm text-slate-400">Total Tests</div>
                  <div className="text-2xl font-bold text-slate-100">{results.length}</div>
                </CardContent>
              </Card>
              <Card className="bg-green-900/30 border-green-700">
                <CardContent className="p-4">
                  <div className="text-sm text-green-400">Passed</div>
                  <div className="text-2xl font-bold text-green-300">{passedTests}</div>
                </CardContent>
              </Card>
              <Card className="bg-red-900/30 border-red-700">
                <CardContent className="p-4">
                  <div className="text-sm text-red-400">Failed</div>
                  <div className="text-2xl font-bold text-red-300">{failedTests}</div>
                </CardContent>
              </Card>
              <Card className="bg-blue-900/30 border-blue-700">
                <CardContent className="p-4">
                  <div className="text-sm text-blue-400">Pass Rate</div>
                  <div className="text-2xl font-bold text-blue-300">{passRate}%</div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="space-y-2">
            {results.map((result, index) => (
              <div 
                key={index}
                className={`p-4 rounded-lg border ${
                  result.status === 'passed' 
                    ? 'bg-green-900/20 border-green-700' 
                    : 'bg-red-900/20 border-red-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {result.status === 'passed' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400" />
                    )}
                    <div>
                      <div className="font-medium text-slate-200">
                        {result.suite} - {result.test}
                      </div>
                      {result.error && (
                        <div className="text-sm text-red-400 mt-1">
                          Error: {result.error}
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-slate-400">
                    {result.duration}ms
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}