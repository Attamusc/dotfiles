// Consumer rendering types. Runtime schema and store behavior come from the package.
export interface TodoFrontMatter {
  id: string;
  title: string;
  tags: string[];
  status: string;
  created_at: string;
  assigned_to_session?: string;
}
export interface TodoRecord extends TodoFrontMatter { body: string }
export type TodoAction = 'list' | 'list-all' | 'get' | 'create' | 'update' | 'append' | 'delete' | 'claim' | 'release';
