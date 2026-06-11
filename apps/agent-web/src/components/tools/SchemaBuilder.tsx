'use client'

import { useState, useEffect, useMemo } from 'react'
import { MonacoEditor } from '@/components/shared/monaco-editor'
import { cn } from '@/lib/utils'

interface Property {
  key: string
  type: string
  required: boolean
  description: string
}

interface SchemaBuilderProps {
  value: string
  onChange: (value: string) => void
}

const PROPERTY_TYPES = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'object', label: 'Object' },
  { value: 'array', label: 'Array' },
]

export function SchemaBuilder({ value, onChange }: SchemaBuilderProps) {
  const [mode, setMode] = useState<'visual' | 'raw'>('visual')
  const [isValid, setIsValid] = useState(true)

  // Parse value to properties for visual mode
  const properties = useMemo(() => {
    try {
      const schema = JSON.parse(value)
      if (schema.type !== 'object' || !schema.properties) return []

      const requiredList = Array.isArray(schema.required) ? schema.required : []
      
      return Object.entries(schema.properties).map(([key, prop]: [string, any]) => ({
        key,
        type: prop.type || 'string',
        required: requiredList.includes(key),
        description: prop.description || '',
      }))
    } catch {
      return []
    }
  }, [value])

  useEffect(() => {
    try {
      JSON.parse(value)
      setIsValid(true)
    } catch {
      setIsValid(false)
    }
  }, [value])

  const updateSchema = (newProps: Property[]) => {
    const schema: any = {
      type: 'object',
      properties: {},
      required: [],
    }

    newProps.forEach((p) => {
      if (!p.key) return
      schema.properties[p.key] = {
        type: p.type,
        description: p.description,
      }
      if (p.required) {
        schema.required.push(p.key)
      }
    })

    if (schema.required.length === 0) delete schema.required
    
    onChange(JSON.stringify(schema, null, 2))
  }

  const addProperty = () => {
    const newProps = [...properties, { key: '', type: 'string', required: false, description: '' }]
    updateSchema(newProps)
  }

  const removeProperty = (index: number) => {
    const newProps = properties.filter((_, i) => i !== index)
    updateSchema(newProps)
  }

  const updateProperty = (index: number, field: keyof Property, val: any) => {
    const newProps = properties.map((p, i) => (i === index ? { ...p, [field]: val } : p))
    updateSchema(newProps)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <div className="flex bg-muted p-0.5 rounded-md gap-0.5 scale-90">
          <button
            type="button"
            onClick={() => setMode('visual')}
            className={cn(
              'px-2 py-0.5 text-xs uppercase font-bold rounded transition-colors',
              mode === 'visual' ? 'bg-background shadow-sm' : 'text-muted-foreground'
            )}
          >
            Visual
          </button>
          <button
            type="button"
            onClick={() => setMode('raw')}
            className={cn(
              'px-2 py-0.5 text-xs uppercase font-bold rounded transition-colors',
              mode === 'raw' ? 'bg-background shadow-sm' : 'text-muted-foreground'
            )}
          >
            Raw JSON
          </button>
        </div>
      </div>

      {mode === 'visual' ? (
        <div className="border border-input rounded-md p-3 bg-muted/10 space-y-3">
          {properties.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">정의된 속성이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr,80px,40px,1.5fr,30px] gap-2 items-center text-xs font-bold text-muted-foreground uppercase px-1">
                <span>Key</span>
                <span>Type</span>
                <span className="text-center">Req</span>
                <span>Description</span>
                <span />
              </div>
              {properties.map((prop, i) => (
                <div key={i} className="grid grid-cols-[1fr,80px,40px,1.5fr,30px] gap-2 items-center">
                  <input
                    value={prop.key}
                    onChange={(e) => updateProperty(i, 'key', e.target.value)}
                    placeholder="name"
                    className="w-full px-2 py-1 text-xs border border-input rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <select
                    value={prop.type}
                    onChange={(e) => updateProperty(i, 'type', e.target.value)}
                    className="w-full px-1 py-1 text-xs border border-input rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {PROPERTY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={prop.required}
                      onChange={(e) => updateProperty(i, 'required', e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-input text-primary focus:ring-primary"
                    />
                  </div>
                  <input
                    value={prop.description}
                    onChange={(e) => updateProperty(i, 'description', e.target.value)}
                    placeholder="사용자 이름"
                    className="w-full px-2 py-1 text-xs border border-input rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => removeProperty(i)}
                    className="text-muted-foreground hover:text-destructive text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={addProperty}
            className="w-full py-1.5 border border-dashed border-input rounded-md text-xs text-muted-foreground hover:text-primary hover:border-primary transition-colors"
          >
            + 속성 추가
          </button>
        </div>
      ) : (
        <MonacoEditor
          language="json"
          value={value}
          onChange={(v) => onChange(v ?? '')}
          height="200px"
          options={{
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
          }}
        />
      )}
      {!isValid && mode === 'raw' && (
        <p className="text-xs text-destructive">유효하지 않은 JSON 스키마 형식입니다.</p>
      )}
    </div>
  )
}
