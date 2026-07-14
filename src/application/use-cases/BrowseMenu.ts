import { Node } from '../../domain/entities/Node';
import { Page } from '../../domain/entities/Page';
import { PageAttachment } from '../../domain/entities/PageAttachment';
import { ContentRepository } from '../../domain/ports/ContentRepository';

export const LIST_PAGE_SIZE = 5;

export type MenuAction =
  | { type: 'root'; batch: number }
  | { type: 'node'; nodeId: number; batch: number }
  | { type: 'page'; nodeId: number; pageIndex: number }
  | { type: 'file'; attachmentId: number };

export type MenuResult =
  | { kind: 'root'; nodes: Node[]; batch: number; totalBatches: number }
  | {
      kind: 'nodes';
      nodeId: number;
      parentId: number | null;
      title: string;
      breadcrumb: string[];
      nodes: Node[];
      batch: number;
      totalBatches: number;
    }
  | {
      kind: 'pages';
      nodeId: number;
      parentId: number | null;
      title: string;
      breadcrumb: string[];
      pages: Page[];
      batch: number;
      totalBatches: number;
    }
  | {
      kind: 'page';
      nodeId: number;
      page: Page;
      pageIndex: number;
      totalPages: number;
      attachments: PageAttachment[];
      breadcrumb: string[];
    }
  | { kind: 'empty'; title: string; breadcrumb: string[]; parentId: number | null }
  | { kind: 'file'; attachment: PageAttachment }
  | { kind: 'not_found' };

function totalBatchesOf(total: number): number {
  return Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
}

function clampBatch(batch: number, totalBatches: number): number {
  return Math.min(Math.max(batch, 0), totalBatches - 1);
}

// Хлебные крошки для просмотра САМОГО узла (его название показывается отдельно как текущее — исключаем из пути).
async function ancestorTitles(contentRepository: ContentRepository, nodeId: number): Promise<string[]> {
  const ancestry = await contentRepository.getAncestry(nodeId);
  return ancestry.slice(0, -1).map((n) => n.title);
}

// Хлебные крошки для просмотра СТРАНИЦЫ внутри узла — сам узел (раздел/подкаталог) обязательно входит в путь,
// иначе при одинаковых названиях страниц в разных подкаталогах (например "Описание") непонятно, к чему они относятся.
async function nodePathTitles(contentRepository: ContentRepository, nodeId: number): Promise<string[]> {
  const ancestry = await contentRepository.getAncestry(nodeId);
  return ancestry.map((n) => n.title);
}

export class BrowseMenu {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(action: MenuAction): Promise<MenuResult> {
    switch (action.type) {
      case 'root': {
        const total = await this.contentRepository.countChildNodes(null);
        const totalBatches = totalBatchesOf(total);
        const batch = clampBatch(action.batch, totalBatches);
        const nodes = total > 0 ? await this.contentRepository.listChildNodes(null, batch * LIST_PAGE_SIZE, LIST_PAGE_SIZE) : [];
        return { kind: 'root', nodes, batch, totalBatches };
      }

      case 'node': {
        const node = await this.contentRepository.getNode(action.nodeId);
        if (!node) return { kind: 'not_found' };
        const breadcrumb = await ancestorTitles(this.contentRepository, node.id);

        const childCount = await this.contentRepository.countChildNodes(node.id);
        if (childCount > 0) {
          const totalBatches = totalBatchesOf(childCount);
          const batch = clampBatch(action.batch, totalBatches);
          const nodes = await this.contentRepository.listChildNodes(node.id, batch * LIST_PAGE_SIZE, LIST_PAGE_SIZE);
          return {
            kind: 'nodes',
            nodeId: node.id,
            parentId: node.parentId,
            title: node.title,
            breadcrumb,
            nodes,
            batch,
            totalBatches,
          };
        }

        const pageCount = await this.contentRepository.countPages(node.id);
        if (pageCount === 0) {
          return { kind: 'empty', title: node.title, breadcrumb, parentId: node.parentId };
        }
        const totalBatches = totalBatchesOf(pageCount);
        const batch = clampBatch(action.batch, totalBatches);
        const pages = await this.contentRepository.listPages(node.id, batch * LIST_PAGE_SIZE, LIST_PAGE_SIZE);
        return {
          kind: 'pages',
          nodeId: node.id,
          parentId: node.parentId,
          title: node.title,
          breadcrumb,
          pages,
          batch,
          totalBatches,
        };
      }

      case 'page': {
        const totalPages = await this.contentRepository.countPages(action.nodeId);
        if (totalPages === 0) return { kind: 'not_found' };
        const pageIndex = Math.min(Math.max(action.pageIndex, 0), totalPages - 1);
        const [page] = await this.contentRepository.listPages(action.nodeId, pageIndex, 1);
        const attachments = await this.contentRepository.listPageAttachments(page.id);
        const breadcrumb = await nodePathTitles(this.contentRepository, action.nodeId);
        return {
          kind: 'page',
          nodeId: action.nodeId,
          page,
          pageIndex,
          totalPages,
          attachments,
          breadcrumb,
        };
      }

      case 'file': {
        const attachment = await this.contentRepository.getPageAttachment(action.attachmentId);
        return attachment ? { kind: 'file', attachment } : { kind: 'not_found' };
      }
    }
  }
}
