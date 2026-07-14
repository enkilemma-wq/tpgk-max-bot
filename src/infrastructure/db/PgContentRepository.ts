import { Pool } from 'pg';
import { Node } from '../../domain/entities/Node';
import { Page } from '../../domain/entities/Page';
import { PageAttachment, PageAttachmentType } from '../../domain/entities/PageAttachment';
import { ContentRepository } from '../../domain/ports/ContentRepository';

type NodeRow = { id: number; parent_id: number | null; title: string; sort_order: number };
type PageRow = { id: number; node_id: number; title: string; description: string; sort_order: number };
type PageAttachmentRow = {
  id: number;
  page_id: number;
  type: PageAttachmentType;
  token: string;
  filename: string | null;
};

function toNode(row: NodeRow): Node {
  return { id: row.id, parentId: row.parent_id, title: row.title, sortOrder: row.sort_order };
}

function toPage(row: PageRow): Page {
  return {
    id: row.id,
    nodeId: row.node_id,
    title: row.title,
    description: row.description,
    sortOrder: row.sort_order,
  };
}

function toPageAttachment(row: PageAttachmentRow): PageAttachment {
  return { id: row.id, pageId: row.page_id, type: row.type, token: row.token, filename: row.filename };
}

export class PgContentRepository implements ContentRepository {
  constructor(private readonly pool: Pool) {}

  async listChildNodes(parentId: number | null, offset: number, limit: number): Promise<Node[]> {
    const result = await this.pool.query<NodeRow>(
      `SELECT id, parent_id, title, sort_order FROM nodes
       WHERE parent_id IS NOT DISTINCT FROM $1 ORDER BY sort_order, id LIMIT $2 OFFSET $3`,
      [parentId, limit, offset],
    );
    return result.rows.map(toNode);
  }

  async countChildNodes(parentId: number | null): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM nodes WHERE parent_id IS NOT DISTINCT FROM $1',
      [parentId],
    );
    return Number(result.rows[0].count);
  }

  async getNode(nodeId: number): Promise<Node | null> {
    const result = await this.pool.query<NodeRow>(
      'SELECT id, parent_id, title, sort_order FROM nodes WHERE id = $1',
      [nodeId],
    );
    return result.rows[0] ? toNode(result.rows[0]) : null;
  }

  async getAncestry(nodeId: number): Promise<Node[]> {
    const result = await this.pool.query<NodeRow & { depth: number }>(
      `WITH RECURSIVE ancestry AS (
         SELECT id, parent_id, title, sort_order, 0 AS depth
         FROM nodes WHERE id = $1
         UNION ALL
         SELECT n.id, n.parent_id, n.title, n.sort_order, a.depth + 1
         FROM nodes n
         JOIN ancestry a ON n.id = a.parent_id
       )
       SELECT id, parent_id, title, sort_order FROM ancestry ORDER BY depth DESC`,
      [nodeId],
    );
    return result.rows.map(toNode);
  }

  async listPages(nodeId: number, offset: number, limit: number): Promise<Page[]> {
    const result = await this.pool.query<PageRow>(
      `SELECT id, node_id, title, description, sort_order FROM pages
       WHERE node_id = $1 ORDER BY sort_order, id LIMIT $2 OFFSET $3`,
      [nodeId, limit, offset],
    );
    return result.rows.map(toPage);
  }

  async countPages(nodeId: number): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM pages WHERE node_id = $1',
      [nodeId],
    );
    return Number(result.rows[0].count);
  }

  async getPage(pageId: number): Promise<Page | null> {
    const result = await this.pool.query<PageRow>(
      'SELECT id, node_id, title, description, sort_order FROM pages WHERE id = $1',
      [pageId],
    );
    return result.rows[0] ? toPage(result.rows[0]) : null;
  }

  async listPageAttachments(pageId: number): Promise<PageAttachment[]> {
    const result = await this.pool.query<PageAttachmentRow>(
      'SELECT id, page_id, type, token, filename FROM page_attachments WHERE page_id = $1 ORDER BY sort_order, id',
      [pageId],
    );
    return result.rows.map(toPageAttachment);
  }

  async getPageAttachment(attachmentId: number): Promise<PageAttachment | null> {
    const result = await this.pool.query<PageAttachmentRow>(
      'SELECT id, page_id, type, token, filename FROM page_attachments WHERE id = $1',
      [attachmentId],
    );
    return result.rows[0] ? toPageAttachment(result.rows[0]) : null;
  }

  async createNode(parentId: number | null, title: string): Promise<Node> {
    const result = await this.pool.query<NodeRow>(
      `INSERT INTO nodes (parent_id, title, sort_order)
       VALUES (
         $1, $2,
         (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM nodes WHERE parent_id IS NOT DISTINCT FROM $1)
       )
       RETURNING id, parent_id, title, sort_order`,
      [parentId, title],
    );
    return toNode(result.rows[0]);
  }

  async createPage(nodeId: number, title: string, description: string): Promise<Page> {
    const result = await this.pool.query<PageRow>(
      `INSERT INTO pages (node_id, title, description, sort_order)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM pages WHERE node_id = $1))
       RETURNING id, node_id, title, description, sort_order`,
      [nodeId, title, description],
    );
    return toPage(result.rows[0]);
  }

  async addPageAttachment(
    pageId: number,
    attachment: { type: PageAttachmentType; token: string; filename: string | null },
  ): Promise<PageAttachment> {
    const result = await this.pool.query<PageAttachmentRow>(
      `INSERT INTO page_attachments (page_id, type, token, filename, sort_order)
       VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM page_attachments WHERE page_id = $1))
       RETURNING id, page_id, type, token, filename`,
      [pageId, attachment.type, attachment.token, attachment.filename],
    );
    return toPageAttachment(result.rows[0]);
  }

  async updateNodeTitle(nodeId: number, title: string): Promise<void> {
    await this.pool.query('UPDATE nodes SET title = $1 WHERE id = $2', [title, nodeId]);
  }

  async updatePageTitle(pageId: number, title: string): Promise<void> {
    await this.pool.query('UPDATE pages SET title = $1 WHERE id = $2', [title, pageId]);
  }

  async updatePageDescription(pageId: number, description: string): Promise<void> {
    await this.pool.query('UPDATE pages SET description = $1 WHERE id = $2', [description, pageId]);
  }

  async deleteNode(nodeId: number): Promise<void> {
    await this.pool.query('DELETE FROM nodes WHERE id = $1', [nodeId]);
  }

  async deletePage(pageId: number): Promise<void> {
    await this.pool.query('DELETE FROM pages WHERE id = $1', [pageId]);
  }

  async deletePageAttachment(attachmentId: number): Promise<void> {
    await this.pool.query('DELETE FROM page_attachments WHERE id = $1', [attachmentId]);
  }
}
