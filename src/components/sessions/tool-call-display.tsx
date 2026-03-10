'use client'

import { useState } from 'react'

interface ToolCallDisplayProps {
  toolCall: {
    id: string
    function: { name: string; arguments: string }
  }
  result?: string
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function countLines(text: string): number {
  return text.split('\n').length
}

const MAX_RESULT_LINES = 20

export function ToolCallDisplay({ toolCall, result }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false)
  const formattedArgs = formatJson(toolCall.function.arguments)
  const formattedResult = result ? formatJson(result) : null
  const resultLineCount = formattedResult ? countLines(formattedResult) : 0
  const isTruncated = resultLineCount > MAX_RESULT_LINES
  const displayResult = isTruncated && !expanded
    ? formattedResult!.split('\n').slice(0, MAX_RESULT_LINES).join('\n')
    : formattedResult

  return (
    <div className="rounded-md bg-secondary/50 border border-border/50 p-2 my-1 text-xs">
      {/* Tool name */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 text-muted-foreground shrink-0">
          <path d="M9.5 2L14 6.5 6.5 14H2v-4.5L9.5 2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-mono font-semibold text-foreground">{toolCall.function.name}</span>
      </div>

      {/* Arguments */}
      <pre className="font-mono text-[11px] text-muted-foreground bg-background/50 rounded p-1.5 overflow-x-auto whitespace-pre-wrap break-all">
        {formattedArgs}
      </pre>

      {/* Result */}
      {displayResult && (
        <div className="mt-1.5">
          <span className="text-[10px] text-muted-foreground/70 font-medium">Result:</span>
          <pre className="font-mono text-[11px] text-muted-foreground bg-background/50 rounded p-1.5 overflow-x-auto whitespace-pre-wrap break-all mt-0.5">
            {displayResult}
          </pre>
          {isTruncated && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[11px] text-primary hover:text-primary/80 mt-1 font-medium"
            >
              {expanded ? 'Show less' : `Show full result (${resultLineCount} lines)`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
