'use client'

import { cn } from '@/lib/utils'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { ToolCallDisplay } from './tool-call-display'
import type { NanobotSessionMessage } from '@/types/nanobot-session'

interface MessageBubbleProps {
  message: NanobotSessionMessage
  agentIcon?: string
  toolResult?: string
  searchHighlight?: string
  id?: string
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function highlightText(text: string, highlight?: string): React.ReactNode {
  if (!highlight) return text
  const idx = text.toLowerCase().indexOf(highlight.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-300/80 text-foreground rounded px-0.5">{text.slice(idx, idx + highlight.length)}</mark>
      {text.slice(idx + highlight.length)}
    </>
  )
}

export function MessageBubble({ message, agentIcon, toolResult, searchHighlight, id }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isTool = message.role === 'tool'
  const isAssistant = message.role === 'assistant'

  return (
    <div
      id={id}
      className={cn(
        'flex gap-2 max-w-[75%] mb-3',
        isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
      )}
    >
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1 text-sm">
        {isUser ? (
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 text-primary">
              <circle cx="8" cy="5" r="3" />
              <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
            </svg>
          </div>
        ) : isTool ? (
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 text-muted-foreground">
              <path d="M9.5 2L14 6.5 6.5 14H2v-4.5L9.5 2z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
            {agentIcon || (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 text-muted-foreground">
                <rect x="3" y="2" width="10" height="8" rx="1.5" />
                <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" />
                <circle cx="10" cy="6" r="1" fill="currentColor" stroke="none" />
                <path d="M5 12v2M11 12v2M4 14h8" />
              </svg>
            )}
          </div>
        )}
      </div>

      {/* Bubble content */}
      <div
        className={cn(
          'rounded-xl px-3 py-2 text-sm min-w-0',
          isUser
            ? 'bg-primary/15 text-foreground'
            : 'bg-muted text-foreground'
        )}
      >
        {/* Role label for tool messages */}
        {isTool && message.name && (
          <div className="text-[10px] text-muted-foreground/70 font-medium mb-1">
            Tool: {message.name}
          </div>
        )}

        {/* Message content */}
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">
            {searchHighlight ? highlightText(message.content, searchHighlight) : message.content}
          </div>
        ) : isTool ? (
          <div className="font-mono text-xs whitespace-pre-wrap break-words text-muted-foreground">
            {searchHighlight ? highlightText(
              message.content.length > 500 ? message.content.slice(0, 500) + '...' : message.content,
              searchHighlight
            ) : (
              message.content.length > 500 ? message.content.slice(0, 500) + '...' : message.content
            )}
          </div>
        ) : (
          <div>
            {searchHighlight ? (
              <div className="whitespace-pre-wrap break-words">
                {highlightText(message.content, searchHighlight)}
              </div>
            ) : (
              <MarkdownRenderer content={message.content} />
            )}
          </div>
        )}

        {/* Tool calls from assistant messages */}
        {isAssistant && message.tool_calls && message.tool_calls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.tool_calls.map((tc) => (
              <ToolCallDisplay
                key={tc.id}
                toolCall={tc}
                result={toolResult}
              />
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div className={cn(
          'text-[10px] text-muted-foreground/50 mt-1',
          isUser ? 'text-right' : 'text-left'
        )}>
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  )
}
