Policy corpus for the RAG research agent.

Every *.md file here is chunked on "## " headings, embedded, and stored in the
policy_chunks table by:  python -m scripts.ingest_policies

These files are plain-language summaries of public federal rules written for this
student prototype. They are NOT legal advice and not Capital One documents.
Team TODO:
  1. Verify each summary and URL against the official source.
  2. Add summaries of Capital One's PUBLIC pages (e.g. dispute process, privacy
     notice, servicemember benefits) as new .md files with a title: and url: header.
