import React, { useState } from 'react';
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

export default function TestRunner({ testSuites }) {
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState(null);

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
            <Button 
              onClick={runTests} 
              disabled={running}
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
          </CardTitle>
        </CardHeader>
        <CardContent>
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