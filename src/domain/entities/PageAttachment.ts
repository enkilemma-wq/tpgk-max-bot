export type PageAttachmentType = 'image' | 'file';

export interface PageAttachment {
  id: number;
  pageId: number;
  type: PageAttachmentType;
  token: string;
  filename: string | null;
}
