import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { FieldControl, FieldControlType, FieldGroup, FieldNode, FormSchema, generateId } from '../../models/form-schema.model';
import { FormSchemaStore } from '../../services/form-schema.store';
import { combineLatest } from 'rxjs';

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
  imports: [CommonModule, ReactiveFormsModule, DragDropModule, RouterModule],
  templateUrl: './builder.component.html',
  styleUrls: ['./builder.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuilderComponent implements OnInit {
  private readonly store = inject(FormSchemaStore);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly expandedIds = signal<Set<string>>(new Set<string>());
  protected readonly pendingDelete = signal<PendingDelete | null>(null);
  protected readonly toast = signal<{ message: string; variant: 'error' | 'success' } | null>(null);
  private isPatchingForm = false;

  protected readonly paletteSections = signal<PaletteSection[]>([
    {
      title: 'Structure',
      items: [
        { label: 'Add Group', description: 'Nest steps or related inputs.', type: 'group' }
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
  protected readonly lastUpdated = toSignal(this.store.lastUpdated$, { initialValue: Date.now() });
  protected readonly saveStatus = signal<'saved' | 'saving'>('saved');
  protected readonly selectedControlType = computed<FieldControlType | null>(() => {
    const node = this.selectedNode();
    return node && node.type !== 'group' ? node.type : null;
  });
  protected readonly dropListIds = computed<string[]>(() => {
    const schema = this.schema();
    if (!schema) {
      return [];
    }
    const ids: string[] = [];
    const walk = (group: FieldGroup): void => {
      ids.push(group.id);
      for (const child of group.children) {
        if (child.type === 'group') {
          walk(child as FieldGroup);
        }
      }
    };
    walk(schema.root);
    return ids;
  });
  protected readonly dropListConnectedTo = computed<string[]>(() => ['palette', ...this.dropListIds()]);
  protected readonly inspectorForm = this.fb.group({
    label: this.fb.control<string>('', { nonNullable: true, validators: [Validators.required] }),
    key: this.fb.control<string>('', { nonNullable: true }),
    placeholder: this.fb.control<string>('', { nonNullable: true }),
    defaultValue: this.fb.control<string | number | boolean | null>(null),
    required: this.fb.control<boolean>(false, { nonNullable: true }),
    options: this.fb.array<FormGroup>([]),
    visibility: this.fb.group({
      visibleByDefault: this.fb.control<boolean>(true, { nonNullable: true }),
      mode: this.fb.control<'all' | 'any'>('all', { nonNullable: true }),
      conditions: this.fb.array<FormGroup>([])
    }),
    validators: this.fb.group({
      min: this.fb.control<string>('', { nonNullable: true }),
      max: this.fb.control<string>('', { nonNullable: true }),
      minLength: this.fb.control<string>('', { nonNullable: true }),
      maxLength: this.fb.control<string>('', { nonNullable: true }),
      pattern: this.fb.control<string>('', { nonNullable: true })
    })
  });

  protected readonly availableFieldKeys = computed<string[]>(() => {
    const schema = this.schema();
    const selected = this.selectedNode();
    if (!schema) {
      return [];
    }
    const keys: string[] = [];
    const walk = (node: FieldNode): void => {
      if (node.type === 'group') {
        for (const child of (node as FieldGroup).children) {
          walk(child);
        }
      } else {
        const control = node as FieldControl;
        if (!selected || selected.type === 'group' || control.id !== selected.id) {
          keys.push(control.key);
        }
      }
    };
    walk(schema.root);
    return keys.sort((a, b) => a.localeCompare(b));
  });

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
    if (!this.store.snapshot.currentSchema) {
      this.store.loadDefaultSchema();
    }
    const rootId = this.schema()?.root.id;
    if (rootId) {
      this.expandGroup(rootId);
    }

    combineLatest([this.store.schema$, this.store.selectedNode$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([schema, selected]) => {
        const node = selected ?? schema?.root;
        if (node) {
          this.patchInspectorForm(node);
        }
      });

    this.store.lastUpdated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.saveStatus.set('saving');
        setTimeout(() => this.saveStatus.set('saved'), 350);
      });

    this.inspectorForm.valueChanges.subscribe(() => {
      if (this.isPatchingForm) {
        return;
      }
      this.applyInspectorChanges();
    });
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
    this.showToast(`${type === 'group' ? 'Group' : this.friendlyLabel(type)} added`, 'success');
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

  protected onDrop(event: CdkDragDrop<FieldNode[]>): void {
    const targetGroupId = event.container.element.nativeElement.id;
    const previousGroupId = event.previousContainer.element.nativeElement.id;
    const draggedData = event.item.data as any;

    if (previousGroupId === 'palette') {
      const schema = this.schema();
      if (!schema) {
        return;
      }
      const paletteItem = draggedData as PaletteItem;
      const node = paletteItem.type === 'group' ? this.createGroupNode() : this.createFieldNode(paletteItem.type);
      this.store.addNode(targetGroupId, node);
      this.store.selectNode(node.id);
      this.showToast(`${paletteItem.label} added`, 'success');
      return;
    }

    const dragged = draggedData as FieldNode;

    if (dragged.type === 'group' && (dragged.id === targetGroupId || this.isGroupDescendant(dragged.id, targetGroupId))) {
      this.showToast('Cannot move a group into its own descendant.', 'error');
      return;
    }

    if (previousGroupId === targetGroupId) {
      if (event.previousIndex === event.currentIndex) {
        return;
      }
      this.store.moveNode(dragged.id, targetGroupId, event.currentIndex);
      this.store.selectNode(dragged.id);
      this.showToast('Reordered', 'success');
      return;
    }

    this.store.moveNode(dragged.id, targetGroupId, event.currentIndex);
    this.store.selectNode(dragged.id);
    this.showToast('Moved', 'success');
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
    this.showToast('Deleted', 'success');
  }

  protected onTreeKeydown(event: KeyboardEvent, node: FieldNode): void {
    const key = event.key;

    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      this.selectNode(node.id);
      return;
    }

    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      const schema = this.schema();
      if (schema && schema.root.id !== node.id) {
        this.requestDelete(node.id);
      }
      return;
    }

    if (node.type === 'group') {
      if (key === 'ArrowLeft' && this.isExpanded(node.id) && this.schema()?.root.id !== node.id) {
        event.preventDefault();
        this.toggleGroup(node.id);
        return;
      }
      if (key === 'ArrowRight' && !this.isExpanded(node.id)) {
        event.preventDefault();
        this.toggleGroup(node.id);
        return;
      }
    }

    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      const items = Array.from(document.querySelectorAll<HTMLElement>('[data-tree-node="true"]'));
      const index = items.findIndex((el) => el.dataset['nodeId'] === node.id);
      if (index === -1) {
        return;
      }
      const nextIndex = key === 'ArrowDown' ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);
      items[nextIndex]?.focus();
    }
  }

  protected optionControls(): FormGroup[] {
    return (this.inspectorForm.get('options') as FormArray<FormGroup>).controls as FormGroup[];
  }

  protected nodeMeta(node: FieldNode): string {
    if (node.type === 'group') {
      const count = (node as FieldGroup).children.length;
      return `${count} item${count === 1 ? '' : 's'}`;
    }
    return this.describeField(node as FieldControl);
  }

  protected addVisibilityCondition(): void {
    this.visibilityConditionsArray().push(
      this.fb.group({
        fieldKey: ['', Validators.required],
        operator: ['equals', Validators.required],
        value: ['']
      })
    );
  }

  protected removeVisibilityCondition(index: number): void {
    const array = this.visibilityConditionsArray();
    if (index >= 0 && index < array.length) {
      array.removeAt(index);
    }
  }

  protected visibilityConditionControls(): FormGroup[] {
    return this.visibilityConditionsArray().controls as FormGroup[];
  }

  private isGroupDescendant(ancestorId: string, targetGroupId: string): boolean {
    const schema = this.schema();
    if (!schema) {
      return false;
    }
    const ancestor = this.findGroup(schema.root, ancestorId);
    if (!ancestor) {
      return false;
    }
    const walk = (group: FieldGroup): boolean => {
      for (const child of group.children) {
        if (child.type === 'group') {
          if (child.id === targetGroupId) {
            return true;
          }
          if (walk(child as FieldGroup)) {
            return true;
          }
        }
      }
      return false;
    };
    return walk(ancestor);
  }

  private findGroup(node: FieldNode, groupId: string): FieldGroup | null {
    if (node.type === 'group' && node.id === groupId) {
      return node as FieldGroup;
    }

    if (node.type === 'group') {
      for (const child of (node as FieldGroup).children) {
        const found = this.findGroup(child, groupId);
        if (found) {
          return found;
        }
      }
    }

    return null;
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

  private patchInspectorForm(node: FieldNode): void {
    this.isPatchingForm = true;

    const optionsArray = this.inspectorForm.get('options') as FormArray<FormGroup>;
    while (optionsArray.length) {
      optionsArray.removeAt(0);
    }
    const conditionsArray = this.visibilityConditionsArray();
    while (conditionsArray.length) {
      conditionsArray.removeAt(0);
    }

    if (node.type === 'group') {
      this.inspectorForm.reset({
        label: node.label,
        key: '',
        placeholder: '',
        defaultValue: null,
        required: false,
        visibility: {
          visibleByDefault: true,
          mode: 'all',
          conditions: []
        },
        validators: {
          min: '',
          max: '',
          minLength: '',
          maxLength: '',
          pattern: ''
        }
      });
      this.inspectorForm.get('label')?.setValidators([Validators.required]);
      this.inspectorForm.get('label')?.updateValueAndValidity({ emitEvent: false });
      this.inspectorForm.get('key')?.disable({ emitEvent: false });
      this.inspectorForm.get('placeholder')?.disable({ emitEvent: false });
      this.inspectorForm.get('defaultValue')?.disable({ emitEvent: false });
      this.inspectorForm.get('required')?.disable({ emitEvent: false });
      this.inspectorForm.get('visibility')?.disable({ emitEvent: false });
      this.inspectorForm.get('validators')?.disable({ emitEvent: false });
      optionsArray.disable({ emitEvent: false });
    } else {
      const field = node as FieldControl;
      const keyControl = this.inspectorForm.get('key');
      keyControl?.setValidators([Validators.required, (control) => this.uniqueKeyValidator(control, field.id)]);
      keyControl?.updateValueAndValidity({ emitEvent: false });
      const patternControl = this.inspectorForm.get('validators.pattern');
      patternControl?.setValidators([(control) => this.patternValidator(control)]);
      patternControl?.updateValueAndValidity({ emitEvent: false });

      this.inspectorForm.get('key')?.enable({ emitEvent: false });
      this.inspectorForm.get('placeholder')?.enable({ emitEvent: false });
      this.inspectorForm.get('defaultValue')?.enable({ emitEvent: false });
      this.inspectorForm.get('required')?.enable({ emitEvent: false });
      this.inspectorForm.get('visibility')?.enable({ emitEvent: false });
      this.inspectorForm.get('validators')?.enable({ emitEvent: false });

      const validators = field.validators ?? {};
      const placeholder = field.placeholder ?? '';
      const defaultValue = field.defaultValue ?? null;

      if (field.options?.length && (field.type === 'select' || field.type === 'radio')) {
        for (const opt of field.options) {
          optionsArray.push(
            this.fb.group({
              label: [opt.label, Validators.required],
              value: [opt.value, Validators.required]
            })
          );
        }
      }

      const visibility = field.visibility;
      if (visibility?.conditions?.length) {
        for (const cond of visibility.conditions) {
          conditionsArray.push(
            this.fb.group({
              fieldKey: [cond.fieldKey, Validators.required],
              operator: [cond.operator, Validators.required],
              value: [cond.value]
            })
          );
        }
      }

      this.inspectorForm.patchValue(
        {
          label: field.label,
          key: field.key,
          placeholder,
          defaultValue,
          required: field.required ?? false,
          visibility: {
            visibleByDefault: field.visibleByDefault !== false,
            mode: visibility?.mode ?? 'all'
          },
          validators: {
            min: String(validators.min ?? ''),
            max: String(validators.max ?? ''),
            minLength: String(validators.minLength ?? ''),
            maxLength: String(validators.maxLength ?? ''),
            pattern: validators.pattern ?? ''
          }
        },
        { emitEvent: false }
      );

      if (field.type === 'select' || field.type === 'radio') {
        optionsArray.enable({ emitEvent: false });
      } else {
        optionsArray.disable({ emitEvent: false });
      }
    }

      this.isPatchingForm = false;
  }

  private applyInspectorChanges(): void {
    const schema = this.schema();
    const selected = this.selectedNode();
    if (!schema || !selected || this.inspectorForm.invalid) {
      return;
    }

    const formValue = this.inspectorForm.getRawValue();

    if (selected.type === 'group') {
      if (formValue.label !== selected.label) {
        this.store.updateNode({ id: selected.id, label: formValue.label });
      }
      return;
    }

    const field = selected as FieldControl;
    const validators = formValue.validators;
    const optionsArray = (this.inspectorForm.get('options') as FormArray<FormGroup>).getRawValue();
    const options =
      field.type === 'select' || field.type === 'radio'
        ? optionsArray.map((opt) => ({ label: opt.label, value: opt.value }))
        : undefined;
    const visibility = this.serializeVisibility();

    const label = (formValue.label ?? '').trim();
    const key = (formValue.key ?? '').trim();
    const placeholder = (formValue.placeholder ?? '').trim();
    const pattern = (validators.pattern ?? '').toString().trim();

    const patch: Partial<FieldControl> & { id: string } = {
      id: field.id,
      label,
      key,
      placeholder,
      defaultValue: formValue.defaultValue,
      required: formValue.required,
      visibleByDefault: formValue.visibility.visibleByDefault,
      visibility,
      validators: {
        min: this.parseNumber(validators.min),
        max: this.parseNumber(validators.max),
        minLength: this.parseNumber(validators.minLength),
        maxLength: this.parseNumber(validators.maxLength),
        pattern: pattern || undefined
      },
      options
    };

    this.store.updateNode(patch);
  }

  protected addOption(): void {
    const optionsArray = this.inspectorForm.get('options') as FormArray<FormGroup>;
    optionsArray.push(
      this.fb.group({
        label: ['Option', Validators.required],
        value: [`option-${optionsArray.length + 1}`, Validators.required]
      })
    );
  }

  protected removeOption(index: number): void {
    const optionsArray = this.inspectorForm.get('options') as FormArray<FormGroup>;
    if (index >= 0 && index < optionsArray.length) {
      optionsArray.removeAt(index);
    }
  }

  private uniqueKeyValidator(control: AbstractControl, currentId: string): ValidationErrors | null {
    const value = (control.value ?? '').trim();
    if (!value) {
      return { required: true };
    }

    const schema = this.schema();
    if (!schema) {
      return null;
    }

    const keys = this.collectControlKeys(schema.root, currentId);
    if (keys.has(value)) {
      return { keyNotUnique: true };
    }

    return null;
  }

  private patternValidator(control: AbstractControl): ValidationErrors | null {
    const value = (control.value ?? '').toString().trim();
    if (!value) {
      return null;
    }
    try {
      // eslint-disable-next-line no-new
      new RegExp(value);
      return null;
    } catch {
      return { invalidPattern: true };
    }
  }

  private collectControlKeys(node: FieldNode, excludeId: string, keys: Set<string> = new Set()): Set<string> {
    if (node.type === 'group') {
      for (const child of (node as FieldGroup).children) {
        this.collectControlKeys(child, excludeId, keys);
      }
    } else if (node.id !== excludeId) {
      keys.add((node as FieldControl).key);
    }
    return keys;
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

  private parseNumber(value: unknown): number | undefined {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }
    const num = Number(value);
    return Number.isNaN(num) ? undefined : num;
  }

  private showToast(message: string, variant: 'error' | 'success' = 'error'): void {
    this.toast.set({ message, variant });
    setTimeout(() => this.toast.set(null), 3000);
  }

  private visibilityConditionsArray(): FormArray<FormGroup> {
    return this.inspectorForm.get('visibility.conditions') as FormArray<FormGroup>;
  }

  private serializeVisibility(): FieldControl['visibility'] {
    const group = this.inspectorForm.get('visibility') as FormGroup;
    const mode = (group.get('mode')?.value as 'all' | 'any') ?? 'all';
    const conditionsRaw = this.visibilityConditionsArray().getRawValue() as Array<{
      fieldKey: string;
      operator: string;
      value: unknown;
    }>;

    const conditions = conditionsRaw
      .map((c) => ({
        fieldKey: (c.fieldKey ?? '').toString().trim(),
        operator: c.operator as any,
        value: c.value as any
      }))
      .filter((c) => c.fieldKey && c.operator);

    if (!conditions.length) {
      return undefined;
    }

    return { mode, conditions };
  }

  protected describeField(field: FieldControl): string {
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
