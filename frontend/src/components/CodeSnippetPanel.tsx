import { useState, useMemo, useEffect } from "react";
import { X, Copy, Check } from "lucide-react";
import { toast } from "react-toastify";
import { copyToClipboard } from "@/lib/api";
import StyledSelect from "./StyledSelect";

// ---- SYNTAX HIGHLIGHTER ----
const highlightSyntax = (code: string) => {
  if (!code) return "";
  const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const tokenRegex = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\/\/.*|#.*)|\b(return|var|let|const|if|else|import|from|class|require|new|await|async|def|package|func|String|int|void|public|private|protected|static|using|namespace|echo|print|try|catch|throws|defer)\b|\b(fetch|console|http|requests|OkHttpClient|HttpClient|Net::HTTP|curl_init|curl_setopt|curl_exec|json|JSON|ioutil|strings|fmt|btoa|Buffer|Console|URI|Request|Response|Client|URL|axios|conn|client|document|window)\b|\b(true|false|null|nil|undefined)\b/g;

  const tokens = escaped.replace(tokenRegex, (match, pString, pComment, pKeyword, pObject, pBoolean) => {
    if (pString) return `<span class="text-[#D69D85]">${pString}</span>`;
    if (pComment) return `<span class="text-[#6A9955]">${pComment}</span>`;
    if (pKeyword) return `<span class="text-[#569CD6] font-semibold">${pKeyword}</span>`;
    if (pObject) return `<span class="text-[#4EC9B0]">${pObject}</span>`;
    if (pBoolean) return `<span class="text-[#569CD6] italic">${pBoolean}</span>`;
    return match;
  });

  return tokens.split('\n').map((line, i) => {
    return `<div class="flex hover:bg-[#2a2a2a]"><span class="w-8 shrink-0 text-right pr-3 text-[#6e7681] select-none border-r border-[#333] mr-3">${i + 1}</span><span class="flex-1 whitespace-pre-wrap break-words break-all">${line || ' '}</span></div>`;
  }).join('');
};

