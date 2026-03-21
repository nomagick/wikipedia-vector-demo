
# Wikipedia vector search demo
Introducing a demo project showcasing Jina models and Elastic semantic/vector search capabilities using Wikipedia article data.

This puts our latest embeddings model, `jina-embeddings-v5-text-small` and reranker model `jina-reranker-v3` in action, creating a comprehensive search experience with semantic search, recommendation and classification capabilities.

The scale of the dataset (7.1M articles, 60Bn tokens, 299GB indexed size) also demonstrates the scalability, performance and efficiency of ElasticSearch as a vector search, and an integrated Search AI solution.

## Features
- Semantic search with `semantic_text` (asymmetric retrieval)
- Recommendation with dense vector search (text matching)
- Automatic classification of articles with dense vector search (classification)
- Reranking of search results with `jina-reranker-v3` (semantic ranking)

## Dataset
Dump of English Wikipedia, roughly 7.1 Million articles. 

Raw data 144GB compressed, indexed size 299GB, ~60 Bn tokens.

## Ingestion
- Download data dump from Wikipedia enterprise API
- HTML to Markdown conversion with Jina Reader
- Recursive chunking of markdown separator group
- Indexed using `jina-embeddings-v5-text-small`
- 1 semantic_text field, 6 dense vector fields (mean normalized of all chunk vectors)

## Search
- Search with `semantic_text` field for semantic search (asymmetric retrieval)
- Search with dense vector fields for recommendation and classification (dense vector search)
- Optional Reranking of search results with `jina-reranker-v3` 

## Agent Builder
Agent build can automatically leverage the `semantic_text` field for retrieval. As well as exporting MCP tools for external use.

## Using the UI
When accessed without parameters, a random search query is generated from a list of topic prompts. 
Another random query is generated when the "refresh" button is clicked.
You can also specify your own query in the search bar.

By clicking on the title of an article, you will be navigated to the Wikipedia page.

By clicking on the abstract/description of an article, a new text-matching query is run by matching the mean normalized dense vector of the article chunks (text matching optimized). This is useful for finding similar articles, and demonstrates the recommendation capabilities of dense vector search.

By clicking on the category tags of an article, a new classification query is run by matching the mean normalized dense vector of the article chunks (classification optimized) against the normalized dense vector of the category labels (0-shot classification). 

By opening the floating action button, you can toggle several options:
- Classification system used: Dewey Decimal Classification (ddc) or Universal Decimal Classification (udc)
- Rerank: Whether to use `jina-reranker-v3` for reranking search results.
- Hybrid: Whether to combine the relevance score from `semantic_text` with text search on article name / abstract
- Index: Whether to use the `semantic_text` field for search (disk_bbq), or to use the retrieval optimized mean normalized `dense_vector` field for search (hnsw_int8).


## Similar projects or articles
Providing a semantic search for wikipedia has been a common demo for both model providers and vector databases.

- https://lancedb-demos.vercel.app/demo/wikipedia-search `all-MiniLM-L6-v2` + LanceDB, demo site available
- https://wikipedia-semantic-search.vercel.app/ : `BGE-M3` + Upstash, demo site available
- https://developers.openai.com/cookbook/examples/embedding_wikipedia_articles_for_search OpenAI `text-embedding-3-small` playbook
- https://docs.cohere.com/page/wikipedia-search-with-weaviate Example from Cohere
