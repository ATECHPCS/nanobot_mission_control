'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UnifiedTokenStats {
  summary: {
    totalInputTokens: number
    totalOutputTokens: number
    totalSessions: number
    totalMessages: number
    mostActiveAgent: string
    avgTokensPerSession: number
  }
  byAgent: Array<{
    agent: string
    source: 'nanobot' | 'claude-code'
    inputTokens: number
    outputTokens: number
    sessionCount: number
    messageCount: number
  }>
  byModel: Array<{
    model: string
    inputTokens: number
    outputTokens: number
  }>
  timeline: Array<{
    date: string
    inputTokens: number
    outputTokens: number
  }>
  range: string
}

type TimeRange = 'today' | 'week' | 'month' | 'year'

// ---------------------------------------------------------------------------
// Utility functions (defined locally to avoid coupling to legacy panels)
// ---------------------------------------------------------------------------

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d']

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toString()
}

function getModelDisplayName(modelName: string): string {
  const parts = modelName.split('/')
  return parts[parts.length - 1] || modelName
}

/**
 * Clean a Claude Code project_slug into a human-readable name for display.
 * Slugs look like: "-Users-designmac-Nanobot-Bookkeeping-Bot"
 */
function cleanAgentName(name: string): string {
  // If it doesn't look like a slug path, return as-is (e.g. nanobot agent IDs)
  if (!name.startsWith('-') && !name.includes('-Users-')) return name

  const parts = name.replace(/^-/, '').split('-')
  let startIdx = 0
  if (parts[0] === 'Users' && parts.length > 1) {
    startIdx = 2
  }
  const remainder = parts.slice(startIdx).filter(Boolean)
  if (remainder.length === 0) return 'Claude Code'
  return remainder.join(' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NanobotTokenPanel() {
  const [range, setRange] = useState<TimeRange>('week')
  const [stats, setStats] = useState<UnifiedTokenStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/token-stats?range=${range}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data: UnifiedTokenStats = await res.json()
      setStats(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load token data')
    } finally {
      setIsLoading(false)
    }
  }, [range])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // -- Derived data for charts ---------------------------------------------

  const agentChartData = stats
    ? [...stats.byAgent]
        .sort((a, b) => {
          const aTotal = a.inputTokens + a.outputTokens || a.messageCount
          const bTotal = b.inputTokens + b.outputTokens || b.messageCount
          return bTotal - aTotal
        })
        .map(a => {
          const display = cleanAgentName(a.agent)
          return {
          agent: display.length > 20 ? display.slice(0, 18) + '..' : display,
          fullAgent: display,
          inputTokens: a.inputTokens,
          outputTokens: a.outputTokens,
          messageCount: a.messageCount,
          source: a.source,
        }})
    : []

  const modelData = stats
    ? [...stats.byModel].sort(
        (a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens),
      )
    : []

  // -- Render --------------------------------------------------------------

  return (
    <div className="p-6 space-y-6">
      {/* Header + time range selector */}
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Token Usage</h1>
            <p className="text-muted-foreground mt-2">
              Unified token and message analytics across all sources
            </p>
          </div>
          <div className="flex space-x-2">
            {(['today', 'week', 'month', 'year'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setRange(t)}
                className={`px-4 py-2 text-sm rounded-md font-medium transition-colors ${
                  range === t
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <span className="ml-3 text-muted-foreground">Loading token data...</span>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="text-center text-destructive py-12">
          <div className="text-lg mb-2">Error loading data</div>
          <div className="text-sm mb-4">{error}</div>
          <button
            onClick={loadStats}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && stats && stats.summary.totalInputTokens === 0 && stats.summary.totalOutputTokens === 0 && stats.summary.totalMessages === 0 && (
        <div className="text-center text-muted-foreground py-12">
          <div className="text-lg mb-2">No usage data available</div>
          <div className="text-sm">Token usage will appear here once agents start running</div>
          <button
            onClick={loadStats}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Refresh
          </button>
        </div>
      )}

      {/* Data content */}
      {!isLoading && !error && stats && (stats.summary.totalInputTokens > 0 || stats.summary.totalOutputTokens > 0 || stats.summary.totalMessages > 0) && (
        <div className="space-y-6">
          {/* Summary stats cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="text-3xl font-bold text-foreground">
                {formatNumber(stats.summary.totalInputTokens + stats.summary.totalOutputTokens)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Total Tokens</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Input: {formatNumber(stats.summary.totalInputTokens)} / Output: {formatNumber(stats.summary.totalOutputTokens)}
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <div className="text-3xl font-bold text-foreground">
                {stats.summary.totalSessions}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Total Sessions</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Messages: {formatNumber(stats.summary.totalMessages)}
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <div className="text-3xl font-bold text-foreground truncate" title={cleanAgentName(stats.summary.mostActiveAgent)}>
                {cleanAgentName(stats.summary.mostActiveAgent) || '-'}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Most Active Agent</div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <div className="text-3xl font-bold text-foreground">
                {formatNumber(stats.summary.avgTokensPerSession)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Avg Tokens/Session</div>
            </div>
          </div>

          {/* Usage Over Time LineChart */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Usage Over Time</h2>
            <div className="h-[280px]">
              {stats.timeline.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  No usage data for this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.timeline}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="input" tickFormatter={formatNumber} stroke="#8884d8" />
                    <YAxis yAxisId="output" orientation="right" tickFormatter={formatNumber} stroke="#82ca9d" />
                    <Tooltip
                      formatter={(value, name) => [formatNumber(Number(value)), name]}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Legend />
                    <Line
                      yAxisId="input"
                      type="monotone"
                      dataKey="inputTokens"
                      stroke="#8884d8"
                      strokeWidth={2}
                      name="Input Tokens"
                      dot={false}
                    />
                    <Line
                      yAxisId="output"
                      type="monotone"
                      dataKey="outputTokens"
                      stroke="#82ca9d"
                      strokeWidth={2}
                      name="Output Tokens"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Per-Agent BarChart + Per-Model Breakdown side by side */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Per-Agent BarChart */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Per-Agent Usage</h2>
              <div className="h-[300px]">
                {agentChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                    No agent data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={agentChartData}
                      layout="vertical"
                      margin={{ left: 10, right: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis xAxisId="input" type="number" tickFormatter={formatNumber} orientation="bottom" stroke="#8884d8" />
                      <XAxis xAxisId="output" type="number" tickFormatter={formatNumber} orientation="top" stroke="#82ca9d" />
                      <YAxis
                        type="category"
                        dataKey="agent"
                        width={120}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const item = payload[0]?.payload
                          if (!item) return null
                          return (
                            <div className="bg-popover border border-border rounded-lg p-3 text-sm shadow-lg">
                              <p className="font-medium mb-1">{item.fullAgent}</p>
                              <p className="text-xs text-muted-foreground mb-2">
                                Source: {item.source === 'nanobot' ? 'Nanobot Agent' : 'Claude Code'}
                              </p>
                              {(item.inputTokens > 0 || item.outputTokens > 0) && (
                                <>
                                  <p className="text-xs">Input: {formatNumber(item.inputTokens)}</p>
                                  <p className="text-xs">Output: {formatNumber(item.outputTokens)}</p>
                                </>
                              )}
                              {item.messageCount > 0 && (
                                <p className="text-xs">Messages: {formatNumber(item.messageCount)}</p>
                              )}
                            </div>
                          )
                        }}
                      />
                      <Legend />
                      <Bar xAxisId="input" dataKey="inputTokens" fill="#8884d8" name="Input Tokens" />
                      <Bar xAxisId="output" dataKey="outputTokens" fill="#82ca9d" name="Output Tokens" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Per-Model Breakdown */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Per-Model Breakdown</h2>
              <div className="h-[300px] overflow-y-auto">
                {modelData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                    No model data available
                  </div>
                ) : (
                  <div className="space-y-4">
                    {modelData.map((m, i) => {
                      const total = m.inputTokens + m.outputTokens
                      const maxTotal = modelData[0]
                        ? modelData[0].inputTokens + modelData[0].outputTokens
                        : 1
                      const inputPct = maxTotal > 0 ? (m.inputTokens / maxTotal) * 100 : 0
                      const outputPct = maxTotal > 0 ? (m.outputTokens / maxTotal) * 100 : 0

                      return (
                        <div key={m.model} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-foreground">
                              {getModelDisplayName(m.model)}
                            </span>
                            <span className="text-muted-foreground">
                              {formatNumber(total)} total
                            </span>
                          </div>
                          <div className="flex h-3 rounded-full overflow-hidden bg-secondary">
                            <div
                              className="h-full"
                              style={{
                                width: `${inputPct}%`,
                                backgroundColor: '#8884d8',
                              }}
                              title={`Input: ${formatNumber(m.inputTokens)}`}
                            />
                            <div
                              className="h-full"
                              style={{
                                width: `${outputPct}%`,
                                backgroundColor: '#82ca9d',
                              }}
                              title={`Output: ${formatNumber(m.outputTokens)}`}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Input: {formatNumber(m.inputTokens)}</span>
                            <span>Output: {formatNumber(m.outputTokens)}</span>
                          </div>
                        </div>
                      )
                    })}
                    {/* Color legend */}
                    <div className="flex items-center gap-4 pt-2 border-t border-border text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: '#8884d8' }} />
                        Input
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: '#82ca9d' }} />
                        Output
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
