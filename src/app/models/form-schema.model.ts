export type FieldControlType =
  | 'text'
  | 'email'
  | 'number'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'date';

export interface FieldOption {
  label: string;
  value: string | number | boolean;
}

export interface FieldValidators {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export type VisibilityOperator =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'lessThan'
  | 'includes';

export interface VisibilityCondition {
  fieldKey: string;
  operator: VisibilityOperator;
  value: string | number | boolean;
}

export interface FieldVisibilityRule {
  mode: 'all' | 'any';
  conditions: VisibilityCondition[];
}

export interface FieldGroup {
  id: string;
  type: 'group';
  label: string;
  children: FieldNode[];
}

export interface FieldControl {
  id: string;
  type: FieldControlType;
  key: string;
  label: string;
  placeholder?: string;
  defaultValue?: string | number | boolean | null;
  required?: boolean;
  validators?: FieldValidators;
  options?: FieldOption[];
  visibility?: FieldVisibilityRule;
}

export type FieldNode = FieldGroup | FieldControl;

export interface FormSchema {
  id: string;
  name: string;
  version: string;
  root: FieldGroup;
}

export function generateId(prefix: string = 'field'): string {
  const safePrefix = prefix.trim() || 'field';
  const randomValue = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

  return `${safePrefix}-${randomValue}`;
}

export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
