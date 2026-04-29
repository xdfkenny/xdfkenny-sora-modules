# Main JSON
Sora uses a simple JSON file to manage and integrate different streaming modules. You can easily configure new modules by editing this JSON file, adding details like the source name, URLs, and streaming settings.

## JSON Fields

### Fields Overview

| Field          | Type   | Description                                     | Required?      | Variables
|----------------|--------|-------------------------------------------------|----------------|----------|
| `sourceName`   | string | Name of the source.                                 |[x]    |
| `author`       | object | Information about the module's author.              |[x]    |
| `name`         | string | Name of the author.                                 |[x]    |
| `icon`         | string | Icon of the author.                                 |[x]    |
| `iconUrl`      | string | URL to the module's icon.                           |[x]    |
| `version`      | integer| Version of the module.                              |[x]    |
| `language`     | string | Language of the module.                             |[x]    |
| `baseUrl`      | string | Base URL of the source.                             |[x]    |
| `streamType`   | string | Stream type of the module.                          |[x]    |`HLS`, `MP4`   |
| `quality`      | string | Quality of the stream.                              |[x]    |`360p`, `720p`, `1080p` |
| `searchBaseUrl`| string | Search URL of the source. Must include `%s` where the search query will go. |[x]    |`%s` |
| `scriptUrl`    | string | URL to the raw link of the JavaScript file.         |[x]    |
| `asyncJS`      | boolean| Set to `true` to load the script asynchronously.    |[ ]    | `true`, `false` |
| `streamAsyncJS`| boolean| Set to `true` to only load the stream function asynchronously. |[ ] | `true`, `false` |
| `softsub`      | boolean| Set to `true` to load subtitles.                    |[ ]   | `true`, `false` |
| `type`      | string| Category of what the site provides. Required for the module library. |[ ]   | `anime`, `movies`, `shows` |

---

### Full Format

```json
{
   "sourceName": "YourSourceName",
   "iconUrl": "https://your-source.com/icon.png",
   "author": {
       "name": "AuthorName",
       "icon": "https://your-source.com/author-icon.png"
   },
   "version": "1.0.0",
   "language": "English (DUB)",
   "streamType": "HLS",
   "quality": "720p",
   "baseUrl": "https://api.your-source.com/",
   "searchBaseUrl": "https://your-source.com/search=%s",
   "scriptUrl": "https://your-source.com/script.js",
   "asyncJS": true,
   "streamAsyncJS": false,
   "softsub": true
}
```

### Example
```json
{
   "sourceName": "Hianime",
   "iconUrl": "https://raw.githubusercontent.com/50n50/maisgay/refs/heads/main/hianime/icon.png",
   "author": {
       "name": "50/50",
       "icon": "https://encrypted-tbn0.gstatic.com/images?q=tbn:&s"
   },
   "version": "1.0.1",
   "language": "English (DUB)",
   "streamType": "HLS",
   "quality": "720p",
   "baseUrl": "https://api.animemundo.net/",
   "searchBaseUrl": "https://api.animemundo.net/api/v2/hianime/search?q=%s",
   "scriptUrl": "https://raw.githubusercontent.com/50n50/maisgay/refs/heads/main/hianime/hianime.js",
   "asyncJS": true
}
```
