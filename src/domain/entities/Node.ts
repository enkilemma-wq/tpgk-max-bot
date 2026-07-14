export interface Node {
  id: number;
  parentId: number | null;
  title: string;
  sortOrder: number;
}
