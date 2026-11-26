// The local legal sources use headings, paragraphs, emphasis, and simple lists.
export function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function inline(line) {
  return escape(line).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

const listItem = /^( *)(?:(\d+)\. |(-) )(.*)$/;
const tableRule = /^\|(?:\s*-{3,}\s*\|)+$/;
const isTableRow = line => line?.startsWith('|') && line.endsWith('|');
const cells = line => line.slice(1, -1).split('|').map(value => inline(value.trim()));

export function legalArticle(source, fields) {
  const lines = source.trim().split(/\r?\n/).filter(line => {
    const contact = /^联系(?:地址|电话|邮箱)：\{\{(ADDRESS|PHONE|CONTACT_EMAIL|PRIVACY_EMAIL)\}\}$/.exec(line);
    return !contact || fields[contact[1]];
  }).map(line => line.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(fields, key)) throw Error(`Unknown legal field: ${key}`);
    return fields[key];
  }));
  const contents = [];
  const blocks = [];
  let index = 0;

  function list(depth) {
    const ordered = Boolean(lines[index].match(listItem)[2]);
    const tag = ordered ? 'ol' : 'ul';
    const items = [];
    for (let item; (item = lines[index]?.match(listItem));) {
      if (item[1].length !== depth || Boolean(item[2]) !== ordered) break;
      index++;
      const next = lines[index]?.match(listItem);
      const children = next && next[1].length > depth ? list(next[1].length) : '';
      items.push(`<li>${inline(item[4])}${children}</li>`);
    }
    return `<${tag}>${items.join('')}</${tag}>`;
  }

  while (index < lines.length) {
    const line = lines[index];
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    const item = line.match(listItem);
    if (isTableRow(line) && tableRule.test(lines[index + 1] || '')) {
      const headings = cells(line);
      const rows = [];
      index += 2;
      while (isTableRow(lines[index])) {
        const values = cells(lines[index++]);
        if (values.length !== headings.length) throw Error('法律文本表格列数不一致');
        rows.push(`<tr>${values.map((value, column) => column === 0
          ? `<th scope="row">${value}</th>` : `<td>${value}</td>`).join('')}</tr>`);
      }
      blocks.push(`<div class="legal-table" tabindex="0" role="region" aria-label="保存期限与处理方式表，可横向滚动">
        <table><thead><tr>${headings.map(value => `<th scope="col">${value}</th>`).join('')}</tr></thead>
        <tbody>${rows.join('')}</tbody></table></div>`);
      continue;
    }
    if (item) {
      blocks.push(list(item[1].length));
      continue;
    }
    if (heading?.[1].length === 2) {
      const id = `clause-${contents.length + 1}`;
      contents.push(`<li><a href="#${id}">${inline(heading[2])}</a></li>`);
      blocks.push(`<h3 id="${id}">${inline(heading[2])}</h3>`);
    } else if (heading?.[1].length === 3) {
      blocks.push(`<h4>${inline(heading[2])}</h4>`);
    } else if (!heading && line && line !== '---') {
      blocks.push(`<p>${inline(line)}</p>`);
    }
    index++;
  }
  return `<details id="legal-toc" class="legal-toc"><summary>查看小程序条款目录</summary>
    <nav aria-label="小程序条款目录"><ul>${contents.join('')}</ul></nav></details>
    <div class="prose legal-reading">${blocks.join('\n')}</div>`;
}
