'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

const PRESET_QUESTIONS = [
  "What's the best staffing plan for tonight's game?",
  "Which concession stand is underutilized?",
  "How do Friday games compare to Saturday?",
  "What are the top selling items at Island Canteen?",
  "Which opponent brings the most concession sales?",
  "What time has the highest sales volume?",
  "How many refunds happened this season?",
  "What's the average items sold per fan?",
];

interface InsightResult {
  answer: string;
  sql: string | null;
  data: any[] | null;
  question: string;
}

export default function InsightsPage() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<InsightResult[]>([]);
  const [authTokenMissing, setAuthTokenMissing] = useState(false);

  async function askQuestion(q: string) {
    setLoading(true);
    try {
      const res = await fetch('/api/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (data.code === 'AUTH_TOKEN_MISSING') {
        setAuthTokenMissing(true);
      } else {
        setResults(prev => [{ ...data, question: q }, ...prev]);
      }
    } catch (err: any) {
      setResults(prev => [{ answer: `Error: ${err.message}`, sql: null, data: null, question: q }, ...prev]);
    }
    setLoading(false);
    setQuestion('');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">AI Insights</h1>
        <p className="text-gray-500 mt-1">Ask natural language questions about your concession data</p>
      </div>

      {/* Auth Token Missing Banner */}
      {authTokenMissing && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            AI Insights requires a <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">CLAUDE_AUTH_TOKEN</code> environment variable. Add it to your <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">.env.local</code> file to enable this feature.
          </p>
        </div>
      )}

      {/* Question Input */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Input
              placeholder="Ask a question about concession data..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && question.trim() && !authTokenMissing && askQuestion(question)}
              disabled={authTokenMissing}
              className="flex-1"
            />
            <Button
              onClick={() => question.trim() && askQuestion(question)}
              disabled={loading || !question.trim() || authTokenMissing}
            >
              {loading ? 'Thinking...' : 'Ask'}
            </Button>
          </div>

          {/* Preset Questions */}
          <div className="flex flex-wrap gap-2 mt-4">
            {PRESET_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => askQuestion(q)}
                disabled={loading || authTokenMissing}
                className="text-xs px-3 py-1.5 border rounded-full text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results.map((result, i) => (
        <Card key={i}>
          <CardHeader>
            <CardTitle className="text-base">{result.question}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-700 leading-relaxed">{result.answer}</p>

            {result.sql && (
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">View SQL Query</summary>
                <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-xs overflow-x-auto">{result.sql}</pre>
              </details>
            )}

            {result.data && result.data.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                  View Data ({result.data.length} rows)
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        {Object.keys(result.data[0]).map(key => (
                          <th key={key} className="pb-2 text-left px-2">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.slice(0, 20).map((row: any, j: number) => (
                        <tr key={j} className="border-b last:border-0">
                          {Object.values(row).map((val: any, k: number) => (
                            <td key={k} className="py-1 px-2">{typeof val === 'number' ? val.toLocaleString() : String(val ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
