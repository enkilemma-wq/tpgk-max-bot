export type PendingAction =
  | { type: 'add_page_title'; nodeId: number }
  | { type: 'add_page_description'; nodeId: number; title: string }
  | { type: 'edit_page_title'; pageId: number }
  | { type: 'edit_page_description'; pageId: number }
  | { type: 'add_attachment'; pageId: number }
  | { type: 'add_root_node' }
  | { type: 'add_sub_node'; parentId: number }
  | { type: 'rename_node'; nodeId: number };

export class PendingActionStore {
  private readonly pending = new Map<number, PendingAction>();

  set(userId: number, action: PendingAction): void {
    this.pending.set(userId, action);
  }

  get(userId: number): PendingAction | undefined {
    return this.pending.get(userId);
  }

  clear(userId: number): void {
    this.pending.delete(userId);
  }
}
