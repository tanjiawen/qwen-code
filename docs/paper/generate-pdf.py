#!/usr/bin/env python3
"""将 Qwen Code 技术论文合并为带目录的 PDF 文件。"""

import os
import re
import markdown

PAPER_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_HTML = os.path.join(PAPER_DIR, "qwen-code-technical-paper.html")

CHAPTERS = [
    "ch01-03-introduction-architecture.md",
    "ch04-agent-core.md",
    "ch05-context-engineering.md",
    "ch06-tool-system.md",
    "ch07-08-security-persistence.md",
    "ch09-12-ui-discussion-conclusion.md",
]

CSS_STYLE = """
@page {
    size: A4;
    margin: 2.5cm 2cm 2.5cm 2cm;
    @top-center { content: "Qwen Code: 终端原生 AI 编码代理的技术架构"; font-size: 9pt; color: #666; }
    @bottom-center { content: counter(page) " / " counter(pages); font-size: 9pt; color: #666; }
}
@page :first {
    @top-center { content: none; }
    @bottom-center { content: none; }
}
body {
    font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    font-size: 11pt;
    line-height: 1.8;
    color: #1a1a1a;
    text-align: justify;
}
h1 {
    font-size: 22pt;
    color: #1e3a5f;
    border-bottom: 3px solid #1e3a5f;
    padding-bottom: 8px;
    margin-top: 40px;
    page-break-before: always;
}
h1:first-of-type { page-break-before: avoid; }
h2 {
    font-size: 16pt;
    color: #2c5282;
    margin-top: 30px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4px;
}
h3 {
    font-size: 13pt;
    color: #2d3748;
    margin-top: 20px;
}
h4 {
    font-size: 11.5pt;
    color: #4a5568;
    margin-top: 16px;
}
code {
    font-family: "JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace;
    font-size: 9pt;
    background: #f1f5f9;
    padding: 1px 4px;
    border-radius: 3px;
    color: #7c3aed;
}
pre {
    background: #1e293b;
    color: #e2e8f0;
    padding: 16px;
    border-radius: 8px;
    font-size: 8.5pt;
    line-height: 1.5;
    overflow-x: auto;
    page-break-inside: avoid;
}
pre code {
    background: none;
    color: inherit;
    padding: 0;
}
table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 9.5pt;
    page-break-inside: avoid;
}
th {
    background: #1e3a5f;
    color: white;
    padding: 8px 12px;
    text-align: left;
    font-weight: 600;
}
td {
    padding: 6px 12px;
    border-bottom: 1px solid #e2e8f0;
}
tr:nth-child(even) td { background: #f8fafc; }
blockquote {
    border-left: 4px solid #6366f1;
    margin: 16px 0;
    padding: 12px 20px;
    background: #eef2ff;
    color: #3730a3;
    font-style: italic;
}
.mermaid-placeholder {
    background: #f0f9ff;
    border: 1px dashed #93c5fd;
    padding: 20px;
    margin: 16px 0;
    text-align: center;
    color: #1e40af;
    font-style: italic;
    border-radius: 8px;
}
.cover-page {
    text-align: center;
    padding-top: 150px;
    page-break-after: always;
}
.cover-page h1 {
    font-size: 28pt;
    color: #1e3a5f;
    border: none;
    page-break-before: avoid;
}
.cover-page .subtitle {
    font-size: 14pt;
    color: #4a5568;
    margin-top: 20px;
}
.cover-page .meta {
    font-size: 11pt;
    color: #718096;
    margin-top: 60px;
    line-height: 2;
}
.toc { page-break-after: always; }
.toc h2 { border: none; color: #1e3a5f; }
.toc ul { list-style: none; padding-left: 0; }
.toc li { margin: 4px 0; }
.toc a { color: #2c5282; text-decoration: none; }
.toc .toc-h1 { font-weight: 700; font-size: 12pt; margin-top: 12px; }
.toc .toc-h2 { padding-left: 20px; font-size: 10.5pt; }
.toc .toc-h3 { padding-left: 40px; font-size: 10pt; color: #4a5568; }
"""


def extract_toc(html_content):
    """从 HTML 中提取标题生成目录。"""
    toc_entries = []
    pattern = re.compile(r'<h([1-3])[^>]*id="([^"]*)"[^>]*>(.*?)</h[1-3]>', re.DOTALL)
    for match in pattern.finditer(html_content):
        level = int(match.group(1))
        anchor = match.group(2)
        title = re.sub(r'<[^>]+>', '', match.group(3)).strip()
        toc_entries.append((level, anchor, title))
    return toc_entries


