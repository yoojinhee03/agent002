/**
 * Adaptive Cards 1.5 의 최소 서브셋 타입.
 *
 * 우리가 React 로 직접 렌더하는 요소만 정의. 공식 AC 스펙의 모든 속성을 다루지는 않고,
 * HITL 카드 디자인에 필요한 것만 우선 지원한다. 추후 새 요소가 필요해질 때 확장.
 */

export type AcElement =
  | AcAdaptiveCard
  | AcContainer
  | AcColumnSet
  | AcColumn
  | AcTextBlock
  | AcFactSet
  | AcInputText
  | AcInputChoiceSet
  | AcImage
  | AcActionSet
  | AcAction
  | AcCustomHitlHeader
  | AcCustomHitlArgsView
  | AcCustomHitlArgsEditor
  | AcCustomHitlActions
  | AcCustomHitlChoicePrompt
  | AcCustomHitlChoiceOptions

/**
 * Custom.* — AgentStudio 전용 HITL 슬롯 element.
 * AC 표준 외 확장이지만 빌더/렌더러가 동일하게 인식.
 */
export interface AcCustomHitlHeader extends AcCommonProps {
  type: 'Custom.HitlHeader'
  /** 기본 안내 문구 대체. 빈 값이면 자동 생성. */
  title?: string
  /** 도구 표시명 대체. 빈 값이면 카탈로그/이름 fallback. */
  toolLabelOverride?: string
}
/** 슬롯의 fields[] 한 항목 — 도구의 inputSchema 에서 생성되거나 사용자가 직접 편집. */
export interface AcHitlFieldOverride {
  /** dot-path (예: 'q', 'filters[*].field') */
  path: string
  /** 표시 라벨 — 없으면 ctx.argSchema / ARG_LABELS / path fallback */
  label?: string
  /** JSON Schema `required[]` 에 포함되었는지 여부 */
  required?: boolean
  widget?: 'input' | 'textarea' | 'number' | 'switch' | 'select' | 'json'
  helper?: string
  choices?: { title: string; value: string }[]
}

export interface AcCustomHitlArgsView extends AcCommonProps {
  type: 'Custom.HitlArgsView'
  /** dot-path(`filters[*].field`) → 한국어 라벨 */
  labelsOverride?: Record<string, string>
  /** 표시하지 않을 dot-path 목록 */
  hide?: string[]
  /** 최상위 필드 표시 순서 (dot-path) */
  order?: string[]
  /** 도구 선택으로 자동 생성되거나 사용자가 직접 편집한 필드 메타. required/widget 등을 노출. */
  fields?: AcHitlFieldOverride[]
}
export interface AcCustomHitlArgsEditor extends AcCommonProps {
  type: 'Custom.HitlArgsEditor'
  labelsOverride?: Record<string, string>
  hide?: string[]
  order?: string[]
  /** path 별 widget/helper/choices/required 오버라이드 */
  fields?: AcHitlFieldOverride[]
}
export interface AcCustomHitlActions extends AcCommonProps {
  type: 'Custom.HitlActions'
  labels?: { reject?: string; nlEdit?: string; directEdit?: string; approve?: string }
}

/** hitl-choice 흐름 — cardData.prompt 또는 overrides.text 표시. */
export interface AcCustomHitlChoicePrompt extends AcCommonProps {
  type: 'Custom.HitlChoicePrompt'
  text?: string
}

/** hitl-choice 흐름 — cardData.choices 또는 overrides.choices 의 라디오 그룹. */
export interface AcCustomHitlChoiceOptions extends AcCommonProps {
  type: 'Custom.HitlChoiceOptions'
  choices?: { title: string; value: string }[]
}

