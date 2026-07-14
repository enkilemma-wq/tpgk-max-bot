import { PageAttachment, PageAttachmentType } from '../../domain/entities/PageAttachment';
import { ContentRepository } from '../../domain/ports/ContentRepository';

export class AddPageAttachment {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(
    pageId: number,
    attachment: { type: PageAttachmentType; token: string; filename: string | null },
  ): Promise<PageAttachment> {
    return this.contentRepository.addPageAttachment(pageId, attachment);
  }
}