def render_toc(entries):
    """渲染目录 HTML。"""
    html = ['<div class="toc"><h2>目 录</h2><ul>']
    for level, anchor, title in entries:
        cls = f"toc-h{level}"
        html.append(f'<li class="{cls}"><a href="#{anchor}">{title}</a></li>')
    html.append('</ul></div>')
    return '\n'.join(html)


def process_mermaid(html_content):
    """将 mermaid 代码块转换为 Mermaid.js 可渲染的 div 格式。"""
    def replace_mermaid(match):
        code = match.group(1).strip()
        # 反转义 HTML 实体
        code = code.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')
        return f'<div class="mermaid">\n{code}\n</div>'
    # 匹配 codehilite 格式的 mermaid 代码块
    html_content = re.sub(
        r'<pre class="codehilite"><code class="language-mermaid">(.*?)</code></pre>',
        replace_mermaid, html_content, flags=re.DOTALL
    )
    # 也匹配普通格式
    html_content = re.sub(
        r'<pre><code class="language-mermaid">(.*?)</code></pre>',
        replace_mermaid, html_content, flags=re.DOTALL
    )
    return html_content


def add_heading_ids(html_content):
    """给标题添加 id 属性用于目录锚点。"""
    counter = [0]
    def add_id(match):
        counter[0] += 1
        tag = match.group(1)
        attrs = match.group(2) or ''
        content = match.group(3)
        if 'id=' in attrs:
            return match.group(0)
        clean = re.sub(r'<[^>]+>', '', content).strip()
        anchor = re.sub(r'[^\w\u4e00-\u9fff]+', '-', clean).strip('-').lower()
        anchor = f"sec-{counter[0]:03d}-{anchor[:30]}"
        return f'<h{tag} id="{anchor}"{attrs}>{content}</h{tag}>'
    return re.sub(r'<h([1-4])([^>]*)>(.*?)</h\1>', add_id, html_content, flags=re.DOTALL)


def main():
    # 读取所有章节
    all_md = []

    # 封面
    cover = """
<div class="cover-page">
<h1 style="border:none; page-break-before:avoid;">Qwen Code</h1>
<p class="subtitle">终端原生 AI 编码代理的技术架构：<br>脚手架、运行时、上下文工程与经验总结</p>
<p class="meta">
阿里巴巴通义千问团队<br>
开源项目：github.com/QwenLM/qwen-code<br>
版本：v0.21.0<br>
2026 年 7 月
</p>
</div>
"""
    all_md.append(cover)

    # 读取各章
    for chapter_file in CHAPTERS:
        filepath = os.path.join(PAPER_DIR, chapter_file)
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                all_md.append(f.read())
        else:
            print(f"⚠️  文件不存在: {chapter_file}")

    # 合并 Markdown
    combined_md = '\n\n---\n\n'.join(all_md)

    # 转 HTML
    md = markdown.Markdown(extensions=[
        'tables',
        'fenced_code',
        'codehilite',
        'toc',
        'attr_list',
    ], extension_configs={
        'codehilite': {'guess_lang': False, 'noclasses': False},
        'toc': {'permalink': False},
    })
    html_body = md.convert(combined_md)

    # 后处理
    html_body = add_heading_ids(html_body)
    html_body = process_mermaid(html_body)

    # 生成目录
    toc_entries = extract_toc(html_body)
    toc_html = render_toc(toc_entries)

    # 组装完整 HTML
    full_html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Qwen Code 技术论文</title>
<style>{CSS_STYLE}</style>
<style>
.mermaid {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 20px;
    margin: 16px 0;
    text-align: center;
    page-break-inside: avoid;
}}
</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
document.addEventListener('DOMContentLoaded', function() {{
    mermaid.initialize({{ startOnLoad: true, theme: 'default', securityLevel: 'loose' }});
}});
</script>
</head>
<body>
{toc_html}
{html_body}
</body>
</html>"""

    # 写入 HTML 文件
    with open(OUTPUT_HTML, 'w', encoding='utf-8') as f:
        f.write(full_html)
    print(f"✅ HTML 已生成: {OUTPUT_HTML}")
    print(f"   文件大小: {os.path.getsize(OUTPUT_HTML) / 1024:.0f} KB")
    print(f"   目录条目: {len(toc_entries)} 个")


if __name__ == '__main__':
    main()
