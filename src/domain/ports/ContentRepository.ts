import { Node } from '../entities/Node';
import { Page } from '../entities/Page';
import { PageAttachment, PageAttachmentType } from '../entities/PageAttachment';

export interface ContentRepository {
  // offset/limit — постраничная выборка на уровне SQL, а не "забрать всё и обрезать в JS":
  // при десятках тысяч подкаталогов/страниц это единственный способ не тянуть их все по сети на каждый клик.
  listChildNodes(parentId: number | null, offset: number, limit: number): Promise<Node[]>;
  countChildNodes(parentId: number | null): Promise<number>;
  getNode(nodeId: number): Promise<Node | null>;
  getAncestry(nodeId: number): Promise<Node[]>;

  listPages(nodeId: number, offset: number, limit: number): Promise<Page[]>;
  countPages(nodeId: number): Promise<number>;
  getPage(pageId: number): Promise<Page | null>;

  listPageAttachments(pageId: number): Promise<PageAttachment[]>;
  getPageAttachment(attachmentId: number): Promise<PageAttachment | null>;

  createNode(parentId: number | null, title: string): Promise<Node>;
  createPage(nodeId: number, title: string, description: string): Promise<Page>;
  addPageAttachment(
    pageId: number,
    attachment: { type: PageAttachmentType; token: string; filename: string | null },
  ): Promise<PageAttachment>;

  updateNodeTitle(nodeId: number, title: string): Promise<void>;
  updatePageTitle(pageId: number, title: string): Promise<void>;
  updatePageDescription(pageId: number, description: string): Promise<void>;

  deleteNode(nodeId: number): Promise<void>;
  deletePage(pageId: number): Promise<void>;
  deletePageAttachment(attachmentId: number): Promise<void>;
}
