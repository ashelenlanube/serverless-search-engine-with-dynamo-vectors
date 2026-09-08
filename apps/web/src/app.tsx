import { useMemo } from 'react';
import { HttpProductApi } from './api.js';
import { requireApiBaseUrl } from './config.js';
import { SearchBox } from './search-box.js';

export function App(): React.JSX.Element {
  const api = useMemo(() => new HttpProductApi(requireApiBaseUrl()), []);

  return (
    <main className="page-shell">
      <section aria-labelledby="page-title" className="search-card">
        <p className="eyebrow">DynamoDB vector search</p>
        <h1 id="page-title">Find your next favorite product.</h1>
        <p className="intro">
          Start with what is popular, or search by a product’s name and meaning.
        </p>
        <SearchBox api={api} />
      </section>
    </main>
  );
}
