# Available Javascript Methods

Due to the limitations of Swift's JavaScriptCore framework, certain JavaScript functions that are commonly available in Node.js are not compatible with Sora. JavaScriptCore is designed to run JavaScript code in a sandboxed environment, primarily for web-related tasks, and does not provide built-in support for many Node.js-specific features. We are actively working to add additional methods and will keep this documentation updated with new additions while exploring possible workarounds for these limitations.

## Methods

---

- [fetch() (DEPRECATED)](#fetchurl-headers-deprecated)
- [fetchv2()](#fetchv2httpexampleorg-headers)
- [atob()](#atobbase64string)
- [btoa()](#btostring)


---

### fetch(URL, headers) (DEPRECATED)

```{warning}
This function will be deprecated soon. Please use fetchv2() instead.
```

Returns the fetched URL as a `String`

```{warning} 
Do not use .json() or .text() methods as those will not work with this fetch! 
If you want to use these functions, than look at the fetchv2() documentation.
```

For .json(), instead use:
```javascript
const response = await fetch("http://example.org");
const data = await JSON.parse(response);
```

For .text(), Instead assign the value directly:
```javascript
const response = fetch("http://example.org");
const data = await response;
```

#### Example Usage:
```javascript
const url = "http://example.org";
const headers = { // Optional
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
    'Content-Type': 'application/json',
    'Referer': 'http://example.org'
}

const response = await fetch(url, headers);
const data = await JSON.parse(response);
```

Goes without saying that this applies to StreamAsync mode too. You shouldn't need these methods in normal mode but if you do, use the above mentioned way.

---

### fetchv2(URL, headers, method, body)

This function is an improved version of fetch, designed to compensate for the lack of the JavaScriptCore framework in Swift. It returns a Promise with an enhanced response object that includes .text() and .json() methods for easier parsing.
It supports GET, POST, PUT and PATCH methods.

#### Usage:

Parameters:

- `url (String)`: The URL to fetch.

- `headers (Object, optional)`: An object containing key-value pairs for HTTP headers.

- `method (String, optional)`: The HTTP method to use. Defaults to "GET".

- `body (Object, optional)`: The body of the request. Only used for POST, PUT, and PATCH requests.


#### Response Object:

The returned response object contains:

- `.text()`: Returns a Promise that resolves to the response as a String.

- `.json()`: Returns a Promise that resolves to the response parsed as a JSON object.


#### Example Usage for GET Request:
```javascript

const url = "http://example.org";
const headers = { // Optional
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
    'Content-Type': 'application/json',
    'Referer': 'http://example.org'
}

const response = await fetchv2(url, headers);
const data = await response.json(); // or response.text();

```

#### Example Usage for POST Request:
```javascript

const url = "http://example.org";
const headers = { // Optional
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
    'Content-Type': 'application/json',
    'Referer': 'http://example.org'
}
const method = "POST";
const body = {
    key: "value",
    key2: "value2"
}

const response = await fetchv2(url, headers, method, body);
const data = await response.json(); // or response.text();

```

---

### atob(base64String)

Decodes a Base64-encoded ASCII `string` back into a binary string.

#### Returns:
A String containing the decoded data.

#### Example Usage:
```javascript
const decoded = atob("SGVsbG8sIHdvcmxkIQ=="); 
console.log(decoded); // Outputs: "Hello, world!"
```

#### Error Handling`
Returns null if the input is not a valid Base64 string.

---

### btoa(string)

Encodes a given binary string into a Base64-encoded ASCII string.

#### Returns:
A `string` containing the Base64 representation of the input.

#### Example Usage:
```javascript
const encoded = btoa("Hello, world!"); 
console.log(encoded); // Outputs: "SGVsbG8sIHdvcmxkIQ=="
```

#### Error Handling`
Returns null if the input is not a valid Base64 string.