export interface AcCommonProps {
  id?: string
  spacing?: 'none' | 'small' | 'default' | 'medium' | 'large' | 'extraLarge' | 'padding'
  separator?: boolean
  isVisible?: boolean
  /** Adaptive Cards 1.4+ — 표현식 평가 결과가 true 일 때만 렌더. */
  $when?: string | boolean
  /** Adaptive Cards 1.4+ — 배열 데이터로 element 를 반복. 자식이 아닌 element 자신이 반복됨. */
  $data?: unknown
}

export interface AcAdaptiveCard extends AcCommonProps {
  type: 'AdaptiveCard'
  version?: string
  body?: AcElement[]
  actions?: AcAction[]
  /**
   * 도구 인자 메타 — HitlArgsView/Editor 슬롯이 공통으로 lookup. 도구 선택 시 자동 생성.
   * (DB 의 CardDefinition.argSchema 컬럼과 동일 형식. 카드 빌더에서 둘은 동기화됨.)
   */
  argSchema?: Array<{
    key: string
    label?: string
    required?: boolean
    widget?: 'input' | 'textarea' | 'number' | 'switch' | 'select' | 'json'
    helper?: string
    default?: unknown
    choices?: { title: string; value: string }[]
  }>
}

export type AcContainerStyle = 'default' | 'emphasis' | 'accent' | 'good' | 'warning' | 'attention'

export interface AcContainer extends AcCommonProps {
  type: 'Container'
  items?: AcElement[]
  style?: AcContainerStyle
  bleed?: boolean
}

export interface AcColumnSet extends AcCommonProps {
  type: 'ColumnSet'
  columns?: AcColumn[]
}

export interface AcColumn extends AcCommonProps {
  type: 'Column'
  width?: 'auto' | 'stretch' | string | number
  verticalContentAlignment?: 'Top' | 'Center' | 'Bottom'
  items?: AcElement[]
}

export interface AcFact {
  title: string
  value: string
}

export interface AcFactSet extends AcCommonProps {
  type: 'FactSet'
  facts?: AcFact[]
}

export interface AcTextBlock extends AcCommonProps {
  type: 'TextBlock'
  text: string
  wrap?: boolean
  weight?: 'Lighter' | 'Default' | 'Bolder'
  size?: 'Small' | 'Default' | 'Medium' | 'Large' | 'ExtraLarge'
  color?: 'Default' | 'Accent' | 'Good' | 'Warning' | 'Attention'
  isSubtle?: boolean
  fontType?: 'Default' | 'Monospace'
  horizontalAlignment?: 'Left' | 'Center' | 'Right'
}

export interface AcInputText extends AcCommonProps {
  type: 'Input.Text'
  id: string
  label?: string
  placeholder?: string
  value?: string
  isMultiline?: boolean
  isRequired?: boolean
  maxLength?: number
}

export interface AcInputChoiceSet extends AcCommonProps {
  type: 'Input.ChoiceSet'
  id: string
  label?: string
  value?: string
  isMultiSelect?: boolean
  style?: 'compact' | 'expanded'
  isRequired?: boolean
  choices?: { title: string; value: string }[]
}

export interface AcImage extends AcCommonProps {
  type: 'Image'
  url: string
  altText?: string
  size?: 'auto' | 'stretch' | 'small' | 'medium' | 'large'
  style?: 'default' | 'person'
  horizontalAlignment?: 'Left' | 'Center' | 'Right'
}

export interface AcActionSet extends AcCommonProps {
  type: 'ActionSet'
  actions: AcAction[]
}

export type AcAction = AcActionSubmit | AcActionShowCard

export interface AcActionCommon {
  id?: string
  title?: string
  iconUrl?: string
  style?: 'default' | 'positive' | 'destructive'
  $when?: string | boolean
  isVisible?: boolean
}

export interface AcActionSubmit extends AcActionCommon {
  type: 'Action.Submit'
  /** data 의 `__handler` 값으로 React 측 동작을 라우팅. */
  data?: Record<string, unknown>
}

export interface AcActionShowCard extends AcActionCommon {
  type: 'Action.ShowCard'
  card?: AcAdaptiveCard
}
