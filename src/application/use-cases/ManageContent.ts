import { Node } from '../../domain/entities/Node';
import { Page } from '../../domain/entities/Page';
import { PageAttachment } from '../../domain/entities/PageAttachment';
import { ContentRepository } from '../../domain/ports/ContentRepository';

const LIST_PAGE_SIZE = 5;
// "Осиротевшие" страницы (раздел одновременно и ветка, и лист — см. предупреждение в structureView.ts)
// показываем без пагинации, но не более этого числа: это заведомо редкий, отговариваемый случай,
// а не основной сценарий, который обязан масштабироваться на десятки тысяч.
const ORPHAN_PAGES_DISPLAY_LIMIT = 50;

export type ManageContentAction =
  | { type: 'view_root'; batch: number }
  | { type: 'view_node'; nodeId: number; batch: number }
  | { type: 'view_page'; pageId: number }
  | { type: 'rename_page_title'; pageId: number; title: string }
  | { type: 'update_page_description'; pageId: number; description: string }
  | { type: 'delete_page'; pageId: number }
  | { type: 'list_attachments'; pageId: number }
  | { type: 'view_attachment'; attachmentId: number }
  | { type: 'delete_attachment'; attachmentId: number };

export type ManageContentResult =
  | { kind: 'root_list'; nodes: Node[]; batch: number; totalBatches: number }
  | {
      kind: 'node_view';
      node: Node;
      breadcrumb: string[];
      children: Node[];
      pages: Page[];
      batch: number;
      totalBatches: number;
    }
  | { kind: 'page_detail'; page: Page; breadcrumb: string[]; attachmentsCount: number }
  | { kind: 'attachment_list'; pageId: number; breadcrumb: string[]; attachments: PageAttachment[] }
  | { kind: 'attachment_detail'; attachment: PageAttachment }
  | { kind: 'not_found' };

function totalBatchesOf(total: number): number {
  return Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
}

function clampBatch(batch: number, totalBatches: number): number {
  return Math.min(Math.max(batch, 0), totalBatches - 1);
}

export class ManageContent {
  constructor(private readonly contentRepository: ContentRepository) {}

  // Хлебные крошки для просмотра САМОГО узла (его название показывается отдельно как текущее — исключаем из пути).
  private async ancestorTitles(nodeId: number): Promise<string[]> {
    const ancestry = await this.contentRepository.getAncestry(nodeId);
    return ancestry.slice(0, -1).map((n) => n.title);
  }

  // Хлебные крошки для просмотра СТРАНИЦЫ — сам узел (раздел/подкаталог), где она лежит, обязательно входит
  // в путь, иначе при одинаковых названиях страниц в разных подкаталогах непонятно, к чему они относятся.
  private async nodePathTitles(nodeId: number): Promise<string[]> {
    const ancestry = await this.contentRepository.getAncestry(nodeId);
    return ancestry.map((n) => n.title);
  }

  private async viewRoot(batch = 0): Promise<ManageContentResult> {
    const total = await this.contentRepository.countChildNodes(null);
    const totalBatches = totalBatchesOf(total);
    const clamped = clampBatch(batch, totalBatches);
    const nodes = total > 0 ? await this.contentRepository.listChildNodes(null, clamped * LIST_PAGE_SIZE, LIST_PAGE_SIZE) : [];
    return { kind: 'root_list', nodes, batch: clamped, totalBatches };
  }

  private async viewNode(nodeId: number, batch = 0): Promise<ManageContentResult> {
    const node = await this.contentRepository.getNode(nodeId);
    if (!node) return { kind: 'not_found' };
    const breadcrumb = await this.ancestorTitles(nodeId);
    const childCount = await this.contentRepository.countChildNodes(nodeId);

    // Раздел либо "ветка" (пагинируем подкаталоги), либо "лист" (пагинируем страницы) —
    // одновременно активен только один из двух списков как основной, см. contentManageView.ts.
    if (childCount > 0) {
      const totalBatches = totalBatchesOf(childCount);
      const clamped = clampBatch(batch, totalBatches);
      const children = await this.contentRepository.listChildNodes(nodeId, clamped * LIST_PAGE_SIZE, LIST_PAGE_SIZE);
      // "Осиротевшие" страницы (см. ORPHAN_PAGES_DISPLAY_LIMIT) — редкий случай, не пагинируем полноценно.
      const pages = await this.contentRepository.listPages(nodeId, 0, ORPHAN_PAGES_DISPLAY_LIMIT);
      return { kind: 'node_view', node, breadcrumb, children, pages, batch: clamped, totalBatches };
    }

    const pageCount = await this.contentRepository.countPages(nodeId);
    const totalBatches = totalBatchesOf(pageCount);
    const clamped = clampBatch(batch, totalBatches);
    const pages = pageCount > 0 ? await this.contentRepository.listPages(nodeId, clamped * LIST_PAGE_SIZE, LIST_PAGE_SIZE) : [];
    return { kind: 'node_view', node, breadcrumb, children: [], pages, batch: clamped, totalBatches };
  }

  private async viewPage(pageId: number): Promise<ManageContentResult> {
    const page = await this.contentRepository.getPage(pageId);
    if (!page) return { kind: 'not_found' };
    const attachments = await this.contentRepository.listPageAttachments(pageId);
    const breadcrumb = await this.nodePathTitles(page.nodeId);
    return { kind: 'page_detail', page, attachmentsCount: attachments.length, breadcrumb };
  }

  private async listAttachmentsView(pageId: number): Promise<ManageContentResult> {
    const page = await this.contentRepository.getPage(pageId);
    if (!page) return { kind: 'not_found' };
    const attachments = await this.contentRepository.listPageAttachments(pageId);
    const breadcrumb = await this.nodePathTitles(page.nodeId);
    return { kind: 'attachment_list', pageId: page.id, breadcrumb: [...breadcrumb, page.title], attachments };
  }

  async execute(action: ManageContentAction): Promise<ManageContentResult> {
    switch (action.type) {
      case 'view_root':
        return this.viewRoot(action.batch);

      case 'view_node':
        return this.viewNode(action.nodeId, action.batch);

      case 'view_page':
        return this.viewPage(action.pageId);

      case 'rename_page_title': {
        await this.contentRepository.updatePageTitle(action.pageId, action.title);
        return this.viewPage(action.pageId);
      }

      case 'update_page_description': {
        await this.contentRepository.updatePageDescription(action.pageId, action.description);
        return this.viewPage(action.pageId);
      }

      case 'delete_page': {
        const page = await this.contentRepository.getPage(action.pageId);
        if (!page) return { kind: 'not_found' };
        await this.contentRepository.deletePage(action.pageId);
        return this.viewNode(page.nodeId);
      }

      case 'list_attachments':
        return this.listAttachmentsView(action.pageId);

      case 'view_attachment': {
        const attachment = await this.contentRepository.getPageAttachment(action.attachmentId);
        return attachment ? { kind: 'attachment_detail', attachment } : { kind: 'not_found' };
      }

      case 'delete_attachment': {
        const attachment = await this.contentRepository.getPageAttachment(action.attachmentId);
        if (!attachment) return { kind: 'not_found' };
        await this.contentRepository.deletePageAttachment(action.attachmentId);
        return this.listAttachmentsView(attachment.pageId);
      }
    }
  }
}
