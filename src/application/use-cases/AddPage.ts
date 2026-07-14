import { Page } from '../../domain/entities/Page';
import { ContentRepository } from '../../domain/ports/ContentRepository';

export class AddPage {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(nodeId: number, title: string, description: string): Promise<Page> {
    return this.contentRepository.createPage(nodeId, title, description);
  }
}
