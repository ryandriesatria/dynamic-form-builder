import { Injectable } from '@angular/core';
import { BehaviorSubject, map } from 'rxjs';
import { deepClone, FieldGroup, FieldNode, FormSchema, generateId } from '../models/form-schema.model';

interface FormSchemaState {
  currentSchema: FormSchema | null;
  selectedNodeId: string | null;
  lastUpdated: number;
}

@Injectable({ providedIn: 'root' })
export class FormSchemaStore {
  private readonly state$ = new BehaviorSubject<FormSchemaState>({
    currentSchema: null,
    selectedNodeId: null,
    lastUpdated: Date.now()
  });

  readonly schema$ = this.state$.pipe(map((state) => state.currentSchema));

  readonly selectedNodeId$ = this.state$.pipe(
    map((state) => state.selectedNodeId)
  );

  readonly selectedNode$ = this.state$.pipe(
    map((state) => this.findNode(state.currentSchema?.root, state.selectedNodeId))
  );

  readonly lastUpdated$ = this.state$.pipe(map((state) => state.lastUpdated));

  get snapshot(): FormSchemaState {
    return this.state$.value;
  }

  loadDefaultSchema(): void {
    const defaultSchema: FormSchema = {
      id: generateId('form'),
      name: 'Contact Form',
      version: '1.0.0',
      root: {
        id: generateId('group'),
        type: 'group',
        label: 'Root Group',
        children: [
          {
            id: generateId('field'),
            type: 'text',
            key: 'name',
            label: 'Full Name',
            placeholder: 'Enter your name',
            required: true
          },
          {
            id: generateId('field'),
            type: 'email',
            key: 'email',
            label: 'Email Address',
            placeholder: 'Enter your email',
            required: true
          }
        ]
      }
    };

    this.state$.next({ currentSchema: defaultSchema, selectedNodeId: defaultSchema.root.id, lastUpdated: Date.now() });
  }

  selectNode(nodeId: string | null): void {
    const { currentSchema } = this.state$.value;
    if (!currentSchema) {
      return;
    }

    if (nodeId && !this.findNode(currentSchema.root, nodeId)) {
      return;
    }

    this.state$.next({ ...this.state$.value, selectedNodeId: nodeId });
  }

  updateNode(nodePatch: Partial<FieldNode> & { id: string }): void {
    this.updateSchema((schema) => ({
      ...schema,
      root: this.patchNode(schema.root, nodePatch.id, nodePatch) as FieldGroup
    }));
  }

  addNode(parentGroupId: string, node: FieldNode, index?: number): void {
    this.updateSchema((schema) => {
      const { group, added } = this.insertIntoGroup(schema.root, parentGroupId, node, index);
      return added ? { ...schema, root: group } : schema;
    });
  }

  removeNode(nodeId: string): void {
    const { currentSchema, selectedNodeId } = this.state$.value;
    if (!currentSchema) {
      return;
    }

    const { group, removed } = this.removeNodeFromGroup(deepClone(currentSchema.root), nodeId);
    if (!removed) {
      return;
    }

    const nextSelectedNodeId = selectedNodeId === nodeId ? null : selectedNodeId;
    this.state$.next({
      currentSchema: { ...currentSchema, root: group },
      selectedNodeId: nextSelectedNodeId,
      lastUpdated: Date.now()
    });
  }

  moveNode(dragId: string, targetGroupId: string, index: number): void {
    this.updateSchema((schema) => {
      const { group: withoutNode, removedNode, removed } = this.removeNodeFromGroup(schema.root, dragId);
      if (!removed || !removedNode) {
        return schema;
      }

      const { group: withNode, added } = this.insertIntoGroup(withoutNode, targetGroupId, removedNode, index);
      return added ? { ...schema, root: withNode } : schema;
    });
  }

  private updateSchema(mutator: (schema: FormSchema) => FormSchema): void {
    const { currentSchema } = this.state$.value;
    if (!currentSchema) {
      return;
    }

    const nextSchema = mutator(deepClone(currentSchema));
    this.state$.next({ ...this.state$.value, currentSchema: nextSchema, lastUpdated: Date.now() });
  }

  private findNode(node: FieldNode | undefined, nodeId: string | null): FieldNode | null {
    if (!node || !nodeId) {
      return null;
    }

    if (node.id === nodeId) {
      return node;
    }

    if (node.type === 'group') {
      for (const child of node.children) {
        const found = this.findNode(child, nodeId);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  private patchNode(node: FieldNode, nodeId: string, patch: Partial<FieldNode>): FieldNode {
    if (node.id === nodeId) {
      return { ...node, ...patch } as FieldNode;
    }

    if (node.type === 'group') {
      const updatedChildren = node.children.map((child) => this.patchNode(child, nodeId, patch));
      return { ...node, children: updatedChildren } as FieldGroup;
    }

    return node;
  }

  private insertIntoGroup(group: FieldGroup, parentGroupId: string, node: FieldNode, index?: number): { group: FieldGroup; added: boolean } {
    if (group.id === parentGroupId) {
      const children = [...group.children];
      const insertIndex = Math.max(0, Math.min(index ?? children.length, children.length));
      children.splice(insertIndex, 0, deepClone(node));
      return { group: { ...group, children }, added: true };
    }

    const newChildren: FieldNode[] = [];
    let added = false;

    for (const child of group.children) {
      if (child.type === 'group') {
        const result = this.insertIntoGroup(child, parentGroupId, node, index);
        added = added || result.added;
        newChildren.push(result.group);
      } else {
        newChildren.push(child);
      }
    }

    if (!added) {
      return { group, added: false };
    }

    return { group: { ...group, children: newChildren }, added: true };
  }

  private removeNodeFromGroup(group: FieldGroup, nodeId: string): { group: FieldGroup; removedNode?: FieldNode; removed: boolean } {
    const children: FieldNode[] = [];
    let removedNode: FieldNode | undefined;
    let removed = false;

    for (const child of group.children) {
      if (child.id === nodeId) {
        removed = true;
        removedNode = child;
        continue;
      }

      if (child.type === 'group') {
        const result = this.removeNodeFromGroup(child, nodeId);
        removed = removed || result.removed;
        if (result.removed) {
          if (result.removedNode) {
            removedNode = result.removedNode;
          }
          children.push(result.group);
          continue;
        }
      }

      children.push(child);
    }

    if (!removed) {
      return { group, removed };
    }

    return {
      group: { ...group, children },
      removedNode,
      removed
    };
  }
}
