import { describe, expect, it } from "vitest";

import { htmlToText, sanitizeReviewHtml } from "./sanitize";

describe("sanitizeReviewHtml", () => {
  it("deixa o HTML honesto do editor passar intacto", () => {
    const honest =
      "<h2>Sebo do João</h2>" +
      "<p>Café <strong>bom</strong>, livro <em>barato</em>, <s>fila</s> <u>zero</u>.</p>" +
      "<ul><li>Bukowski na prateleira</li><li>Ar-condicionado</li></ul>" +
      "<ol><li>Chega</li><li>Pede</li></ol>" +
      "<blockquote>Voltaria.</blockquote>" +
      "<pre><code>narga --status</code></pre>" +
      "<h3>Resumo</h3><p>Nota alta.<br />Fim.</p>";
    expect(sanitizeReviewHtml(honest)).toBe(honest);
  });

  it("mata script, style e o texto de dentro deles", () => {
    expect(sanitizeReviewHtml("<p>oi</p><script>alert(1)</script>")).toBe("<p>oi</p>");
    expect(sanitizeReviewHtml("<style>body{display:none}</style><p>oi</p>")).toBe("<p>oi</p>");
    expect(sanitizeReviewHtml("<p>oi</p><iframe src='https://evil.com'></iframe>")).toBe(
      "<p>oi</p>",
    );
    expect(sanitizeReviewHtml("<svg onload=alert(1)></svg><p>oi</p>")).toBe("<p>oi</p>");
    expect(sanitizeReviewHtml("<p>oi</p><noscript>nada</noscript>")).toBe("<p>oi</p>");
  });

  it("remove handlers, style, class e id", () => {
    const out = sanitizeReviewHtml(
      '<p onclick="alert(1)" style="color:red" class="x" id="y" onmouseover="x()">oi</p>',
    );
    expect(out).toBe("<p>oi</p>");
    expect(out).not.toMatch(/onclick|style|class|id/i);
  });

  it("recusa javascript:, data: e protocol-relative no href", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "//evil.com",
      "vbscript:msgbox(1)",
    ]) {
      const out = sanitizeReviewHtml(`<p><a href="${href}">clica</a></p>`);
      expect(out).toBe("<p>clica</p>");
    }
  });

  it("aceita http, https e mailto, sempre com rel e target", () => {
    expect(sanitizeReviewHtml('<p><a href="https://sebo.com.br">sebo</a></p>')).toBe(
      '<p><a href="https://sebo.com.br" rel="noopener noreferrer" target="_blank">sebo</a></p>',
    );
    expect(sanitizeReviewHtml('<a href="mailto:oi@sebo.com.br">email</a>')).toBe(
      '<a href="mailto:oi@sebo.com.br" rel="noopener noreferrer" target="_blank">email</a>',
    );
    // rel e target do usuário são sobrescritos, não somados.
    expect(sanitizeReviewHtml('<a href="http://x.com" rel="me" target="_self">x</a>')).toBe(
      '<a href="http://x.com" rel="noopener noreferrer" target="_blank">x</a>',
    );
  });

  it("só deixa imagem do nosso próprio /api/uploads/", () => {
    expect(sanitizeReviewHtml('<img src="/api/uploads/abc123.webp" alt="foto">')).toBe(
      '<img src="/api/uploads/abc123.webp" alt="foto" />',
    );
    for (const src of [
      "https://evil.com/x.png",
      "x",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "/api/uploads/../../etc/passwd",
      "//evil.com/x.png",
      "/uploads/x.webp",
      "javascript:alert(1)",
    ]) {
      expect(sanitizeReviewHtml(`<p>a</p><img src="${src}">`)).toBe("<p>a</p>");
    }
  });

  it("derruba o clássico <img src=x onerror=alert(1)>", () => {
    expect(sanitizeReviewHtml("<img src=x onerror=alert(1)>")).toBe("");
    expect(sanitizeReviewHtml('<img src="/api/uploads/a.webp" onerror="alert(1)">')).toBe(
      '<img src="/api/uploads/a.webp" />',
    );
  });

  it("guarda largura e altura só quando são número", () => {
    expect(sanitizeReviewHtml('<img src="/api/uploads/a.webp" width="800" height="600">')).toBe(
      '<img src="/api/uploads/a.webp" width="800" height="600" />',
    );
    expect(sanitizeReviewHtml('<img src="/api/uploads/a.webp" width="100%">')).toBe(
      '<img src="/api/uploads/a.webp" />',
    );
  });

  it("escapa entidades e não deixa tag nascer de entidade", () => {
    expect(sanitizeReviewHtml("<p>1 &lt; 2 &amp; 3 &gt; 0</p>")).toBe(
      "<p>1 &lt; 2 &amp; 3 &gt; 0</p>",
    );
    expect(sanitizeReviewHtml("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
    expect(sanitizeReviewHtml("<p>oi</p>")).not.toContain("<script");
  });

  it("descarta tags fora da lista mas mantém o texto", () => {
    expect(sanitizeReviewHtml("<div><span>oi</span></div>")).toBe("oi");
    expect(sanitizeReviewHtml("<h1>Título</h1>")).toBe("Título");
    expect(sanitizeReviewHtml("<form><input value='x'><button>ok</button></form>")).toBe("ok");
  });

  it("aguenta vazio e lixo", () => {
    expect(sanitizeReviewHtml("")).toBe("");
    expect(sanitizeReviewHtml("<p>")).toBe("<p></p>");
    expect(sanitizeReviewHtml("texto solto")).toBe("texto solto");
  });
});

describe("htmlToText", () => {
  it("tira as tags e junta os blocos com espaço", () => {
    expect(htmlToText("<p>Um</p><p>Dois</p>")).toBe("Um Dois");
    expect(htmlToText("<ul><li>a</li><li>b</li></ul>")).toBe("a b");
    expect(htmlToText("<p>quebra<br>aqui</p>")).toBe("quebra aqui");
  });

  it("decodifica entidades sem decodificar duas vezes", () => {
    expect(htmlToText("<p>1 &lt; 2 &amp; 3</p>")).toBe("1 < 2 & 3");
    expect(htmlToText("<p>&amp;lt;b&amp;gt;</p>")).toBe("&lt;b&gt;");
    expect(htmlToText("<p>caf&#233;</p>")).toBe("café");
    expect(htmlToText("<p>caf&#xe9;</p>")).toBe("café");
    expect(htmlToText("<p>a&nbsp;b</p>")).toBe("a b");
  });

  it("ignora o conteúdo de script e style", () => {
    expect(htmlToText("<p>oi</p><script>alert(1)</script>")).toBe("oi");
    expect(htmlToText("<style>p{color:red}</style><p>oi</p>")).toBe("oi");
    expect(htmlToText("<p>oi</p><script>alert(1)")).toBe("oi");
  });

  it("conta o texto, não a marcação", () => {
    const html = `<p>${"a".repeat(50)}</p>`;
    expect(htmlToText(html)).toHaveLength(50);
    expect(htmlToText("")).toBe("");
    expect(htmlToText("   <p>  oi   </p>  ")).toBe("oi");
  });
});
