import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FieldControl, FieldControlType, FieldGroup, FieldNode, FormSchema, generateId } from '../../models/form-schema.model';
import { FormSchemaStore } from '../../services/form-schema.store';

type PaletteItem = {
  label: string;
  description: string;
  type: 'group' | FieldControlType;
};

type PaletteSection = {
  title: string;
  items: PaletteItem[];
};

type TreeRow = {
  node: FieldNode;
  depth: number;
  meta: string;
  badge?: string;
  isSelected: boolean;
};

type InspectorView = {
  title: string;
  typeLabel: string;
  meta: string;
  key?: string;
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string | number | boolean }[];
};

type PendingDelete = {
  id: string;
  label: string;
  isGroup: boolean;
};

@Component({
  selector: 'app-builder',
  standalone: true,
  templateUrl: './builder.component.html',
  styleUrls: ['./builder.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuilderComponent implements OnInit {
  private readonly store = inject(FormSchemaStore);
  private readonly expandedIds = signal<Set<string>>(new Set<string>());
  protected readonly pendingDelete = signal<PendingDelete | null>(null);

  protected readonly paletteSections = signal<PaletteSection[]>([
    {
      title: 'Structure',
      items: [
        { label: 'Group', description: 'Nest steps or related inputs.', type: 'group' }
      ]
    },
    {
      title: 'Inputs',
      items: [
        { label: 'Text', description: 'Single line text input.', type: 'text' },
        { label: 'Email', description: 'Captures valid email addresses.', type: 'email' },
        { label: 'Number', description: 'Quantities, currency, or scores.', type: 'number' },
        { label: 'Textarea', description: 'Long-form responses.', type: 'textarea' }
      ]
    },
    {
      title: 'Choices',
      items: [
        { label: 'Select', description: 'Dropdown with options.', type: 'select' },
        { label: 'Checkbox', description: 'On/off agreement or toggle.', type: 'checkbox' },
        { label: 'Radio group', description: 'Pick exactly one choice.', type: 'radio' },
        { label: 'Date', description: 'Schedule or deadlines.', type: 'date' }
      ]
    }
  ]);

  protected readonly schema = toSignal(this.store.schema$, { initialValue: null });
  protected readonly selectedNodeId = toSignal(this.store.selectedNodeId$, { initialValue: null });
  protected readonly selectedNode = toSignal(this.store.selectedNode$, { initialValue: null });

  protected readonly treeRows = computed<TreeRow[]>(() => {
    const schema = this.schema();
    if (!schema) {
      return [];
    }

    const rows: TreeRow[] = [];
    const selectedId = this.selectedNodeId();
    const expanded = this.expandedIds();

    const walk = (node: FieldNode, depth: number, badge?: string, forceExpanded: boolean = false): void => {
      const isGroup = node.type === 'group';
      const meta = isGroup
        ? `${(node as FieldGroup).children.length} item${(node as FieldGroup).children.length === 1 ? '' : 's'}`
        : this.describeField(node as FieldControl);
      const expandedHere = forceExpanded || expanded.has(node.id);

      rows.push({
        node,
        depth,
        meta,
        badge,
        isSelected: node.id === selectedId
      });

      if (isGroup && (expandedHere || badge === 'Root')) {
        for (const child of (node as FieldGroup).children) {
          walk(child, depth + 1);
        }
      }
    };

    walk(schema.root, 0, 'Root', true);
    return rows;
  });

  protected readonly inspector = computed<InspectorView | null>(() => {
    const schema = this.schema();
    if (!schema) {
      return null;
    }

    const node = this.selectedNode() ?? schema.root;
    if (node.type === 'group') {
      const group = node as FieldGroup;
      return {
        title: group.label,
        typeLabel: 'Group',
        meta: `${group.children.length} item${group.children.length === 1 ? '' : 's'}`
      };
    }

    const field = node as FieldControl;
    return {
      title: field.label,
      typeLabel: this.friendlyLabel(field.type),
      meta: this.describeField(field),
      key: field.key,
      placeholder: field.placeholder,
      required: field.required,
      options: field.options
    };
  });

  ngOnInit(): void {
    this.store.loadDefaultSchema();
    const rootId = this.schema()?.root.id;
    if (rootId) {
      this.expandGroup(rootId);
    }
  }

  protected selectNode(nodeId: string): void {
    this.store.selectNode(nodeId);
  }

  protected addFromPalette(type: 'group' | FieldControlType): void {
    const schema = this.schema();
    if (!schema) {
      return;
    }

    const parentGroupId = this.resolveTargetGroupId(schema);
    if (!parentGroupId) {
      return;
    }

    const node = type === 'group' ? this.createGroupNode() : this.createFieldNode(type);
    this.store.addNode(parentGroupId, node);
    this.store.selectNode(node.id);
  }

  protected toggleGroup(nodeId: string): void {
    const schema = this.schema();
    if (!schema || schema.root.id === nodeId) {
      return;
    }

    const next = new Set(this.expandedIds());
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    this.expandedIds.set(next);
  }

  protected isExpanded(nodeId: string): boolean {
    const schema = this.schema();
    if (schema && schema.root.id === nodeId) {
      return true;
    }
    return this.expandedIds().has(nodeId);
  }

  protected requestDelete(nodeId: string): void {
    const schema = this.schema();
    if (!schema || schema.root.id === nodeId) {
      return;
    }

    const node = this.findNode(schema.root, nodeId);
    if (!node) {
      return;
    }

    this.pendingDelete.set({
      id: node.id,
      label: node.label,
      isGroup: node.type === 'group'
    });
  }

  protected cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  protected confirmDelete(): void {
    const pending = this.pendingDelete();
    const schema = this.schema();
    if (!pending || !schema) {
      return;
    }

    if (schema.root.id === pending.id) {
      this.pendingDelete.set(null);
      return;
    }

    const parentId = this.findParentGroupId(schema.root, pending.id) ?? schema.root.id;

    const nextExpanded = new Set(this.expandedIds());
    nextExpanded.delete(pending.id);
    this.expandedIds.set(nextExpanded);

    this.store.removeNode(pending.id);
    this.store.selectNode(parentId);
    this.pendingDelete.set(null);
  }

  private resolveTargetGroupId(schema: FormSchema): string | null {
    const selected = this.selectedNode();
    if (!selected) {
      return schema.root.id;
    }

    if (selected.type === 'group') {
      return selected.id;
    }

    return this.findParentGroupId(schema.root, selected.id) ?? schema.root.id;
  }

  private findParentGroupId(group: FieldGroup, nodeId: string): string | null {
    for (const child of group.children) {
      if (child.id === nodeId) {
        return group.id;
      }

      if (child.type === 'group') {
        const fromChild = this.findParentGroupId(child, nodeId);
        if (fromChild) {
          return fromChild;
        }
      }
    }

    return null;
  }

  private findNode(node: FieldNode, nodeId: string): FieldNode | null {
    if (node.id === nodeId) {
      return node;
    }

    if (node.type === 'group') {
      for (const child of (node as FieldGroup).children) {
        const found = this.findNode(child, nodeId);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  private expandGroup(groupId: string): void {
    const next = new Set(this.expandedIds());
    next.add(groupId);
    this.expandedIds.set(next);
  }

  private createGroupNode(): FieldGroup {
    return {
      id: generateId('group'),
      type: 'group',
      label: 'New group',
      children: []
    };
  }

  private createFieldNode(type: FieldControlType): FieldControl {
    const id = generateId('field');
    const suffix = id.slice(-4);

    const base: FieldControl = {
      id,
      type,
      key: `${type}-${suffix}`,
      label: this.friendlyLabel(type),
      placeholder: undefined,
      required: type !== 'checkbox'
    };

    switch (type) {
      case 'text':
        return { ...base, placeholder: 'Enter text' };
      case 'email':
        return { ...base, placeholder: 'name@example.com' };
      case 'number':
        return { ...base, placeholder: 'Enter a number', validators: { min: 0 } };
      case 'textarea':
        return {
          ...base,
          label: 'Message',
          placeholder: 'Add details',
          validators: { minLength: 10 }
        };
      case 'select':
        return {
          ...base,
          label: 'Select option',
          defaultValue: 'option-1',
          options: [
            { label: 'Option 1', value: 'option-1' },
            { label: 'Option 2', value: 'option-2' },
            { label: 'Option 3', value: 'option-3' }
          ]
        };
      case 'checkbox':
        return {
          ...base,
          label: 'Accept terms',
          defaultValue: false,
          required: false
        };
      case 'radio':
        return {
          ...base,
          label: 'Choose one',
          defaultValue: 'option-1',
          options: [
            { label: 'Option A', value: 'option-1' },
            { label: 'Option B', value: 'option-2' }
          ]
        };
      case 'date':
        return { ...base, label: 'Date', placeholder: 'Select a date', required: false };
      default:
        return base;
    }
  }

  private describeField(field: FieldControl): string {
    const pieces = [this.friendlyLabel(field.type)];
    if (field.required) {
      pieces.push('required');
    } else {
      pieces.push('optional');
    }

    if (field.placeholder) {
      pieces.push(field.placeholder);
    }

    if (field.options?.length) {
      pieces.push(`${field.options.length} option${field.options.length === 1 ? '' : 's'}`);
    }

    return pieces.join(' - ');
  }

  private friendlyLabel(type: FieldControlType): string {
    switch (type) {
      case 'text':
        return 'Text';
      case 'email':
        return 'Email';
      case 'number':
        return 'Number';
      case 'textarea':
        return 'Textarea';
      case 'select':
        return 'Select';
      case 'checkbox':
        return 'Checkbox';
      case 'radio':
        return 'Radio group';
      case 'date':
        return 'Date';
      default:
        return type;
    }
  }
}