const generateCode = (reqData: any, lang: string, envVariables: any[] = []) => {
  if (!reqData) return "";

  const interpolate = (str: any) => {
    if (typeof str !== 'string') return str;
    let interpolated = str;
    envVariables.filter(v => v.enabled !== false && v.key).forEach(v => {
      interpolated = interpolated.replace(new RegExp(`\\{\\{\\s*${v.key}\\s*\\}\\}`, 'g'), () => v.value);
      interpolated = interpolated.replace(new RegExp(`%7B%7B\\s*${v.key}\\s*%7D%7D`, 'i'), () => v.value);
    });
    return interpolated;
  };

  // Deep clone to prevent mutating original React state
  const req = JSON.parse(JSON.stringify(reqData));
  
  // Recursively apply interpolation across all strings in the payload memory tree
  const interpolateRecursive = (obj: any) => {
     for (const key in obj) {
       if (typeof obj[key] === 'string') {
          obj[key] = interpolate(obj[key]);
       } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          interpolateRecursive(obj[key]);
       }
     }
  };
  interpolateRecursive(req);

  const stringifyObj = (obj: any) => JSON.stringify(obj, null, 2);

  const headers = Array.isArray(req.headers) 
    ? req.headers.reduce((acc: any, h: any) => h.active && h.key ? { ...acc, [h.key]: h.value } : acc, {})
    : (req.headers || {});

  if (req.auth) {
    if (req.auth.type === 'bearer' && req.auth.bearerToken) {
      headers['Authorization'] = `Bearer ${req.auth.bearerToken}`;
    } else if (req.auth.type === 'basic') {
      const user = req.auth.basicUsername || '';
      const pass = req.auth.basicPassword || '';
      headers['Authorization'] = `Basic ${typeof btoa !== 'undefined' ? btoa(user + ':' + pass) : Buffer.from(user + ':' + pass).toString('base64')}`;
    }
  }

  let url = req.url || "";
  if (Array.isArray(req.params)) {
    const activeParams = req.params.filter((p: any) => p.active && p.key);
    if (activeParams.length > 0) {
      const qs = new URLSearchParams();
      activeParams.forEach((p: any) => qs.append(p.key, p.value));
      url += url.includes('?') ? `&${qs.toString()}` : `?${qs.toString()}`;
    }
  }

  const method = req.method || "GET";
  const bodyStr = req.body || "";

  switch (lang) {
    case "curl": {
      let cmd = `curl --request ${method} \\\n  --url '${url}'`;
      Object.entries(headers).forEach(([k, v]) => {
        cmd += ` \\\n  --header '${k}: ${v}'`;
      });
      if (bodyStr && method !== 'GET') {
        cmd += ` \\\n  --data '${bodyStr.replace(/'/g, "'\\''")}'`;
      }
      return cmd;
    }
    case "fetch": {
      let code = `const options = {\n  method: '${method}',\n  headers: ${stringifyObj(headers)}`;
      if (bodyStr && method !== 'GET') code += `,\n  body: ${JSON.stringify(bodyStr)}`;
      code += `\n};\n\nfetch('${url}', options)\n  .then(response => response.json())\n  .then(response => console.log(response))\n  .catch(err => console.error(err));`;
      return code;
    }
    case "axios": {
      let code = `const axios = require('axios');\n`;
      let dataVal = (bodyStr && method !== 'GET') ? JSON.stringify(bodyStr) : "''";
      code += `let data = ${dataVal};\n\n`;
      code += `let config = {\n  method: '${method.toLowerCase()}',\n  maxBodyLength: Infinity,\n  url: '${url}',\n`;
      
      const headerStr = Object.keys(headers).length > 0 
        ? stringifyObj(headers).split('\n').map((line, i) => i === 0 ? line : `  ${line}`).join('\n')
        : '{ }';
        
      code += `  headers: ${headerStr},\n  data : data\n};\n\n`;
      code += `axios.request(config)\n.then((response) => {\n  console.log(JSON.stringify(response.data));\n})\n.catch((error) => {\n  console.log(error);\n});`;
      return code;
    }
    case "python_req": {
      let code = `import requests\n\nurl = "${url}"\n`;
      if (bodyStr && method !== 'GET') code += `payload = ${JSON.stringify(bodyStr)}\n`;
      code += `headers = ${stringifyObj(headers)}\n\n`;
      code += `response = requests.request("${method}", url`;
      if (bodyStr && method !== 'GET') code += `, data=payload`;
      if (Object.keys(headers).length > 0) code += `, headers=headers`;
      code += `)\n\nprint(response.text)`;
      return code;
    }
    case "python_http": {
      const host = url.replace(/https?:\/\//, '').split('/')[0];
      const path = url.replace(/https?:\/\/[^\/]+/, '') || '/';
      let code = `import http.client\n\nconn = http.client.HTTPSConnection("${host}")\n`;
      if (bodyStr && method !== 'GET') code += `payload = ${JSON.stringify(bodyStr)}\n`;
      code += `headers = ${stringifyObj(headers)}\n\n`;
      code += `conn.request("${method}", "${path}", ${bodyStr && method !== 'GET' ? 'payload' : '""'}, headers)\n`;
      code += `res = conn.getresponse()\ndata = res.read()\n\nprint(data.decode("utf-8"))`;
      return code;
    }
    case "go": {
      let code = `package main\n\nimport (\n\t"fmt"\n\t"strings"\n\t"net/http"\n\t"io/ioutil"\n)\n\nfunc main() {\n\turl := "${url}"\n`;
      if (bodyStr && method !== 'GET') code += `\tpayload := strings.NewReader(${JSON.stringify(bodyStr)})\n`;
      code += `\n\treq, _ := http.NewRequest("${method}", url, ${(bodyStr && method !== 'GET') ? 'payload' : 'nil'})\n`;
      Object.entries(headers).forEach(([k, v]) => { code += `\treq.Header.Add("${k}", "${v}")\n`; });
      code += `\n\tres, _ := http.DefaultClient.Do(req)\n\tdefer res.Body.Close()\n\tbody, _ := ioutil.ReadAll(res.Body)\n\n\tfmt.Println(string(body))\n}`;
      return code;
    }
    case "java": {
      let code = `OkHttpClient client = new OkHttpClient();\n`;
      if (bodyStr && method !== 'GET') code += `\nMediaType mediaType = MediaType.parse("application/json");\nRequestBody body = RequestBody.create(mediaType, ${JSON.stringify(bodyStr)});\n`;
      code += `\nRequest request = new Request.Builder()\n  .url("${url}")\n  .method("${method}", ${(bodyStr && method !== 'GET') ? 'body' : 'null'})\n`;
      Object.entries(headers).forEach(([k, v]) => { code += `  .addHeader("${k}", "${v}")\n`; });
      code += `  .build();\n\nResponse response = client.newCall(request).execute();`;
      return code;
    }
    case "csharp": {
      let code = `var client = new HttpClient();\nvar request = new HttpRequestMessage(HttpMethod.${method === 'GET' ? 'Get' : method === 'POST' ? 'Post' : method === 'PUT' ? 'Put' : method === 'DELETE' ? 'Delete' : 'Send'}, "${url}");\n`;
      Object.entries(headers).forEach(([k, v]) => { code += `request.Headers.Add("${k}", "${v}");\n`; });
      if (bodyStr && method !== 'GET') code += `var content = new StringContent(${JSON.stringify(bodyStr)}, null, "application/json");\nrequest.Content = content;\n`;
      code += `var response = await client.SendAsync(request);\nresponse.EnsureSuccessStatusCode();\nConsole.WriteLine(await response.Content.ReadAsStringAsync());`;
      return code;
    }
    case "php": {
      let code = `<?php\n\n$curl = curl_init();\n\ncurl_setopt_array($curl, array(\n  CURLOPT_URL => '${url}',\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_ENCODING => '',\n  CURLOPT_MAXREDIRS => 10,\n  CURLOPT_TIMEOUT => 0,\n  CURLOPT_FOLLOWLOCATION => true,\n  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,\n  CURLOPT_CUSTOMREQUEST => '${method}',\n`;
      if (bodyStr && method !== 'GET') code += `  CURLOPT_POSTFIELDS => ${JSON.stringify(bodyStr)},\n`;
      if (Object.keys(headers).length > 0) {
        code += `  CURLOPT_HTTPHEADER => array(\n`;
        Object.entries(headers).forEach(([k, v]) => { code += `    '${k}: ${v}',\n`; });
        code += `  ),\n`;
      }
      code += `));\n\n$response = curl_exec($curl);\ncurl_close($curl);\necho $response;`;
      return code;
    }
    case "ruby": {
      const host = url.replace(/https?:\/\//, '').split('/')[0];
      let code = `require 'uri'\nrequire 'net/http'\n\nurl = URI("${url}")\n\nhttp = Net::HTTP.new(url.host, url.port)\nhttp.use_ssl = true\n\nrequest = Net::HTTP::${method.charAt(0) + method.slice(1).toLowerCase()}.new(url)\n`;
      Object.entries(headers).forEach(([k, v]) => { code += `request["${k}"] = '${v}'\n`; });
      if (bodyStr && method !== 'GET') code += `request.body = ${JSON.stringify(bodyStr)}\n`;
      code += `\nresponse = http.request(request)\nputs response.read_body`;
      return code;
    }
    case "wget": {
      let cmd = `wget --no-check-certificate --quiet \\\n  --method ${method} \\\n  --timeout=0 \\\n  --header ''`;
      Object.entries(headers).forEach(([k, v]) => {
        cmd += ` \\\n  --header '${k}: ${v}'`;
      });
      if (bodyStr && method !== 'GET') {
        cmd += ` \\\n  --body-data '${bodyStr.replace(/'/g, "'\\''")}'`;
      }
      cmd += ` \\\n   '${url}'`;
      return cmd;
    }
    default:
      return "";
  }
};

export default function CodeSnippetPanel({ request, onClose, envVariables = [] }: { request: any, onClose: () => void, envVariables?: any[] }) {
  const [lang, setLang] = useState("axios");
  const [copied, setCopied] = useState(false);
  const [width, setWidth] = useState(384);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newWidth = window.innerWidth - e.clientX - 40; // 40px offsets the RightSidebar icon strip
      setWidth(Math.min(Math.max(newWidth, 250), window.innerWidth - 300));
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const languages = [
    { id: "curl", name: "cURL" },
    { id: "fetch", name: "JavaScript (Fetch)" },
    { id: "axios", name: "Node.js (Axios)" },
    { id: "python_req", name: "Python (Requests)" },
    { id: "python_http", name: "Python (http.client)" },
    { id: "go", name: "Go (Native)" },
    { id: "java", name: "Java (OkHttp)" },
    { id: "csharp", name: "C# (HttpClient)" },
    { id: "php", name: "PHP (cURL)" },
    { id: "ruby", name: "Ruby (Net::HTTP)" },
    { id: "wget", name: "Shell (wget)" },
  ];

  const code = useMemo(() => generateCode(request, lang, envVariables), [request, lang, envVariables]);
  const formattedHtml = useMemo(() => highlightSyntax(code), [code]);

  const handleCopy = () => {
    if (!code) return;
    copyToClipboard(code);
    setCopied(true);
    toast.success("Snippet copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      style={{ width: `${width}px` }}
      className="border-l border-[var(--border)] bg-[var(--sidebar)] flex flex-col h-full flex-shrink-0 animate-in slide-in-from-right-10 duration-200 shadow-2xl z-50 relative"
    >
      {/* Draggable divider handle */}
      <div 
        className="absolute top-0 bottom-0 -left-1 w-2 hover:bg-[var(--color-brand-500)] cursor-col-resize z-50 transition-colors"
        onMouseDown={() => setIsDragging(true)}
      />

      {/* Invisible overlay if dragging so iframe/text selection doesn't break drag logic */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] cursor-col-resize" />
      )}
      <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Code snippet</h3>
        <button onClick={onClose} className="p-1 hover:bg-[var(--border)] rounded text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 border-b border-[var(--border)] bg-[var(--background)]">
        <StyledSelect
          options={languages.map(l => ({ value: l.id, label: l.name }))}
          value={lang}
          onChange={(val) => setLang(val)}
          size="sm"
        />
      </div>

      <div className="flex-1 p-3 overflow-y-auto relative bg-[#1e1e1e] group selection:bg-[#264F78]">
        <button 
          onClick={handleCopy}
          className="absolute top-4 right-4 p-1.5 bg-[#3a3d41] hover:bg-[#505357] opacity-0 group-hover:opacity-100 transition-opacity rounded border border-[#454545] text-[#cccccc] flex items-center justify-center shadow-lg hover:text-white"
          title="Copy to Clipboard"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
        <pre 
          className="text-xs leading-5 text-[#d4d4d4] overflow-x-hidden overflow-y-auto h-full font-mono"
          dangerouslySetInnerHTML={{ __html: formattedHtml || "No request loaded." }}
        />
      </div>
    </div>
  );
}
