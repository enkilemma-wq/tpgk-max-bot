import { Node } from '../../domain/entities/Node';
import { ContentRepository } from '../../domain/ports/ContentRepository';

const LIST_PAGE_SIZE = 5;

export type StructureAction =
  | { type: 'view_root'; batch: number }
  | { type: 'view_node'; nodeId: number; batch: number }
  | { type: 'add_root'; title: string }
  | { type: 'add_sub'; parentId: number; title: string }
  | { type: 'rename_node'; nodeId: number; title: string }
  | { type: 'delete_node'; nodeId: number };

export type StructureResult =
  | { kind: 'root_list'; nodes: Node[]; batch: number; totalBatches: number }
  | {
      kind: 'node_view';
      node: Node;
      breadcrumb: string[];
      children: Node[];
      batch: number;
      totalBatches: number;
      pageCount: number;
    }
  | { kind: 'not_found' };

function totalBatchesOf(total: number): number {
  return Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
}

function clampBatch(batch: number, totalBatches: number): number {
  return Math.min(Math.max(batch, 0), totalBatches - 1);
}

export class ManageStructure {
  constructor(private readonly contentRepository: ContentRepository) {}

  private async viewRoot(batch = 0): Promise<StructureResult> {
    const total = await this.contentRepository.countChildNodes(null);
    const totalBatches = totalBatchesOf(total);
    const clamped = clampBatch(batch, totalBatches);
    const nodes = total > 0 ? await this.contentRepository.listChildNodes(null, clamped * LIST_PAGE_SIZE, LIST_PAGE_SIZE) : [];
    return { kind: 'root_list', nodes, batch: clamped, totalBatches };
  }

  private async viewNode(nodeId: number, batch = 0): Promise<StructureResult> {
    const node = await this.contentRepository.getNode(nodeId);
    if (!node) return { kind: 'not_found' };
    const ancestry = await this.contentRepository.getAncestry(nodeId);
    const breadcrumb = ancestry.slice(0, -1).map((n) => n.title);
    const childCount = await this.contentRepository.countChildNodes(nodeId);
    const totalBatches = totalBatchesOf(childCount);
    const clamped = clampBatch(batch, totalBatches);
    const children =
      childCount > 0 ? await this.contentRepository.listChildNodes(nodeId, clamped * LIST_PAGE_SIZE, LIST_PAGE_SIZE) : [];
    const pageCount = await this.contentRepository.countPages(nodeId);
    return {
      kind: 'node_view',
      node,
      breadcrumb,
      children,
      batch: clamped,
      totalBatches,
      pageCount,
    };
  }

  async execute(action: StructureAction): Promise<StructureResult> {
    switch (action.type) {
      case 'view_root':
        return this.viewRoot(action.batch);

      case 'view_node':
        return this.viewNode(action.nodeId, action.batch);

      case 'add_root': {
        await this.contentRepository.createNode(null, action.title);
        return this.viewRoot();
      }

      case 'add_sub': {
        await this.contentRepository.createNode(action.parentId, action.title);
        return this.viewNode(action.parentId);
      }

      case 'rename_node': {
        await this.contentRepository.updateNodeTitle(action.nodeId, action.title);
        return this.viewNode(action.nodeId);
      }

      case 'delete_node': {
        const node = await this.contentRepository.getNode(action.nodeId);
        if (!node) return { kind: 'not_found' };
        await this.contentRepository.deleteNode(action.nodeId);
        return node.parentId === null ? this.viewRoot() : this.viewNode(node.parentId);
      }
    }
  }
}
