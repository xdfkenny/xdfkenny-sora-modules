# Main JSON
Sora uses a simple JSON file to manage and integrate different streaming modules. You can easily configure new modules by editing this JSON file, adding details like the source name, URLs, and streaming settings.

## JSON Fields

### Fields Overview

| Field          | Type   | Description                                     | Required?      | Variables/Options
|----------------|--------|-------------------------------------------------|----------------|----------
| `sourceName`   | string | Name of the source.                             | ✅             | —
| `author`       | object | Information about the module's author.          | ✅             | —
| `name`         | string | Name of the author.                             | ✅             | —
| `icon`         | string | Icon of the author.                             | ✅             | —
| `url`          | string | URL to the author's profile (optional).         | ❌             | —
| `iconUrl`      | string | URL to the module's icon.                       | ✅             | —
| `description`  | string | Short description of the module.                | ❌             | —
| `version`      | string | Version of the module (e.g. `1.0.0`).           | ✅             | —
| `language`     | string | Language of the module.                         | ✅             | —
| `streamType`   | string | Stream type of the module.                      | ✅             | `HLS`, `MP4`
| `quality`      | string | Quality of the stream.                          | ✅             | `360p`, `720p`, `1080p`
| `baseUrl`      | string | Base URL of the source.                         | ✅             | —
| `searchBaseUrl`| string | Search URL of the source. Must include `%s` where the search query will go. | ✅ | `%s`
| `scriptUrl`    | string | URL to the raw link of the JavaScript file.     | ✅             | —
| `type`         | string | Category of what the site provides. Required for the module library. | ✅ | `anime`, `movies`, `shows`, `novels`
| `downloadSupport` | boolean | Set to `true` if the module supports downloads. Required for module library. | ⚠️ | `true`, `false`
| `combo`        | boolean | Set to `true` if the source includes multiple websites in one module. | ❌ | `true`, `false`
| `asyncJS`      | boolean | Set to `true` to load the script asynchronously. | ❌ | `true`, `false`
| `streamAsyncJS`| boolean | Set to `true` to only load the stream function asynchronously. | ❌ | `true`, `false`
| `softsub`      | boolean | Set to `true` to load subtitles.                | ❌             | `true`, `false`

> **Legend:** ✅ Required | ⚠️ Required for library | ❌ Optional

---

### Full Format

```json
{
   "sourceName": "YourSourceName",
   "iconUrl": "https://your-source.com/icon.png",
   "author": {
       "name": "AuthorName",
       "icon": "https://your-source.com/author-icon.png",
       "url": "https://github.com/author-profile"
   },
   "description": "A short description of your module.",
   "version": "1.0.0",
   "language": "English (DUB)",
   "streamType": "HLS",
   "quality": "720p",
   "baseUrl": "https://api.your-source.com/",
   "searchBaseUrl": "https://your-source.com/search=%s",
   "scriptUrl": "https://your-source.com/script.js",
   "type": "anime",
   "downloadSupport": false,
   "combo": false,
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
   "type": "anime",
   "downloadSupport": true,
   "asyncJS": true
}
```
