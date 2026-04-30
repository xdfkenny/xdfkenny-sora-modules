<p align="center"><img src="banner.png" width="100%" /></p>

<h1 align="center">xdfkenny modules</h1>

<p align="center"><b>random ai agent vibe coded modules for anime streaming.</b></p>

<p align="center">
  <a href="#overview">Overview</a> •
  <a href="#documentation">Documentation</a> •
  <a href="#recommended-agent-workflow">Agent Workflow</a>

---

## Overview

xdfkenny modules engineer with ai agents xdddddddddd 🤪🤪🤪🤪🤪🤪🤪🤪🤪🤪

| Surface | Route | Description | Data Source |
| :--- | :--- | :--- | :--- |
| **HenaoJara** | `/henaojara` | Feature-rich anime scraper with Spanish Latino localization and multi-server resolution. | [AnimeJara](https://animejara.com/) |

## Architecture

The framework leverages a high-performance **fetchv2** bridge to handle complex network requests, bypass cross-origin restrictions, and manage session headers.

```text
    +-------------------+         +-----------------------+         +-----------------------+
    |   Sora Player     |  JSON   |   xdfkenny Module     |  HTTP   |   Provider Data       |
    |   (Host Engine)   | <-----> |   (Regex + Scraper)   | <-----> |   (Streaming Sites)   |
    +-------------------+         +-----------------------+         +-----------------------+
              |                               |                             |
              |                               v                             |
              +----------------------- [ soraFetch ] -----------------------+
```
## Documentation

### Core Docs
1. [Module Manifest Specification](henaojara/henaojara.json) — Configuration for metadata, versioning, and stream types.
2. [Scraper Implementation Guide](example.js) — The foundational template for developing new scrapers.
3. [Network Layer Protocol](henaojara/henaojara.js) — Deep dive into header merging and request management.

### Specialized Docs
- **Multi-Server Resolution**: Logic for extracting and prioritizing diverse streaming servers.
- **Language Localization**: Handling Spanish Latino and Japanese subtitle/audio tracks.

> **Instruction**: Start with the Manifest Specification to understand module registration, then proceed to the Reference Scraper for logic implementation.

## Recommended Agent Workflow

1. **Target Analysis**: Deconstruct the provider's search and episode listing HTML structure.
2. **Manifest Definition**: Configure `henaojara.json` with the appropriate `baseUrl` and metadata.
3. **Core Development**: Implement `searchResults` and `extractEpisodes` using the provided template.
4. **Stream Resolution**: Optimize `extractStreamUrl` to handle multi-server embeds.
5. **Validation**: Verify that the returned stream object meets the Sora HLS requirements.

## Current Reality / Caveats

<details>
<summary>Click to view implementation risks</summary>

**Pattern Sensitivity**: Scrapers are dependent on **fixed HTML patterns**; provider updates may require immediate regex adjustments.
**Runtime Environment**: Optimized for the **Sora/Luna host engine**; direct Node.js execution requires a network shim.
**Data Policy**: Use these modules responsibly. Scrapers are for **educational and interoperability purposes** only.

</details>

---

<p align="center"><sub>Written by <b>Vibe Coding</b> with multiples AI agents</sub></p>
